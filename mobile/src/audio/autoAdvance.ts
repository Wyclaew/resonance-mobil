import TrackPlayer, { Event, State } from "react-native-track-player";

import { recordPlay } from "../lib/history";
import { usePlayerStore } from "../store/usePlayerStore";

/**
 * Kuyruğu ilerletme + dinleme kaydı. Açılışta bir kez kurulur.
 *
 * ⛔⛔ MASAÜSTÜNÜN EN PAHALI DERSİ (CLAUDE.md v1.8.5-1.8.6, MOBILE.md §5.2-1):
 * **"kaynak bitti" ≠ "şarkı bitti".** İndirirken/akış çalarken bağlantı koparsa
 * oynatıcı dosyanın sonuna gelip "bitti" yayıyor; kuyruk ilerletilirse şarkı
 * 35-45. saniyede SESSİZCE ATLANIYOR. Aylarca "garip şekilde atlıyor" diye
 * görüldü. Bu yüzden burada bitişin GERÇEK olduğu doğrulanır: konum beklenen
 * süreye yakın değilse kuyruk ilerletilmez, aynı parça kaldığı saniyeden
 * yeniden bağlanır.
 */

/** Bitişi gerçek saymak için gereken yakınlık (saniye). */
const END_TOLERANCE = 6;

let installed = false;
/** Bu parça için o ana kadar dinlenen süre (kayıt için). */
let lastPositionMs = 0;

export function installAutoAdvance(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position }) => {
    lastPositionMs = Math.round(position * 1000);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    try {
      const { position, duration } = await TrackPlayer.getProgress();
      const store = usePlayerStore.getState();
      const current = store.current;
      const expected = duration > 0 ? duration : (current?.durationMs ?? 0) / 1000;

      if (expected > 0 && position < expected - END_TOLERANCE) {
        // Kaynak koptu, şarkı bitmedi → kaldığı yerden yeniden bağlan.
        console.warn(
          `[audio] kaynak erken bitti (${position.toFixed(0)}/${expected.toFixed(0)} sn) — yeniden bağlanılıyor`
        );
        if (current) await store.resumeCurrent(Math.floor(position));
        return;
      }

      if (current) {
        // Dinleme kaydı öneri motorunu besler (>%70 dinlenen parça karma alır).
        await recordPlay(current, Math.max(lastPositionMs, Math.round(position * 1000)));
      }
      lastPositionMs = 0;
      await store.next();
    } catch (e) {
      // Servis ÖLMEMELİ (v1.8.6 dersi): hata yut, kullanıcı kalsın.
      console.error("[audio] kuyruk ilerletme hatası:", e);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (e) => {
    console.error("[audio] oynatma hatası:", e);
    const state = (await TrackPlayer.getPlaybackState()).state;
    if (state === State.Error) usePlayerStore.setState({ error: "oynatma hatası" });
  });
}
