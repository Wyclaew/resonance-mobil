import * as Network from "expo-network";
import { create } from "zustand";

import { downloadTrack, pruneCache } from "../lib/downloads";
import { getMobileSettings } from "../lib/mobileSettings";
import { useToastStore } from "./useToastStore";
import { useSettingsStore } from "./useSettingsStore";
import type { Track } from "../types";

export interface DownloadJob {
  track: Track;
  /** 0..1 */
  progress: number;
  status: "bekliyor" | "iniyor" | "bitti" | "hata";
  error?: string;
}

interface DownloadState {
  jobs: Record<string, DownloadJob>;
  /**
   * `permanent` false ise dosya LRU budamasına AÇIK kalır — ön indirme
   * (spekülatif) böyle yapılır, kullanıcının açıkça indirdiği korunur.
   * `speculative` true ise hata sessizdir: kullanıcı istemedi, rahatsız etme.
   */
  enqueue: (track: Track, opts?: { permanent?: boolean; speculative?: boolean }) => Promise<void>;
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

export const useDownloadStore = create<DownloadState>((set, get) => ({
  jobs: {},

  enqueue: async (track, opts = {}) => {
    // Yerel dosya zaten diskte; başka cihazın yerel dosyası ise indirilemez.
    if (track.source === "local") {
      if (!opts.speculative) useToastStore.getState().show("Yerel dosya — indirmeye gerek yok", "info");
      return;
    }
    const existing = get().jobs[track.id];
    if (existing?.status === "iniyor" || existing?.status === "bitti") return;
    if (pending.some((p) => p.track.id === track.id)) return;
    set((s) => ({
      jobs: { ...s.jobs, [track.id]: { track, progress: 0, status: "bekliyor" } },
    }));
    pending.push({
      track,
      permanent: opts.permanent ?? true,
      speculative: opts.speculative ?? false,
    });
    void drain(set, get);
  },
}));

async function drain(
  set: (fn: (s: DownloadState) => Partial<DownloadState>) => void,
  get: () => DownloadState
): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (pending.length) {
      const { track, permanent, speculative } = pending.shift()!;
      const update = (patch: Partial<DownloadJob>) =>
        set((s) => ({
          jobs: { ...s.jobs, [track.id]: { ...s.jobs[track.id], ...patch } },
        }));

      // ⭐ Veri kotası: varsayılan olarak yalnız Wi-Fi'da indir (MOBILE.md §1).
      // Ön indirme HER ZAMAN yalnız Wi-Fi'da: kullanıcı istemediği bir dosya
      // için mobil veri harcanmaz (MOBILE.md §7).
      if (getMobileSettings().wifiOnly || speculative) {
        const state = await Network.getNetworkStateAsync();
        if (state.type !== Network.NetworkStateType.WIFI) {
          update({ status: "hata", error: "Wi-Fi bekleniyor" });
          if (!speculative) useToastStore.getState().show("Wi-Fi yokken indirme kapalı", "info");
          continue;
        }
      }

      update({ status: "iniyor", progress: 0 });
      try {
        await downloadTrack(track, {
          permanent,
          onProgress: (p) => update({ progress: p.ratio }),
        });
        update({ status: "bitti", progress: 1 });
        // Kota aşıldıysa en eski GEÇİCİ önbellek dosyaları budanır; kullanıcının
        // açıkça indirdikleri (downloaded=1) korunur.
        const limit = useSettingsStore.getState().cacheLimitGb * 1024 * 1024 * 1024;
        const { removed } = await pruneCache(limit);
        if (removed) console.log(`[indirme] LRU budama: ${removed} dosya silindi`);
      } catch (e) {
        update({ status: "hata", error: e instanceof Error ? e.message : String(e) });
        if (!speculative) {
          useToastStore.getState().show("İndirilemedi: " + (e instanceof Error ? e.message : e), "error");
        }
      }
    }
  } finally {
    running = false;
    void get;
  }
}
