import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import TrackPlayer from "react-native-track-player";

import { useT } from "../lib/i18n.mobile";
import { fetchLyrics, type LrcLine } from "../lib/lyrics";
import type { Track } from "../types";

const LINE_HEIGHT = 34;

/**
 * Şarkı sözleri (lrclib). Zamanlı sözde çalan satır vurgulanır ve ortada
 * tutulur; bir satıra dokununca şarkı o ana sarar (masaüstü `LyricsPanel`).
 */
export function Lyrics({ track, positionMs, large }: { track: Track; positionMs: number; large?: boolean }) {
  const t = useT();
  const [synced, setSynced] = useState<LrcLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const scroller = useRef<ScrollView>(null);
  const [boxHeight, setBoxHeight] = useState(260);

  useEffect(() => {
    let alive = true;
    setState("loading");
    setSynced(null);
    setPlain(null);
    void fetchLyrics(track.artist, track.title, track.durationMs)
      .then((res) => {
        if (!alive) return;
        setSynced(res.synced);
        setPlain(res.plain);
        setState(res.synced || res.plain ? "ready" : "none");
      })
      .catch(() => alive && setState("none"));
    return () => {
      alive = false;
    };
  }, [track.id, track.artist, track.title, track.durationMs]);

  const activeIndex = synced ? synced.reduce((acc, line, i) => (line.timeMs <= positionMs ? i : acc), -1) : -1;

  // Satır yükseklikleri sabit değil (uzun satır iki satıra kırılır) → gerçek
  // konumlar ölçülür; sabit yükseklik varsayımı vurguyu ekran dışına kaydırıyordu.
  const lineY = useRef<number[]>([]);
  useEffect(() => {
    if (activeIndex < 0) return;
    const y = lineY.current[activeIndex] ?? activeIndex * LINE_HEIGHT;
    scroller.current?.scrollTo({ y: Math.max(0, y - boxHeight / 2 + LINE_HEIGHT), animated: true });
  }, [activeIndex, boxHeight]);

  if (state !== "ready") {
    return (
      <Text className="text-faint py-6 text-center text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
        {state === "loading" ? t("lyrics.loading") : t("lyrics.notFound")}
      </Text>
    );
  }

  return (
    <ScrollView
      ref={scroller}
      style={{ maxHeight: large ? undefined : 300 }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      onLayout={(e) => setBoxHeight(e.nativeEvent.layout.height)}
    >
      {synced ? (
        synced.map((line, i) => (
          <Text
            key={`${line.timeMs}-${i}`}
            onLayout={(e) => {
              lineY.current[i] = e.nativeEvent.layout.y;
            }}
            onPress={() => void TrackPlayer.seekTo(line.timeMs / 1000)}
            className={i === activeIndex ? "text-text" : i < activeIndex ? "text-faint" : "text-muted"}
            style={{
              minHeight: LINE_HEIGHT,
              paddingVertical: 5,
              fontSize: large ? 22 : 17,
              lineHeight: large ? 30 : 24,
              fontFamily: i === activeIndex ? "Archivo_700Bold" : "Inter_500Medium",
            }}
          >
            {line.text || "♪"}
          </Text>
        ))
      ) : (
        <Text className="text-muted text-[16px] leading-[26px]">{plain}</Text>
      )}
      <View className="h-10" />
    </ScrollView>
  );
}
