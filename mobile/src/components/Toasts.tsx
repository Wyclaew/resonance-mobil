import { useSegments } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { FadeInUp, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sendReport } from "../lib/bugReport";
import { useT } from "../lib/i18n.mobile";
import { useToastStore, type Toast } from "../store/useToastStore";
import { useColors } from "../theme";

/** Yana bu kadar ya da yukarı bu kadar sürüklenince kapanır (dp). */
const DISMISS_X = 90;
const DISMISS_Y = 28;
const OUT_MS = 160;

/**
 * Bildirimler — EKRANIN ÜSTÜNDE (kullanıcı isteği 2026-11: alttakiler mini oynatıcı ve
 * sekmelerle yarışıyordu). Kapatma çarpıyla değil KAYDIRARAK: yana ya da yukarı.
 * Oynatıcı/ambiyans ekranında üst çubuk yok; yine de durum çubuğunun altında kalır.
 */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  if (!toasts.length) return null;
  // Tam ekran oynatıcıda üst çubuk yok → biraz daha yukarı oturabilir.
  const top = insets.top + (["player", "ambient"].includes(segments[0] ?? "") ? 4 : 8);

  return (
    // zIndex: alt sayfaların (Portal, 1000) üstünde kalsın — sayfa açıkken çıkan bildirim görünsün.
    <View style={{ position: "absolute", left: 12, right: 12, top, gap: 8, zIndex: 1001 }} pointerEvents="box-none">
      {toasts.slice(-3).map((toast) => (
        <Animated.View key={toast.id} entering={FadeInUp.duration(220)} exiting={FadeOut.duration(OUT_MS)}>
          <SwipeToast toast={toast} />
        </Animated.View>
      ))}
    </View>
  );
}

function SwipeToast({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const c = useColors();
  const t = useT();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const close = () => dismiss(toast.id);

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      x.value = e.translationX;
      y.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > DISMISS_X || Math.abs(e.velocityX) > 900) {
        x.value = withTiming(Math.sign(e.translationX || e.velocityX) * 500, { duration: OUT_MS }, () => runOnJS(close)());
      } else if (e.translationY < -DISMISS_Y || e.velocityY < -700) {
        y.value = withTiming(-160, { duration: OUT_MS }, () => runOnJS(close)());
      } else {
        x.value = withSpring(0);
        y.value = withSpring(0);
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    opacity: 1 - Math.min(0.7, Math.abs(x.value) / 300 + Math.abs(y.value) / 120),
  }));

  const action = toast.action
    ? { label: toast.action.label, run: () => void toast.action?.fn() }
    : toast.kind === "error"
      ? // Hata bildirimi kaybolmadan önce tek dokunuşla ayrıntılı rapor.
        { label: t("m.report.action"), run: () => void sendReport({ error: toast.message }) }
      : null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          style,
          {
            elevation: 10,
            borderLeftWidth: 3,
            borderLeftColor: toast.kind === "error" ? c.down : toast.kind === "success" ? c.accent : c.borderStrong,
          },
        ]}
        className="bg-surface-3 min-h-[48px] flex-row items-center rounded-2xl pl-4 pr-2"
        accessibilityLiveRegion="polite"
        accessibilityHint={t("m.toast.swipeHint")}
      >
        <Text className="text-text flex-1 py-3 pr-2 text-[13px] leading-[18px]">{toast.message}</Text>
        {action ? (
          <Pressable
            onPress={() => {
              action.run();
              close();
            }}
            hitSlop={8}
            className="h-10 justify-center px-3"
          >
            <Text className="text-accent text-[13px]" style={{ fontFamily: "Inter_600SemiBold" }}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}
