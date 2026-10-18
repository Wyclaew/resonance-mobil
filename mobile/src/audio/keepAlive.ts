import TrackPlayer, { Event, State } from "react-native-track-player";

import { batteryRestricted, requestBatteryExemption } from "../lib/battery";
import { t } from "../lib/i18n.mobile";
import { suppressMoodSignal, usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import * as engine from "./player";

/**
 * ⭐ TAKILMA BEKÇİSİ — kullanıcı şikâyeti (2026-10): "müzik bazen kendi kendine
 * duruyor; ben durdurmadan durmasın, yükleyemiyorsa sıradakine geçsin".
 *
 * Track-player bir akış takıldığında (ağ yavaş, Wi-Fi uykuya geçti, sunucu
 * yanıt vermiyor) hata vermeden "tamponluyor"da kalabiliyor; hata gelmediği için
 * hata kurtarma (autoAdvance) hiç devreye girmiyordu → sessizlik.
 *
 * Kural: kullanıcı çalmak İSTİYORSA (son eylemi duraklatma değilse) ve
 *  - 20 sn'den uzun süre tamponlanıyor/yükleniyorsa, ya da
 *  - "çalıyor" görünüp konum 30 sn ilerlemiyorsa
 * önce TAZE ADRESLE aynı saniyeden yeniden bağlan; aynı parçada ikinci kez
 * takılırsa sıradakine geç (`next("error")` → ağ sorununda indirilmiş/önbellekteki
 * parçaya geçer ya da bağlantıyı bekler).
 *
 * Sistem duraklatmaları (kulaklık çıktı, başka uygulama sesi aldı) bilinçli
 * olarak GERİ AÇILMAZ — ama rapora girsin diye kaydedilir.
 */
const CHECK_MS = 5000;
const BUFFER_STALL_MS = 20_000;
const FROZEN_STALL_MS = 30_000;
const LOADING_STALL_MS = 45_000;
let loadingSince = 0;

let installed = false;
/** Kullanıcının niyeti: çalsın mı? Duraklatma tuşları false yapar. */
let wantPlaying = false;
let since = { state: "" as string, at: 0 };
let lastPos = { uid: "", pos: -1, at: 0 };
const stalls = new Map<string, number>();

/** Kullanıcı (ya da uyku zamanlayıcısı) bilerek duraklattı / çalmaya başlattı. */
export function setWantPlaying(v: boolean): void {
  wantPlaying = v;
}

export function installKeepAlive(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    const prev = since.state;
    since = { state: String(state), at: Date.now() };
    if (state === State.Playing) {
      wantPlaying = true;
      nudgeBatteryOnce();
      return;
    }
    // Biz duraklatmadık ama durdu: sistem kararı (kulaklık, ses odağı). Kayda geç.
    if (wantPlaying && (state === State.Paused || state === State.Stopped) && prev === State.Playing) {
      const cur = usePlayerStore.getState().current;
      console.log(`[audio] sistem duraklattı (kulaklık/başka uygulama?): ${cur?.title ?? "?"}`);
      wantPlaying = false;
    }
  });

  setInterval(() => void tick(), CHECK_MS);
}

async function tick(): Promise<void> {
  try {
    if (!wantPlaying) return;
    const st = usePlayerStore.getState();
    const cur = st.current;
    // "Yükleniyor"da asılı kalma: 45 sn'den uzun sürerse aynı parçayı yeniden başlat
    // (toggle yükleme takıldıysa yeniden dener).
    if (cur && st.loading) {
      if (!loadingSince) loadingSince = Date.now();
      else if (Date.now() - loadingSince > LOADING_STALL_MS) {
        loadingSince = 0;
        console.warn(`[audio] 45 sn'dir yükleniyor — yeniden deneniyor: ${cur.title}`);
        await usePlayerStore.getState().toggle();
      }
      return;
    }
    loadingSince = 0;
    if (!cur || engine.loadedItemUid() !== cur.uid) return;
    const { state } = await TrackPlayer.getPlaybackState();
    const now = Date.now();

    if (state === State.Buffering || state === State.Loading) {
      if (since.state === String(state) && now - since.at > BUFFER_STALL_MS) {
        await recover(cur.uid, `${Math.round((now - since.at) / 1000)} sn tamponlanıyor`);
      }
      return;
    }
    if (state === State.Playing) {
      const { position } = await TrackPlayer.getProgress();
      if (lastPos.uid !== cur.uid || Math.abs(position - lastPos.pos) > 0.5) {
        lastPos = { uid: cur.uid, pos: position, at: now };
      } else if (now - lastPos.at > FROZEN_STALL_MS) {
        await recover(cur.uid, `konum ${Math.round(position)}. sn'de donmuş`);
      }
    }
  } catch (e) {
    console.warn("[audio] bekçi denetimi başarısız:", e);
  }
}

async function recover(uid: string, why: string): Promise<void> {
  const store = usePlayerStore.getState();
  const cur = store.current;
  if (!cur || cur.uid !== uid) return;
  const n = (stalls.get(uid) ?? 0) + 1;
  stalls.set(uid, n);
  since = { state: "recovering", at: Date.now() };
  lastPos = { uid: "", pos: -1, at: 0 };
  const { position } = await TrackPlayer.getProgress().catch(() => ({ position: 0 }));
  if (n === 1 && cur.source !== "local") {
    console.warn(`[audio] takıldı (${why}) — taze adresle ${Math.round(position)}. sn'den yeniden bağlanılıyor: ${cur.title}`);
    try {
      await engine.reloadCurrent(cur, Math.round(position * 1000));
      return;
    } catch (e) {
      console.warn("[audio] yeniden bağlanılamadı:", e);
    }
  }
  console.warn(`[audio] takıldı (${why}) — sıradakine geçiliyor: ${cur.title}`);
  suppressMoodSignal();
  await usePlayerStore.getState().next("error");
}

const NUDGE_KEY = "resonance.bgPlayNudged";
let nudged = false;

/** İlk çalışta, pil kısıtlıysa BİR KEZ "arka planda kesilebilir — düzelt" önerisi. */
function nudgeBatteryOnce(): void {
  if (nudged) return;
  nudged = true;
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (store?.getItem(NUDGE_KEY) || !batteryRestricted()) return;
    store?.setItem(NUDGE_KEY, "1");
    setTimeout(() => {
      useToastStore.getState().show(t("m.settings.bgPlayOff"), "info", {
        label: t("m.settings.bgPlayFix"),
        fn: () => void requestBatteryExemption(),
      }, 12_000);
    }, 3000);
  } catch {
    /* depo yoksa önemli değil */
  }
}
