import { PermissionsAndroid, Platform } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";
import type { Track } from "../types";

/**
 * Telefondaki müzik dosyaları.
 *
 * Kimlik kuralı masaüstüyle AYNI (`localFiles.ts`): `id = "local:<adres>"`,
 * `source = "local"`, `sourceId` = oynatılabilir adres. Senkronda `tracks`
 * satırı diğer cihaza gider ama SES GİTMEZ — geçmiş ve istatistik ortak kalsın,
 * dosya kopyalama işine girilmesin diye bilinçli karar.
 */

/** Bu cihazda çalınabilir yerel dosya mı? (Masaüstünün yolları burada yok.) */
export function isPlayableHere(track: Track): boolean {
  return track.source === "local" && /^(content|file):\/\//.test(track.sourceId);
}

/**
 * Android 13+ yalnız müzik iznini ister (`READ_MEDIA_AUDIO`); daha eskilerde
 * genel depolama izni. İzin reddedilirse tarama boş döner, uygulama çalışmaya
 * devam eder.
 */
export async function ensureAudioPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const permission =
    Number(Platform.Version) >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
  if (await PermissionsAndroid.check(permission)) return true;
  const result = await PermissionsAndroid.request(permission, {
    title: "Müzik dosyaların",
    message: "Telefondaki şarkıları Resonance'ta çalmak ve öneri motoruna katmak için.",
    buttonPositive: "İzin ver",
    buttonNegative: "Şimdi değil",
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function scanLocalAudio(): Promise<Track[]> {
  if (!(await ensureAudioPermission())) return [];
  return Extractor.scanLocal(3000);
}
