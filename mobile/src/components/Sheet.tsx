import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { alpha, useColors } from "../theme";
import { Icon, type IconName } from "./Icon";

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
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1, backgroundColor: alpha("#000000", 0.55) }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="close" />
        <Animated.View
          entering={SlideInDown.duration(240)}
          className="bg-surface border-border rounded-t-3xl border-t"
          style={{ paddingBottom: insets.bottom + 12, maxHeight: "88%" }}
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
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </Animated.View>
      </Animated.View>
    </Modal>
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
