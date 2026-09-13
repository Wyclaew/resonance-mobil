import { Archivo_700Bold, Archivo_800ExtraBold } from "@expo-google-fonts/archivo";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack, router, type ErrorBoundaryProps } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import "../global.css";
import { installAutoAdvance } from "../src/audio/autoAdvance";
import { setupAudio } from "../src/audio/player";
import { installPresence } from "../src/audio/presence";
import { AddToPlaylistSheet } from "../src/components/AddToPlaylistSheet";
import { BarMark } from "../src/components/BarMark";
import { MiniPlayer } from "../src/components/MiniPlayer";
import { Toasts } from "../src/components/Toasts";
import { TrackSheet } from "../src/components/TrackSheet";
import { Button } from "../src/components/ui";
import { sendReport } from "../src/lib/bugReport";
import { getDb } from "../src/lib/db";
import { initDeviceId } from "../src/lib/device";
import { installErrorCapture } from "../src/lib/errorLog";
import { t } from "../src/lib/i18n.mobile";
import { loadMobileSettings } from "../src/lib/mobileSettings";
import { repairPlaceholderTracks } from "../src/lib/repairTracks";
import { runStartupTasks } from "../src/lib/startup";
import { startSync } from "../src/lib/sync/engine";
import { hydrateLocalStorage, installWebShims } from "../src/lib/webShims";
import { installPlaybackState } from "../src/store/usePlayback";
import { useSettingsStore } from "../src/store/useSettingsStore";
import { buildPalette, themeVars, useColors } from "../src/theme";

// Hata raporu için son hata/uyarıları topla — her şeyden ÖNCE (açılış hataları da girsin).
installErrorCapture();

// Sistem açılış ekranı (koyu zemin + logo) veritabanı ve yazı tipleri hazır
// olana kadar kalır → siyah boşluk ya da yarım çizilmiş ekran görünmez.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 220 });

/**
 * Açılış sırası ÖNEMLİ:
 *   0) tarayıcı API taklitleri (kopyalanan senkron kodu bunları bekliyor)
 *   1) cihaz kimliği  → senkron satırları doğru cihaza yazılsın (getDeviceId senkron)
 *   2) veritabanı     → migration'lar (masaüstüyle BİREBİR aynı şema)
 *   3) ayarlar        → dil/tema, öneri ayarları
 *   4) ses motoru     → arka plan servisi
 *   5) senkron + arka plan işleri → arayüzü bekletmeden
 */
export default function RootLayout() {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  // Archivo = başlık sesi, Inter = gövde (masaüstüyle ortak),
  // JetBrains Mono = veri (karma, süre, gerekçe).
  const [fontsReady] = useFonts({
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const colors = useColors();

  // Pencere zemini temayla aynı olsun: geçiş animasyonlarında ve klavye
  // açılırken arkadan beyaz/siyah şerit görünmesin.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  }, [colors.bg]);

  useEffect(() => {
    (async () => {
      try {
        installWebShims();
        await hydrateLocalStorage();
        await initDeviceId();
        await getDb();
        await useSettingsStore.getState().load();
        await loadMobileSettings();
        await setupAudio();
        installPlaybackState();
        installAutoAdvance();
        installPresence();
        setReady(true);
        runStartupTasks();
        // Senkron arayüzü BEKLETMEZ: giriş yapılmamışsa sessizce çıkar,
        // yapılmışsa arka planda ilk turu atar (docs/SYNC.md tetikleyicileri).
        void startSync().catch((e) => console.error("[sync] başlatılamadı:", e));
        // Senkron eksik ebeveyn yüzünden yer tutucu açtıysa arka planda doldur.
        void repairPlaceholderTracks();
      } catch (e) {
        console.error("[boot] açılış hatası:", e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if ((ready && fontsReady) || error) void SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsReady, error]);

  if (error) {
    return (
      <View className="bg-bg flex-1 items-center justify-center px-8" style={themeVars(colors)}>
        <BarMark size={28} color={colors.down} />
        <Text className="text-text mt-5 text-[17px]" style={{ fontFamily: "Archivo_700Bold" }}>
          {t("m.boot.failed")}
        </Text>
        <Text className="text-muted mt-2 text-center text-[13px]">{error}</Text>
      </View>
    );
  }

  if (!ready || !fontsReady) {
    // Marka işareti nefes alır — boş siyah ekran yerine "açılıyor".
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg }}>
        <BarMark size={34} alive color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="bg-bg flex-1" style={themeVars(colors)}>
        <StatusBar style={colors.isLight ? "dark" : "light"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="player" options={{ animation: "slide_from_bottom", gestureEnabled: true }} />
          <Stack.Screen name="queue" options={{ animation: "slide_from_bottom" }} />
          <Stack.Screen name="ambient" options={{ animation: "fade" }} />
          <Stack.Screen name="onboarding" options={{ animation: "fade", gestureEnabled: false }} />
        </Stack>
        <MiniPlayer />
        <AddToPlaylistSheet />
        <TrackSheet />
        <Toasts />
      </View>
    </GestureHandlerRootView>
  );
}

/**
 * Arayüz hatası tüm uygulamayı beyaz ekrana düşürmesin (masaüstü
 * `ErrorBoundary`). Oynatma arka planda sürer; "tekrar dene" ekranı yeniden kurar.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const s = useSettingsStore.getState();
  const colors = buildPalette(s.theme === "light", s.accentColor);
  console.error("[arayüz] yakalanan hata:", error);
  return (
    <View className="flex-1 items-center justify-center px-8" style={[themeVars(colors), { backgroundColor: colors.bg }]}>
      <BarMark size={28} color={colors.down} />
      <Text className="text-text mt-5 text-[18px]" style={{ fontFamily: "Archivo_700Bold" }}>
        {t("error.title")}
      </Text>
      <Text className="text-muted mt-2 text-center text-[13px] leading-5">{t("error.body")}</Text>
      <Text className="text-faint mt-3 text-center text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }} numberOfLines={3}>
        {error.message}
      </Text>
      <Button
        label={t("error.retry")}
        kind="primary"
        className="mt-6"
        onPress={() => {
          void retry();
          if (router.canGoBack()) router.back();
        }}
      />
      <Button
        label={t("m.report.send")}
        kind="ghost"
        icon="fileUp"
        className="mt-3"
        onPress={() => void sendReport({ error: `${error.name}: ${error.message}\n${(error.stack ?? "").slice(0, 1500)}` })}
      />
    </View>
  );
}
