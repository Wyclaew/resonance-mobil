import * as IntentLauncher from "expo-intent-launcher";
import { Linking } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";

/**
 * Arka planda kesintisiz çalma — pil kısıtlaması muafiyeti.
 *
 * Kullanıcı (Xiaomi) "müzik bazen kendi kendine duruyor" dedi. Uyanık kilidi
 * (keepAlive/player.ts) çalarken CPU ve Wi-Fi'yi açık tutar; ama MIUI/HyperOS
 * pil tasarrufu muaf olmayan uygulamanın servisini yine de öldürebilir.
 * Sistem diyaloğu tek dokunuşla muaf tutar; Xiaomi'de ayrıca "Pil tasarrufu →
 * Kısıtlama yok" ve "Otomatik başlatma" gerekebilir (uygulama ayarlarından).
 */
const PACKAGE = "com.resonance.mobile";

export function batteryRestricted(): boolean {
  return !Extractor.isIgnoringBatteryOptimizations();
}

export async function requestBatteryExemption(): Promise<void> {
  try {
    await IntentLauncher.startActivityAsync("android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS", {
      data: `package:${PACKAGE}`,
    });
  } catch {
    // Bazı üreticiler bu diyaloğu kapatmış: uygulama ayarlarını aç.
    await Linking.openSettings().catch(() => {});
  }
}
