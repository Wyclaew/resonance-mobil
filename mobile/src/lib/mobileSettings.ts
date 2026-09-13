// Mobile'a ÖZEL ayarlar. Masaüstünde karşılığı olmadığı için `useSettingsStore`
// (kopya) genişletilmez; değerler aynı `settings` tablosuna yazılır.
//
// ⚠️ Anahtarlar `SYNCED_SETTING_KEYS` beyaz listesinde YOK → senkronlanmaz.
// Doğrusu bu: "yalnız Wi-Fi" telefonun kararı, masaüstünü ilgilendirmez.
import * as Network from "expo-network";
import { create } from "zustand";

import { loadSettings, setSetting } from "./settings";

const KEY_WIFI_ONLY = "mobile.wifiOnly";
const KEY_DATA_SAVER = "mobile.dataSaver";
const KEY_AMBIENT = "mobile.ambientSeconds";

export interface MobileSettings {
  /** İndirme yalnız Wi-Fi'dayken yapılsın mı? Varsayılan AÇIK (veri kotası). */
  wifiOnly: boolean;
  /** Mobil veride akış düşük kalitede (~50 kbps) çalsın mı? Varsayılan KAPALI. */
  dataSaver: boolean;
  /**
   * Oynatıcı açıkken kaç sn dokunulmazsa ambiyans (0 = kapalı).
   * ⚠️ Masaüstünün `appearance.screensaverSeconds` ayarı SENKRONLANIYOR —
   * telefonda onu kullanmak (ya da varsayılanını yazmak) masaüstünün
   * ekran koruyucusunu değiştirirdi. Telefonun bağlamı farklı: ayrı anahtar.
   */
  ambientSeconds: number;
}

const DEFAULTS: MobileSettings = { wifiOnly: true, dataSaver: false, ambientSeconds: 0 };

export const useMobileSettings = create<MobileSettings>(() => ({ ...DEFAULTS }));

/** Şu an hücresel veride miyiz? (akış kalitesi kararı eşzamanlı okunur) */
let cellular = false;
export const onCellular = () => cellular;

export async function loadMobileSettings(): Promise<MobileSettings> {
  const raw = await loadSettings();
  const next = {
    wifiOnly: raw[KEY_WIFI_ONLY] !== "0",
    dataSaver: raw[KEY_DATA_SAVER] === "1",
    ambientSeconds: Number(raw[KEY_AMBIENT] ?? 0) || 0,
  };
  useMobileSettings.setState(next);
  try {
    const net = await Network.getNetworkStateAsync();
    cellular = net.type === Network.NetworkStateType.CELLULAR;
    Network.addNetworkStateListener((s) => {
      cellular = s.type === Network.NetworkStateType.CELLULAR;
    });
  } catch {
    // ağ durumu okunamazsa Wi-Fi varsayılır (kalite düşürülmez)
  }
  return next;
}

export function getMobileSettings(): MobileSettings {
  return useMobileSettings.getState();
}

export async function setWifiOnly(value: boolean): Promise<void> {
  useMobileSettings.setState({ wifiOnly: value });
  await setSetting(KEY_WIFI_ONLY, value ? "1" : "0");
}

export async function setAmbientSeconds(value: number): Promise<void> {
  useMobileSettings.setState({ ambientSeconds: value });
  await setSetting(KEY_AMBIENT, String(value));
}

export async function setDataSaver(value: boolean): Promise<void> {
  useMobileSettings.setState({ dataSaver: value });
  await setSetting(KEY_DATA_SAVER, value ? "1" : "0");
}
