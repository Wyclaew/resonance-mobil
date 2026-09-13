import { create } from "zustand";

import { playlistCovers } from "../lib/insights";
import { usePlaylistStore } from "./usePlaylistStore";

/** Liste kapak mozaikleri — liste içeriği değişince (sayı değişimi) tazelenir. */
interface CoversState {
  covers: Record<string, string[]>;
  refresh: () => Promise<void>;
}

export const useCovers = create<CoversState>((set) => ({
  covers: {},
  refresh: async () => {
    try {
      set({ covers: await playlistCovers() });
    } catch (e) {
      console.warn("[kapak] okunamadı:", e);
    }
  },
}));

// Listeler yenilendiğinde (ekleme/çıkarma/senkron) kapaklar da yenilensin.
usePlaylistStore.subscribe((s, prev) => {
  if (s.playlists !== prev.playlists) void useCovers.getState().refresh();
});
