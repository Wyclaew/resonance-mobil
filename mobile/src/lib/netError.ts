/**
 * Ağ hatası sınıflandırması — indirme, çalma ve alternatif arama ortak kullanır.
 * Ayrı dosya: `downloads.ts` ↔ `relink.ts` döngüsel içe aktarması olmasın diye.
 */

/** Ağ yok / bağlantı koptu — iş "başarısız" değil, bağlantı gelince devam. */
export class NetworkDownError extends Error {}

const NETWORK_HINTS = [
  "network request failed",
  "unable to resolve host",
  "unknownhost",
  "failed to connect",
  "timeout",
  "zaman aşımı",
  "aborted",
  "software caused connection abort",
];

export function isNetworkError(e: unknown): boolean {
  if (e instanceof NetworkDownError) return true;
  const text = String(e instanceof Error ? e.message : e).toLowerCase();
  return NETWORK_HINTS.some((h) => text.includes(h));
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
