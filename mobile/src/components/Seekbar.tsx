import { useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import TrackPlayer, { useProgress } from "react-native-track-player";

import { mmss } from "../lib/fmt";
import { hapticSelect } from "../lib/haptics";
import { usePlayerStore } from "../store/usePlayerStore";
import { useColors } from "../theme";

/**
 * Sürüklenebilir ilerleme çubuğu. Eskisi yalnız dokunmayla sarıyordu ve 2 px
 * yüksekliğinde parmakla tutulamıyordu. Sürüklerken zaman etiketi hedefi
 * gösterir; bırakınca bir kez sarılır (her piksel için seek atmak akışı yorar).
 */
export function Seekbar() {
  const c = useColors();
  const { position, duration } = useProgress(500);
  const pending = usePlayerStore((s) => s.pendingStartMs);
  const itemDuration = usePlayerStore((s) => (s.current?.durationMs ?? 0) / 1000);
  const total = duration > 0 ? duration : itemDuration;
  const shown = duration > 0 ? position : pending / 1000;

  const [width, setWidth] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const dragX = useSharedValue(-1);

  const ratio = total > 0 ? Math.min(1, Math.max(0, (scrub ?? shown) / total)) : 0;

  const commit = (x: number) => {
    setScrub(null);
    if (!(total > 0) || !width) return;
    const target = Math.max(0, Math.min(total - 1, (x / width) * total));
    void TrackPlayer.seekTo(target);
  };
  const preview = (x: number) => {
    if (!(total > 0) || !width) return;
    setScrub(Math.max(0, Math.min(total, (x / width) * total)));
  };

  const pan = Gesture.Pan()
    .minDistance(2)
    .onBegin((e) => {
      dragX.value = e.x;
      runOnJS(hapticSelect)();
      runOnJS(preview)(e.x);
    })
    .onUpdate((e) => {
      dragX.value = e.x;
      runOnJS(preview)(e.x);
    })
    .onEnd((e) => {
      dragX.value = -1;
      runOnJS(commit)(e.x);
    })
    .onFinalize(() => {
      dragX.value = -1;
    });
  const tap = Gesture.Tap().onEnd((e) => runOnJS(commit)(e.x));
  const gesture = Gesture.Exclusive(pan, tap);

  const thumb = useAnimatedStyle(() => ({
    transform: [{ scale: dragX.value >= 0 ? 1.5 : 1 }],
  }));

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <View className="h-9 justify-center" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          <View style={{ height: 4, borderRadius: 4, backgroundColor: c.surface3, overflow: "hidden" }}>
            <View style={{ width: `${ratio * 100}%`, height: 4, backgroundColor: c.accent }} />
          </View>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: Math.max(0, ratio * width - 7),
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: c.text,
              },
              thumb,
            ]}
          />
        </View>
      </GestureDetector>
      <View className="-mt-1 flex-row justify-between">
        <Text
          className={scrub !== null ? "text-accent text-[11px]" : "text-faint text-[11px]"}
          style={{ fontFamily: "JetBrainsMono_400Regular" }}
        >
          {mmss(scrub ?? shown)}
        </Text>
        <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          {total > 0 ? `−${mmss(Math.max(0, total - (scrub ?? shown)))}` : "0:00"}
        </Text>
      </View>
    </View>
  );
}
