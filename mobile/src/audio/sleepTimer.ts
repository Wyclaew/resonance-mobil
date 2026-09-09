import TrackPlayer from "react-native-track-player";
import { create } from "zustand";

import { useSettingsStore } from "../store/useSettingsStore";

/**
 * Uyku zamanlayıcı — masaüstünde de var, mobilde daha da gerekli (telefon
 * yastıkta unutulur, sabaha kadar veri/pil yakar).
 *
 * Süre dolunca ses KADEMELİ kısılır (`playback.sleepFadeSeconds`), sonra
 * duraklatılır. Sert kesme uykuda rahatsız edici.
 */
interface SleepState {
  /** Bitiş zamanı (epoch ms) — yoksa kapalı. */
  endsAt: number | null;
  setMinutes: (minutes: number | null) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useSleepTimer = create<SleepState>((set) => ({
  endsAt: null,

  setMinutes: (minutes) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!minutes) {
      set({ endsAt: null });
      void TrackPlayer.setVolume(1);
      return;
    }
    const endsAt = Date.now() + minutes * 60_000;
    set({ endsAt });
    timer = setTimeout(() => {
      timer = null;
      set({ endsAt: null });
      void fadeOutAndPause();
    }, minutes * 60_000);
  },
}));

async function fadeOutAndPause(): Promise<void> {
  try {
    const seconds = Math.max(0, useSettingsStore.getState().sleepFadeSeconds || 0);
    const steps = Math.min(20, Math.max(1, Math.round(seconds)));
    for (let i = steps; i > 0; i--) {
      await TrackPlayer.setVolume(i / steps);
      await new Promise((r) => setTimeout(r, (seconds * 1000) / steps));
    }
    await TrackPlayer.pause();
  } catch (e) {
    console.error("[uyku] duraklatılamadı:", e);
  } finally {
    // Ses seviyesi geri açılmalı, yoksa sonraki çalma sessiz sanılır.
    await TrackPlayer.setVolume(1).catch(() => {});
  }
}
