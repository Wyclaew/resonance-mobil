// MOBİL — Supabase bağlantısı ortam değişkeninden gelir (`mobile/.env`,
// git'e girmez; örnek: `.env.example`). Masaüstünde bu değerler dosyaya gömülü.
//
// 🔐 anon key gizli DEĞİLDİR (istemci için tasarlandı); veriyi RLS korur
// (`user_id = auth.uid()`). ⛔ `service_role` anahtarı ASLA buraya girmez.
//
// ⭐ KENDİ SUPABASE PROJEN (masaüstü v1.9.6 ile aynı davranış): APK'nın içindeki
// varsayılan proje, uygulamayı kuran HERKESİ aynı projeye düşürür — veri
// güvende (RLS her satırı kullanıcıya kilitler) ama kota, e-posta limiti ve
// depolama ortaktır. Kullanıcı kendi projesini verirse buradaki varsayılan EZİLİR.
// Değerler `localStorage` kabuğunda (AsyncStorage'a yazar, açılışta yüklenir).
const URL_OVERRIDE_KEY = "resonance.supabaseUrl";
const KEY_OVERRIDE_KEY = "resonance.supabaseAnonKey";

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

function readOverride(key: string): string {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage?.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Kullanılacak proje adresi: kendi verdiğin varsa o, yoksa APK'daki. */
export function syncUrl(): string {
  return readOverride(URL_OVERRIDE_KEY) || SUPABASE_URL;
}

export function syncAnonKey(): string {
  return readOverride(KEY_OVERRIDE_KEY) || SUPABASE_ANON_KEY;
}

/** Kendi projesi mi kullanılıyor (arayüzde göstermek için)? */
export function usingOwnProject(): boolean {
  return readOverride(URL_OVERRIDE_KEY).length > 0;
}

/**
 * Kendi projeni ayarla (boş string → gömülü varsayılana dön).
 * ⚠️ Çağıran ÖNCE oturumu kapatmalı: jeton eski projeye ait.
 */
export function setOwnProject(url: string, anonKey: string): void {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    if (!store) return;
    if (url.trim() && anonKey.trim()) {
      store.setItem(URL_OVERRIDE_KEY, url.trim().replace(/\/+$/, ""));
      store.setItem(KEY_OVERRIDE_KEY, anonKey.trim());
    } else {
      store.removeItem(URL_OVERRIDE_KEY);
      store.removeItem(KEY_OVERRIDE_KEY);
    }
  } catch {
    /* depo yoksa yapılacak bir şey yok */
  }
}

export function isSyncConfigured(): boolean {
  return syncUrl().trim().length > 0 && syncAnonKey().trim().length > 0;
}
