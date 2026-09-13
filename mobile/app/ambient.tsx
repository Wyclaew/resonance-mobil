import { Image } from "expo-image";
import { useKeepAwake } from "expo-keep-awake";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { useProgress } from "react-native-track-player";

import { BarMark } from "../src/components/BarMark";
import { Artwork } from "../src/components/ui";
import { clock } from "../src/lib/fmt";
import { useT } from "../src/lib/i18n.mobile";
import { fetchLyrics, type LrcLine } from "../src/lib/lyrics";
import { bestThumb } from "../src/lib/thumbs";
import { usePlayback } from "../src/store/usePlayback";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { alpha, useColors } from "../src/theme";

/**
 * Ambiyans — masaüstündeki ekran koruyucunun mobil karşılığı.
 *
 * Telefonda kullanım yeri farklı: araç tutucu, masa, başucu. Bu yüzden ekran
 * AÇIK KALIR (`useKeepAwake`) ve yalnız uzaktan okunacak şeyler gösterilir:
 * saat, kapak, başlık, çalan söz satırı. Dokununca çıkar.
 */
export default function Ambient() {
  useKeepAwake();
  const c = useColors();
  const t = useT();
  const current = usePlayerStore((s) => s.current);
  const playing = usePlayback((s) => s.playing);
  const progress = useProgress(500);
  const { width, height } = useWindowDimensions();
  const [lines, setLines] = useState<LrcLine[] | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

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
  const landscape = width > height;
  const art = Math.min(width, height) * (landscape ? 0.6 : 0.66);
  const ratio = progress.duration > 0 ? progress.position / progress.duration : 0;

  return (
    <Pressable onPress={() => router.back()} className="flex-1" style={{ backgroundColor: c.bg }}>
      <StatusBar hidden />
      {current ? (
        <Image
          source={{ uri: bestThumb(current.thumbnail, 160) }}
          style={{ position: "absolute", width: "100%", height: "100%", opacity: 0.45 }}
          blurRadius={50}
          contentFit="cover"
        />
      ) : null}
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(c.bg, 0.55) }} />

      <View className={`flex-1 items-center justify-center px-8 ${landscape ? "flex-row gap-10" : ""}`}>
        {current ? (
          <>
            <Artwork uri={current.thumbnail} size={art} radius={18} style={{ elevation: 16 }} />
            <View className={landscape ? "flex-1" : "mt-9 items-center"} style={{ maxWidth: landscape ? undefined : width - 48 }}>
              <Text
                className="text-faint text-[13px]"
                style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 2, textAlign: landscape ? "left" : "center" }}
              >
                {clock(now)}
              </Text>
              <View className="mt-3" style={{ alignSelf: landscape ? "flex-start" : "center" }}>
                <BarMark size={18} alive={playing} />
              </View>
              <Text
                className="text-text mt-3 text-[30px] leading-[35px]"
                style={{ fontFamily: "Archivo_800ExtraBold", textAlign: landscape ? "left" : "center" }}
                numberOfLines={2}
              >
                {current.title}
              </Text>
              <Text className="text-muted mt-1 text-[17px]" style={{ textAlign: landscape ? "left" : "center" }} numberOfLines={1}>
                {current.artist}
              </Text>
              {/* Uzaktan okunacak TEK söz satırı — tüm metin kalabalık olurdu. */}
              <Text
                className="text-accent mt-7 min-h-[58px] text-[21px] leading-[29px]"
                style={{ fontFamily: "Archivo_700Bold", textAlign: landscape ? "left" : "center" }}
                numberOfLines={2}
              >
                {active?.text ?? ""}
              </Text>
              <View className="mt-5 h-[3px] w-56 overflow-hidden rounded-full" style={{ backgroundColor: c.surface3, alignSelf: landscape ? "flex-start" : "center" }}>
                <View className="bg-accent h-[3px]" style={{ width: `${ratio * 100}%` }} />
              </View>
            </View>
          </>
        ) : (
          <Text className="text-muted text-[14px]">{t("player.notPlaying")}</Text>
        )}
      </View>
      <Text className="text-faint pb-8 text-center text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
        {t("m.ambient.tapToExit")}
      </Text>
    </Pressable>
  );
}
