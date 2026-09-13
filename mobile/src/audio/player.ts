import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RatingType,
  RepeatMode,
  State,
} from "react-native-track-player";

import * as Extractor from "../../modules/resonance-extractor";
import { cachedPath } from "../lib/downloads";
import { gainForTrack } from "../lib/loudness";
import { useSettingsStore } from "../store/useSettingsStore";
import { isPlayableHere } from "../lib/localAudio";
import { findAlternative, findStandIn, isUnavailable } from "../lib/relink";
import { bestThumb } from "../lib/thumbs";
import type { Track } from "../types";

let ready = false;

/**
 * Şu anki parçanın eşitleme kazancı (0..1). Uyku zamanlayıcı sesi kıstıktan
 * sonra 1'e DEĞİL buna döner — yoksa sonraki parça eşitlemesiz patlardı.
 */
let gain = 1;
export const currentGain = () => gain;

/**
 * ⭐ SES SEVİYESİ EŞİTLEME (masaüstündeki `loudness.ts`, aynı −14 LUFS hedefi).
 * İlk ölçüm ~0.5 sn sürebilir: en fazla {@link GAIN_WAIT_MS} beklenir, olmazsa
 * parça başlar ve kazanç gelince uygulanır. Masaüstü dersi: ölçümsüz başlayıp
 * sonra seviyeyi değiştirmek duyulur bir sıçrama yapıyor — ön ölçüm
 * (`premeasure`, sıradaki parça için) bunun asıl çözümü.
 */
const GAIN_WAIT_MS = 800;

async function applyLoudness(track: Track): Promise<void> {
  if (!useSettingsStore.getState().normalizeVolume || track.source === "local") {
    gain = 1;
    await TrackPlayer.setVolume(1);
    return;
  }
  const pending = gainForTrack(track.id, track.sourceId).then((g) => Math.min(1, g));
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), GAIN_WAIT_MS));
  const first = await Promise.race([pending, timeout]);
  if (first !== null) {
    gain = first;
    await TrackPlayer.setVolume(gain);
    console.log(`[ses] eşitleme kazancı ${gain.toFixed(2)} (${(20 * Math.log10(gain)).toFixed(1)} dB)`);
    return;
  }
  gain = 1;
  await TrackPlayer.setVolume(1);
  void pending.then(async (g) => {
    // Bu arada başka parçaya geçildiyse eskisinin kazancını uygulama.
    const active = await TrackPlayer.getActiveTrack();
    if (active?.id !== track.id) return;
    gain = g;
    await TrackPlayer.setVolume(g);
    console.log(`[ses] eşitleme kazancı (geç) ${g.toFixed(2)}`);
  });
}

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
  // Telefondaki dosya: çıkarım yok, ağ yok.
  if (isPlayableHere(track)) return { url: track.sourceId, local: true };

  // Masaüstündeki yerel dosya (yolu bu cihazda yok): YouTube'daki eşdeğerini
  // çal ama KALICI BAĞLAMA — `source_id`'yi değiştirmek masaüstündeki
  // parçayı bozar (orada dosya duruyor).
  if (track.source === "local") {
    const standIn = await findStandIn(track);
    if (!standIn) throw new Error("bu parça başka cihazdaki bir dosya — YouTube'da eşdeğeri bulunamadı");
    const info = await Extractor.resolve(standIn);
    const stream = Extractor.pickStream(info.streams, { preferSmall: opts.preferSmall });
    if (!stream) throw new Error("çalınabilir ses akışı yok");
    return { url: stream.url, local: false };
  }

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
  await applyLoudness(track);
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
