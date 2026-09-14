import * as Network from "expo-network";
import TrackPlayer, { State } from "react-native-track-player";
import { create } from "zustand";

import * as engine from "../audio/player";
import { useSleepTimer } from "../audio/sleepTimer";
import { prewarmUrls } from "../audio/urlCache";
import type { RemoteQueue } from "../lib/deviceQueue";
import { loadDiscoverySession, saveDiscoverySession, type DiscoverySession } from "../lib/discoverySession";
import { cachedPath, isNetworkError } from "../lib/downloads";
import { recordPlay } from "../lib/history";
import { t } from "../lib/i18n.mobile";
import { isPlayableHere } from "../lib/localAudio";
import { premeasure } from "../lib/loudness";
import { noteListen } from "../lib/mood";
import { PREF_MORE, setArtistPref } from "../lib/prefs";
import { onRelinked } from "../lib/relink";
import { onMetaFilled } from "../lib/repairTracks";
import {
  getRecommendations,
  recordRecommended,
  songCore,
  type Recommendation,
} from "../lib/recommender";
import type { QueueItem, RepeatMode, ShuffleMode, Track } from "../types";
import { useDownloadStore } from "./useDownloadStore";
import { useSettingsStore } from "./useSettingsStore";
import { useToastStore } from "./useToastStore";

/**
 * Oynatma kuyruğu — masaüstündeki `usePlayerStore.ts`'in mobil karşılığı.
 * Kuyruk kararları (sıradaki hangisi, tekrar, karışık, radyo beslemesi, sinyal
 * kaydı) BURADA; ses motoru (`audio/player.ts`) yalnız "çal/hazırla" der.
 *
 * ⚠️ Masaüstündeki yarış-koşulu dersleri (CLAUDE.md gotcha #6–#10) burada da
 * geçerli: motor her yüklemeye token verir, geç dönen eski çağrı durumu EZMEZ.
 */

type KarmaTrack = Track & { karma?: number };
/** Öneriden gelen alanlar (gerekçe, tohum) kuyrukta KORUNUR. */
export type QueueSource = Track & Partial<Pick<Recommendation, "reason" | "seedArtist" | "recSource" | "isProbe">>;

/** Parçadan nasıl çıkıldı? Sinyalin ANLAMI buna bağlı (masaüstü `ExitReason`). */
export type ExitReason = "ended" | "next" | "prev" | "jump" | "error";

interface PlayerState {
  current: QueueItem | null;
  queue: QueueItem[];
  index: number;
  /** Yükleniyor (adres çözümü / tampon). */
  loading: boolean;
  error: string | null;
  shuffleMode: ShuffleMode;
  repeat: RepeatMode;

  /** Liste bitince/araya öneriyle beslenen "radyo" (Keşfet ve akıllı karışık). */
  radioActive: boolean;
  radioPlaylistId: string | null;
  skippedRecIds: Set<string>;
  /** Keşif partisi hazırlanıyor (düğmeler bekleme gösterir). */
  discovering: boolean;
  /** Bu partiyi getiren tohum sanatçılar — "başka tarz" bunları dışlar. */
  discoverySeedArtists: string[];
  discoveryFilters: string[];
  /** ⭐ TARZ KİLİDİ: yeni partiler ağırlıklı bu sanatçıdan beslenir. */
  lockedSeedArtist: string | null;
  /**
   * Açılışta geri yüklenen ama henüz motora yüklenmemiş kuyruğun konumu (ms).
   * Oynat'a basınca buradan başlar; ilerleme çubuğu da bunu gösterir.
   */
  pendingStartMs: number;
  /**
   * ⭐ Kenara konmuş keşif partisi: Keşfet çalarken listeden/aramadan başka bir
   * şey açılınca parti kaybolmaz, burada bekler (`lib/discoverySession.ts`).
   */
  savedDiscovery: DiscoverySession | null;

  playNow: (track: QueueSource, queue?: QueueSource[], playlistId?: string, startMs?: number) => Promise<void>;
  /** Kenara konmuş keşfi kaldığı şarkıdan (ya da `index`'teki şarkıdan) sürdür. */
  resumeDiscovery: (index?: number) => Promise<void>;
  /** Saf rastgele çalma (öneri serpiştirmesi YOK). */
  playShuffled: (tracks: Track[], playlistId?: string) => Promise<void>;
  /** Karma ağırlıklı karışık + araya öneriler + sürekli besleme. */
  startSmartShuffle: (tracks: KarmaTrack[], playlistId: string) => Promise<void>;
  startDiscovery: (opts?: { force?: boolean; filters?: string[]; lockedSeedArtist?: string | null }) => Promise<void>;
  rerollDiscovery: () => Promise<void>;
  /** "Böyle devam et": çalanı bozmadan SIRADAKİLERİ bu tarza çevirir. */
  moreLikeThis: (item: QueueItem) => Promise<void>;
  setDiscoveryFilters: (ids: string[]) => void;
  setLockedSeedArtist: (artist: string | null) => void;
  toggle: () => Promise<void>;
  next: (reason?: ExitReason) => Promise<void>;
  previous: () => Promise<void>;
  jumpTo: (index: number) => Promise<void>;
  removeFromQueue: (uid: string) => void;
  moveInQueue: (from: number, to: number) => void;
  /** Sıraya ekle: hemen sonra ya da en sona. */
  enqueue: (track: QueueSource, where: "next" | "end") => void;
  cycleShuffle: () => void;
  cycleRepeat: () => void;
  /** ⭐ Çapraz cihaz devam: başka cihazdaki kuyruğu DURAKLATILMIŞ kurar. */
  adoptRemoteQueue: (remote: RemoteQueue) => void;
  /** Kapat-aç: son kuyruğu (Keşfet'se tamamını) duraklatılmış geri yükler. */
  restore: () => void;
  /** Sıradaki kararını etkileyen bir şey değişti (uyku, ayar) → hazırlığı yenile. */
  refreshUpcoming: () => void;
}

/** Keşfet oturumunun sanal liste kimliği — masaüstüyle AYNI değer. */
export const DISCOVERY_ID = "__discovery__";

/**
 * Radyoda ileride tutulacak parça sayısı. Masaüstünde 20; mobilde DÜŞÜK:
 * her öneri partisi radyo istekleri demek, her istek pil + veri (MOBILE.md §7).
 */
const TARGET_QUEUE_AHEAD = 10;
/** Bu sürenin altındaki gezinme çıkışı = gürültü (yanlış tuş). */
const NAV_NOISE_MS = 10_000;
/** "Önceki"den sonra bu süre içindeki "sonraki" = düzeltme, yargı değil. */
const CORRECTION_MS = 8_000;
/** Art arda bu kadar parça çalınamazsa atlamayı bırak (sonsuz atlama olmasın). */
const MAX_CONSECUTIVE_ERRORS = 3;

// Oturum belleği: aynı şarkı (ve aynı şarkının başka kaydı) tekrar gelmesin.
// ⚠️ `excludeIds` TEK BAŞINA YETMEZ — aynı şarkının farklı yüklemesinin id'si
// farklıdır; `songCore` çekirdeği bunu yakalar (CLAUDE.md).
const recommendedThisSession = new Set<string>();
const recommendedCoresThisSession = new Set<string>();

let refilling = false;
let lastPrevAt = 0;
let skipMoodOnce = false;
let consecutiveErrors = 0;
let loadingSince = 0;
/** Karışık modda sıradaki önceden seçilir: hazırlanan parça ile "sonraki" aynı olsun. */
let plannedShuffle: { uid: string; index: number } | null = null;
/** Keşfet açılışta önden hazırlanır (Wi-Fi'da) → düğmeye basınca anında başlar. */
let discoveryPrewarm: Recommendation[] | null = null;
let prewarming = false;

// `recordOutgoing`/`afterStart` store kapanışının içinde; track-player olayları
// (doğal geçiş) için ince köprü. ⚠️ `create()` bunları çağırmadan ÖNCE tanımlı
// olmalı (TDZ) — bu yüzden store'dan yukarıda.
let recordNaturalEnd: (positionMs: number, durationMs: number) => void = () => {};
let finishStart: () => void = () => {};

let uidSeq = 0;
const newUid = (id: string) => `${id}#${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

function toItem(t: QueueSource, playlistId?: string): QueueItem {
  return {
    id: t.id,
    source: t.source,
    sourceId: t.sourceId,
    title: t.title,
    artist: t.artist,
    album: t.album,
    durationMs: t.durationMs,
    thumbnail: t.thumbnail,
    addedAt: t.addedAt,
    uid: newUid(t.id),
    playlistId,
    isRecommendation: !!t.reason,
    recReason: t.reason,
    recSource: t.recSource,
    seedArtist: t.seedArtist,
    isProbe: t.isProbe,
  };
}

function toRecItem(r: Recommendation, playlistId: string): QueueItem {
  return { ...toItem(r, playlistId), isRecommendation: true };
}

/** Bağlantı geri gelince bir kez çağır (bekleyen tek dinleyici; yenisi eskisinin yerini alır). */
let onlineSub: { remove: () => void } | null = null;
let onlineTimer: ReturnType<typeof setTimeout> | null = null;
function whenOnline(fn: () => void): void {
  onlineSub?.remove();
  if (onlineTimer) clearTimeout(onlineTimer);
  const fire = (delay: number) => {
    onlineSub?.remove();
    onlineSub = null;
    if (onlineTimer) clearTimeout(onlineTimer);
    onlineTimer = null;
    setTimeout(fn, delay);
  };
  onlineSub = Network.addNetworkStateListener((s) => {
    // Bağlantı "var" dendiği anda DNS henüz hazır olmayabiliyor — kısa pay.
    if (s.isConnected && s.isInternetReachable !== false) fire(1500);
  });
  // Ağ durumu değişmeden de düzelebilir (Wi-Fi bağlı ama DNS/internet yoktu):
  // 20 sn'de bir yeniden dene; hâlâ yoksa hata yolu yeniden bekletir.
  onlineTimer = setTimeout(() => fire(0), 20_000);
}

/** Çalma HATASI sonrası atlamada mod sinyali yazılmaz (kullanıcı şarkıyı duymadı). */
export function suppressMoodSignal(): void {
  skipMoodOnce = true;
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const usePlayerStore = create<PlayerState>((set, get) => {
  // ── iç yardımcılar (store'a erişir) ─────────────────────────────────────

  /**
   * ⭐ YANLIŞ TUŞ / GEZİNME GÜRÜLTÜSÜ FİLTRESİ (masaüstü `recordOutgoing`).
   * "Önceki" ve "sıradan atla" YARGI DEĞİL, GEZİNMEDİR: kısa gezinme çıkışları
   * hiç kaydedilmez. Ceza YALNIZ bilerek "sonraki"ye basıldığında.
   */
  function recordOutgoing(reason: ExitReason, positionMs: number, durationMs: number): void {
    const cur = get().current;
    if (!cur) return;
    if (reason === "error") {
      // Çalınamayan öneri bu oturumda bir daha gelmesin; dinleme KAYDEDİLMEZ
      // (masaüstü burada kısa bir "çalma" yazıyordu → haksız atlama cezası).
      if (cur.isRecommendation) set({ skippedRecIds: new Set(get().skippedRecIds).add(cur.id) });
      return;
    }
    const short = positionMs < NAV_NOISE_MS;
    const correcting = reason === "next" && Date.now() - lastPrevAt < CORRECTION_MS;
    const navigating = reason === "prev" || reason === "jump" || correcting;
    if (navigating && short) return;

    void recordPlay(cur, positionMs).catch((e) => console.warn("[geçmiş] yazılamadı:", e));

    // ⭐ OTURUM MODU: bu tarzı ne kadar dinledin? (lib/mood.ts)
    if (skipMoodOnce) skipMoodOnce = false;
    else if (cur.isRecommendation && durationMs > 0) noteListen(cur.seedArtist, positionMs / durationMs);

    if (
      !navigating &&
      reason === "next" &&
      cur.isRecommendation &&
      positionMs < Math.min(20_000, durationMs * 0.3)
    ) {
      set({ skippedRecIds: new Set(get().skippedRecIds).add(cur.id) });
    }
  }

  /** Sıradaki öğenin konumu — "sonraki" ile boşluksuz hazırlık AYNI kararı versin. */
  function planNext(): { index: number } | "refill" | "stop" {
    const { queue, index, shuffleMode, repeat, radioActive, current } = get();
    if (!queue.length) return "stop";
    if (shuffleMode === "shuffle" && !radioActive) {
      if (queue.length === 1) return repeat === "off" ? "stop" : { index };
      if (!plannedShuffle || plannedShuffle.uid !== current?.uid) {
        let r = index;
        while (r === index) r = Math.floor(Math.random() * queue.length);
        plannedShuffle = { uid: current?.uid ?? "", index: r };
      }
      return { index: plannedShuffle.index };
    }
    const nextIdx = index + 1;
    if (nextIdx < queue.length) return { index: nextIdx };
    if (repeat === "all") return { index: 0 };
    if (radioActive) return "refill";
    const behavior = useSettingsStore.getState().queueEndBehavior;
    if (behavior === "repeat") return { index: 0 };
    if (behavior === "recommend" && recsAllowed()) return "refill";
    return "stop";
  }

  /** Sıradakini track-player kuyruğuna koy (boşluksuz geçiş). */
  function prepareNext(): void {
    const st = get();
    if (!st.current || engine.loadedItemUid() !== st.current.uid) return;
    // Tekrar-tek ve "şarkı bitince dur": kuyruk bitmeli ki olay gelsin.
    if (st.repeat === "one" || useSleepTimer.getState().afterTrack) {
      void engine.prepareUpcoming(null);
      return;
    }
    const plan = planNext();
    if (typeof plan === "string") {
      void engine.prepareUpcoming(null);
      return;
    }
    const item = st.queue[plan.index];
    if (!item || item.uid === st.current.uid) return void engine.prepareUpcoming(null);
    void engine.prepareUpcoming({ item, index: plan.index });
  }

  /** Bir parça çalmaya başladıktan sonra: hazırlık, besleme, ısıtma, ön indirme. */
  function afterStart(): void {
    const st = get();
    consecutiveErrors = 0;
    prepareNext();
    if (st.radioActive && st.queue.length - st.index - 1 < TARGET_QUEUE_AHEAD) void refillRadio(false);
    // Adres ısıtma ucuz (meta veri) — sıradaki birkaç parça anında başlasın.
    const ahead = st.queue.slice(st.index + 2, st.index + 5).filter((i) => i.source !== "local");
    if (ahead.length) void prewarmUrls(ahead.map((i) => i.sourceId));
    void prefetchNext();
  }

  /** Öğeyi motora yükle; hata olursa masaüstü gibi birkaç kez atla. */
  async function startAt(index: number, opts: { startMs?: number; autoplay?: boolean } = {}): Promise<void> {
    const item = get().queue[index];
    if (!item) return;
    plannedShuffle = null;
    loadingSince = Date.now();
    set({ index, current: item, loading: true, error: null, pendingStartMs: 0 });
    try {
      const ok = await engine.startItem(item, opts);
      if (!ok) return; // daha yeni bir yükleme başladı
      set({ loading: false });
      afterStart();
    } catch (e) {
      if (get().current?.uid !== item.uid) return;
      console.error("[player] çalınamadı:", item.title, errorText(e));
      // ⚠️ BUG'DI (kullanıcı raporu: "Unable to resolve host youtubei.googleapis.com"
      // ×3): bağlantı yokken her parça "çalınamadı" sayılıp üçü art arda atlanıyor,
      // sonra çalma duruyordu. Ağ hatası parçanın suçu değil — atlama, bekle ve
      // bağlantı gelince aynı parçayı aynı yerden yeniden dene.
      const offline =
        isNetworkError(e) &&
        (await Network.getNetworkStateAsync()
          .then((n) => !n.isConnected || n.isInternetReachable === false || /unknownhost|resolve host/i.test(errorText(e)))
          .catch(() => true));
      if (offline && opts.autoplay !== false && !(await cachedPath(item.id))) {
        // Sırada İNDİRİLMİŞ bir parça varsa beklemek yerine ona geç: yolda,
        // metroda internet giderken müzik kesilmesin.
        const downloaded = useDownloadStore.getState().downloaded;
        const q = get().queue;
        const startFrom = get().index;
        for (let k = 1; k < q.length; k++) {
          const cand = q[(startFrom + k) % q.length];
          if (isPlayableHere(cand) || downloaded.has(cand.id)) {
            console.log(`[player] çevrimdışı — indirilmiş parçaya geçiliyor: ${cand.title}`);
            useToastStore.getState().show(t("m.player.offlineJump"), "info");
            await startAt((startFrom + k) % q.length);
            return;
          }
        }
        engine.markUnloaded();
        set({ loading: false, error: t("m.player.offline"), pendingStartMs: opts.startMs ?? 0 });
        whenOnline(() => {
          const now = get();
          if (now.current?.uid === item.uid && engine.loadedItemUid() !== item.uid && !now.loading) {
            console.log("[player] bağlantı geldi — kaldığı yerden devam");
            void startAt(now.index, { startMs: now.pendingStartMs });
          }
        });
        return;
      }
      consecutiveErrors++;
      const hasMore = get().queue.length > 1;
      if (consecutiveErrors <= MAX_CONSECUTIVE_ERRORS && hasMore && opts.autoplay !== false) {
        useToastStore.getState().show(t("player.trackFailed"), "error");
        suppressMoodSignal();
        set({ loading: false });
        await get().next("error");
      } else {
        // ⛔ "Yükleniyor"da ASILI KALMA (CLAUDE.md v1.8.8): durumu duraklatılmışa çek.
        engine.markUnloaded();
        set({ loading: false, error: errorText(e) });
        useToastStore.getState().show(`${t("player.playFailed")}: ${errorText(e)}`, "error");
      }
    }
  }

  /**
   * Liste bittiğinde/araya öneri eklemek için radyoyu besler.
   * `playAfter`: kuyruk BİTTİĞİ için çağrıldıysa, besledikten sonra ilk yeni
   * öneriye geç (müzik durmasın).
   */
  async function refillRadio(playAfter: boolean): Promise<void> {
    if (refilling) return;
    const st = get();
    if (!st.radioActive && !playAfter) return;
    if (!recsAllowed()) return;
    // Arama/tek parça bitince "öneriyle devam": liste yoksa Keşfet gibi beslenir.
    const playlistId = st.radioPlaylistId ?? st.current?.playlistId ?? DISCOVERY_ID;
    if (!st.radioActive || st.radioPlaylistId !== playlistId) {
      set({ radioActive: true, radioPlaylistId: playlistId });
    }
    refilling = true;
    if (playAfter) set({ loading: true });
    try {
      const s = useSettingsStore.getState();
      const upcoming = st.queue.length - st.index - 1;
      const needed = Math.max(TARGET_QUEUE_AHEAD - upcoming, 5);
      const recs = await getRecommendations({
        playlistId,
        // Keşfet'te besleme de AYNI filtreyle devam etmeli; yoksa kuyruk
        // ilerledikçe seçtiğin tür sessizce kaybolurdu.
        filters: playlistId === DISCOVERY_ID ? get().discoveryFilters : undefined,
        lockedSeedArtist: playlistId === DISCOVERY_ID ? (get().lockedSeedArtist ?? undefined) : undefined,
        excludeIds: new Set([...get().queue.map((i) => i.id), ...get().skippedRecIds, ...recommendedThisSession]),
        excludeCores: buildExcludeCores(),
        limit: needed,
        useYouTube: s.recYouTube,
        useLibrary: s.recLibrary,
        halfLifeDays: s.karmaHalfLifeDays,
      });
      if (!recs.length) {
        if (playAfter) {
          set({ loading: false });
          useToastStore.getState().show(t("rec.exhausted"), "info");
        }
        return;
      }
      rememberRecs(recs);
      const cur = get();
      if (!cur.radioActive || cur.radioPlaylistId !== playlistId) return;
      const items = spreadByArtist(recs).map((r) => toRecItem(r, playlistId));
      set({ queue: [...cur.queue, ...items] });
      if (playAfter) {
        const nextIdx = get().index + 1;
        if (nextIdx < get().queue.length) await startAt(nextIdx);
      } else {
        prepareNext(); // liste sonundaydık → artık sıradaki var
      }
    } catch (e) {
      console.warn("[radyo] beslenemedi:", errorText(e));
      if (playAfter) set({ loading: false });
    } finally {
      refilling = false;
    }
  }

  /** Öneri getir ve MEVCUT kuyruğa `recEveryN` aralıkla serpiştir (akıllı karışık). */
  async function fetchAndInterleave(playlistId: string, extraExclude: string[] = []): Promise<void> {
    if (!recsAllowed()) return;
    const s = useSettingsStore.getState();
    const st = get();
    const remaining = Math.max(1, st.queue.length - st.index);
    try {
      const recs = await getRecommendations({
        playlistId,
        excludeIds: new Set([...extraExclude, ...st.queue.map((i) => i.id), ...st.skippedRecIds, ...recommendedThisSession]),
        excludeCores: buildExcludeCores(),
        limit: Math.max(2, Math.min(TARGET_QUEUE_AHEAD, Math.ceil(remaining / s.recEveryN) + 1)),
        useYouTube: s.recYouTube,
        useLibrary: s.recLibrary,
        halfLifeDays: s.karmaHalfLifeDays,
      });
      if (!recs.length) return;
      rememberRecs(recs);
      const cur = get();
      if (!cur.radioActive || cur.radioPlaylistId !== playlistId) return;
      const q = [...cur.queue];
      const recItems = spreadByArtist(recs).map((r) => toRecItem(r, playlistId));
      let insertAt = cur.index + s.recEveryN + 1;
      let ri = 0;
      while (ri < recItems.length && insertAt <= q.length) {
        q.splice(insertAt, 0, recItems[ri++]);
        insertAt += s.recEveryN + 1;
      }
      while (ri < recItems.length) q.push(recItems[ri++]);
      set({ queue: q });
      prepareNext();
    } catch (e) {
      console.warn("[akıllı karışık] öneriler serpiştirilemedi:", errorText(e));
    }
  }

  /** Keşfet mi çalıyor? (öneri radyosunun sanal "Keşfet" listesi) */
  const inDiscovery = (st: PlayerState) => st.radioActive && st.radioPlaylistId === DISCOVERY_ID && st.queue.length > 0;

  /** Verilen anın keşif partisini kenara koy (kuyruk birazdan başka bir şeyle değişecek). */
  function stashDiscovery(st: PlayerState, positionMs: number): void {
    if (!inDiscovery(st) || !st.current) return;
    const saved = saveDiscoverySession({
      queue: st.queue,
      index: st.index,
      positionMs,
      seedArtists: st.discoverySeedArtists,
      filters: st.discoveryFilters,
      lockedSeedArtist: st.lockedSeedArtist,
      savedAt: Date.now(),
    });
    set({ savedDiscovery: saved });
    console.log(`[keşfet] parti kenara kondu: ${st.index + 1}/${st.queue.length} · ${st.current.title}`);
  }

  /**
   * Kuyruk başka bir şeyle değişmeden hemen önce: çalanın dinlenen kısmını kaydet
   * ve Keşfet çalıyorsa partiyi kenara koy.
   *
   * ⚠️ BUG'DI (kullanıcı raporu 2026-09-14): "Keşfet dışında bir listeden şarkı
   * açınca Keşfet gidiyor." Ayrıca listeden şarkı açmak bir ÇIKIŞ olduğu hâlde
   * kaydedilmiyordu — 2 dk dinlenmiş öneri öneri motoruna hiç ulaşmıyordu.
   */
  async function leaveCurrent(): Promise<void> {
    const st = get();
    if (!st.current) return;
    if (engine.loadedItemUid() !== st.current.uid) {
      stashDiscovery(st, st.pendingStartMs);
      return;
    }
    const p = await TrackPlayer.getProgress().catch(() => ({ position: 0, duration: 0 }));
    const positionMs = Math.round(p.position * 1000);
    recordOutgoing("jump", positionMs, p.duration > 0 ? Math.round(p.duration * 1000) : st.current.durationMs);
    stashDiscovery(st, positionMs);
  }

  /** Keşif partisini kuyruk yapıp çalmaya başlar (startDiscovery + reroll ortak). */
  async function startBatch(recs: Recommendation[]): Promise<void> {
    rememberRecs(recs);
    const items = spreadByArtist(recs).map((r) => toRecItem(r, DISCOVERY_ID));
    set({
      // Yeni parti eskisinin yerini alır: "kaldığın keşif" artık bu.
      savedDiscovery: saveDiscoverySession(null),
      queue: items,
      radioActive: true,
      radioPlaylistId: DISCOVERY_ID,
      shuffleMode: "smart",
      discoverySeedArtists: seedArtistsOf(recs),
    });
    await startAt(0);
  }

  recordNaturalEnd = (positionMs, durationMs) => recordOutgoing("ended", positionMs, durationMs);
  finishStart = afterStart;

  // ── durum + eylemler ────────────────────────────────────────────────────
  return {
    current: null,
    queue: [],
    index: -1,
    loading: false,
    error: null,
    shuffleMode: "off",
    repeat: "off",
    radioActive: false,
    radioPlaylistId: null,
    skippedRecIds: new Set(),
    discovering: false,
    discoverySeedArtists: [],
    discoveryFilters: [],
    lockedSeedArtist: null,
    pendingStartMs: 0,
    savedDiscovery: null,

    playNow: async (track, queue, playlistId, startMs = 0) => {
      await leaveCurrent();
      const items = (queue ?? [track]).map((t) => toItem(t, playlistId));
      const idx = Math.max(0, items.findIndex((i) => i.id === track.id));
      const smart = get().shuffleMode === "smart" && !!playlistId && playlistId !== DISCOVERY_ID;
      set({
        queue: items,
        radioActive: smart,
        radioPlaylistId: smart ? (playlistId ?? null) : null,
        // Listeden normal çalma Keşfet'in karışık kilidini taşımasın.
        shuffleMode: get().shuffleMode === "smart" && !smart ? "off" : get().shuffleMode,
      });
      await startAt(idx, { startMs });
      if (smart && playlistId) void fetchAndInterleave(playlistId, items.map((i) => i.id));
    },

    resumeDiscovery: async (at) => {
      const saved = get().savedDiscovery ?? loadDiscoverySession();
      if (!saved?.queue.length || inDiscovery(get())) return;
      await leaveCurrent();
      const queue = saved.queue.map((i) => ({ ...i, uid: newUid(i.id) }));
      const index = Math.min(Math.max(0, at ?? saved.index), queue.length - 1);
      rememberRecs(queue.filter((i) => i.isRecommendation) as unknown as Recommendation[]);
      discoveryPrewarm = null;
      set({
        savedDiscovery: saveDiscoverySession(null),
        queue,
        radioActive: true,
        radioPlaylistId: DISCOVERY_ID,
        shuffleMode: "smart",
        lockedSeedArtist: saved.lockedSeedArtist,
        discoverySeedArtists: saved.seedArtists,
        discoveryFilters: saved.filters,
      });
      console.log(`[keşfet] kaldığın keşif sürüyor: ${index + 1}/${queue.length}`);
      await startAt(index, { startMs: index === saved.index ? saved.positionMs : 0 });
    },

    playShuffled: async (tracks, playlistId) => {
      if (!tracks.length) return;
      await leaveCurrent();
      const shuffled = [...tracks];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      set({
        queue: shuffled.map((t) => toItem(t, playlistId)),
        // Kuyruk zaten karışık: "shuffle" modu rastgele atlama yapar ve sırayı
        // görünmez kılar → sıra karışık ama doğrusal ilerlesin.
        shuffleMode: "off",
        radioActive: false,
        radioPlaylistId: null,
      });
      await startAt(0);
    },

    startSmartShuffle: async (tracks, playlistId) => {
      if (!tracks.length) return;
      await leaveCurrent();
      const items = weightedShuffle(tracks).map((t) => toItem(t, playlistId));
      set({ queue: items, radioActive: true, radioPlaylistId: playlistId, shuffleMode: "smart" });
      await startAt(0);
      await fetchAndInterleave(playlistId, tracks.map((t) => t.id));
    },

    startDiscovery: async (opts = {}) => {
      if (opts.filters) set({ discoveryFilters: opts.filters });
      if (opts.lockedSeedArtist !== undefined) {
        set({ lockedSeedArtist: opts.lockedSeedArtist ? opts.lockedSeedArtist.toLowerCase() : null });
      }
      if (opts.filters || opts.lockedSeedArtist !== undefined) discoveryPrewarm = null;
      const cur = get();
      // Keşfet zaten çalıyorsa sayfaya her girişte kuyruk SIFIRLANMAZ.
      if (!opts.force && cur.radioActive && cur.radioPlaylistId === DISCOVERY_ID && cur.queue.length) return;
      if (cur.discovering) return; // arka arkaya basışları yut
      if (!recsAllowed()) {
        useToastStore.getState().show(t("common.recsOff"), "info");
        return;
      }
      set({ discovering: true, error: null });
      try {
        let recs = discoveryPrewarm;
        discoveryPrewarm = null;
        if (recs) {
          await recordRecommended(recs.map((r) => r.id));
        } else {
          recs = await fetchDiscovery({
            excludeSeedArtists: opts.force ? new Set(cur.discoverySeedArtists.map((a) => a.toLowerCase())) : new Set(),
          });
        }
        if (!recs.length) {
          useToastStore.getState().show(t("home.noData"), "info");
          return;
        }
        await startBatch(recs);
      } catch (e) {
        console.error("[keşfet] başlatılamadı:", e);
        set({ error: errorText(e) });
      } finally {
        set({ discovering: false });
      }
    },

    rerollDiscovery: async () => {
      if (get().discovering) return;
      set({ discovering: true });
      try {
        // Mevcut partinin tohumlarını dışla → gelen tarz GERÇEKTEN değişsin.
        const recs = await fetchDiscovery({
          excludeSeedArtists: new Set(get().discoverySeedArtists.map((a) => a.toLowerCase())),
        });
        if (!recs.length) {
          useToastStore.getState().show(t("queue.noOtherStyle"), "info");
          return;
        }
        await startBatch(recs);
        const styles = seedArtistsOf(recs);
        useToastStore
          .getState()
          .show(styles.length ? t("queue.newStyle", { artists: styles.join(", ") }) : t("queue.newBatch"), "info");
      } catch (e) {
        console.error("[keşfet] başka tarz başarısız:", e);
      } finally {
        set({ discovering: false });
      }
    },

    moreLikeThis: async (item) => {
      const artist = item.seedArtist || item.artist;
      if (!artist || get().discovering) return;
      set({ discovering: true });
      try {
        await setArtistPref(artist, PREF_MORE);
        noteListen(item.seedArtist, 1); // "sonuna kadar dinlendi" kadar güçlü
        set({ lockedSeedArtist: artist.toLowerCase() });
        const st = get();
        const keep = st.queue.slice(0, st.index + 1);
        const playlistId = st.radioPlaylistId ?? DISCOVERY_ID;
        const s = useSettingsStore.getState();
        const recs = await getRecommendations({
          playlistId,
          filters: st.discoveryFilters,
          lockedSeedArtist: artist,
          excludeIds: new Set([...st.skippedRecIds, ...recommendedThisSession, ...keep.map((k) => k.id)]),
          excludeCores: buildExcludeCores(),
          limit: TARGET_QUEUE_AHEAD,
          useYouTube: s.recYouTube,
          useLibrary: s.recLibrary,
          halfLifeDays: s.karmaHalfLifeDays,
        });
        if (!recs.length) {
          useToastStore.getState().show(t("discover.moreLikeEmpty"), "info");
          return;
        }
        rememberRecs(recs);
        set({
          queue: [...keep, ...spreadByArtist(recs).map((r) => toRecItem(r, playlistId))],
          radioActive: true,
          radioPlaylistId: playlistId,
          discoverySeedArtists: [artist],
        });
        prepareNext();
        useToastStore.getState().show(t("discover.moreLikeDone", { artist }), "success");
      } catch (e) {
        console.error("[keşfet] tarz yönlendirme başarısız:", e);
      } finally {
        set({ discovering: false });
      }
    },

    setDiscoveryFilters: (ids) => {
      set({ discoveryFilters: ids });
      discoveryPrewarm = null;
    },

    setLockedSeedArtist: (artist) => {
      set({ lockedSeedArtist: artist ? artist.toLowerCase() : null });
      discoveryPrewarm = null;
    },

    toggle: async () => {
      const st = get();
      const item = st.current ?? st.queue[st.index] ?? st.queue[0];
      if (!item) return;
      // ⚠️ Nesne kimliğiyle (indexOf) değil uid ile ara: kaynak yeniden
      // bağlanınca kuyruk öğeleri kopyalanıyor ve referans eşleşmiyordu.
      const at = Math.max(0, st.queue.findIndex((i) => i.uid === item.uid));
      if (st.loading) {
        // Takıldıysa (4 sn+) aynı parçayı yeniden dene — oynat tuşu ölmesin.
        if (Date.now() - loadingSince < 4000) return;
        useToastStore.getState().show(t("player.retrying"), "info");
        await startAt(at);
        return;
      }
      // Açılışta geri yüklenen kuyruk henüz motora yüklenmedi → kaldığı yerden yükle.
      if (engine.loadedItemUid() !== item.uid) {
        await startAt(at, { startMs: st.pendingStartMs });
        return;
      }
      const state = (await TrackPlayer.getPlaybackState()).state;
      if (state === State.Playing || state === State.Buffering || state === State.Loading) {
        await TrackPlayer.pause();
      } else {
        // Oynatıcı hata/son durumundaysa play() sessizce hiçbir şey yapmaz.
        if (state === State.Error || state === State.Ended || state === State.None) {
          const { position } = await TrackPlayer.getProgress();
          await startAt(st.index, { startMs: state === State.Ended ? 0 : Math.round(position * 1000) });
          return;
        }
        await TrackPlayer.play();
      }
    },

    next: async (reason = "next") => {
      const st = get();
      if (!st.queue.length || !st.current) return;
      const progress = await TrackPlayer.getProgress().catch(() => ({ position: 0, duration: 0 }));
      const positionMs = engine.loadedItemUid() === st.current.uid ? Math.round(progress.position * 1000) : 0;
      const durationMs = progress.duration > 0 ? Math.round(progress.duration * 1000) : st.current.durationMs;
      recordOutgoing(reason, positionMs, durationMs);

      // Tekrar-tek YALNIZ doğal bitişte döner; "sonraki"ye basan gerçekten ilerlemek
      // istiyor (masaüstünde tuş da aynı şarkıyı başa sarıyordu).
      if (st.repeat === "one" && reason === "ended") {
        if (engine.loadedItemUid() === st.current.uid) {
          await TrackPlayer.seekTo(0);
          await TrackPlayer.play();
        } else await startAt(st.index);
        return;
      }

      const plan = planNext();
      if (plan === "refill") {
        await refillRadio(true);
        return;
      }
      if (plan === "stop") {
        await TrackPlayer.pause().catch(() => {});
        await TrackPlayer.seekTo(0).catch(() => {});
        set({ loading: false });
        return;
      }
      const target = get().queue[plan.index];
      const prepared = engine.preparedNext();
      if (prepared && prepared.uid === target?.uid) {
        plannedShuffle = null;
        set({ index: plan.index, current: target, error: null, pendingStartMs: 0 });
        if (await engine.skipToPrepared()) return; // olay işleyici afterStart'ı çağırır
      }
      await startAt(plan.index);
    },

    previous: async () => {
      const st = get();
      if (!st.queue.length) return;
      const { position } = await TrackPlayer.getProgress().catch(() => ({ position: 0 }));
      // 3 saniyeden sonra "önceki" = baştan başlat (yaygın oynatıcı davranışı).
      if (position > 3 || st.index <= 0) {
        if (engine.loadedItemUid() === st.current?.uid) await TrackPlayer.seekTo(0);
        return;
      }
      lastPrevAt = Date.now();
      recordOutgoing("prev", Math.round(position * 1000), st.current?.durationMs ?? 0);
      await startAt(st.index - 1);
    },

    jumpTo: async (index) => {
      const st = get();
      if (index < 0 || index >= st.queue.length || index === st.index) return;
      const { position } = await TrackPlayer.getProgress().catch(() => ({ position: 0 }));
      recordOutgoing("jump", Math.round(position * 1000), st.current?.durationMs ?? 0);
      await startAt(index);
    },

    removeFromQueue: (uid) => {
      const { queue, index, current } = get();
      if (current?.uid === uid) return;
      const at = queue.findIndex((i) => i.uid === uid);
      if (at < 0) return;
      set({ queue: queue.filter((i) => i.uid !== uid), index: at < index ? index - 1 : index });
      prepareNext();
    },

    moveInQueue: (from, to) => {
      const { queue, current, index } = get();
      if (from === to || from < 0 || to < 0 || from >= queue.length || to >= queue.length) return;
      const nq = [...queue];
      const [moved] = nq.splice(from, 1);
      nq.splice(to, 0, moved);
      const found = current ? nq.findIndex((i) => i.uid === current.uid) : -1;
      set({ queue: nq, index: found >= 0 ? found : index });
      prepareNext();
    },

    enqueue: (track, where) => {
      const st = get();
      const item = toItem(track, st.current?.playlistId);
      if (!st.current) {
        set({ queue: [item] });
        void startAt(0);
        return;
      }
      const q = [...st.queue];
      q.splice(where === "next" ? st.index + 1 : q.length, 0, item);
      set({ queue: q });
      prepareNext();
      useToastStore.getState().show(where === "next" ? t("m.queue.addedNext") : t("m.queue.addedEnd"), "success");
    },

    cycleShuffle: () => {
      const { shuffleMode, radioActive, radioPlaylistId } = get();
      if (radioActive && radioPlaylistId === DISCOVERY_ID) {
        useToastStore.getState().show(t("player.discoveryShuffleLocked"), "info");
        return;
      }
      if (shuffleMode === "off") {
        set({ shuffleMode: "shuffle" });
      } else if (shuffleMode === "shuffle") {
        const playlistId = get().current?.playlistId;
        set({ shuffleMode: "smart" });
        if (playlistId) {
          set({ radioActive: true, radioPlaylistId: playlistId });
          void fetchAndInterleave(playlistId);
        } else {
          useToastStore.getState().show(t("player.smartShuffleNeedsList"), "info");
        }
      } else {
        // Akıllı karışıktan çık: sıradaki önerileri at, çalan kalsın.
        const { queue, index, current } = get();
        const filtered = queue.filter((item, i) => !(i > index && item.isRecommendation));
        const newIndex = current ? filtered.findIndex((i) => i.uid === current.uid) : index;
        set({
          queue: filtered,
          index: newIndex >= 0 ? newIndex : index,
          radioActive: false,
          radioPlaylistId: null,
          shuffleMode: "off",
        });
      }
      plannedShuffle = null;
      prepareNext();
    },

    cycleRepeat: () => {
      const order: RepeatMode[] = ["off", "all", "one"];
      set({ repeat: order[(order.indexOf(get().repeat) + 1) % order.length] });
      prepareNext();
    },

    adoptRemoteQueue: (remote) => {
      if (!remote.queue.length) return;
      // Başka cihazdan devralmak da Keşfet'i silmesin. Konum sıfırlamadan ÖNCE
      // istenir (yerel çağrılar sırayla işlenir); anlık durum şimdi alınır.
      const before = get();
      if (inDiscovery(before)) {
        void TrackPlayer.getProgress()
          .then((p) => stashDiscovery(before, Math.round(p.position * 1000)))
          .catch(() => stashDiscovery(before, before.pendingStartMs));
      }
      const index = Math.min(Math.max(0, remote.queueIndex), remote.queue.length - 1);
      engine.markUnloaded();
      void TrackPlayer.reset().catch(() => {});
      const queue = remote.queue.map((i) => ({ ...i, uid: newUid(i.id) }));
      const discovery = remote.mode === "discovery";
      if (discovery) rememberRecs(queue.filter((i) => i.isRecommendation) as unknown as Recommendation[]);
      set({
        queue,
        index,
        current: queue[index],
        loading: false,
        error: null,
        pendingStartMs: remote.positionMs,
        radioActive: discovery,
        radioPlaylistId: discovery ? DISCOVERY_ID : null,
        shuffleMode: discovery ? "smart" : "off",
        discoverySeedArtists: remote.seeds,
        discoveryFilters: remote.filters,
      });
      // Oynat'a basınca beklemesin: adresi şimdiden çöz (indirme değil).
      void prewarmUrls(queue.slice(index, index + 2).map((i) => i.sourceId));
    },

    refreshUpcoming: () => prepareNext(),

    restore: () => {
      set({ savedDiscovery: loadDiscoverySession() });
      const raw = useSettingsStore.getState().resumeState;
      if (get().current) {
        console.log("[devam] kuyruk zaten dolu — geri yükleme atlandı");
        return;
      }
      if (!raw) {
        console.log("[devam] kayıtlı durum yok");
        return;
      }
      try {
        const saved = JSON.parse(raw) as {
          mode?: "discovery" | "queue";
          queue?: QueueItem[];
          queueIndex?: number;
          track?: Track;
          positionMs?: number;
          savedAt?: number;
          seedArtists?: string[];
          filters?: string[];
          lockedSeedArtist?: string | null;
          radioActive?: boolean;
          radioPlaylistId?: string | null;
          shuffleMode?: ShuffleMode;
          repeat?: RepeatMode;
        };
        const age = saved.savedAt ? `${Math.round((Date.now() - saved.savedAt) / 60_000)} dk önce` : "zamanı bilinmiyor";
        if (saved.mode === "discovery") {
          if (!saved.queue?.length) return;
          const queue = saved.queue.map((i) => ({ ...i, uid: newUid(i.id) }));
          const index = Math.min(Math.max(0, saved.queueIndex ?? 0), queue.length - 1);
          rememberRecs(queue.filter((i) => i.isRecommendation) as unknown as Recommendation[]);
          set({
            queue,
            index,
            current: queue[index],
            pendingStartMs: saved.positionMs ?? 0,
            radioActive: true,
            radioPlaylistId: DISCOVERY_ID,
            shuffleMode: "smart",
            repeat: saved.repeat ?? "off",
            lockedSeedArtist: saved.lockedSeedArtist ?? null,
            discoverySeedArtists: saved.seedArtists ?? [],
            discoveryFilters: saved.filters ?? [],
          });
          console.log(`[devam] Keşfet geri yüklendi: ${index + 1}/${queue.length} (${age})`);
          return;
        }
        const list = saved.queue?.length ? saved.queue : saved.track ? [{ ...saved.track, uid: "" }] : [];
        if (!list.length) return;
        const queue = list.map((i) => ({ ...i, uid: newUid(i.id) }));
        const index = Math.min(Math.max(0, saved.queueIndex ?? 0), queue.length - 1);
        const radio = !!saved.radioActive && !!saved.radioPlaylistId;
        set({
          queue,
          index,
          current: queue[index],
          pendingStartMs: saved.positionMs ?? 0,
          radioActive: radio,
          radioPlaylistId: radio ? (saved.radioPlaylistId ?? null) : null,
          shuffleMode: saved.shuffleMode ?? "off",
          repeat: saved.repeat ?? "off",
        });
        console.log(`[devam] kuyruk geri yüklendi: ${index + 1}/${queue.length}${radio ? " (akıllı karışık)" : ""} (${age})`);
      } catch (e) {
        console.warn("[devam] kayıtlı durum okunamadı:", e);
      }
    },
  };
});

// ── Track-player olaylarından çağrılanlar (audio/autoAdvance.ts) ────────────

/**
 * Track-player hazırlanan sıradaki öğeye geçti. Doğal bitişse sinyal kaydedilir;
 * kullanıcı "sonraki"ye bastıysa kayıt zaten `next()`'te yazıldı.
 */
export async function onAdvancedTo(uid: string, natural: { positionMs: number; durationMs: number } | null): Promise<void> {
  const st = usePlayerStore.getState();
  const idx = st.queue.findIndex((i) => i.uid === uid);
  if (idx < 0) return;
  if (natural) {
    // Öncekini "sonuna kadar dinlendi" diye yaz; sonra yeni öğeye geç.
    recordNaturalEnd(natural.positionMs, natural.durationMs);
    usePlayerStore.setState({ index: idx, current: st.queue[idx], error: null, pendingStartMs: 0 });
  }
  await engine.adoptActive(uid);
  const item = usePlayerStore.getState().queue[idx];
  if (item) await engine.applyLoudness(item);
  usePlayerStore.setState({ loading: false });
  finishStart();
}


// Yer tutucu parçanın meta verisi geldi → kuyruk, mini oynatıcı ve bildirim adı görsün.
onMetaFilled((trackId, meta) => {
  const patch = (i: QueueItem): QueueItem =>
    i.id === trackId && !i.title
      ? { ...i, title: meta.title, artist: meta.artist, thumbnail: meta.thumbnail ?? i.thumbnail, durationMs: meta.durationMs || i.durationMs }
      : i;
  usePlayerStore.setState((s) => ({ queue: s.queue.map(patch), current: s.current ? patch(s.current) : null }));
});

// Silinen video başka yüklemeye bağlandı → kuyruktaki kopyalar da güncellensin.
onRelinked((trackId, sourceId) => {
  usePlayerStore.setState((s) => ({
    queue: s.queue.map((i) => (i.id === trackId ? { ...i, sourceId } : i)),
    current: s.current?.id === trackId ? { ...s.current, sourceId } : s.current,
  }));
});

// "Şarkı bitince dur" açılınca, zaten hazırlanmış sıradaki track-player
// kuyruğundan çıkarılmalı — yoksa ExoPlayer kendisi geçer ve uyku işlemez.
useSleepTimer.subscribe((s, prev) => {
  if (s.afterTrack !== prev.afterTrack) usePlayerStore.getState().refreshUpcoming();
});
useSettingsStore.subscribe((s, prev) => {
  if (s.queueEndBehavior !== prev.queueEndBehavior || s.recEnabled !== prev.recEnabled) {
    usePlayerStore.getState().refreshUpcoming();
  }
});

/** Kuyruk ilerlemeden biten parçanın dinlemesini yaz ("şarkı bitince dur"). */
export function recordEndedPlay(positionMs: number, durationMs: number): void {
  recordNaturalEnd(positionMs, durationMs);
}

// ── saf yardımcılar ───────────────────────────────────────────────────────

function recsAllowed(): boolean {
  const s = useSettingsStore.getState();
  return s.recEnabled && (s.recYouTube || s.recLibrary);
}

/**
 * Karma ağırlıklı karıştırma — masaüstüyle AYNI formül: ağırlık = 1 + karma*0.6
 * (taban 0.12), sıra anahtarı `-ln(rastgele)/ağırlık`. Yüksek karma SIK ama
 * garanti değil; downvote'lu parça listede kalır, arkaya düşer.
 */
function weightedShuffle<T extends { karma?: number }>(tracks: T[]): T[] {
  return tracks
    .map((t) => ({ t, key: -Math.log(Math.random() || 1e-9) / Math.max(0.12, 1 + (t.karma ?? 0) * 0.6) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.t);
}

/** Arka arkaya AYNI sanatçı gelmesin (masaüstü `spreadByArtist`). */
function spreadByArtist<T extends { artist: string }>(items: T[]): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i++) {
    if (out[i].artist && out[i].artist === out[i - 1].artist) {
      let j = i + 1;
      while (j < out.length && out[j].artist === out[i - 1].artist) j++;
      if (j < out.length) [out[i], out[j]] = [out[j], out[i]];
    }
  }
  return out;
}

function seedArtistsOf(recs: Recommendation[]): string[] {
  return Array.from(new Set(recs.map((r) => r.seedArtist).filter((a): a is string => !!a)));
}

function rememberRecs(recs: Pick<Recommendation, "id" | "title" | "artist">[]): void {
  for (const r of recs) {
    recommendedThisSession.add(r.id);
    recommendedCoresThisSession.add(songCore(r.title, r.artist));
  }
}

/** Bu oturumda önerilenler + kuyrukta olanların şarkı çekirdekleri. */
function buildExcludeCores(): Set<string> {
  const cores = new Set(recommendedCoresThisSession);
  for (const it of usePlayerStore.getState().queue) cores.add(songCore(it.title, it.artist));
  return cores;
}

async function fetchDiscovery(opts: { excludeSeedArtists: Set<string>; record?: boolean }): Promise<Recommendation[]> {
  const s = useSettingsStore.getState();
  const st = usePlayerStore.getState();
  return getRecommendations({
    playlistId: DISCOVERY_ID,
    filters: st.discoveryFilters,
    lockedSeedArtist: st.lockedSeedArtist ?? undefined,
    excludeSeedArtists: opts.excludeSeedArtists,
    excludeIds: new Set([...st.skippedRecIds, ...recommendedThisSession]),
    excludeCores: buildExcludeCores(),
    limit: TARGET_QUEUE_AHEAD + 4,
    useYouTube: s.recYouTube,
    useLibrary: s.recLibrary,
    halfLifeDays: s.karmaHalfLifeDays,
    record: opts.record,
  });
}

/**
 * Keşfet'i önden hazırla (kayıt YAPILMAZ — kullanılmadan "harcanmasın";
 * kullanılınca `recordRecommended` ile yazılır). Yalnız Wi-Fi'da çağrılır.
 */
export async function prewarmDiscovery(): Promise<void> {
  if (prewarming || discoveryPrewarm || !recsAllowed()) return;
  prewarming = true;
  try {
    const recs = await fetchDiscovery({ excludeSeedArtists: new Set(), record: false });
    if (recs.length) {
      discoveryPrewarm = recs;
      void prewarmUrls(recs.slice(0, 2).map((r) => r.sourceId));
    }
  } catch (e) {
    console.warn("[keşfet] önden hazırlık başarısız:", errorText(e));
  } finally {
    prewarming = false;
  }
}

/**
 * ⭐ SIRADAKİNİ ÖNDEN İNDİR — yalnız Wi-Fi'da, yalnız bir parça.
 * Spekülatif indirme kullanıcının istemediği veriyi harcar → mobil veride
 * ASLA, ve dosya `permanent:false` ile LRU'ya açık kalır.
 */
async function prefetchNext(): Promise<void> {
  try {
    const { queue, index } = usePlayerStore.getState();
    const next = queue[index + 1];
    if (!next || next.source === "local") return;
    // Kazancı önden ölç: geçişte seviye sıçramasın (yalnız meta veri).
    void premeasure(next.id, next.sourceId);
    if (!useSettingsStore.getState().prefetchEnabled) return;
    if (await cachedPath(next.id)) return;
    await useDownloadStore.getState().enqueue(next, { permanent: false, speculative: true });
  } catch (e) {
    console.warn("[prefetch] sıradaki hazırlanamadı:", e);
  }
}
