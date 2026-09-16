import { create } from "zustand";

import { downloadUpdate, installUpdate, skipVersion, type UpdateInfo } from "../lib/updater";

type Phase = "ask" | "downloading" | "ready" | "failed";

interface UpdateState {
  info: UpdateInfo | null;
  phase: Phase;
  /** 0..1 */
  progress: number;
  error: string | null;
  prompt: (info: UpdateInfo) => void;
  close: () => void;
  skip: () => void;
  start: () => Promise<void>;
}

/** "Yeni sürüm var" akışı — sayfa `components/UpdateSheet.tsx`. */
export const useUpdate = create<UpdateState>((set, get) => ({
  info: null,
  phase: "ask",
  progress: 0,
  error: null,

  prompt: (info) => set({ info, phase: "ask", progress: 0, error: null }),
  close: () => set({ info: null, phase: "ask", progress: 0, error: null }),
  skip: () => {
    const info = get().info;
    if (info) void skipVersion(info.version);
    set({ info: null, phase: "ask", progress: 0, error: null });
  },

  start: async () => {
    const info = get().info;
    if (!info || get().phase === "downloading") return;
    set({ phase: "downloading", progress: 0, error: null });
    try {
      const file = await downloadUpdate(info, (ratio) => set({ progress: ratio }));
      set({ phase: "ready", progress: 1 });
      await installUpdate(file, info);
    } catch (e) {
      console.warn("[güncelleme] indirilemedi:", e);
      set({ phase: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
