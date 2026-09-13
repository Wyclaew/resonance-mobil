import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { State, usePlaybackState, useProgress } from "react-native-track-player";

import { BarMark } from "../src/components/BarMark";
import { fetchLyrics, type LrcLine } from "../src/lib/lyrics";
import { bestThumb } from "../src/lib/thumbs";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { COLORS } from "../src/theme";

/**
 * Ambiyans — masaüstündeki ekran koruyucunun mobil karşılığı.
 *
 * Telefonda kullanım yeri farklı: araç tutucu, masa, başucu. Bu yüzden ekran
 * AÇIK KALIR (`useKeepAwake`) ve yalnız uzaktan okunacak şeyler gösterilir:
 * kapak, başlık, çalan söz satırı. Dokununca çıkar.
 */
export default function Ambient() {
  useKeepAwake();
  const current = usePlayerStore((s) => s.current);
  const progress = useProgress(500);
  const playback = usePlaybackState();
  const { width, height } = useWindowDimensions();
  const [lines, setLines] = useState<LrcLine[] | null>(null);

  useEffect(() => {
    if (!current) return;
    let alive = true;
    setLines(null);
    void fetchLyrics(current.artist, current.title, current.durationMs)
      .then((res) => alive && setLines(res.synced))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [current?.id]);

  const positionMs = progress.position * 1000;
  const active = lines ? lines.filter((l) => l.timeMs <= positionMs).pop() : undefined;
  const art = Math.min(width, height) * 0.62;
  const ratio = progress.duration > 0 ? progress.position / progress.duration : 0;

  return (
    <Pressable onPress={() => router.back()} className="flex-1 items-center justify-center bg-bg px-8">
      <StatusBar hidden />
      {current ? (
        <>
          <Image
            source={{ uri: bestThumb(current.thumbnail, 720) }}
            style={{ width: art, height: art, borderRadius: 6, backgroundColor: COLORS.surface2 }}
            contentFit="cover"
            transition={400}
          />
          <View className="mt-8 flex-row items-center gap-3">
            <BarMark size={18} alive={playback.state === State.Playing} />
          </View>
          <Text
            className="text-text mt-3 text-center text-[28px] leading-8"
            style={{ fontFamily: "Archivo_800ExtraBold" }}
            numberOfLines={2}
          >
            {current.title}
          </Text>
          <Text className="text-muted mt-1 text-center text-base" numberOfLines={1}>
            {current.artist}
          </Text>
          {/* Uzaktan okunacak TEK söz satırı — tüm metin kalabalık olurdu. */}
          <Text
            className="text-accent mt-8 min-h-[52px] text-center text-[20px] leading-7"
            style={{ fontFamily: "Inter_600SemiBold" }}
            numberOfLines={2}
          >
            {active?.text ?? ""}
          </Text>
          <View className="mt-6 h-[2px] w-2/3 bg-surface-3">
            <View className="h-[2px] bg-accent" style={{ width: `${ratio * 100}%` }} />
          </View>
        </>
      ) : (
        <Text className="text-muted text-sm">Çalan bir şey yok. Dokunarak çık.</Text>
      )}
    </Pressable>
  );
}
