import TrackPlayer, { Event, State } from "react-native-track-player";
import { AppState } from "react-native";

import { publishDeviceQueue } from "../lib/deviceQueue";
import { publishNowPlaying } from "../lib/nowPlaying";
import { usePlayerStore } from "../store/usePlayerStore";

/**
 * ⭐ ÇAPRAZ CİHAZ DEVAM (MOBILE.md §5.1: "mobilin en görünür kazancı").
 * Bu cihazın ne çaldığını ve kuyruğunu buluta yazar; masaüstü aynı tabloları
 * okur (`now_playing`, `device_queue`).
 *
 * Yazma sıklığını modüllerin KENDİSİ kısıtlıyor (15/20 sn) — burada her saniye
 * çağırmak güvenli. Yine de arka plana geçerken `force` ile bir kez yazıyoruz:
 * OS uygulamayı öldürebilir ve son durum kaybolur (MOBILE.md §1).
 */
let installed = false;

export function installPresence(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    void publish(Math.round(position * 1000), false);
  });

  AppState.addEventListener("change", (state) => {
    if (state === "active") return;
    void TrackPlayer.getProgress().then(({ position }) =>
      publish(Math.round(position * 1000), true)
    );
  });
}

async function publish(positionMs: number, force: boolean): Promise<void> {
  try {
    const st = usePlayerStore.getState();
    if (!st.current) return;
    const playing = (await TrackPlayer.getPlaybackState()).state === State.Playing;
    await publishNowPlaying(st.current, positionMs, playing, force);
    await publishDeviceQueue(
      st.discovery ? "discovery" : "normal",
      st.queue,
      st.index,
      positionMs,
      // Keşfet sanal listesi uzak cihazda "liste" gibi görünmemeli.
      st.discovery ? null : (st.current.playlistId ?? null),
      st.discoveryFilters,
      st.discoverySeedArtists,
      force
    );
  } catch (e) {
    // Senkron yoksa/çevrimdışıysa sessiz — çalmayı asla bozmaz.
    console.warn("[presence] yayınlanamadı:", e);
  }
}
