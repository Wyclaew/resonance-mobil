// Mobile'a ÖZEL ayarlar. Masaüstünde karşılığı olmadığı için `useSettingsStore`
// (kopya) genişletilmez; değerler aynı `settings` tablosuna yazılır.
//
// ⚠️ Anahtarlar `SYNCED_SETTING_KEYS` beyaz listesinde YOK → senkronlanmaz.
// Doğrusu bu: "yalnız Wi-Fi" telefonun kararı, masaüstünü ilgilendirmez.
import { loadSettings, setSetting } from "./settings";

const KEY_WIFI_ONLY = "mobile.wifiOnly";

export interface MobileSettings {
  /** İndirme yalnız Wi-Fi'dayken yapılsın mı? Varsayılan AÇIK (veri kotası). */
  wifiOnly: boolean;
}

const DEFAULTS: MobileSettings = { wifiOnly: true };

let cache: MobileSettings = { ...DEFAULTS };

export async function loadMobileSettings(): Promise<MobileSettings> {
  const raw = await loadSettings();
  cache = { wifiOnly: raw[KEY_WIFI_ONLY] !== "0" };
  return cache;
}

export function getMobileSettings(): MobileSettings {
  return cache;
}

export async function setWifiOnly(value: boolean): Promise<void> {
  cache = { ...cache, wifiOnly: value };
  await setSetting(KEY_WIFI_ONLY, value ? "1" : "0");
}
