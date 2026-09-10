import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RatingType,
  RepeatMode,
  State,
} from "react-native-track-player";

import * as Extractor from "../../modules/resonance-extractor";
import { cachedPath } from "../lib/downloads";
import { findAlternative, isUnavailable } from "../lib/relink";
import { bestThumb } from "../lib/thumbs";
import type { Track } from "../types";

let ready = false;

/** Uygulama açılışında bir kez. Çift kurulum RNTP'de hata fırlatır. */
export async function setupAudio(): Promise<void> {
  if (ready) return;
  try {
    await TrackPlayer.setupPlayer({ autoHandleInterruptions: true });
  } catch (e) {
    // "player already initialized" — sıcak yeniden yüklemede normal.
    console.warn("[audio] setupPlayer:", e);
  }
  await TrackPlayer.updateOptions({
    android: {
      // Bildirimden kaydırınca çalma dursun (pil), servis öldürülmesin.
      appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    // ⭐ Bildirimden OY: karma bu uygulamanın çekirdeği, kilit ekranından
    // ulaşılabilir olması gerekir. Başparmak yukarı/aşağı → `vote.ts`.
    ratingType: RatingType.ThumbsUpDown,
    likeOptions: { isActive: false, title: "Beğen" },
    dislikeOptions: { isActive: false, title: "Beğenme" },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
      Capability.SetRating,
    ],
    // v5: "compactCapabilities" yerine bildirimde gorunecek yetenekler.
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SetRating,
    ],
    // Bildirimin vurgu rengi — kapaktan türetilen rastgele renk yerine
    // uygulamanın kehribarı (Android sürümüne göre yok sayılabilir).
    color: 0xe0a33c,
    progressUpdateEventInterval: 1,
  });
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
  ready = true;
}

/**
 * Bir parçanın çalınabilir kaynağı: önce YEREL dosya (offline + veri tasarrufu),
 * yoksa taze çözülmüş akış adresi.
 *
 * ⚠️ Adres kısa ömürlüdür (~6 saat) — kuyruğa ÖNCEDEN adres koyup saatlerce
 * bekletme; çalma anında çöz (ya da `resolveMany` ile ısıt).
 */
export async function sourceFor(
  track: Track,
  opts: { preferSmall?: boolean } = {}
): Promise<{ url: string; local: boolean }> {
  const local = await cachedPath(track.id);
  if (local) return { url: local, local: true };

  let info;
  try {
    info = await Extractor.resolve(track.sourceId);
  } catch (e) {
    // Video silinmiş/engellenmişse parçayı ÖLDÜRME: aynı şarkının başka
    // yüklemesini bul ve kalıcı olarak ona bağlan (lib/relink.ts).
    if (!isUnavailable(e)) throw e;
    const alternative = await findAlternative(track);
    if (!alternative) throw e;
    info = await Extractor.resolve(alternative);
  }

  const stream = Extractor.pickStream(info.streams, { preferSmall: opts.preferSmall });
  if (!stream) throw new Error("çalınabilir ses akışı yok");
  return { url: stream.url, local: false };
}

/**
 * ⛔ MASAÜSTÜ DERSİ (v1.8.8 / MOBILE.md §5.2-3): her ağ çağrısına zaman aşımı +
 * bekçi. Zaman aşımsız zincir, ağ takıldığında durumu kalıcı "yükleniyor"a
 * düşürüyor ve oynat tuşunu tamamen öldürüyordu.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: zaman aşımı`)), ms)),
  ]);
}

export async function playTrack(
  track: Track,
  opts: { preferSmall?: boolean; startSeconds?: number; autoplay?: boolean } = {}
): Promise<void> {
  await setupAudio();
  const { url, local } = await withTimeout(sourceFor(track, opts), 20_000, "adres çözümü");
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: track.id,
    url,
    title: track.title,
    artist: track.artist,
    // Bildirim ve kilit ekranı bu görseli büyütüyor → yüksek çözünürlük iste.
    artwork: bestThumb(track.thumbnail, 720),
    duration: track.durationMs > 0 ? track.durationMs / 1000 : undefined,
  });
  if (opts.startSeconds && opts.startSeconds > 0) await TrackPlayer.seekTo(opts.startSeconds);
  // Çapraz cihaz devamında kuyruk DURAKLATILMIŞ kurulur (MOBILE.md §5.1):
  // telefon cebindeyken kendiliğinden çalmaya başlamamalı.
  if (opts.autoplay === false) {
    console.log(`[audio] hazır (duraklatılmış): ${track.title}`);
    return;
  }
  await TrackPlayer.play();
  console.log(`[audio] çalıyor: ${track.title} (${local ? "yerel dosya" : "akış"})`);
}

export async function togglePlay(): Promise<void> {
  const state = (await TrackPlayer.getPlaybackState()).state;
  if (state === State.Playing) await TrackPlayer.pause();
  else await TrackPlayer.play();
}
