import TrackPlayer from "react-native-track-player";
import { create } from "zustand";

import { playTrack } from "../audio/player";
import type { QueueItem, Track } from "../types";

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
  /** `playlistId` verilirse kuyruğun tamamı o listeden sayılır → oy verilebilir. */
  playNow: (track: Track, queue?: Track[], playlistId?: string) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
}

let token = 0;
const toItem = (t: Track, i: number, playlistId?: string): QueueItem => ({
  ...t,
  uid: `${t.id}#${i}#${Date.now()}`,
  playlistId,
});

export const usePlayerStore = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  index: -1,
  loading: false,
  error: null,

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
    const { queue, index } = get();
    const nextIndex = index + 1;
    if (nextIndex >= queue.length) return;
    await get().playNow(queue[nextIndex], queue, queue[nextIndex].playlistId);
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
