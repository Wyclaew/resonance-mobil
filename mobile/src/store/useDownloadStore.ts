import * as Network from "expo-network";
import { create } from "zustand";

import { downloadTrack, downloadedIds, pruneCache, removeDownload } from "../lib/downloads";
import { t } from "../lib/i18n.mobile";
import { getMobileSettings } from "../lib/mobileSettings";
import type { Track } from "../types";
import { useSettingsStore } from "./useSettingsStore";
import { useToastStore } from "./useToastStore";

export interface DownloadJob {
  track: Track;
  /** 0..1 */
  progress: number;
  status: "queued" | "running" | "done" | "failed";
  error?: string;
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
}

/**
 * İndirme kuyruğu — TEK SIRA çalışır.
 *
 * Neden paralel değil: mobil şebekede eşzamanlı indirme hem hızı bölüyor hem
 * de veri/pil tüketimini öngörülemez yapıyor. Masaüstündeki paralellik orada
 * bedava, burada değil (MOBILE.md §1).
 */
let running = false;
interface PendingItem {
  track: Track;
  permanent: boolean;
  speculative: boolean;
}
const pending: PendingItem[] = [];

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useDownloadStore = create<DownloadState>((set, get) => ({
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
    if (existing?.status === "running" || existing?.status === "queued") {
      // Spekülatif iş sırada bekliyorsa ve kullanıcı açıkça istediyse kalıcıya yükselt.
      const p = pending.find((x) => x.track.id === track.id);
      if (p && permanent) {
        p.permanent = true;
        p.speculative = false;
      }
      return;
    }
    set((s) => ({ jobs: { ...s.jobs, [track.id]: { track, progress: 0, status: "queued" } } }));
    pending.push({ track, permanent, speculative: opts.speculative ?? false });
    void drain(set, get);
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
}));

async function drain(
  set: (fn: (s: DownloadState) => Partial<DownloadState>) => void,
  get: () => DownloadState
): Promise<void> {
  if (running) return;
  running = true;
  let wifiWarned = false;
  try {
    while (pending.length) {
      const { track, permanent, speculative } = pending.shift()!;
      const update = (patch: Partial<DownloadJob>) =>
        set((s) => ({ jobs: { ...s.jobs, [track.id]: { ...s.jobs[track.id], ...patch } } }));

      // ⭐ Veri kotası: varsayılan olarak yalnız Wi-Fi'da indir (MOBILE.md §1).
      // Ön indirme HER ZAMAN yalnız Wi-Fi'da: kullanıcı istemediği bir dosya
      // için mobil veri harcanmaz (MOBILE.md §7).
      if (getMobileSettings().wifiOnly || speculative) {
        const state = await Network.getNetworkStateAsync();
        if (state.type !== Network.NetworkStateType.WIFI) {
          update({ status: "failed", error: t("m.dl.waitingWifi") });
          if (!speculative && !wifiWarned) {
            wifiWarned = true; // toplu indirmede 50 kez aynı uyarı çıkmasın
            useToastStore.getState().show(t("m.dl.wifiOnly"), "info");
          }
          continue;
        }
      }

      update({ status: "running", progress: 0 });
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
            update({ progress: p.ratio });
          },
        });
        update({ status: "done", progress: 1 });
        if (permanent) {
          set((s) => ({ downloaded: new Set(s.downloaded).add(track.id) }));
        }
        // Kota aşıldıysa en eski GEÇİCİ önbellek dosyaları budanır; kullanıcının
        // açıkça indirdikleri (downloaded=1) korunur.
        const limit = useSettingsStore.getState().cacheLimitGb * 1024 * 1024 * 1024;
        const { removed } = await pruneCache(limit);
        if (removed) console.log(`[indirme] LRU budama: ${removed} dosya silindi`);
      } catch (e) {
        update({ status: "failed", error: errorText(e) });
        if (!speculative) {
          useToastStore.getState().show(t("toast.downloadFailed", { title: track.title }), "error");
        }
      }
    }
  } finally {
    running = false;
    void get;
  }
}
