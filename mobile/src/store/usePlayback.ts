import TrackPlayer, { Event, State } from "react-native-track-player";
import { create } from "zustand";

/**
 * Track-player'ın çalma durumu, TEK dinleyiciden. Listedeki her satırın
 * kendi native olay aboneliğini açması (usePlaybackState) yüzlerce abonelik
 * demekti; satırlar bu küçük store'dan okur.
 */
interface PlaybackState {
  playing: boolean;
  /** Tampon dolduruluyor / yükleniyor. */
  buffering: boolean;
  ended: boolean;
}

export const usePlayback = create<PlaybackState>(() => ({ playing: false, buffering: false, ended: false }));

let installed = false;

export function installPlaybackState(): void {
  if (installed) return;
  installed = true;
  TrackPlayer.addEventListener(Event.PlaybackState, ({ state }) => {
    usePlayback.setState({
      playing: state === State.Playing,
      buffering: state === State.Buffering || state === State.Loading,
      ended: state === State.Ended,
    });
  });
}
