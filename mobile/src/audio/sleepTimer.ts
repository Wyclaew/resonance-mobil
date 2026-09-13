import TrackPlayer from "react-native-track-player";
import { create } from "zustand";

import { useSettingsStore } from "../store/useSettingsStore";
import { currentGain, holdVolume } from "./player";

/**
 * Uyku zamanlayıcı — masaüstünde de var, mobilde daha da gerekli (telefon
 * yastıkta unutulur, sabaha kadar veri/pil yakar).
 *
 * İki kip (masaüstüyle aynı, biri diğerini iptal eder):
 *  - süre: dolunca ses KADEMELİ kısılır (`sleepFadeSeconds`), sonra duraklatılır;
 *  - "şarkı bitince dur": sıradaki hazırlanmaz, kuyruk bitince durur
 *    (autoAdvance.ts).
 */
interface SleepState {
  /** Bitiş zamanı (epoch ms) — yoksa kapalı. */
  endsAt: number | null;
  afterTrack: boolean;
  setMinutes: (minutes: number | null) => void;
  setAfterTrack: (on: boolean) => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

function clearTimers(): void {
  if (timer) clearTimeout(timer);
  if (fadeTimer) clearTimeout(fadeTimer);
  timer = null;
  fadeTimer = null;
}

export const useSleepTimer = create<SleepState>((set) => ({
  endsAt: null,
  afterTrack: false,

  setMinutes: (minutes) => {
    clearTimers();
    restoreVolume();
    if (!minutes) {
      set({ endsAt: null });
      return;
    }
    const ms = minutes * 60_000;
    set({ endsAt: Date.now() + ms, afterTrack: false });
    const fadeMs = Math.max(0, useSettingsStore.getState().sleepFadeSeconds || 0) * 1000;
    // Kısma, süre dolmadan ÖNCE başlar: müzik tam bitiş anında sessizleşsin.
    if (fadeMs > 0 && ms > fadeMs) {
      fadeTimer = setTimeout(() => void fadeOut(fadeMs), ms - fadeMs);
    }
    timer = setTimeout(() => {
      clearTimers();
      set({ endsAt: null });
      void TrackPlayer.pause()
        .catch((e) => console.error("[uyku] duraklatılamadı:", e))
        .finally(restoreVolume);
    }, ms);
  },

  setAfterTrack: (on) => {
    clearTimers();
    restoreVolume();
    set({ afterTrack: on, endsAt: null });
  },
}));

let fading = false;

async function fadeOut(durationMs: number): Promise<void> {
  fading = true;
  holdVolume(true);
  try {
    const steps = Math.min(30, Math.max(1, Math.round(durationMs / 500)));
    const from = currentGain();
    for (let i = steps - 1; i >= 0 && fading; i--) {
      await TrackPlayer.setVolume((from * i) / steps);
      await new Promise((r) => setTimeout(r, durationMs / steps));
    }
  } catch (e) {
    console.warn("[uyku] ses kısılamadı:", e);
  }
}

/** Ses seviyesi geri açılmalı — ama 1'e değil, parçanın eşitleme kazancına. */
function restoreVolume(): void {
  if (!fading) return;
  fading = false;
  holdVolume(false);
  void TrackPlayer.setVolume(currentGain()).catch(() => {});
}
