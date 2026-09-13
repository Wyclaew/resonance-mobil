import TrackPlayer, { Event, State } from "react-native-track-player";

import { t } from "../lib/i18n.mobile";
import { onAdvancedTo, recordEndedPlay, suppressMoodSignal, usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import * as engine from "./player";
import { useSleepTimer } from "./sleepTimer";

/**
 * Kuyruk ilerletme — track-player olaylarını kuyruk kararlarına çevirir.
 * Açılışta bir kez kurulur.
 *
 * ⛔⛔ MASAÜSTÜNÜN EN PAHALI DERSİ (CLAUDE.md v1.8.5-1.8.6, MOBILE.md §5.2-1):
 * **"kaynak bitti" ≠ "şarkı bitti".** Akış çalarken bağlantı koparsa oynatıcı
 * dosyanın sonuna gelmiş gibi davranabilir; kuyruk ilerletilirse şarkı 35-45.
 * saniyede SESSİZCE ATLANIR. Bu yüzden her geçişte bitişin GERÇEK olduğu
 * doğrulanır: konum süreye yakın değilse aynı parça kaldığı saniyeden bağlanır.
 */

/** Bitişi gerçek saymak için gereken yakınlık (saniye). */
const END_TOLERANCE = 6;
/** Aynı parçada en fazla bu kadar "erken bitti → yeniden bağlan" (sonsuz döngü olmasın). */
const MAX_RESUMES = 3;

let installed = false;
const resumes = new Map<string, number>();

function earlyEnd(uid: string, position: number, duration: number): boolean {
  if (!(duration > 0) || position >= duration - END_TOLERANCE) return false;
  const n = (resumes.get(uid) ?? 0) + 1;
  resumes.set(uid, n);
  if (n > MAX_RESUMES) return false;
  console.warn(`[audio] kaynak erken bitti (${position.toFixed(0)}/${duration.toFixed(0)} sn) — yeniden bağlanılıyor`);
  return true;
}

/**
 * Son bilinen ilerleme (saniyede bir gelir). Geçiş olayındaki `lastPosition`
 * tek kaynak olursa ve bir sürümde 0 gelirse her doğal bitiş "erken bitti"
 * sayılıp şarkının sonu tekrar çalardı — iki kaynağın büyüğü alınır.
 */
let lastProgress = { uid: "", position: 0, duration: 0 };

export function installAutoAdvance(): void {
  if (installed) return;
  installed = true;

  TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, ({ position, duration }) => {
    const uid = engine.loadedItemUid();
    if (uid) lastProgress = { uid, position, duration };
  });

  // Boşluksuz geçiş: track-player hazırlanan sıradaki öğeye kendisi geçti.
  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (ev) => {
    try {
      const uid = ev.track?.id as string | undefined;
      if (!uid || uid === engine.loadedItemUid()) return;
      const prepared = engine.preparedNext();
      if (!prepared || prepared.uid !== uid) return; // reset/yeni yükleme — bizim geçişimiz değil

      if (engine.consumeExpectedSkip(uid)) {
        await onAdvancedTo(uid, null); // kullanıcı "sonraki" — kayıt next()'te yazıldı
        return;
      }

      const last = usePlayerStore.getState().current;
      const known = last && lastProgress.uid === last.uid ? lastProgress : null;
      const lastDuration =
        known?.duration || (ev.lastTrack?.duration as number | undefined) || (last ? last.durationMs / 1000 : 0);
      const lastPosition = Math.max(ev.lastPosition ?? 0, known?.position ?? 0);
      if (last && ev.lastIndex !== undefined && earlyEnd(last.uid, lastPosition, lastDuration)) {
        await TrackPlayer.skip(ev.lastIndex, lastPosition);
        return;
      }
      console.log(`[audio] boşluksuz geçiş (${lastPosition.toFixed(0)}/${lastDuration.toFixed(0)} sn): ${ev.track?.title ?? uid}`);
      await onAdvancedTo(uid, {
        positionMs: Math.round(Math.max(lastPosition, lastDuration) * 1000),
        durationMs: Math.round(lastDuration * 1000),
      });
    } catch (e) {
      // Servis ÖLMEMELİ (v1.8.6 dersi): hata yut, kullanıcı kalsın.
      console.error("[audio] geçiş işlenemedi:", e);
    }
  });

  // Sıradaki hazır değildi (liste sonu, tekrar-tek, uyku, ya da adres gecikti).
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    try {
      const store = usePlayerStore.getState();
      const current = store.current;
      if (!current || engine.loadedItemUid() !== current.uid) return;
      const { position, duration } = await TrackPlayer.getProgress();
      const expected = duration > 0 ? duration : current.durationMs / 1000;

      if (earlyEnd(current.uid, position, expected)) {
        await engine.reloadCurrent(current, Math.floor(position) * 1000);
        return;
      }

      const sleep = useSleepTimer.getState();
      if (sleep.afterTrack) {
        // Masaüstüyle aynı: dinlemeyi yaz, dur, parçayı başa sar — ilerleme.
        sleep.setAfterTrack(false);
        recordEndedPlay(Math.round(position * 1000), Math.round(expected * 1000));
        await TrackPlayer.pause();
        await TrackPlayer.seekTo(0);
        return;
      }
      await store.next("ended");
    } catch (e) {
      console.error("[audio] kuyruk ilerletme hatası:", e);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (e) => {
    console.error("[audio] oynatma hatası:", e);
    try {
      const store = usePlayerStore.getState();
      const current = store.current;
      if (!current) return;
      const { state } = await TrackPlayer.getPlaybackState();
      if (state !== State.Error) return;
      const { position } = await TrackPlayer.getProgress();
      // Adresin süresi dolmuş olabilir (uzun duraklatma, 403): önce taze adresle
      // aynı yerden bir kez dene; olmazsa masaüstü gibi atla.
      if (current.source !== "local" && (resumes.get(`err:${current.uid}`) ?? 0) === 0) {
        resumes.set(`err:${current.uid}`, 1);
        if (await engine.reloadCurrent(current, Math.round(position * 1000))) return;
      }
      useToastStore.getState().show(t("player.trackFailed"), "error");
      suppressMoodSignal();
      await store.next("error");
    } catch (err) {
      console.error("[audio] hata kurtarma başarısız:", err);
      usePlayerStore.setState({ loading: false, error: t("player.playFailed") });
    }
  });
}
