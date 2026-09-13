import TrackPlayer, { Event, State } from "react-native-track-player";
import { AppState } from "react-native";

import { publishDeviceQueue } from "../lib/deviceQueue";
import { publishNowPlaying } from "../lib/nowPlaying";
import { DISCOVERY_ID, usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import type { QueueItem } from "../types";

/**
 * Çalma durumunu iki yere yazar:
 *  1. ⭐ ÇAPRAZ CİHAZ DEVAM (buluta): `now_playing` + `device_queue`. Yazma
 *     sıklığını modüllerin KENDİSİ kısıtlıyor (15/20 sn).
 *  2. KALDIĞIN YERDEN DEVAM (cihaza): `resumeState` ayarı — masaüstüyle aynı
 *     biçim. Keşfet'se TÜM kuyruk, değilse çalanın çevresindeki pencere.
 *
 * Arka plana geçerken `force` ile bir kez yazılır: OS uygulamayı öldürebilir
 * ve son durum kaybolur (MOBILE.md §1).
 */
let installed = false;
let lastSave = 0;
/** Kuyruk değişmedikçe JSON yeniden üretilmez (uzun listede her 10 sn 60 KB olmasın). */
let bodyCache: { queue: QueueItem[]; index: number; json: string } | null = null;

const SAVE_EVERY_MS = 10_000;
/** Normal kuyrukta saklanan pencere: çalanın 10 öncesi, 90 sonrası. */
const WINDOW_BEFORE = 10;
const WINDOW_AFTER = 90;

export function installPresence(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    void publish(Math.round(position * 1000), false);
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") return;
    void TrackPlayer.getProgress()
      .then(({ position }) => publish(Math.round(position * 1000), true))
      .catch(() => {});
  });
}

function resumeBody(): string | null {
  const st = usePlayerStore.getState();
  if (!st.current || !st.queue.length) return null;
  if (bodyCache && bodyCache.queue === st.queue && bodyCache.index === st.index) return bodyCache.json;
  const discovery = st.radioActive && st.radioPlaylistId === DISCOVERY_ID;
  let json: string;
  if (discovery) {
    json = JSON.stringify({
      mode: "discovery",
      queue: st.queue,
      queueIndex: st.index,
      seedArtists: st.discoverySeedArtists,
      filters: st.discoveryFilters,
    });
  } else {
    const from = Math.max(0, st.index - WINDOW_BEFORE);
    const slice = st.queue.slice(from, st.index + WINDOW_AFTER);
    json = JSON.stringify({
      mode: "queue",
      queue: slice,
      queueIndex: st.index - from,
      // Masaüstü tek parça biçimini okur — geriye dönük uyum için ikisi birden.
      track: st.current,
    });
  }
  bodyCache = { queue: st.queue, index: st.index, json };
  return json;
}

async function publish(positionMs: number, force: boolean): Promise<void> {
  const st = usePlayerStore.getState();
  if (!st.current) return;
  const now = Date.now();
  if (force || now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now;
    const body = resumeBody();
    if (body) {
      const payload = `${body.slice(0, -1)},"positionMs":${positionMs}}`;
      void useSettingsStore.getState().update("resumeState", payload);
    }
  }
  try {
    const playing = (await TrackPlayer.getPlaybackState()).state === State.Playing;
    const discovery = st.radioActive && st.radioPlaylistId === DISCOVERY_ID;
    await publishNowPlaying(st.current, positionMs, playing, force);
    await publishDeviceQueue(
      discovery ? "discovery" : "normal",
      st.queue,
      st.index,
      positionMs,
      // Keşfet sanal listesi uzak cihazda "liste" gibi görünmemeli.
      discovery ? null : (st.radioPlaylistId ?? st.current.playlistId ?? null),
      st.discoveryFilters,
      st.discoverySeedArtists,
      force
    );
  } catch (e) {
    // Senkron yoksa/çevrimdışıysa sessiz — çalmayı asla bozmaz.
    console.warn("[presence] yayınlanamadı:", e);
  }
}
