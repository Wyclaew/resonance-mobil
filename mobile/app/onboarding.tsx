import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BarMark } from "../src/components/BarMark";
import { Icon, type IconName } from "../src/components/Icon";
import { Button } from "../src/components/ui";
import { useT, type Key } from "../src/lib/i18n.mobile";
import { useSettingsStore } from "../src/store/useSettingsStore";
import { useColors } from "../src/theme";

const STEPS: { icon: IconName | "logo"; title: Key; body: Key }[] = [
  { icon: "logo", title: "onb.welcomeTitle", body: "onb.welcomeBody" },
  { icon: "compass", title: "onb.discoverTitle", body: "onb.discoverBody" },
  { icon: "sliders", title: "onb.filtersTitle", body: "onb.filtersBody" },
  { icon: "up", title: "onb.karmaTitle", body: "onb.karmaBody" },
  { icon: "search", title: "onb.searchTitle", body: "onb.searchBody" },
  { icon: "fileDown", title: "onb.importTitle", body: "onb.importBody" },
  { icon: "download", title: "onb.downloadTitle", body: "onb.downloadBody" },
  { icon: "sparkles", title: "onb.tasteTitle", body: "m.onb.tasteBody" },
];

/**
 * İlk açılış rehberi (masaüstü `Onboarding`): atlanabilir, bir kez gösterilir
 * (`onboardingDone`). Dinleme geçmişi olan kullanıcıya hiç açılmaz — bkz. ana sayfa.
 */
export default function Onboarding() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  const finish = () => {
    void useSettingsStore.getState().update("onboardingDone", true);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View className="bg-bg flex-1 px-7" style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-faint text-[12px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
          {t("onb.step", { n: i + 1, total: STEPS.length })}
        </Text>
        {!last ? <Button small kind="ghost" label={t("onb.skip")} onPress={finish} /> : null}
      </View>

      <Animated.View key={i} entering={FadeIn.duration(260)} exiting={FadeOut.duration(120)} className="flex-1 justify-center">
        <View className="bg-surface-2 h-20 w-20 items-center justify-center rounded-3xl">
          {step.icon === "logo" ? <BarMark size={36} alive /> : <Icon name={step.icon} size={34} color={c.accent} />}
        </View>
        <Text className="text-text mt-8 text-[32px] leading-[37px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
          {t(step.title)}
        </Text>
        <Text className="text-muted mt-4 text-[16px] leading-[25px]">{t(step.body)}</Text>
      </Animated.View>

      <View className="mb-6 flex-row justify-center gap-1.5">
        {STEPS.map((_, k) => (
          <View key={k} className="h-1.5 rounded-full" style={{ width: k === i ? 22 : 6, backgroundColor: k === i ? c.accent : c.surface3 }} />
        ))}
      </View>
      <View className="flex-row gap-2">
        {i > 0 ? <Button kind="secondary" label={t("onb.back")} onPress={() => setI(i - 1)} /> : null}
        <Button kind="primary" label={last ? t("onb.finish") : t("onb.next")} onPress={() => (last ? finish() : setI(i + 1))} className="flex-1" />
      </View>
    </View>
  );
}
