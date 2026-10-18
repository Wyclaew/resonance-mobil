import { useEffect } from "react";
import { BackHandler, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { bytes as fmtBytes } from "../lib/fmt";
import { useLang, useT } from "../lib/i18n.mobile";
import { currentVersion } from "../lib/updater";
import { useUpdate } from "../store/useUpdate";
import { alpha, useColors } from "../theme";
import { BarMark } from "./BarMark";
import { Icon } from "./Icon";
import { Portal } from "./Portal";

/**
 * ⭐ "YENİ SÜRÜM VAR" PENCERESİ — kullanıcı isteği (2026-10): "bildirim çok küçük;
 * ekranın ortasına güzel bir pencere, gören kesin güncellesin; güncellemeden devam
 * et de olsun ama güncel değilse her açılışta gelsin". Alt sayfa (Sheet) yerine
 * ortada kart; "Devam et" yalnız bu açılış için kapatır (`startup.ts` her açılışta
 * yeniden denetler).
 */
export function UpdateDialog() {
  const { info, phase, progress, error, close, start } = useUpdate();
  const t = useT();
  const lang = useLang();
  const c = useColors();
  const busy = phase === "downloading" || phase === "ready";

  // Kart yumuşakça büyüyerek gelir (transform — dizilim animasyonu değil).
  const scale = useSharedValue(0.92);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (!info) return;
    scale.value = 0.92;
    scale.value = withSpring(1, { damping: 16, stiffness: 180 });
    // Geri tuşu: indirilirken yutulur, değilse "devam et".
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, busy]);

  if (!info) return null;
  const pct = Math.round(progress * 100);

  return (
    <Portal>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1000,
          backgroundColor: alpha("#000000", 0.62),
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 22,
        }}
      >
        <Animated.View
          className="bg-surface border-border w-full rounded-3xl border"
          style={[{ maxWidth: 420, maxHeight: "86%", overflow: "hidden", elevation: 12 }, cardStyle]}
        >
          {/* Üst şerit: marka işareti + sürüm geçişi */}
          <View className="items-center px-6 pb-5 pt-7" style={{ backgroundColor: alpha(c.accent, 0.1) }}>
            <View
              className="h-16 w-16 items-center justify-center rounded-2xl"
              style={{ backgroundColor: c.accent }}
            >
              <BarMark size={30} alive color="#ffffff" />
            </View>
            <Text
              className="text-accent mt-4 text-[11px]"
              style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.6 }}
            >
              {t("m.update.eyebrow").toLocaleUpperCase(lang)}
            </Text>
            <Text className="text-text mt-1.5 text-center text-[24px] leading-[30px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
              {t("m.update.title")}
            </Text>
            <View className="mt-3 flex-row items-center">
              <Chip text={currentVersion()} muted />
              <Icon name="chevronRight" size={16} color={c.faint} />
              <Chip text={info.version} />
            </View>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 16 }}>
            <Text className="text-muted text-center text-[13px] leading-[19px]">{t("m.update.lead")}</Text>
            {info.notes ? (
              <View className="bg-surface-2 mt-4 rounded-2xl p-3.5">
                <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }}>
                  {t("m.update.notes").toLocaleUpperCase(lang)}
                </Text>
                <Text className="text-text mt-1.5 text-[12.5px] leading-[18px]">{info.notes}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View className="px-5 pb-5 pt-4">
            {busy ? (
              <View className="mb-3">
                <View className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: c.surface3 }}>
                  <View style={{ width: `${pct}%`, height: 8, borderRadius: 4, backgroundColor: c.accent }} />
                </View>
                <Text className="text-muted mt-2 text-center text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {phase === "ready" ? t("m.update.install") : `${t("m.update.downloading")} · %${pct}`}
                </Text>
              </View>
            ) : null}
            {error ? <Text className="text-down mb-3 text-center text-[12px]">{`${t("m.update.failed")}: ${error}`}</Text> : null}

            <Pressable
              onPress={() => void start()}
              disabled={phase === "downloading"}
              android_ripple={{ color: alpha("#ffffff", 0.2) }}
              className="h-14 flex-row items-center justify-center overflow-hidden rounded-2xl"
              style={{ backgroundColor: c.accent, opacity: phase === "downloading" ? 0.7 : 1 }}
            >
              <Icon name="download" size={20} color="#ffffff" />
              <Text className="ml-2 text-[16px]" style={{ color: "#ffffff", fontFamily: "Inter_600SemiBold" }}>
                {phase === "failed"
                  ? t("error.retry")
                  : phase === "ready"
                    ? t("m.update.installNow")
                    : info.bytes > 0
                      ? t("m.update.downloadSized", { size: fmtBytes(info.bytes, lang) })
                      : t("m.update.download")}
              </Text>
            </Pressable>

            {phase !== "downloading" ? (
              <Pressable onPress={close} hitSlop={8} className="mt-3 h-11 items-center justify-center rounded-2xl">
                <Text className="text-muted text-[14px]" style={{ fontFamily: "Inter_500Medium" }}>
                  {t("m.update.continue")}
                </Text>
              </Pressable>
            ) : null}
            <Text className="text-faint mt-1 text-center text-[11px] leading-[15px]">{t("m.update.installHint")}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Portal>
  );
}

function Chip({ text, muted }: { text: string; muted?: boolean }) {
  const c = useColors();
  return (
    <View
      className="mx-1.5 rounded-full px-3 py-1"
      style={{ backgroundColor: muted ? c.surface3 : c.accent }}
    >
      <Text
        className="text-[12px]"
        style={{ fontFamily: "JetBrainsMono_500Medium", color: muted ? c.muted : "#ffffff" }}
      >
        {`v${text}`}
      </Text>
    </View>
  );
}
