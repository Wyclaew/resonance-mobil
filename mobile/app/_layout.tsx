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
import { installKeepAlive } from "../src/audio/keepAlive";
import { setupAudio } from "../src/audio/player";
import { installPresence } from "../src/audio/presence";
import { AddToPlaylistSheet } from "../src/components/AddToPlaylistSheet";
import { BarMark } from "../src/components/BarMark";
import { MiniPlayer } from "../src/components/MiniPlayer";
import { Toasts } from "../src/components/Toasts";
import { PlaylistStyleSheet } from "../src/components/PlaylistStyleSheet";
import { LaunchIntro } from "../src/components/LaunchIntro";
import { PortalHost } from "../src/components/Portal";
import { RemoteDeviceBar } from "../src/components/RemoteDeviceBar";
import { TrackSheet } from "../src/components/TrackSheet";
import { UpdateDialog } from "../src/components/UpdateDialog";
import { VersionSheet } from "../src/components/VersionSheet";
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

// Sistem açılış ekranı artık logosuz (yalnız koyu zemin, `splash-blank.png`) ve JS'in
// İLK çiziminde kapanır: logo animasyonu (`LaunchIntro`) hemen başlar, uygulama
// hazırlanırken o oynar. Eskiden sabit logo hazır olana kadar duruyordu.
void SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 150 });

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
  const [themeReady, setThemeReady] = useState(false);
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
        // Birbirinden bağımsız adımlar paralel (açılış süresi): depo ön yükleme, cihaz
        // kimliği ve veritabanı (migration). Ayarlar veritabanını, ses ayarları bekler.
        await Promise.all([hydrateLocalStorage(), initDeviceId(), getDb()]);
        await Promise.all([useSettingsStore.getState().load(), loadMobileSettings()]);
        // Tema/vurgu artık belli → açılış animasyonu kullanıcının renginde başlayabilir.
        setThemeReady(true);
        await setupAudio();
        installPlaybackState();
        installAutoAdvance();
        installKeepAlive();
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
    void SplashScreen.hideAsync().catch(() => {});
  }, []);

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

  const booted = ready && fontsReady;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {booted ? <App colors={colors} /> : null}
      {/* Açılış animasyonu hazırlık sırasında da oynar; hazır olunca kendini kapatır. */}
      <LaunchIntro themeReady={themeReady || !!error} ready={booted} />
    </View>
  );
}

function App({ colors }: { colors: ReturnType<typeof useColors> }) {
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
        <RemoteDeviceBar />
        <AddToPlaylistSheet />
        <TrackSheet />
        <VersionSheet />
        <PlaylistStyleSheet />
        <UpdateDialog />
        {/* Alt sayfalar burada, ekranların ve mini oynatıcının üstünde çizilir (Modal değil — Portal.tsx). */}
        <PortalHost />
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
