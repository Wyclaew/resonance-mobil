import { router, useSegments } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useProgress } from "react-native-track-player";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  FadeOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { hapticTap } from "../lib/haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useT } from "../lib/i18n.mobile";
import { useOverlay } from "../store/useOverlay";
import { usePlayback } from "../store/usePlayback";
import { usePlayerStore } from "../store/usePlayerStore";
import { useColors } from "../theme";
import { BarMark } from "./BarMark";
import { Icon } from "./Icon";
import { Artwork } from "./ui";

export const TAB_BAR_HEIGHT = 58;
export const MINI_PLAYER_HEIGHT = 64;
/** Mini oynatıcının görünmediği ekranlar (kendi oynatıcı arayüzü olanlar). */
const HIDDEN_ON = new Set(["player", "ambient", "onboarding", "queue"]);

/**
 * Mini oynatıcı — masaüstündeki alt çubuğun (NowPlayingBar) mobil karşılığı.
 * Her ekranda altta durur: sekmelerde çubuğun hemen üstünde, yığın
 * ekranlarında en altta. Dokununca tam ekran oynatıcı açılır.
 */
export function MiniPlayer() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const current = usePlayerStore((s) => s.current);
  const loading = usePlayerStore((s) => s.loading);
  const playing = usePlayback((s) => s.playing);
  const buffering = usePlayback((s) => s.buffering);
  const sheetOpen = useOverlay((s) => s.sheets > 0);
  const { gesture: swipe, style: dragStyle } = useSwipe();
  if (!current || sheetOpen || HIDDEN_ON.has(segments[0] ?? "")) return null;
  const inTabs = segments[0] === "(tabs)";
  const bottom = inTabs ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom;

  return (
    <GestureDetector gesture={swipe}>
    <Animated.View
      entering={FadeInDown.duration(220)}
      exiting={FadeOutDown.duration(160)}
      style={[{ position: "absolute", left: 8, right: 8, bottom: bottom + 6, height: MINI_PLAYER_HEIGHT - 8 }, dragStyle]}
    >
      <Pressable
        onPress={() => router.push("/player")}
        className="bg-surface-2 border-border h-full flex-row items-center overflow-hidden rounded-2xl border pl-2 pr-1"
        style={{ elevation: 6 }}
        android_ripple={{ color: c.surface3 }}
        accessibilityLabel={t("player.goToPlaying")}
      >
        <Artwork uri={current.thumbnail} size={40} radius={8} />
        <View className="ml-3 flex-1">
          <Text className="text-text text-[14px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
            {current.title}
          </Text>
          <View className="flex-row items-center">
            {current.isRecommendation ? (
              <View className="mr-1.5">
                <BarMark size={9} alive={playing} />
              </View>
            ) : null}
            <Text className="text-muted flex-1 text-[12px]" numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => void usePlayerStore.getState().toggle()}
          hitSlop={6}
          accessibilityLabel={playing ? t("player.pause") : t("player.play")}
          className="h-11 w-11 items-center justify-center"
        >
          {loading || buffering ? (
            <BarMark size={16} alive />
          ) : (
            <Icon name={playing ? "pause" : "play"} size={22} filled color={c.text} />
          )}
        </Pressable>
        <Pressable
          onPress={() => void usePlayerStore.getState().next("next")}
          hitSlop={6}
          accessibilityLabel={t("player.next")}
          className="h-11 w-10 items-center justify-center"
        >
          <Icon name="skipForward" size={20} filled color={c.muted} />
        </Pressable>
        <ProgressLine />
      </Pressable>
    </Animated.View>
    </GestureDetector>
  );
}

/**
 * Kaydırma: sola = sonraki, sağa = önceki, yukarı = tam ekran oynatıcı.
 * Dokunma hâlâ çalışsın diye hareket ancak belirgin kaydırmada devreye girer.
 */
function useSwipe() {
  const dx = useSharedValue(0);
  const next = () => {
    hapticTap();
    void usePlayerStore.getState().next("next");
  };
  const prev = () => {
    hapticTap();
    void usePlayerStore.getState().previous();
  };
  const open = () => router.push("/player");
  const gesture = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .activeOffsetY([-18, 18])
    .onUpdate((e) => {
      dx.value = Math.max(-80, Math.min(80, e.translationX * 0.6));
    })
    .onEnd((e) => {
      if (e.translationY < -40 && Math.abs(e.translationY) > Math.abs(e.translationX)) runOnJS(open)();
      else if (e.translationX < -60) runOnJS(next)();
      else if (e.translationX > 60) runOnJS(prev)();
      dx.value = withSpring(0, { damping: 18, stiffness: 220 });
    })
    .onFinalize(() => {
      dx.value = withSpring(0, { damping: 18, stiffness: 220 });
    });
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: dx.value }] }));
  return { gesture, style };
}

/** Alt kenardaki ince ilerleme çizgisi — kendi aboneliği, üst bileşeni yormaz. */
function ProgressLine() {
  const c = useColors();
  const { position, duration } = useProgress(1000);
  const pending = usePlayerStore((s) => s.pendingStartMs);
  const durationMs = usePlayerStore((s) => s.current?.durationMs ?? 0);
  const ratio =
    duration > 0 ? position / duration : pending > 0 && durationMs > 0 ? pending / durationMs : 0;
  return (
    <View style={{ position: "absolute", left: 10, right: 10, bottom: 0, height: 2, backgroundColor: c.surface3 }}>
      <View style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, height: 2, backgroundColor: c.accent }} />
    </View>
  );
}

/** Ekran içeriğinin mini oynatıcının altında kalmaması için alt boşluk. */
export function useBottomSpace(inTabs: boolean): number {
  const insets = useSafeAreaInsets();
  const hasCurrent = usePlayerStore((s) => !!s.current);
  return (inTabs ? 0 : insets.bottom) + (hasCurrent ? MINI_PLAYER_HEIGHT + 4 : 0) + 20;
}
