import TrackPlayer, { Event } from "react-native-track-player";

import { voteCurrent } from "../lib/vote";
import { usePlayerStore } from "../store/usePlayerStore";

/**
 * Arka plan oynatma servisi — kilit ekranı / bildirim / kulaklık tuşları.
 * Masaüstündeki `media_controls.rs` olay döngüsünün karşılığı.
 *
 * ⚠️ BUG'DI: "sonraki/önceki" doğrudan track-player'a gidiyordu
 * (`skipToNext`). Kuyruk mantığı (tekrar, karışık, Keşfet beslemesi, dinleme
 * kaydı) store'da olduğu için bu tuşlar ya hiçbir şey yapmıyor ya da öğrenmeyi
 * atlıyordu. Artık arayüzdeki düğmelerle AYNI yoldan geçer.
 *
 * ⛔ MASAÜSTÜ DERSİ (CLAUDE.md v1.8.6-1.8.8): bu servis bir hatada ÖLMEMELİ.
 * Her handler hatayı yutar.
 */
async function safely(label: string, fn: () => Promise<unknown> | unknown) {
  try {
    await fn();
  } catch (e) {
    console.error(`[audio] ${label} hatası (yutuldu):`, e);
  }
}

const player = () => usePlayerStore.getState();

export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => safely("play", () => player().toggle()));
  TrackPlayer.addEventListener(Event.RemotePause, () => safely("pause", () => TrackPlayer.pause()));
  // "Durdur" konumu sıfırlamasın: kaldığın yerden devam edilebilsin.
  TrackPlayer.addEventListener(Event.RemoteStop, () => safely("stop", () => TrackPlayer.pause()));
  TrackPlayer.addEventListener(Event.RemoteNext, () => safely("next", () => player().next("next")));
  TrackPlayer.addEventListener(Event.RemotePrevious, () => safely("previous", () => player().previous()));
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    safely("seek", () => TrackPlayer.seekTo(position))
  );
  // Ses odağı kaybı (arama, başka uygulama) `autoHandleInterruptions` ile
  // track-player'da; burada ayrıca ele almak duraklatılmış müziği geri açıyordu.
  // Kilit ekranı / bildirim oyu — arayüzdeki oyla AYNI yoldan geçer
  // (`vote.ts`), yoksa oy sessizce öğrenmeye katılmazdı.
  TrackPlayer.addEventListener(Event.RemoteLike, () => safely("like", () => voteCurrent(1)));
  TrackPlayer.addEventListener(Event.RemoteDislike, () => safely("dislike", () => voteCurrent(-1)));
}
