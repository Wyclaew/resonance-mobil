import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { hapticTap } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { mmss } from "../lib/fmt";
import { useDownloadStore } from "../store/useDownloadStore";
import { usePlayback } from "../store/usePlayback";
import { usePlayerStore } from "../store/usePlayerStore";
import { useColors } from "../theme";
import type { Track } from "../types";
import { BarMark } from "./BarMark";
import { Icon } from "./Icon";
import { KarmaBar } from "./KarmaBar";
import { useTrackSheet, type TrackSheetContext } from "./TrackSheet";
import { Artwork } from "./ui";

export { Eyebrow } from "./ui";

/**
 * Listelerin ortak satırı.
 *
 * YAPI FİKRİ: sol raydaki şerit HER ZAMAN "bu satır neden burada"yı anlatır —
 * kütüphanede karma çubuğu, Keşfet'te öneri gerekçesi. Süs değil, bilgi.
 * Çalan parça satırında logo çubukları nefes alır; indirilmiş parçada ✓ durur.
 */
function TrackRowBase({
  track,
  karma,
  note,
  meta,
  index,
  onPress,
  sheet,
  right,
  dim,
}: {
  track: Track;
  /** Kütüphane satırlarında karma çubuğu gösterilir. */
  karma?: number;
  /** Keşfet satırlarında öneri gerekçesi (mono). */
  note?: string;
  /** Sağdaki tek genişlikli bilgi; verilmezse süre. */
  meta?: string;
  /** Sıra numarası (listede konum). */
  index?: number;
  onPress?: () => void;
  /** Uzun basış / ⋮ ile açılan parça sayfasının bağlamı. `false` = sayfa yok. */
  sheet?: TrackSheetContext | false;
  right?: React.ReactNode;
  /** Sıranın geçmiş kısmı gibi ikincil satırlar. */
  dim?: boolean;
}) {
  const c = useColors();
  const t = useT();
  const active = usePlayerStore((s) => s.current?.id === track.id);
  const playing = usePlayback((s) => active && s.playing);
  const downloaded = useDownloadStore((s) => s.downloaded.has(track.id));
  const job = useDownloadStore((s) => s.jobs[track.id]);
  const openSheet = () => {
    if (sheet === false) return;
    hapticTap();
    useTrackSheet.getState().open(track, sheet ?? {});
  };
  const running = job?.status === "running" || job?.status === "queued";

  return (
    <Pressable
      onPress={onPress}
      onLongPress={sheet === false ? undefined : openSheet}
      delayLongPress={320}
      android_ripple={{ color: c.surface2 }}
      className="min-h-[62px] flex-row items-center py-2 pr-1"
      style={{ opacity: dim ? 0.55 : 1 }}
    >
      <View className="w-5 items-center">
        {karma === undefined ? null : <KarmaBar karma={karma} height={40} />}
      </View>
      {index !== undefined ? (
        <Text
          className="text-faint mr-2 w-6 text-right text-[11px]"
          style={{ fontFamily: "JetBrainsMono_400Regular" }}
        >
          {index}
        </Text>
      ) : null}
      <View>
        <Artwork uri={track.thumbnail} size={46} radius={6} />
        {active ? (
          <View
            className="absolute inset-0 items-center justify-center rounded-md"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <BarMark size={16} alive={playing} color={c.accent} />
          </View>
        ) : null}
      </View>
      <View className="ml-3 flex-1">
        <Text
          className="text-[15px]"
          style={{ color: active ? c.accent : c.text, fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" }}
          numberOfLines={1}
        >
          {/* Senkronun açtığı yer tutucu: bilgisi arka planda (Wi-Fi'da) dolduruluyor. */}
          {track.title || t("m.track.pending")}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          {downloaded ? (
            <View className="mr-1.5">
              <Icon name="checkCircle" size={12} color={c.accent} />
            </View>
          ) : running ? (
            <Text className="text-accent mr-1.5 text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
              {`${Math.round((job?.progress ?? 0) * 100)}%`}
            </Text>
          ) : job?.status === "waiting" ? (
            <View className="mr-1.5">
              <Icon name="clock" size={11} color={c.faint} />
            </View>
          ) : job?.status === "failed" ? (
            <View className="mr-1.5">
              <Icon name="warning" size={11} color={c.down} />
            </View>
          ) : null}
          <Text className="text-muted flex-1 text-[12px]" numberOfLines={1}>
            {track.title ? track.artist : `YouTube · ${track.sourceId}`}
          </Text>
          <Text className="text-faint ml-2 text-[10px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {meta ?? (track.durationMs > 0 ? mmss(track.durationMs / 1000) : "")}
          </Text>
        </View>
        {note ? (
          <Text
            className="text-faint mt-0.5 text-[10px]"
            style={{ fontFamily: "JetBrainsMono_400Regular", letterSpacing: 0.2 }}
            numberOfLines={1}
          >
            {note}
          </Text>
        ) : null}
      </View>
      {right ?? null}
      {sheet === false ? null : (
        <Pressable
          onPress={openSheet}
          hitSlop={6}
          accessibilityLabel={t("trackDetail.open")}
          className="h-11 w-9 items-center justify-center"
        >
          <Icon name="more" size={18} color={c.faint} />
        </Pressable>
      )}
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowBase);
