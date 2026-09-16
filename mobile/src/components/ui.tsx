import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, Switch, Text, View, type ViewStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hapticSelect } from "../lib/haptics";
import { useLang, useT } from "../lib/i18n.mobile";
import { bestThumb } from "../lib/thumbs";
import { useColors } from "../theme";
import { BarMark } from "./BarMark";
import { Icon, type IconName } from "./Icon";

/**
 * Arayüz ilkelleri. Ekranlar renk/boyut kararı VERMEZ, bunları kullanır →
 * tema (açık/koyu/vurgu) ve ritim her yerde aynı kalır.
 *
 * Ritim: yatay kenar 20, bölüm arası 28, satır yüksekliği ≥ 48 (dokunma hedefi).
 */

/** Ekran başlıklarının üstündeki mono etiket — bağlamı tek satırda verir. */
export function Eyebrow({ children, accent }: { children: string; accent?: boolean }) {
  const lang = useLang();
  return (
    <Text
      className={accent ? "text-accent text-[10px]" : "text-faint text-[10px]"}
      style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.6 }}
      numberOfLines={1}
    >
      {children.toLocaleUpperCase(lang === "tr" ? "tr" : "en")}
    </Text>
  );
}

/** Üst çubuk: geri + başlık + sağ eylemler. Yığın ekranlarının ortak başı. */
export function TopBar({
  title,
  right,
  onBack,
  transparent,
}: {
  title?: string;
  right?: ReactNode;
  onBack?: () => void;
  transparent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <View
      className={transparent ? "" : "bg-bg"}
      style={{ paddingTop: insets.top, zIndex: 10 }}
    >
      <View className="h-14 flex-row items-center px-2">
        <IconButton
          name="back"
          label={t("onb.back")}
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
        />
        <Text
          className="text-text ml-1 flex-1 text-[17px]"
          style={{ fontFamily: "Archivo_700Bold" }}
          numberOfLines={1}
        >
          {title ?? ""}
        </Text>
        <View className="flex-row items-center">{right}</View>
      </View>
    </View>
  );
}

/** Büyük ekran başlığı (Archivo) + isteğe bağlı alt metin. */
export function Title({ children, sub, eyebrow }: { children: string; sub?: string; eyebrow?: string }) {
  return (
    <View className="px-5 pb-2 pt-1">
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Text
        className="text-text mt-1 text-[30px] leading-[34px]"
        style={{ fontFamily: "Archivo_800ExtraBold" }}
      >
        {children}
      </Text>
      {sub ? <Text className="text-muted mt-1.5 text-[13px] leading-5">{sub}</Text> : null}
    </View>
  );
}

/** Bölüm başlığı: mono etiket + sağda isteğe bağlı eylem. */
export function Section({
  title,
  action,
  onAction,
  info,
  children,
  className = "",
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  /** Uzun açıklama: başlığın yanındaki ⓘ'ye basınca açılır (kullanıcı isteği). */
  info?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className={`mt-7 ${className}`}>
      <View className="mb-2 flex-row items-center justify-between px-5">
        <View className="flex-1 flex-row items-center">
          <Eyebrow>{title}</Eyebrow>
          {info ? <InfoButton open={open} onPress={() => setOpen((v) => !v)} /> : null}
        </View>
        {action && onAction ? (
          <Pressable onPress={onAction} hitSlop={10}>
            <Text className="text-accent text-[12px]" style={{ fontFamily: "Inter_500Medium" }}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {info && open ? (
        <Animated.View entering={FadeIn.duration(140)}>
          <Text className="text-muted -mt-1 px-5 pb-2 text-[12px] leading-[17px]">{info}</Text>
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}

/**
 * ⭐ Uzun açıklamalar ⓘ ARKASINDA — kullanıcı isteği (2026-09-16): "ayarlardaki
 * açıklamalar ve uzun yazılar bir düğmeye basınca görünsün". Kapalıyken ekranı
 * doldurmaz, açıkken tam metin görünür (kısaltma/üç nokta YOK).
 */
function InfoButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const c = useColors();
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={t("m.common.info")}
      accessibilityState={{ expanded: open }}
      className="ml-1.5 h-7 w-7 items-center justify-center rounded-full"
      style={{ backgroundColor: open ? c.surface3 : "transparent" }}
    >
      <Icon name="info" size={15} color={open ? c.accent : c.faint} />
    </Pressable>
  );
}

/** Başlıksız uzun açıklama (bölüm başlığı olmayan yerler için): tek satır + ⓘ. */
export function InfoNote({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View className="px-5 pt-2">
      <View className="flex-row items-center">
        <Text className="text-muted flex-1 text-[13px]" numberOfLines={2}>
          {label}
        </Text>
        <InfoButton open={open} onPress={() => setOpen((v) => !v)} />
      </View>
      {open ? (
        <Animated.View entering={FadeIn.duration(140)}>
          <Text className="text-muted mt-1 text-[12px] leading-[17px]">{text}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

export function IconButton({
  name,
  label,
  onPress,
  size = 22,
  color,
  disabled,
  active,
  filled,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  disabled?: boolean;
  active?: boolean;
  filled?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: c.surface3, borderless: true, radius: 22 }}
      className="h-11 w-11 items-center justify-center"
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      <Icon name={name} size={size} color={color ?? (active ? c.accent : c.text)} filled={filled} />
    </Pressable>
  );
}

type ButtonKind = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  kind = "secondary",
  icon,
  busy,
  disabled,
  small,
  className = "",
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  className?: string;
}) {
  const c = useColors();
  const bg =
    kind === "primary" ? "bg-accent" : kind === "secondary" ? "bg-surface-2" : kind === "danger" ? "bg-surface-2" : "";
  const border = kind === "ghost" ? "border border-border" : "";
  const fg = kind === "primary" ? c.onAccent : kind === "danger" ? c.down : c.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      className={`${small ? "h-9 px-3.5" : "h-11 px-5"} flex-row items-center justify-center rounded-full ${bg} ${border} active:opacity-80 ${className}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : icon ? (
        <Icon name={icon} size={small ? 15 : 17} color={fg} filled={icon === "play"} />
      ) : null}
      <Text
        className={`${small ? "text-[12px]" : "text-[14px]"} ${busy || icon ? "ml-2" : ""}`}
        style={{ color: fg, fontFamily: "Inter_600SemiBold" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Seçilebilir hap. Filtreler, kısayollar, durum göstergeleri. */
export function Chip({
  label,
  active,
  onPress,
  icon,
  tone,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: "up" | "down";
}) {
  const c = useColors();
  const color = active ? c.accent : tone === "down" ? c.down : tone === "up" ? c.up : c.muted;
  return (
    <Pressable
      onPress={
        onPress
          ? () => {
              hapticSelect();
              onPress();
            }
          : undefined
      }
      disabled={!onPress}
      className={`h-9 flex-row items-center rounded-full border px-3.5 ${
        active ? "border-accent bg-surface-2" : "border-border"
      } active:opacity-70`}
    >
      {icon ? <Icon name={icon} size={14} color={color} /> : null}
      <Text
        className={icon ? "ml-1.5 text-[12px]" : "text-[12px]"}
        style={{ color, fontFamily: "Inter_500Medium" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Ayar/gezinme satırı. */
export function Row({
  icon,
  title,
  sub,
  value,
  onPress,
  right,
  danger,
}: {
  icon?: IconName;
  title: string;
  sub?: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      android_ripple={{ color: c.surface3 }}
      className="min-h-[56px] flex-row items-center px-5 py-3"
    >
      {icon ? (
        <View className="mr-4 w-6 items-center">
          <Icon name={icon} size={20} color={danger ? c.down : c.muted} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text
          className="text-[15px]"
          style={{ color: danger ? c.down : c.text, fontFamily: "Inter_500Medium" }}
        >
          {title}
        </Text>
        {sub ? <Text className="text-muted mt-0.5 text-[12px] leading-[17px]">{sub}</Text> : null}
      </View>
      {value ? (
        <Text className="text-muted ml-3 text-[13px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress && !value ? <Icon name="chevronRight" size={18} color={c.faint} /> : null)}
    </Pressable>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <Switch
      value={value}
      onValueChange={(v) => {
        hapticSelect();
        onChange(v);
      }}
      trackColor={{ false: c.surface3, true: c.accentDim }}
      thumbColor={value ? c.accent : c.muted}
    />
  );
}

/** Seçenekler arasında tek seçim (2-4 seçenek). */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View className="bg-surface-2 flex-row rounded-full p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              hapticSelect();
              onChange(o.value);
            }}
            className={`h-8 flex-1 items-center justify-center rounded-full px-2 ${on ? "bg-accent" : ""}`}
          >
            <Text
              className={on ? "text-on-accent text-[12px]" : "text-muted text-[12px]"}
              style={{ fontFamily: on ? "Inter_600SemiBold" : "Inter_500Medium" }}
              numberOfLines={1}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Boş durum: logo işareti + tek cümle + isteğe bağlı eylem. */
export function EmptyState({
  text,
  action,
  onAction,
  icon,
}: {
  text: string;
  action?: string;
  onAction?: () => void;
  icon?: IconName;
}) {
  const c = useColors();
  return (
    <View className="items-center px-10 py-14">
      {icon ? <Icon name={icon} size={30} color={c.faint} /> : <BarMark size={30} color={c.surface3} />}
      <Text className="text-muted mt-4 text-center text-[13px] leading-5">{text}</Text>
      {action && onAction ? <Button label={action} onPress={onAction} className="mt-5" small /> : null}
    </View>
  );
}

/** Kapak görseli; yoksa marka işareti (boş gri kare yerine). */
export function Artwork({
  uri,
  size,
  radius = 6,
  style,
}: {
  uri?: string;
  size: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const c = useColors();
  const src = bestThumb(uri, size > 200 ? 720 : size > 80 ? 320 : 160);
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius, backgroundColor: c.surface2, overflow: "hidden" },
        style,
      ]}
      className="items-center justify-center"
    >
      {src ? (
        <Image source={{ uri: src }} style={{ width: "100%", height: "100%" }} contentFit="cover" transition={160} />
      ) : (
        <BarMark size={Math.max(12, size * 0.34)} color={c.surface3} />
      )}
    </View>
  );
}

/**
 * Liste kapağı: ilk 4 parçanın kapağından 2×2 mozaik. Tek kapak varsa tam kare;
 * hiç yoksa marka işareti. Kütüphanede her liste gri ikon yerine kendi yüzüyle görünür.
 */
export function Mosaic({ uris, size, radius = 10 }: { uris?: string[]; size: number; radius?: number }) {
  const c = useColors();
  const list = uris ?? [];
  if (list.length < 4) return <Artwork uri={list[0]} size={size} radius={radius} />;
  const half = size / 2;
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: "hidden", backgroundColor: c.surface2 }} className="flex-row flex-wrap">
      {list.slice(0, 4).map((u, i) => (
        <Image key={i} source={{ uri: bestThumb(u, size > 100 ? 320 : 160) }} style={{ width: half, height: half }} contentFit="cover" transition={160} />
      ))}
    </View>
  );
}

export function Divider({ inset = 20 }: { inset?: number }) {
  return <View className="bg-border h-px" style={{ marginLeft: inset }} />;
}

/** Kart yüzeyi. */
export function Card({ children, className = "", onPress }: { children: ReactNode; className?: string; onPress?: () => void }) {
  const c = useColors();
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        android_ripple={{ color: c.surface3 }}
        className={`bg-surface border-border overflow-hidden rounded-2xl border ${className}`}
      >
        {children}
      </Pressable>
    );
  }
  return <View className={`bg-surface border-border overflow-hidden rounded-2xl border ${className}`}>{children}</View>;
}

/** Büyük sayı + mono etiket (istatistik kutucukları). */
export function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  const lang = useLang();
  return (
    <View className="flex-1">
      <Text
        className={accent ? "text-accent text-[26px]" : "text-text text-[26px]"}
        style={{ fontFamily: "Archivo_800ExtraBold" }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="text-faint mt-0.5 text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }}>
        {label.toLocaleUpperCase(lang === "tr" ? "tr" : "en")}
      </Text>
    </View>
  );
}
