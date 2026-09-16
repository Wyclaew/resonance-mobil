import { useEffect, useState, type ReactNode } from "react";
import { BackHandler, Keyboard, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useOverlay } from "../store/useOverlay";
import { alpha, useColors } from "../theme";
import { Icon, type IconName } from "./Icon";
import { Portal } from "./Portal";

/**
 * Alt sayfa — mobilde masaüstündeki sağ tık menüsünün ve açılır pencerelerin
 * karşılığı. Arka plan kararır, içerik aşağıdan kayar; geri tuşu ve boşluğa
 * dokunmak kapatır.
 */
export function Sheet({
  visible,
  onClose,
  children,
  title,
  scroll,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** Uzun içerik (liste seçimi) için kaydırılabilir gövde. */
  scroll?: boolean;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // Aşağıdan kayma YALNIZ transform ile. ⛔ `entering={SlideInDown}` (dizilim
  // animasyonu) çerçeveyi açılış anındaki boyutta donduruyordu (ölçüldü): sayfa
  // açıldıktan sonra büyüyünce (dinleme karnesi geç yüklenir) JS'e göre y=222 h=692
  // iken ekranda ilk dizilimdeki y=403'te kalıyor, son satırlar ekranın altından
  // taşıp görünmüyor ve dokunulamıyordu ("Listeden çıkar", "Başka sürüm seç").
  // ⌨️ Klavye açılınca sayfa yukarı çıksın — kullanıcı raporu (2026-09-16):
  // "yeni liste adını yazarken kutu klavyenin altında kalıyor, ne yazdığımı
  // görmüyorum". Android 15+ kenardan kenara düzende pencere KÜÇÜLMÜYOR
  // (adjustResize devre dışı), o yüzden boşluğu sayfanın kendisi bırakır.
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboard(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const slide = useSharedValue(height);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.value }] }));
  useEffect(() => {
    if (!visible) return;
    slide.value = height;
    slide.value = withTiming(0, { duration: 240 });
    useOverlay.getState().open();
    return () => useOverlay.getState().close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  // Geri tuşu önce sayfayı kapatsın (Modal'ın onRequestClose karşılığı).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    // ⛔ RN `Modal` DEĞİL, ana pencerede kök düzey (`Portal`): Modal penceresinin
    // kökü açılıştan hemen sonra 838 → 914 dp yeniden boyutlanıyordu (ölçüldü) —
    // ayrıntı `Portal.tsx`'te.
    <Portal>
      <Animated.View
        entering={FadeIn.duration(160)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          backgroundColor: alpha("#000000", 0.55),
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="close" />
        <Animated.View
          className="bg-surface border-border rounded-t-3xl border-t"
          style={[
            {
              paddingBottom: (keyboard > 0 ? 12 : insets.bottom + 12) + keyboard,
              maxHeight: Math.round((height - keyboard) * 0.88) + keyboard,
            },
            slideStyle,
          ]}
        >
          <View className="items-center pb-1 pt-2.5">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: c.surface3 }} />
          </View>
          {title ? (
            <Text className="text-text px-5 pb-2 pt-2 text-[17px]" style={{ fontFamily: "Archivo_700Bold" }}>
              {title}
            </Text>
          ) : null}
          {scroll ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ flexGrow: 0, flexShrink: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}

/** Alt sayfadaki eylem satırı. */
export function SheetAction({
  icon,
  label,
  sub,
  onPress,
  danger,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const color = danger ? c.down : active ? c.accent : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: c.surface3 }}
      className="min-h-[52px] flex-row items-center px-5 py-2.5"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Icon name={icon} size={20} color={danger ? c.down : active ? c.accent : c.muted} />
      <View className="ml-4 flex-1">
        <Text className="text-[15px]" style={{ color, fontFamily: "Inter_500Medium" }} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text className="text-muted mt-0.5 text-[12px]" numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
