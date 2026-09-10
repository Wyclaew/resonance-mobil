import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";

import { getMobileSettings, loadMobileSettings, setWifiOnly } from "../src/lib/mobileSettings";
import { useSettingsStore } from "../src/store/useSettingsStore";

/** Ayarlar — mobilde önemli olanlar: veri, depolama, öneri. */
export default function Settings() {
  const settings = useSettingsStore();
  const [wifiOnly, setWifi] = useState(getMobileSettings().wifiOnly);

  useEffect(() => {
    void loadMobileSettings().then((s) => setWifi(s.wifiOnly));
  }, []);

  return (
    <ScrollView className="flex-1 bg-bg px-6 pt-16">
      <Text className="text-text text-2xl font-semibold">Ayarlar</Text>

      <Section title="Veri ve depolama" />
      <ToggleRow
        label="Yalnız Wi-Fi'da indir"
        hint="Mobil veride indirme yapılmaz; önbellekteki parçalar yine çalar."
        value={wifiOnly}
        onChange={(v) => {
          setWifi(v);
          void setWifiOnly(v);
        }}
      />
      <StepperRow
        label="Önbellek sınırı"
        value={`${settings.cacheLimitGb} GB`}
        onDown={() => settings.update("cacheLimitGb", Math.max(1, settings.cacheLimitGb - 1))}
        onUp={() => settings.update("cacheLimitGb", Math.min(32, settings.cacheLimitGb + 1))}
      />

      <Section title="Öneri" />
      <ToggleRow
        label="Öneriler açık"
        value={settings.recEnabled}
        onChange={(v) => settings.update("recEnabled", v)}
      />
      <ToggleRow
        label="YouTube kaynağı"
        hint="Kapatılırsa öneriler yalnız kendi kütüphanenden gelir."
        value={settings.recYouTube}
        onChange={(v) => settings.update("recYouTube", v)}
      />
      <ToggleRow
        label="Kütüphane kaynağı"
        value={settings.recLibrary}
        onChange={(v) => settings.update("recLibrary", v)}
      />

      <Section title="Kütüphane" />
      <LinkRow label="Dinleme analizi" hint="Ne kadar, ne zaman, kimi dinledin" to="/stats" />
      <LinkRow label="Zevk profili" hint="Motor seni nasıl görüyor, hangi öneriyi kabul ettin" to="/taste" />
      <LinkRow label="Yıllık özet" hint="Saatler, sanatçılar, keşifler — paylaşılabilir" to="/wrapped" />
      <LinkRow label="Hesap & senkron" hint="Giriş, senkron durumu, buluttan al" to="/account" />

      <Pressable onPress={() => router.back()} className="mb-10 mt-8 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return <Text className="text-faint mt-8 text-xs uppercase">{title}</Text>;
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View className="mt-3 flex-row items-center justify-between rounded-lg bg-surface px-4 py-3">
      <View className="flex-1 pr-3">
        <Text className="text-text text-sm">{label}</Text>
        {hint ? <Text className="text-faint mt-1 text-xs">{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: "#b9842f", false: "#2a2a2e" }}
        thumbColor={value ? "#e0a33c" : "#8d8d93"}
      />
    </View>
  );
}

function StepperRow({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <View className="mt-3 flex-row items-center justify-between rounded-lg bg-surface px-4 py-3">
      <Text className="text-text text-sm">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable onPress={onDown} hitSlop={10} className="h-8 w-8 items-center justify-center rounded bg-surface-2">
          <Text className="text-text">−</Text>
        </Pressable>
        <Text className="text-muted w-16 text-center text-sm">{value}</Text>
        <Pressable onPress={onUp} hitSlop={10} className="h-8 w-8 items-center justify-center rounded bg-surface-2">
          <Text className="text-text">＋</Text>
        </Pressable>
      </View>
    </View>
  );
}


/** Ayarlar içinden ayrı ekranlara geçiş. */
function LinkRow({ label, hint, to }: { label: string; hint: string; to: "/stats" | "/account" | "/taste" | "/wrapped" }) {
  return (
    <Pressable
      onPress={() => router.push(to)}
      className="mt-3 flex-row items-center justify-between rounded-lg bg-surface px-4 py-3"
    >
      <View className="flex-1 pr-3">
        <Text className="text-text text-sm">{label}</Text>
        <Text className="text-faint mt-1 text-xs">{hint}</Text>
      </View>
      <Text className="text-faint text-base">›</Text>
    </Pressable>
  );
}
