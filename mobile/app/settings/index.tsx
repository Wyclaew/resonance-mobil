import { router } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import { useBottomSpace } from "../../src/components/MiniPlayer";
import { Divider, Row, Section, TopBar } from "../../src/components/ui";
import { useT } from "../../src/lib/i18n.mobile";

/**
 * Ayarlar — masaüstündeki sekmeli `SettingsView`'ın mobil düzeni: gruplar
 * listesi, her grup kendi sayfasında. Profil menüsündeki kısayollar (hesap,
 * istatistik, zevk profili) de burada.
 */
export default function SettingsIndex() {
  const t = useT();
  const bottom = useBottomSpace(false);
  const go = (section: string) => () => router.push({ pathname: "/settings/[section]", params: { section } });
  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("settings.title")} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <Section title={t("m.settings.you")} className="mt-2">
          <Row icon="user" title={t("profile.account")} sub={t("m.settings.accountSub")} onPress={() => router.push("/account")} />
          <Row icon="chart" title={t("profile.stats")} onPress={() => router.push("/stats")} />
          <Row icon="sparkles" title={t("profile.taste")} onPress={() => router.push("/taste")} />
          <Row icon="calendar" title={t("wrapped.open")} onPress={() => router.push("/wrapped")} />
        </Section>
        <Section title={t("settings.title")}>
          <Row icon="headphones" title={t("m.settings.playback")} sub={t("m.settings.playbackSub")} onPress={go("playback")} />
          <Row icon="radio" title={t("settings.recTitle")} sub={t("m.settings.recsSub")} onPress={go("recs")} />
          <Row icon="hardDrive" title={t("m.settings.storage")} sub={t("m.settings.storageSub")} onPress={go("storage")} />
          <Row icon="palette" title={t("m.settings.appearance")} sub={t("m.settings.appearanceSub")} onPress={go("appearance")} />
          <Divider />
          <Row icon="database" title={t("m.settings.data")} sub={t("m.settings.dataSub")} onPress={go("data")} />
          <Row icon="bug" title={t("m.settings.troubleshoot")} sub={t("m.settings.troubleshootSub")} onPress={go("diagnostics")} />
          <Row icon="info" title={t("m.settings.about")} onPress={go("about")} />
        </Section>
        <Text className="text-faint px-5 pt-6 text-[12px] leading-[17px]">{t("m.settings.syncedNote")}</Text>
      </ScrollView>
    </View>
  );
}
