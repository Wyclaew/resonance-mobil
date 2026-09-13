import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RatingType,
  RepeatMode,
  type Track as RntpTrack,
} from "react-native-track-player";

import * as Extractor from "../../modules/resonance-extractor";
import { cachedPath } from "../lib/downloads";
import { gainForTrack } from "../lib/loudness";
import { isPlayableHere } from "../lib/localAudio";
import { getMobileSettings, onCellular } from "../lib/mobileSettings";
import { findAlternative, findStandIn, isUnavailable } from "../lib/relink";
import { bestThumb } from "../lib/thumbs";
import { useSettingsStore } from "../store/useSettingsStore";
import { getPalette } from "../theme";
import type { QueueItem, Track } from "../types";
import { invalidateUrl, resolveCached } from "./urlCache";

/**
 * SES MOTORU — masaüstündeki Rust `audio.rs` + `scheduleLoad`'ın karşılığı.
 * Kuyruk MANTIĞI `usePlayerStore`'da; burası yalnız "bu öğeyi çal / sıradakini
 * hazırla" der.
 *
 * ⭐ BOŞLUKSUZ GEÇİŞ: track-player'ın kuyruğunda hep [çalan, sıradaki] durur.
 * Sıradakinin adresi önden çözülüp eklendiği için şarkı bitince ExoPlayer
 * kendisi geçer — JS'in adres çözmesini (~2.6 sn) beklemez, ekran kapalıyken
 * de kesinti olmaz. Eskiden kuyrukta tek parça vardı: her geçişte 2-3 sn
 * sessizlik ve bildirimdeki "sonraki" tuşu hiçbir şey yapmıyordu.
 *
 * Track-player kimliği = kuyruk öğesinin `uid`'si (aynı şarkı kuyrukta iki kez
 * olabilir; parça kimliği ayırt etmez).
 */

let ready = false;
let loadToken = 0;
/** Track-player'da şu an yüklü kuyruk öğesi. null = hiçbir şey yüklenmedi. */
let loadedUid: string | null = null;
/** Track-player kuyruğuna eklenmiş sıradaki öğe. */
let prepared: { uid: string; index: number } | null = null;

export const loadedItemUid = () => loadedUid;
export const preparedNext = () => prepared;

/**
 * Şu anki parçanın eşitleme kazancı (0..1). Uyku zamanlayıcı sesi kıstıktan
 * sonra 1'e DEĞİL buna döner — yoksa sonraki parça eşitlemesiz patlardı.
 */
let gain = 1;
export const currentGain = () => gain;

/** Uyku zamanlayıcısı sesi kısarken kazanç uygulanmasın. */
let volumeHeld = false;
export function holdVolume(on: boolean): void {
  volumeHeld = on;
}

/**
 * ⭐ SES SEVİYESİ EŞİTLEME (masaüstündeki `loudness.ts`, aynı −14 LUFS hedefi).
 * İlk ölçüm ~0.5 sn sürebilir: en fazla {@link GAIN_WAIT_MS} beklenir, olmazsa
 * parça başlar ve kazanç gelince uygulanır. Sıradaki parça önden ölçüldüğü için
 * (`premeasure`) geçişte çoğunlukla anında hazırdır.
 */
const GAIN_WAIT_MS = 800;

export async function applyLoudness(item: Track & { uid?: string }): Promise<void> {
  if (!useSettingsStore.getState().normalizeVolume || item.source === "local") {
    gain = 1;
    if (!volumeHeld) await TrackPlayer.setVolume(1);
    return;
  }
  const pending = gainForTrack(item.id, item.sourceId).then((g) => Math.min(1, g));
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), GAIN_WAIT_MS));
  const first = await Promise.race([pending, timeout]);
  if (first !== null) {
    gain = first;
    if (!volumeHeld) await TrackPlayer.setVolume(gain);
    return;
  }
  gain = 1;
  if (!volumeHeld) await TrackPlayer.setVolume(1);
  void pending.then(async (g) => {
    // Bu arada başka parçaya geçildiyse eskisinin kazancını uygulama.
    if (item.uid && loadedUid !== item.uid) return;
    gain = g;
    if (!volumeHeld) await TrackPlayer.setVolume(g);
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
    likeOptions: { isActive: false, title: "+1" },
    dislikeOptions: { isActive: false, title: "−1" },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.Stop,
      Capability.SetRating,
    ],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SetRating,
    ],
    color: parseInt(getPalette().accent.slice(1), 16),
    progressUpdateEventInterval: 1,
  });
  await TrackPlayer.setRepeatMode(RepeatMode.Off);
  ready = true;
}

/** Akış kalitesi: ayar; mobil veride "veri tasarrufu" açıksa en düşük kademe. */
function quality(): Extractor.StreamQuality {
  if (onCellular() && getMobileSettings().dataSaver) return "low";
  return useSettingsStore.getState().audioQuality;
}

/**
 * Bir parçanın çalınabilir kaynağı: önce YEREL dosya (offline + veri tasarrufu),
 * yoksa (önbellekli) çözülmüş akış adresi.
 */
export async function sourceFor(track: Track): Promise<{ url: string; local: boolean }> {
  // Telefondaki dosya: çıkarım yok, ağ yok.
  if (isPlayableHere(track)) return { url: track.sourceId, local: true };

  // Masaüstündeki yerel dosya (yolu bu cihazda yok): YouTube'daki eşdeğerini
  // çal ama KALICI BAĞLAMA — `source_id`'yi değiştirmek masaüstündeki
  // parçayı bozar (orada dosya duruyor).
  if (track.source === "local") {
    const standIn = await findStandIn(track);
    if (!standIn) throw new Error("bu parça başka cihazdaki bir dosya — YouTube'da eşdeğeri bulunamadı");
    const info = await resolveCached(standIn);
    const stream = Extractor.pickStream(info.streams, quality());
    if (!stream) throw new Error("çalınabilir ses akışı yok");
    return { url: stream.url, local: false };
  }

  const local = await cachedPath(track.id, true);
  if (local) return { url: local, local: true };

  let info;
  try {
    info = await resolveCached(track.sourceId);
  } catch (e) {
    // Video silinmiş/engellenmişse parçayı ÖLDÜRME: aynı şarkının başka
    // yüklemesini bul ve kalıcı olarak ona bağlan (lib/relink.ts).
    if (!isUnavailable(e)) throw e;
    const alternative = await findAlternative(track);
    if (!alternative) throw e;
    info = await resolveCached(alternative);
  }

  const stream = Extractor.pickStream(info.streams, quality());
  if (!stream) throw new Error("çalınabilir ses akışı yok");
  return { url: stream.url, local: false };
}

/**
 * ⛔ MASAÜSTÜ DERSİ (v1.8.8): her ağ çağrısına zaman aşımı. Zaman aşımsız zincir,
 * ağ takıldığında durumu kalıcı "yükleniyor"a düşürüyor ve oynat tuşunu
 * tamamen öldürüyordu.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: zaman aşımı`)), ms)),
  ]);
}

function toRntp(item: QueueItem, url: string): RntpTrack {
  return {
    id: item.uid,
    url,
    title: item.title,
    artist: item.artist,
    // Bildirim ve kilit ekranı bu görseli büyütüyor → yüksek çözünürlük iste.
    artwork: bestThumb(item.thumbnail, 720),
    duration: item.durationMs > 0 ? item.durationMs / 1000 : undefined,
  };
}

/**
 * Öğeyi baştan yükleyip çalar. `false` dönerse bu arada daha yeni bir yükleme
 * başladı demektir (geç dönen eski çağrı durumu EZMEZ — masaüstü gotcha #6).
 */
export async function startItem(
  item: QueueItem,
  opts: { startMs?: number; autoplay?: boolean } = {}
): Promise<boolean> {
  const mine = ++loadToken;
  prepared = null;
  await setupAudio();
  const { url, local } = await withTimeout(sourceFor(item), 20_000, "adres çözümü");
  if (mine !== loadToken) return false;
  await TrackPlayer.reset();
  await TrackPlayer.add(toRntp(item, url));
  loadedUid = item.uid;
  await applyLoudness(item);
  if (opts.startMs && opts.startMs > 0) await TrackPlayer.seekTo(opts.startMs / 1000);
  if (mine !== loadToken) return false;
  if (opts.autoplay === false) await TrackPlayer.pause();
  else await TrackPlayer.play();
  console.log(`[audio] ${opts.autoplay === false ? "hazır" : "çalıyor"}: ${item.title} (${local ? "yerel dosya" : "akış"})`);
  return true;
}

/**
 * Sıradaki öğeyi track-player kuyruğuna ekler (boşluksuz geçiş için).
 * `null` → sıradaki yok (liste sonu, uyku "şarkı bitince", tekrar-tek).
 */
export async function prepareUpcoming(next: { item: QueueItem; index: number } | null): Promise<void> {
  const mine = loadToken;
  const owner = loadedUid;
  if (!owner) return;
  try {
    if (!next) {
      if (prepared) {
        prepared = null;
        await TrackPlayer.removeUpcomingTracks();
      }
      return;
    }
    if (prepared?.uid === next.item.uid) {
      prepared = { uid: next.item.uid, index: next.index };
      return;
    }
    const { url } = await withTimeout(sourceFor(next.item), 20_000, "sıradaki adres");
    // Bu arada parça değiştiyse eski hazırlığı ekleme.
    if (mine !== loadToken || loadedUid !== owner) return;
    await TrackPlayer.removeUpcomingTracks();
    await TrackPlayer.add(toRntp(next.item, url));
    prepared = { uid: next.item.uid, index: next.index };
    console.log(`[audio] sıradaki hazır: ${next.item.title}`);
  } catch (e) {
    // Sessiz: sıra gelince normal yoldan yeniden denenir.
    console.warn("[audio] sıradaki hazırlanamadı:", e instanceof Error ? e.message : e);
  }
}

/** Kullanıcı "sonraki"ye bastı ve sıradaki zaten hazır → anında geç. */
export async function skipToPrepared(): Promise<boolean> {
  if (!prepared) return false;
  const uid = prepared.uid;
  const q = await TrackPlayer.getQueue();
  const idx = q.findIndex((t) => t.id === uid);
  if (idx < 0) {
    prepared = null;
    return false;
  }
  ++loadToken;
  expectSkip = uid;
  await TrackPlayer.skip(idx);
  await TrackPlayer.play();
  return true;
}

/** `skipToPrepared` kaynaklı geçişi doğal bitişten ayırmak için. */
let expectSkip: string | null = null;
export function consumeExpectedSkip(uid: string): boolean {
  if (expectSkip !== uid) return false;
  expectSkip = null;
  return true;
}

/**
 * Track-player hazırlanan öğeye geçti (doğal bitiş ya da skipToPrepared):
 * motor durumunu yeni öğeye taşır, eskisini kuyruktan atar.
 */
export async function adoptActive(uid: string): Promise<void> {
  loadedUid = uid;
  prepared = null;
  ++loadToken;
  try {
    const q = await TrackPlayer.getQueue();
    const idx = q.findIndex((t) => t.id === uid);
    if (idx > 0) await TrackPlayer.remove(Array.from({ length: idx }, (_, i) => i));
  } catch (e) {
    console.warn("[audio] eski parça kuyruktan atılamadı:", e);
  }
}

/** Adres reddedildi (403/süresi doldu): önbelleği boşalt, aynı yerden yeniden bağlan. */
export async function reloadCurrent(item: QueueItem, positionMs: number): Promise<boolean> {
  invalidateUrl(item.sourceId);
  return startItem(item, { startMs: positionMs });
}

export function markUnloaded(): void {
  ++loadToken;
  loadedUid = null;
  prepared = null;
}
