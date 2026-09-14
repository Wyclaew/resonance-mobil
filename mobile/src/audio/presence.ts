import TrackPlayer, { Event, State } from "react-native-track-player";
import { AppState } from "react-native";

import { publishDeviceQueue } from "../lib/deviceQueue";
import { publishNowPlaying } from "../lib/nowPlaying";
import { DISCOVERY_ID, usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { QueueItem } from "../types";

/**
 * Çalma durumunu iki yere yazar:
 *  1. ⭐ ÇAPRAZ CİHAZ DEVAM (buluta): `now_playing` + `device_queue`. Yazma
 *     sıklığını modüllerin KENDİSİ kısıtlıyor (15/20 sn).
 *  2. KALDIĞIN YERDEN DEVAM (cihaza): `resumeState` ayarı — masaüstüyle aynı
 *     biçim. Keşfet'se TÜM kuyruk, değilse çalanın çevresindeki pencere.
 *
 * ⚠️ Kullanıcı bildirdi: "Keşfet'i başlatıp dinliyorum, uygulamayı kapatıp
 * açınca hatırlamıyor." Emülatörde yeniden üretilemedi; o yüzden yazma
 * fırsatları çoğaltıldı: yalnız 10 sn'lik ilerleme değil, parça değişimi,
 * duraklatma, kuyruk değişimi (yeni Keşfet partisi) ve arka plana geçiş
 * anında da ZORLA yazılır. Android bazı cihazlarda (Xiaomi) süreci uyarısız
 * öldürüyor; son durum en fazla birkaç saniye eski kalır.
 */
let installed = false;
let lastSave = 0;
let lastPosition = 0;
/** Kuyruk değişmedikçe JSON yeniden üretilmez (uzun listede her yazmada 60 KB olmasın). */
let bodyCache: { queue: QueueItem[]; index: number; radio: string; json: string } | null = null;

const SAVE_EVERY_MS = 10_000;
/** Normal kuyrukta saklanan pencere: çalanın 10 öncesi, 90 sonrası. */
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 90;

export function installPresence(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    lastPosition = Math.round(position * 1000);
    void publish(lastPosition, false);
  });

  // Parça değişti / duraklatıldı → hemen yaz.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, () => void persistNow());
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    if (state === State.Paused || state === State.Stopped) void persistNow();
  });

  AppState.addEventListener("change", (state) => {
    if (state !== "active") void persistNow();
  });

  // Kuyruk değişimi (yeni Keşfet partisi, reroll, sıra düzenleme): ilk ilerleme
  // olayını beklemeden yaz — hemen kapatılırsa eski kuyruk geri gelmesin.
  let timer: ReturnType<typeof setTimeout> | null = null;
  usePlayerStore.subscribe((s, prev) => {
    if (s.queue === prev.queue && s.index === prev.index && s.radioPlaylistId === prev.radioPlaylistId) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void persistNow(), 1500);
  });
}

async function persistNow(): Promise<void> {
  const st = usePlayerStore.getState();
  if (!st.current) return;
  const pos = await TrackPlayer.getProgress()
    .then((p) => Math.round(p.position * 1000))
    .catch(() => lastPosition);
  await publish(pos > 0 ? pos : st.pendingStartMs || lastPosition, true);
}

function resumeBody(): string | null {
  const st = usePlayerStore.getState();
  if (!st.current || !st.queue.length) return null;
  const radioKey = `${st.radioActive}|${st.radioPlaylistId}|${st.shuffleMode}|${st.repeat}|${st.lockedSeedArtist}`;
  if (bodyCache && bodyCache.queue === st.queue && bodyCache.index === st.index && bodyCache.radio === radioKey) {
    return bodyCache.json;
  }
  const discovery = st.radioActive && st.radioPlaylistId === DISCOVERY_ID;
  let json: string;
  if (discovery) {
    json = JSON.stringify({
      mode: "discovery",
      queue: st.queue,
      queueIndex: st.index,
      seedArtists: st.discoverySeedArtists,
      filters: st.discoveryFilters,
      lockedSeedArtist: st.lockedSeedArtist,
      repeat: st.repeat,
    });
  } else {
    const from = Math.max(0, st.index - WINDOW_BEFORE);
    const slice = st.queue.slice(from, st.index + WINDOW_AFTER);
    json = JSON.stringify({
      mode: "queue",
      queue: slice,
      queueIndex: st.index - from,
      // Akıllı karışık (liste radyosu) da geri gelsin — eskiden düz kuyruğa dönüyordu.
      radioActive: st.radioActive,
      radioPlaylistId: st.radioPlaylistId,
      shuffleMode: st.shuffleMode,
      repeat: st.repeat,
      // Masaüstü tek parça biçimini okur — geriye dönük uyum için ikisi birden.
      track: st.current,
    });
  }
  bodyCache = { queue: st.queue, index: st.index, radio: radioKey, json };
  return json;
}

async function publish(positionMs: number, force: boolean): Promise<void> {
  const st = usePlayerStore.getState();
  if (!st.current) return;
  const now = Date.now();
  if (force || now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now;
    const body = resumeBody();
    if (body) {
      const payload = `${body.slice(0, -1)},"positionMs":${positionMs},"savedAt":${now}}`;
      void useSettingsStore.getState().update("resumeState", payload);
    }
  }
  try {
    const playing = (await TrackPlayer.getPlaybackState()).state === State.Playing;
    const discovery = st.radioActive && st.radioPlaylistId === DISCOVERY_ID;
    await publishNowPlaying(st.current, positionMs, playing, force);
    await publishDeviceQueue(
      discovery ? "discovery" : "normal",
      st.queue,
      st.index,
      positionMs,
      // Keşfet sanal listesi uzak cihazda "liste" gibi görünmemeli.
      discovery ? null : (st.radioPlaylistId ?? st.current.playlistId ?? null),
      st.discoveryFilters,
      st.discoverySeedArtists,
      force
    );
  } catch (e) {
    // Senkron yoksa/çevrimdışıysa sessiz — çalmayı asla bozmaz.
    console.warn("[presence] yayınlanamadı:", e);
  }
}
