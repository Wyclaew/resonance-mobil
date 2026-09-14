import type { QueueItem } from "../types";

/**
 * ⭐ KALDIĞIN KEŞİF — kullanıcı isteği (2026-09-14): "Keşfet dışında bir listeden
 * şarkı açınca Keşfet gidiyor, olmasını istemiyorum."
 *
 * Tek bir çalma kuyruğu var; listeden şarkı açmak onu değiştirir ve keşif partisi
 * (öneriler, gerekçeleri, tarz kilidi, filtreler) kayboluyordu. Artık kuyruk
 * Keşfet'ten başka bir şeye geçerken parti buraya kenara konur; Keşfet sekmesi
 * ve ana sayfa "Keşfe devam et" gösterir, kaldığı şarkıdan ve saniyeden sürer.
 * Yeni keşif başlatılınca silinir.
 *
 * Cihaza özel: `localStorage` kalıbı (AsyncStorage'a yazar, açılışta yüklenir).
 * Senkronlanmaz — `resumeState` gibi bu telefonun kendi durumu.
 */
export interface DiscoverySession {
  queue: QueueItem[];
  index: number;
  positionMs: number;
  seedArtists: string[];
  filters: string[];
  lockedSeedArtist: string | null;
  savedAt: number;
}

const KEY = "resonance.discoverySession";
/** Uzun dinlemede kuyruk yüzlerce parçaya çıkar: geride yalnız son 10 tutulur. */
const KEEP_BEHIND = 10;

function storage(): Storage | null {
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

export function loadDiscoverySession(): DiscoverySession | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as DiscoverySession;
    return Array.isArray(s.queue) && s.queue.length ? s : null;
  } catch (e) {
    console.warn("[keşfet] kayıtlı parti okunamadı:", e);
    return null;
  }
}

export function saveDiscoverySession(session: DiscoverySession | null): DiscoverySession | null {
  try {
    if (!session) {
      storage()?.removeItem(KEY);
      return null;
    }
    const from = Math.max(0, session.index - KEEP_BEHIND);
    const trimmed = { ...session, queue: session.queue.slice(from), index: session.index - from };
    storage()?.setItem(KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (e) {
    console.warn("[keşfet] parti kaydedilemedi:", e);
    return session;
  }
}
