import { useEffect, useMemo } from "react";
import { Dimensions, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { ACCENTS, useColors } from "../theme";

/**
 * Gizli kedi + kalp — Hakkında'da imzaya 7 kez dokununca ortaya çıkar
 * (masaüstü `SecretCat.tsx` ile AYNI çizim). Emoji değil çizim: kedi temanın
 * yazı rengini alır, kalp kırmızı ve dolu.
 */
export function CatDrawing({ size = 72 }: { size?: number }) {
  const c = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke={c.text} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15.5 15.5 L13.5 7 L21 12.5" />
      <Path d="M32.5 15.5 L34.5 7 L27 12.5" />
      <Path d="M24 11.5 c-6 0 -10.5 4.2 -10.5 9.5 c0 5.3 4.5 9 10.5 9 c6 0 10.5 -3.7 10.5 -9 c0 -5.3 -4.5 -9.5 -10.5 -9.5 z" />
      <Path d="M18.5 19.5 c1 1.2 2.4 1.2 3.4 0" />
      <Path d="M26.1 19.5 c1 1.2 2.4 1.2 3.4 0" />
      <Path d="M24 23 l-1.2 1.2 M24 23 l1.2 1.2" />
      <Path d="M11 20 l3.5 0.6 M11 23.4 l3.6 -0.7" />
      <Path d="M37 20 l-3.5 0.6 M37 23.4 l-3.6 -0.7" />
      <Path d="M16.5 28.5 c-2.6 3.4 -3.4 8.4 -2 12.5 l19 0 c1.4 -4.1 0.6 -9.1 -2 -12.5" />
      <Path d="M20 41 v-3.2 M24 41 v-3.2 M28 41 v-3.2" />
      <Path d="M33.5 41 c5.5 0.4 8.5 -3.6 6.6 -7.2 c-1 -1.9 -3.2 -2.3 -4.4 -1" />
    </Svg>
  );
}

export function HeartDrawing({ size = 22 }: { size?: number }) {
  const c = useColors();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={c.down}>
      <Path d="M12 20.7 C12 20.7 2.8 14.9 2.8 8.9 C2.8 5.9 5.2 3.5 8.2 3.5 C9.9 3.5 11.4 4.4 12 5.6 C12.6 4.4 14.1 3.5 15.8 3.5 C18.8 3.5 21.2 5.9 21.2 8.9 C21.2 14.9 12 20.7 12 20.7 Z" />
    </Svg>
  );
}

/** Konfeti — 36 parça yukarıdan saçılır, ~1.8 sn sonra `onDone`. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const { width, height } = Dimensions.get("window");
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        delay: Math.random() * 300,
        color: ACCENTS[i % ACCENTS.length].v,
        size: 6 + Math.random() * 6,
        spin: (Math.random() - 0.5) * 720,
      })),
    [width]
  );
  useEffect(() => {
    const id = setTimeout(onDone, 2000);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, width, height }}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} height={height} />
      ))}
    </View>
  );
}

function Piece({ x, drift, delay, color, size, spin, height }: { x: number; drift: number; delay: number; color: string; size: number; spin: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }));
  }, [delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value * t.value,
    transform: [
      { translateX: x + drift * t.value },
      { translateY: -20 + t.value * height * 0.75 },
      { rotate: `${spin * t.value}deg` },
    ],
  }));
  return <Animated.View style={[{ position: "absolute", width: size, height: size * 0.5, borderRadius: 1, backgroundColor: color }, style]} />;
}
