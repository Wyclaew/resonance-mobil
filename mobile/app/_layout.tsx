import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import "../global.css";
import { AddToPlaylistSheet } from "../src/components/AddToPlaylistSheet";
import { Toasts } from "../src/components/Toasts";
import { setupAudio } from "../src/audio/player";
import { getDb } from "../src/lib/db";
import { initDeviceId } from "../src/lib/device";
import { hydrateLocalStorage, installWebShims } from "../src/lib/webShims";
import { startSync } from "../src/lib/sync/engine";
import { useSettingsStore } from "../src/store/useSettingsStore";

/**
 * Açılış sırası ÖNEMLİ:
 *   0) tarayıcı API taklitleri (kopyalanan senkron kodu bunları bekliyor)
 *   1) cihaz kimliği  → senkron satırları doğru cihaza yazılsın (getDeviceId senkron)
 *   2) veritabanı     → migration'lar (masaüstüyle BİREBİR aynı şema)
 *   3) ayarlar        → dil/tema, öneri ayarları
 *   4) ses motoru     → arka plan servisi
 *   5) senkron        → arka planda, arayüzü bekletmeden
 */
export default function RootLayout() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        installWebShims();
        await hydrateLocalStorage();
        await initDeviceId();
        await getDb();
        await useSettingsStore.getState().load();
        await setupAudio();
        setReady(true);
        // Senkron arayüzü BEKLETMEZ: giriş yapılmamışsa sessizce çıkar,
        // yapılmışsa arka planda ilk turu atar (docs/SYNC.md tetikleyicileri).
        void startSync().catch((e) => console.error("[sync] başlatılamadı:", e));
      } catch (e) {
        console.error("[boot] açılış hatası:", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-down text-base font-semibold">Açılamadı</Text>
        <Text className="text-muted mt-2 text-center text-sm">{error}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color="#e0a33c" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0c0c0d" } }} />
      <AddToPlaylistSheet />
      <Toasts />
    </View>
  );
}
