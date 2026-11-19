import { create } from "zustand";

/**
 * ⭐ LİSTE PROFİLİ — kullanıcı isteği (2026-10-18): "playlistlere filtre atayabilelim;
 * playlist dinlerken genel zevk profili çalışmasın, her listenin ayrı profili olsun.
 * Spor listemde yalnız phonk/metal gelsin ama genel zevkim bozulmasın."
 *
 * Her liste için (cihaza özel, localStorage → AsyncStorage):
 *  - `filters`  : Keşfet'teki ruh hali/tür filtreleri (lib/filters.ts kimlikleri)
 *  - `styles`   : serbest tarzlar ("phonk", "drift phonk"…) — paylaşılan filtre
 *                 listesinde olmayan türler için (YT Music'te o adla liste aranır)
 *  - `isolate`  : bu listeyi dinlemek GENEL zevki etkilemesin (varsayılan AÇIK) —
 *                 dinlemeler `context = "filter"` ile yazılır; paylaşılan öneri motoru
 *                 bunları genel profile yalnız %20 katar, zaman profili/kabul oranı/
 *                 favori dönüşüne hiç katmaz (masaüstü v1.9.7 kuralı, iki cihazda aynı)
 *  - `artists`  : bu listede öğrenilen sanatçı puanları (sonuna kadar dinlenen öneri +,
 *                 hemen geçilen −). Liste radyosunun tohum/aday seçimini yönlendirir.
 *
 * ⚠️ Senkronlanmaz (masaüstünde karşılığı yok). Masaüstüne taşınırsa `playlists`
 * tablosuna sütun ya da senkronlu ayar anahtarı gerekir — docs/MASAUSTU-NOTLARI.md.
 */
export interface PlaylistProfile {
  filters: string[];
  styles: string[];
  isolate: boolean;
  artists: Record<string, number>;
  /** Önerili karışıkta kaç şarkıda bir öneri (0 = genel ayar `recEveryN`). */
  everyN: number;
  /** "Bu listede önerme" denen şarkılar (`songCore`); yalnız bu listenin önerilerinden çıkar. */
  blockedCores: string[];
  /** Wi-Fi'da eksik şarkıları kendiliğinden indir (listeyi çevrimdışı tut). */
  keepOffline: boolean;
}

const PREFIX = "resonance.plProfile.";
const DEFAULT: PlaylistProfile = {
  filters: [],
  styles: [],
  isolate: true,
  artists: {},
  everyN: 0,
  blockedCores: [],
  keepOffline: false,
};
/** Liste başına "bu listede önerme" üst sınırı (en eskisi düşer). */
const MAX_BLOCKED = 300;
/** Çevrimdışı tutulan listelerin dizini (açılış işi profilleri tek tek taramasın). */
const OFFLINE_INDEX = "resonance.offlineLists";
/** Öğrenilen puan sınırı — tek bir sanatçı listeyi ele geçirmesin. */
const SCORE_CAP = 5;

function storage(): Storage | null {
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

function read(id: string): PlaylistProfile {
  try {
    const raw = storage()?.getItem(PREFIX + id);
    if (!raw) return { ...DEFAULT, artists: {}, blockedCores: [] };
    const p = JSON.parse(raw) as Partial<PlaylistProfile>;
    return {
      filters: Array.isArray(p.filters) ? p.filters : [],
      styles: Array.isArray(p.styles) ? p.styles : [],
      isolate: p.isolate !== false,
      artists: p.artists && typeof p.artists === "object" ? p.artists : {},
      everyN: typeof p.everyN === "number" && p.everyN > 0 ? p.everyN : 0,
      blockedCores: Array.isArray(p.blockedCores) ? p.blockedCores : [],
      keepOffline: p.keepOffline === true,
    };
  } catch {
    return { ...DEFAULT, artists: {}, blockedCores: [] };
  }
}

interface ProfileState {
  profiles: Record<string, PlaylistProfile>;
}

/** Ekranlar profile abone olur (filtre değişince başlık çipleri tazelenir). */
export const usePlaylistProfiles = create<ProfileState>(() => ({ profiles: {} }));

export function getProfile(id: string): PlaylistProfile {
  const cached = usePlaylistProfiles.getState().profiles[id];
  if (cached) return cached;
  const p = read(id);
  usePlaylistProfiles.setState((s) => ({ profiles: { ...s.profiles, [id]: p } }));
  return p;
}

export function updateProfile(id: string, patch: Partial<PlaylistProfile>): PlaylistProfile {
  const next = { ...getProfile(id), ...patch };
  usePlaylistProfiles.setState((s) => ({ profiles: { ...s.profiles, [id]: next } }));
  try {
    storage()?.setItem(PREFIX + id, JSON.stringify(next));
  } catch (e) {
    console.warn("[liste profili] kaydedilemedi:", e);
  }
  return next;
}

/** Listenin bir tarzı var mı (filtre ya da serbest tarz)? */
export function hasStyle(p: PlaylistProfile): boolean {
  return p.filters.length > 0 || p.styles.length > 0;
}

/**
 * Bu listede dinlenen parçadan öğren. `ratio` = dinlenen oran (0..1).
 * Sonuna kadar (≥ %70) → +1, hemen geçildiyse (< %25, "sonraki" ile) → −1.
 */
export function noteListen(id: string, artist: string, ratio: number, skipped: boolean): void {
  const key = artist.trim().toLowerCase();
  if (!key) return;
  const delta = ratio >= 0.7 ? 1 : skipped && ratio < 0.25 ? -1 : 0;
  if (!delta) return;
  const p = getProfile(id);
  const cur = p.artists[key] ?? 0;
  const next = Math.max(-SCORE_CAP, Math.min(SCORE_CAP, cur + delta));
  updateProfile(id, { artists: { ...p.artists, [key]: next } });
}

/** Sanatçının bu listedeki öğrenilmiş puanı (yoksa 0). */
export function artistScore(p: PlaylistProfile, artist: string): number {
  return p.artists[artist.trim().toLowerCase()] ?? 0;
}

/** "Bu listede önerme": şarkı çekirdeğini listenin engel listesine ekler. */
export function blockInPlaylist(id: string, core: string): void {
  const p = getProfile(id);
  if (p.blockedCores.includes(core)) return;
  updateProfile(id, { blockedCores: [...p.blockedCores, core].slice(-MAX_BLOCKED) });
}

export function unblockInPlaylist(id: string, core: string): void {
  const p = getProfile(id);
  updateProfile(id, { blockedCores: p.blockedCores.filter((c) => c !== core) });
}

export function offlineListIds(): string[] {
  try {
    const parsed = JSON.parse(storage()?.getItem(OFFLINE_INDEX) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setKeepOffline(id: string, on: boolean): void {
  updateProfile(id, { keepOffline: on });
  const ids = offlineListIds().filter((x) => x !== id);
  try {
    storage()?.setItem(OFFLINE_INDEX, JSON.stringify(on ? [...ids, id] : ids));
  } catch (e) {
    console.warn("[liste profili] çevrimdışı dizini yazılamadı:", e);
  }
}
