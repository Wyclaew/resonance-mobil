import TrackPlayer, { Event } from "react-native-track-player";

/**
 * Arka plan oynatma servisi — kilit ekranı / bildirim / kulaklık tuşları.
 * Masaüstündeki `media_controls.rs` + `audio.rs` olay döngüsünün karşılığı.
 *
 * ⛔ MASAÜSTÜ DERSİ (CLAUDE.md v1.8.6-1.8.8, MOBILE.md §5.2-7): bu servis bir
 * hatada ÖLMEMELİ. Ses motoru thread'i panikleyince uygulama açık kaldığı hâlde
 * "bir daha hiçbir şey çalmıyor" durumu oluşuyordu. Her handler hatayı yutar.
 */
async function safely(label: string, fn: () => Promise<unknown> | unknown) {
  try {
    await fn();
  } catch (e) {
    console.error(`[audio] ${label} hatası (yutuldu):`, e);
  }
}

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => safely("play", () => TrackPlayer.play()));
  TrackPlayer.addEventListener(Event.RemotePause, () => safely("pause", () => TrackPlayer.pause()));
  TrackPlayer.addEventListener(Event.RemoteStop, () => safely("stop", () => TrackPlayer.stop()));
  TrackPlayer.addEventListener(Event.RemoteNext, () => safely("next", () => TrackPlayer.skipToNext()));
  TrackPlayer.addEventListener(Event.RemotePrevious, () =>
    safely("previous", () => TrackPlayer.skipToPrevious())
  );
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    safely("seek", () => TrackPlayer.seekTo(position))
  );
  TrackPlayer.addEventListener(Event.RemoteDuck, async ({ paused, permanent }) => {
    await safely("duck", async () => {
      if (permanent) return TrackPlayer.pause();
      if (paused) return TrackPlayer.pause();
      return TrackPlayer.play();
    });
  });
  TrackPlayer.addEventListener(Event.PlaybackError, (e) => {
    // Sessiz ölüm YOK: hata görünür olsun (masaüstünde "neden çalmıyor" bug'ı
    // aylarca böyle gizlendi).
    console.error("[audio] oynatma hatası:", e);
  });
}
