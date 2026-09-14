import { create } from "zustand";

import type { Track } from "../types";

interface VersionPickerState {
  track: Track | null;
  /** İndirme hatasından açıldıysa: seçilen sürüm hemen indirilsin. */
  download: boolean;
  open: (track: Track, opts?: { download?: boolean }) => void;
  close: () => void;
}

/** "Sürüm seç" sayfası — parçayı elle başka bir YouTube yüklemesine bağlar. */
export const useVersionPicker = create<VersionPickerState>((set) => ({
  track: null,
  download: false,
  open: (track, opts = {}) => set({ track, download: !!opts.download }),
  close: () => set({ track: null, download: false }),
}));
