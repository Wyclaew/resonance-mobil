import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { BAR_RATIOS, COLORS } from "../theme";

/**
 * Marka işareti — uygulama ikonundaki 7 çubuklu ses dalgasının aynısı
 * (masaüstündeki `Logo.tsx` ile aynı oranlar).
 *
 * `alive` iken çubuklar nefes alır. Hareket UYGULAMADA TEK YERDE: yalnız ses
 * gerçekten çalarken. Böylece hareket süs değil, durum göstergesi olur —
 * ekrana bakmadan "çalıyor mu?" sorusunun cevabı.
 */
export function BarMark({
  size = 20,
  color = COLORS.accent,
  alive = false,
}: {
  size?: number;
  color?: string;
  alive?: boolean;
}) {
  const barWidth = Math.max(1.5, size * 0.075);
  const gap = size * 0.045;

  return (
    <View
      style={{ height: size, flexDirection: "row", alignItems: "center", gap }}
      accessibilityRole="image"
      accessibilityLabel="Resonance"
    >
      {BAR_RATIOS.map((ratio, i) => (
        <Bar key={i} width={barWidth} height={size * ratio} color={color} alive={alive} index={i} />
      ))}
    </View>
  );
}

function Bar({
  width,
  height,
  color,
  alive,
  index,
}: {
  width: number;
  height: number;
  color: string;
  alive: boolean;
  index: number;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!alive) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 220 });
      return;
    }
    // Ortadaki çubuklar daha geniş salınır → dalga formu korunur.
    const depth = 0.25 + 0.2 * Math.cos(((index - 3) * Math.PI) / 6);
    scale.value = withRepeat(
      withTiming(1 - depth, {
        duration: 620 + index * 70,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
    return () => cancelAnimation(scale);
  }, [alive, index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: width / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}
