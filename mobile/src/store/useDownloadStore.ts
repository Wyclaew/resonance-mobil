import * as Network from "expo-network";
import { create } from "zustand";

import { downloadTrack, downloadedIds, isNetworkError, pruneCache, removeDownload } from "../lib/downloads";
import { t } from "../lib/i18n.mobile";
import { getMobileSettings } from "../lib/mobileSettings";
import type { Track } from "../types";
import { useSettingsStore } from "./useSettingsStore";
import { useToastStore } from "./useToastStore";

export interface DownloadJob {
  track: Track;
  /** 0..1 */
  progress: number;
  /** waiting = ağ/Wi-Fi bekleniyor; gelince KENDİLİĞİNDEN devam eder. */
  status: "queued" | "running" | "waiting" | "done" | "failed";
  error?: string;
  /** Sıradakini önden indirme — kullanıcının kuyruğunda gösterilmez. */
  speculative?: boolean;
}

interface DownloadState {
  jobs: Record<string, DownloadJob>;
  /** Kalıcı indirilmiş parça kimlikleri (açılışta DB'den yüklenir). */
  downloaded: Set<string>;
  refresh: () => Promise<void>;
  /**
   * `permanent` false ise dosya LRU budamasına AÇIK kalır — ön indirme
   * (spekülatif) böyle yapılır, kullanıcının açıkça indirdiği korunur.
   * `speculative` true ise hata sessizdir: kullanıcı istemedi, rahatsız etme.
   */
  enqueue: (track: Track, opts?: { permanent?: boolean; speculative?: boolean }) => Promise<void>;
  /** Toplu indirme (listeyi çevrimdışına al) — indirilmişleri atlar. */
  enqueueMany: (tracks: Track[]) => Promise<number>;
  remove: (trackId: string) => Promise<void>;
  /** Başarısız/bekleyen işi hemen yeniden dene. */
  retry: (trackId: string) => void;
  /** Başarısız işleri listeden temizle. */
  clearFailed: () => void;
}

/**
 * İndirme kuyruğu — TEK SIRA çalışır.
 *
 * Neden paralel değil: mobil şebekede eşzamanlı indirme hem hızı bölüyor hem
 * de veri/pil tüketimini öngörülemez yapıyor (MOBILE.md §1).
 *
 * ⚠️ BUG'DI: bağlantı koptuğunda ya da Wi-Fi yokken iş "başarısız" sayılıp
 * listeden düşüyordu; kullanıcı "Tümünü indir"i yeniden basmak zorundaydı.
 * Artık iş BEKLER ve ağ gelince kaldığı bayttan devam eder.
 */
let running = false;
interface PendingItem {
  track: Track;
  permanent: boolean;
  speculative: boolean;
}
const pending: PendingItem[] = [];
/** Ağ/Wi-Fi bekleyen işler. */
const parked: PendingItem[] = [];
let listening = false;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function networkReady(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected) return false;
  if (getMobileSettings().wifiOnly) return state.type === Network.NetworkStateType.WIFI;
  return true;
}

export const useDownloadStore = create<DownloadState>((set, get) => {
  function update(trackId: string, patch: Partial<DownloadJob>) {
    set((s) => (s.jobs[trackId] ? { jobs: { ...s.jobs, [trackId]: { ...s.jobs[trackId], ...patch } } } : {}));
  }

  function forget(trackId: string) {
    set((s) => {
      const jobs = { ...s.jobs };
      delete jobs[trackId];
      return { jobs };
    });
  }

  function park(item: PendingItem, reason: string) {
    if (!parked.some((p) => p.track.id === item.track.id)) parked.push(item);
    update(item.track.id, { status: "waiting", error: reason });
    if (listening) return;
    listening = true;
    // Ağ geri gelince bekleyenleri kuyruğa geri al (abonelik tek, işler bitince kapanır).
    const sub = Network.addNetworkStateListener(() => {
      void networkReady().then((ok) => {
        if (!ok || !parked.length) return;
        pending.push(...parked.splice(0));
        for (const p of pending) update(p.track.id, { status: "queued", error: undefined });
        sub.remove();
        listening = false;
        void drain();
      });
    });
  }

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    let wifiWarned = false;
    try {
      while (pending.length) {
        const item = pending.shift()!;
        const { track, permanent, speculative } = item;

        // ⭐ Veri kotası: varsayılan olarak yalnız Wi-Fi'da (MOBILE.md §1).
        // Ön indirme HER ZAMAN yalnız Wi-Fi'da ve beklemeye alınmaz (kullanıcı istemedi).
        const net = await Network.getNetworkStateAsync();
        const onWifi = net.type === Network.NetworkStateType.WIFI;
        if (speculative && !onWifi) {
          forget(track.id); // kullanıcı istemedi: iz bırakma (satırda uyarı ikonu çıkmasın)
          continue;
        }
        if (!net.isConnected || (getMobileSettings().wifiOnly && !onWifi)) {
          park(item, net.isConnected ? t("m.dl.waitingWifi") : t("m.dl.waitingNetwork"));
          if (net.isConnected && !wifiWarned) {
            wifiWarned = true; // toplu indirmede 50 kez aynı uyarı çıkmasın
            useToastStore.getState().show(t("m.dl.wifiOnly"), "info");
          }
          continue;
        }

        update(track.id, { status: "running", progress: 0, error: undefined });
        let lastTick = 0;
        try {
          await downloadTrack(track, {
            permanent,
            quality: useSettingsStore.getState().audioQuality,
            onProgress: (p) => {
              // İlerlemeyi saniyede ~4 kez yay: her MB'de store güncellemek listeyi yoruyor.
              const now = Date.now();
              if (now - lastTick < 250 && p.ratio < 1) return;
              lastTick = now;
              update(track.id, { progress: p.ratio });
            },
          });
          update(track.id, { status: "done", progress: 1 });
          if (permanent) set((s) => ({ downloaded: new Set(s.downloaded).add(track.id) }));
          // Kota aşıldıysa en eski GEÇİCİ önbellek dosyaları budanır; indirilenler korunur.
          const limit = useSettingsStore.getState().cacheLimitGb * 1024 * 1024 * 1024;
          const { removed } = await pruneCache(limit);
          if (removed) console.log(`[indirme] LRU budama: ${removed} dosya silindi`);
        } catch (e) {
          if (!speculative && isNetworkError(e)) {
            // Bağlantı koptu: iş kaybolmasın, ağ gelince kaldığı yerden sürer.
            console.warn(`[indirme] ${track.title}: ağ bekleniyor (${errorText(e)})`);
            park(item, t("m.dl.waitingNetwork"));
            continue;
          }
          if (speculative) {
            forget(track.id);
            console.warn(`[önden indirme] ${track.title}: ${errorText(e)}`);
            continue;
          }
          update(track.id, { status: "failed", error: errorText(e) });
          // ⚠️ Nedeni yazılmıyordu: kullanıcı raporunda yalnız "İndirilemedi: <başlık>"
          // vardı, neden yoktu. Log (rapora girer) + bildirime kısa neden.
          console.warn(`[indirme] ${track.title} (${track.sourceId}) indirilemedi:`, errorText(e));
          if (!speculative) {
            useToastStore
              .getState()
              .show(`${t("toast.downloadFailed", { title: track.title })} — ${errorText(e).slice(0, 120)}`, "error");
          }
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    jobs: {},
    downloaded: new Set(),

    refresh: async () => {
      try {
        set({ downloaded: new Set(await downloadedIds()) });
      } catch (e) {
        console.warn("[indirme] liste okunamadı:", e);
      }
    },

    enqueue: async (track, opts = {}) => {
      // Yerel dosya zaten diskte; başka cihazın yerel dosyası ise indirilemez.
      if (track.source === "local") {
        if (!opts.speculative) useToastStore.getState().show(t("m.dl.local"), "info");
        return;
      }
      const permanent = opts.permanent ?? true;
      if (permanent && get().downloaded.has(track.id)) return;
      const existing = get().jobs[track.id];
      if (existing && (existing.status === "running" || existing.status === "queued" || existing.status === "waiting")) {
        // Spekülatif iş bekliyorsa ve kullanıcı açıkça istediyse kalıcıya yükselt.
        const p = pending.find((x) => x.track.id === track.id) ?? parked.find((x) => x.track.id === track.id);
        if (p && permanent) {
          p.permanent = true;
          p.speculative = false;
          update(track.id, { speculative: false });
        }
        return;
      }
      set((s) => ({
        jobs: { ...s.jobs, [track.id]: { track, progress: 0, status: "queued", speculative: !!opts.speculative } },
      }));
      pending.push({ track, permanent, speculative: opts.speculative ?? false });
      void drain();
    },

    enqueueMany: async (tracks) => {
      let n = 0;
      for (const tr of tracks) {
        if (tr.source === "local" || get().downloaded.has(tr.id)) continue;
        await get().enqueue(tr, { permanent: true, speculative: false });
        n++;
      }
      return n;
    },

    remove: async (trackId) => {
      await removeDownload(trackId);
      set((s) => {
        const downloaded = new Set(s.downloaded);
        downloaded.delete(trackId);
        const jobs = { ...s.jobs };
        delete jobs[trackId];
        return { downloaded, jobs };
      });
    },

    retry: (trackId) => {
      const job = get().jobs[trackId];
      if (!job || job.status === "running" || job.status === "queued") return;
      const at = parked.findIndex((p) => p.track.id === trackId);
      if (at >= 0) parked.splice(at, 1);
      set((s) => ({ jobs: { ...s.jobs, [trackId]: { ...job, status: "queued", error: undefined, progress: 0 } } }));
      pending.push({ track: job.track, permanent: true, speculative: false });
      void drain();
    },

    clearFailed: () =>
      set((s) => ({
        jobs: Object.fromEntries(Object.entries(s.jobs).filter(([, j]) => j.status !== "failed")),
      })),
  };
});
