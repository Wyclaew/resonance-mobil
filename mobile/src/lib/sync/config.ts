// MOBİL — Supabase bağlantısı ortam değişkeninden gelir (`mobile/.env`,
// git'e girmez; örnek: `.env.example`). Masaüstünde bu değerler dosyaya gömülü.
//
// 🔐 anon key gizli DEĞİLDİR (istemci için tasarlandı); veriyi RLS korur
// (`user_id = auth.uid()`). ⛔ `service_role` anahtarı ASLA buraya girmez.
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSyncConfigured(): boolean {
  return SUPABASE_URL.trim().length > 0 && SUPABASE_ANON_KEY.trim().length > 0;
}
