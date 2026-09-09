import TrackPlayer from "react-native-track-player";
import { create } from "zustand";

import { playTrack } from "../audio/player";
import * as Extractor from "../../modules/resonance-extractor";
import type { RemoteQueue } from "../lib/deviceQueue";
import { getRecommendations, songCore, type Recommendation } from "../lib/recommender";
import type { QueueItem, Track } from "../types";
import { useSettingsStore } from "./useSettingsStore";

/**
 * Oynatma kuyruğu — masaüstündeki `usePlayerStore.ts`'in (1731 satır) mobil
 * çekirdeği. Kasten küçük başlıyor; Keşfet/öneri akışı Faz 4'te eklenecek.
 *
 * ⚠️ Masaüstündeki yarış-koşulu dersleri (CLAUDE.md gotcha #6–#10) burada da
 * geçerli: her `playNow` bir "token" alır, geç dönen eski çağrı durumu EZMEZ.
 */
interface PlayerState {
  current: QueueItem | null;
  queue: QueueItem[];
  index: number;
  loading: boolean;
  error: string | null;
  /** Keşfet kuyruğu mu çalıyor? */
  discovery: boolean;
  /** Bu partiyi getiren tohum sanatçılar — "başka tarz" bunları dışlar. */
  discoverySeedArtists: string[];
  discoveryFilters: string[];
  /** `playlistId` verilirse kuyruğun tamamı o listeden sayılır → oy verilebilir. */
  playNow: (track: QueueSource, queue?: QueueSource[], playlistId?: string) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  /** Keşfet: öneri motorundan yeni parti kurar ve çalmaya başlar. */
  startDiscovery: (filters?: string[]) => Promise<void>;
  /** "Başka tarz": mevcut partinin tohum sanatçılarını dışlayıp yeniden kurar. */
  rerollDiscovery: () => Promise<void>;
  /** Kaynak koptuğunda aynı parçayı kaldığı saniyeden yeniden bağlar. */
  resumeCurrent: (fromSeconds: number) => Promise<void>;
  /** ⭐ Çapraz cihaz devam: PC'deki kuyruğu DURAKLATILMIŞ kurar. */
  adoptRemoteQueue: (remote: RemoteQueue) => Promise<void>;
}

/** Keşfet oturumunun sanal liste kimliği — masaüstüyle AYNI değer. */
export const DISCOVERY_ID = "__discovery__";

/**
 * Kuyrukta ileride tutulacak parça sayısı. Masaüstünde 20; mobilde
 * MOBILE.md §7 gereği DÜŞÜK: her öneri bir radyo isteği, her istek pil + veri.
 */
const TARGET_QUEUE_AHEAD = 10;

// Oturum belleği: aynı şarkı (ve aynı şarkının başka kaydı) tekrar gelmesin.
// ⚠️ `excludeIds` TEK BAŞINA YETMEZ — aynı şarkının farklı yüklemesinin id'si
// farklıdır; `songCore` çekirdeği bunu yakalar (CLAUDE.md).
const recommendedThisSession = new Set<string>();
const recommendedCoresThisSession = new Set<string>();

let token = 0;
let refilling = false;
/** Öneriden gelen alanlar (gerekçe, tohum) kuyrukta KORUNUR — arayüz
 *  "neden bu şarkı" diye gösteriyor ve reroll tohumları buradan okuyor. */
type QueueSource = Track & Partial<Pick<Recommendation, "reason" | "seedArtist" | "recSource">>;

const toItem = (t: QueueSource, i: number, playlistId?: string): QueueItem => ({
  ...t,
  uid: `${t.id}#${i}#${Date.now()}`,
  playlistId,
  isRecommendation: !!t.reason,
  recReason: t.reason,
  recSource: t.recSource,
  seedArtist: t.seedArtist,
});

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  index: -1,
  loading: false,
  error: null,
  discovery: false,
  discoverySeedArtists: [],
  discoveryFilters: [],

  playNow: async (track, queue, playlistId) => {
    const mine = ++token;
    const items = (queue ?? [track]).map((t, i) => toItem(t, i, playlistId));
    const index = Math.max(0, items.findIndex((i) => i.id === track.id));
    set({ queue: items, index, current: items[index], loading: true, error: null });
    try {
      await playTrack(track);
      if (mine !== token) return; // geç dönen eski çağrı — durumu bozma
      set({ loading: false });
    } catch (e) {
      if (mine !== token) return;
      // ⛔ "Yükleniyor"da ASILI KALMA (CLAUDE.md v1.8.8): hata olunca durumu
      // duraklatılmışa çek, yoksa oynat tuşu tamamen ölür.
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      console.error("[player] çalınamadı:", e);
    }
  },

  next: async () => {
    const { queue, index, discovery } = get();
    const nextIndex = index + 1;
    // Sonsuz radyo: sona yaklaşınca arka planda yeni parti ekle (masaüstündeki
    // `refillRadio` karşılığı). Mobilde eşik düşük tutulur — her çağrı veri.
    if (discovery && nextIndex >= queue.length - 2) void refillDiscovery(set, get);
    if (nextIndex >= queue.length) return;
    await get().playNow(queue[nextIndex], queue, queue[nextIndex].playlistId);
  },

  adoptRemoteQueue: async (remote) => {
    if (!remote.queue.length) return;
    const mine = ++token;
    const index = Math.min(Math.max(0, remote.queueIndex), remote.queue.length - 1);
    // Kuyruk uzaktan geldiği gibi kurulur; uid'ler yeniden üretilmez ki
    // masaüstündeki sırayla birebir aynı kalsın.
    set({
      queue: remote.queue,
      index,
      current: remote.queue[index],
      discovery: remote.mode === "discovery",
      discoverySeedArtists: remote.seeds,
      discoveryFilters: remote.filters,
      loading: true,
      error: null,
    });
    try {
      await playTrack(remote.queue[index], {
        startSeconds: Math.floor(remote.positionMs / 1000),
        autoplay: false,
      });
      if (mine !== token) return;
      set({ loading: false });
    } catch (e) {
      if (mine !== token) return;
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  resumeCurrent: async (fromSeconds) => {
    const current = get().current;
    if (!current) return;
    try {
      await playTrack(current, { startSeconds: fromSeconds });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  startDiscovery: async (filters) => {
    set({ loading: true, error: null, discoveryFilters: filters ?? [] });
    try {
      const recs = await fetchDiscovery(filters ?? [], new Set());
      if (!recs.length) throw new Error("öneri bulunamadı — biraz dinle/oy ver, havuz dolsun");
      await startBatch(set, get, recs);
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
      console.error("[keşfet] başlatılamadı:", e);
    }
  },

  rerollDiscovery: async () => {
    // Mevcut partinin tohumlarını dışla → gelen tarz GERÇEKTEN değişsin
    // (CLAUDE.md: `excludeSeedArtists` olmadan aynı radyolar tekrar açılıyor).
    const exclude = new Set(get().discoverySeedArtists.map((a) => a.toLowerCase()));
    set({ loading: true, error: null });
    try {
      const recs = await fetchDiscovery(get().discoveryFilters, exclude);
      if (!recs.length) throw new Error("başka tarz bulunamadı");
      await startBatch(set, get, recs);
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  previous: async () => {
    const { queue, index } = get();
    const position = (await TrackPlayer.getProgress()).position;
    // 3 saniyeden sonra "önceki" = baştan başlat (yaygın oynatıcı davranışı).
    if (position > 3) return void TrackPlayer.seekTo(0);
    if (index <= 0) return void TrackPlayer.seekTo(0);
    await get().playNow(queue[index - 1], queue, queue[index - 1].playlistId);
  },
}));


// ── Keşfet yardımcıları ────────────────────────────────────────────────────

async function fetchDiscovery(
  filters: string[],
  excludeSeedArtists: Set<string>
): Promise<Recommendation[]> {
  const s = useSettingsStore.getState();
  return getRecommendations({
    playlistId: DISCOVERY_ID,
    filters,
    excludeSeedArtists,
    excludeIds: new Set(recommendedThisSession),
    excludeCores: new Set(recommendedCoresThisSession),
    limit: TARGET_QUEUE_AHEAD,
    useYouTube: s.recYouTube,
    useLibrary: s.recLibrary,
    halfLifeDays: s.karmaHalfLifeDays,
  });
}

type Setter = (partial: Partial<PlayerState>) => void;

async function startBatch(
  set: Setter,
  get: () => PlayerState,
  recs: Recommendation[]
): Promise<void> {
  for (const r of recs) {
    recommendedThisSession.add(r.id);
    recommendedCoresThisSession.add(songCore(r.title, r.artist));
  }
  const seeds = Array.from(
    new Set(recs.map((r) => r.seedArtist).filter((a): a is string => !!a))
  );
  set({ discovery: true, discoverySeedArtists: seeds });
  await get().playNow(recs[0], recs, DISCOVERY_ID);

  // ⭐ Adresleri ÖNDEN çöz (indirme değil): ölçümde hazır olma süresinin %70'i
  // adres çözümü, ve bu iş pil açısından ucuz (MOBILE.md §5). Gerçek indirme
  // muhafazakâr kalır — veri kotası.
  const next = recs.slice(1, 4).map((r) => r.sourceId);
  if (next.length) {
    Extractor.resolveMany(next, 3).catch((e) => console.warn("[keşfet] ısıtma:", e));
  }
}

/**
 * Kuyruk tükenmeden yeni öneri ekler. Hata olursa SESSİZ: kullanıcı çalmaya
 * devam etsin, bir sonraki denemede yine denenir.
 */
async function refillDiscovery(set: Setter, get: () => PlayerState): Promise<void> {
  if (refilling) return;
  refilling = true;
  try {
    const recs = await fetchDiscovery(get().discoveryFilters, new Set());
    if (!recs.length) return;
    for (const r of recs) {
      recommendedThisSession.add(r.id);
      recommendedCoresThisSession.add(songCore(r.title, r.artist));
    }
    const queue = get().queue;
    const added = recs.map((r, i) => toItem(r, queue.length + i, DISCOVERY_ID));
    set({ queue: [...queue, ...added] });
  } catch (e) {
    console.warn("[keşfet] kuyruk tazelenemedi:", e);
  } finally {
    refilling = false;
  }
}
