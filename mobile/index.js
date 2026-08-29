// Giriş noktası. react-native-track-player'ın oynatma servisi, uygulama
// arayüzü kurulmadan ÖNCE kaydedilmeli (arka planda/kilit ekranından gelen
// olaylar arayüz yokken de gelir).
import "expo-router/entry";

import TrackPlayer from "react-native-track-player";

import { PlaybackService } from "./src/audio/service";

TrackPlayer.registerPlaybackService(() => PlaybackService);
