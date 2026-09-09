import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "../theme";
import { KarmaBar } from "./KarmaBar";

/**
 * Listelerin ortak satırı.
 *
 * YAPI FİKRİ: sol raydaki şerit HER ZAMAN "bu satır neden burada"yı anlatır —
 * kütüphanede karma çubuğu, Keşfet'te öneri gerekçesi. Süs değil, bilgi.
 */
export function TrackRow({
  title,
  artist,
  thumbnail,
  karma,
  note,
  meta,
  active,
  onPress,
  onLongPress,
  right,
}: {
  title: string;
  artist: string;
  thumbnail?: string;
  /** Kütüphane satırlarında karma çubuğu gösterilir. */
  karma?: number;
  /** Keşfet satırlarında öneri gerekçesi (mono, sol ray). */
  note?: string;
  /** Sağ üstteki tek genişlikli bilgi (süre, boyut). */
  meta?: string;
  active?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: COLORS.surface3 }}
      className={`flex-row items-center py-2.5 pr-3 ${active ? "bg-surface" : ""}`}
    >
      <View className="w-6 items-center">
        {karma === undefined ? <View className="w-[3px]" /> : <KarmaBar karma={karma} height={38} />}
      </View>

      <Image
        source={{ uri: thumbnail }}
        style={{ width: 42, height: 42, borderRadius: 3, backgroundColor: COLORS.surface2 }}
        contentFit="cover"
        transition={120}
      />

      <View className="ml-3 flex-1">
        <Text
          className={`text-[15px] ${active ? "text-accent" : "text-text"}`}
          style={{ fontFamily: active ? "Inter_600SemiBold" : "Inter_500Medium" }}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View className="mt-0.5 flex-row items-center">
          <Text className="text-muted flex-1 text-xs" numberOfLines={1}>
            {artist}
          </Text>
          {meta ? (
            <Text className="text-faint ml-2 text-[10px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              {meta}
            </Text>
          ) : null}
        </View>
        {note ? (
          <Text
            className="text-faint mt-1 text-[10px]"
            style={{ fontFamily: "JetBrainsMono_400Regular", letterSpacing: 0.2 }}
            numberOfLines={1}
          >
            {note}
          </Text>
        ) : null}
      </View>

      {right ? <View className="ml-2">{right}</View> : null}
    </Pressable>
  );
}

/** Ekran başlıklarının üstündeki mono etiket — bağlamı tek satırda verir. */
export function Eyebrow({ children }: { children: string }) {
  return (
    <Text
      className="text-faint text-[10px]"
      style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.6 }}
    >
      {children.toUpperCase()}
    </Text>
  );
}
