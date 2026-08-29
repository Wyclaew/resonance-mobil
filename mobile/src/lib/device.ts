// MOBİL — masaüstündeki `src/lib/device.ts` karşılığı.
// Masaüstü localStorage kullanıyordu (senkron); RN'de senkron depo yok →
// kimlik açılışta BİR KEZ yüklenir, sonra senkron okunur (kopyalanan dosyalar
// getDeviceId()'yi senkron çağırıyor).
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const KEY = "resonance.deviceId";
let cached: string | null = null;

/** Uygulama açılışında bir kez çağrılır (App boot). */
export async function initDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await AsyncStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}

export function getDeviceId(): string {
  // initDeviceId() boot'ta çağrılmadıysa geçici kimlik döner; senkron
  // satırları yanlış cihaza yazılmasın diye boot sırası ÖNEMLİ (App.tsx).
  if (!cached) {
    console.warn("[device] initDeviceId() çağrılmadan getDeviceId() kullanıldı");
    cached = Crypto.randomUUID();
  }
  return cached;
}

/**
 * Olay günlüğü satırları için cihazdan bağımsız benzersiz kimlik
 * (votes / play_history / recommendation_history idempotent upsert anahtarı).
 */
export function newUid(): string {
  return Crypto.randomUUID();
}
