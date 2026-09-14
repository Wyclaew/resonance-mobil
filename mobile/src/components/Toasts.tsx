import { useSegments } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sendReport } from "../lib/bugReport";
import { useT } from "../lib/i18n.mobile";
import { usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import { Icon } from "./Icon";
import { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from "./MiniPlayer";

/** Bildirimler — mini oynatıcının ÜSTÜNDE (altında kalıp okunmuyordu). */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const hasMini = usePlayerStore((s) => !!s.current);
  if (!toasts.length) return null;
  const inTabs = segments[0] === "(tabs)";
  const miniShown = hasMini && !["player", "ambient", "onboarding", "queue"].includes(segments[0] ?? "");
  const bottom = (inTabs ? TAB_BAR_HEIGHT : 0) + insets.bottom + (miniShown ? MINI_PLAYER_HEIGHT : 0) + 12;

  return (
    // zIndex: alt sayfaların (Portal, 1000) üstünde kalsın — sayfa açıkken çıkan bildirim görünsün.
    <View style={{ position: "absolute", left: 12, right: 12, bottom, gap: 8, zIndex: 1001 }} pointerEvents="box-none">
      {toasts.slice(-3).map((toast) => (
        <Animated.View key={toast.id} entering={FadeInDown.duration(200)} exiting={FadeOut.duration(150)}>
          <View
            className="bg-surface-3 min-h-[48px] flex-row items-center rounded-2xl pl-4 pr-2"
            style={{ elevation: 8, borderLeftWidth: 3, borderLeftColor: toast.kind === "error" ? c.down : toast.kind === "success" ? c.accent : c.borderStrong }}
          >
            <Text className="text-text flex-1 py-3 pr-2 text-[13px] leading-[18px]">{toast.message}</Text>
            {toast.action ? (
              <Pressable
                onPress={() => {
                  void toast.action?.fn();
                  dismiss(toast.id);
                }}
                hitSlop={8}
                className="h-10 justify-center px-3"
              >
                <Text className="text-accent text-[13px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                  {toast.action.label}
                </Text>
              </Pressable>
            ) : toast.kind === "error" ? (
              // Hata bildirimi kaybolmadan önce tek dokunuşla ayrıntılı rapor.
              <Pressable
                onPress={() => {
                  dismiss(toast.id);
                  void sendReport({ error: toast.message });
                }}
                hitSlop={8}
                className="h-10 justify-center px-3"
              >
                <Text className="text-accent text-[13px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                  {t("m.report.action")}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => dismiss(toast.id)} hitSlop={8} className="h-10 w-10 items-center justify-center">
                <Icon name="x" size={16} color={c.faint} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
