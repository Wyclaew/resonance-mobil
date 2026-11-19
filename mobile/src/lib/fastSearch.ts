import * as Extractor from "../../modules/resonance-extractor";
import { prewarmUrls } from "../audio/urlCache";
import type { Track } from "../types";
import { getDb } from "./db";
import { onCellular } from "./mobileSettings";

/**
 * Arama hızı (kullanıcı isteği 2026-11; Spotify'ın "önce yerel, sonra ağ" düzeni):
 *  1. KÜTÜPHANE anında: her tuşta yerel SQLite'tan (ağ yok, ~ms) eşleşen parçalar.
 *  2. ÖNBELLEK: aynı sorgu (geri silme, geçmişten seçme) ağa ikinci kez gitmez.
 *  3. ISITMA: ilk sonucun akış adresi önden çözülür → dokununca bekleme olmaz.
 */
const CACHE_LIMIT = 40;
const CACHE_TTL_MS = 10 * 60 * 1000;
const LIBRARY_LIMIT = 6;

const cache = new Map<string, { at: number; tracks: Track[] }>();

const keyOf = (q: string) => q.trim().toLocaleLowerCase();

export function cachedSearch(query: string): Track[] | null {
  const hit = cache.get(keyOf(query));
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.tracks;
}

export async function searchRemote(query: string, limit: number): Promise<Track[]> {
  const cached = cachedSearch(query);
  if (cached) return cached;
  const tracks = await Extractor.search(query, limit, true);
  const key = keyOf(query);
  cache.delete(key);
  cache.set(key, { at: Date.now(), tracks });
  // En eskisi düşer (Map ekleme sırasını korur).
  const oldest = cache.keys().next().value;
  if (cache.size > CACHE_LIMIT && oldest !== undefined) cache.delete(oldest);
  return tracks;
}

/** İlk sonucu ısıt — yalnız Wi-Fi'da (mobil veride boşa çözüm yapma). */
export function prewarmTop(tracks: Track[]): void {
  if (onCellular()) return;
  const ids = tracks
    .filter((t) => t.source === "youtube")
    .slice(0, 1)
    .map((t) => t.sourceId);
  if (ids.length) void prewarmUrls(ids);
}

interface Row {
  id: string;
  source: string;
  source_id: string;
  title: string;
  artist: string;
  album: string | null;
  duration_ms: number;
  thumbnail: string | null;
  added_at: number;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** Kütüphanedeki eşleşmeler (her kelime başlıkta ya da sanatçıda); çok dinlenenler önce. */
export async function searchLibrary(query: string): Promise<Track[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 4);
  if (!words.length) return [];
  const db = await getDb();
  const where = words.map((_, i) => `(t.title || ' ' || t.artist) LIKE $${i + 1} ESCAPE '\\'`).join(" AND ");
  const rows = await db.select<Row[]>(
    `SELECT t.id, t.source, t.source_id, t.title, t.artist, t.album, t.duration_ms, t.thumbnail, t.added_at
       FROM tracks t
      WHERE t.title != '' AND ${where}
      ORDER BY (SELECT COUNT(*) FROM play_history h WHERE h.track_id = t.id) DESC
      LIMIT ${LIBRARY_LIMIT}`,
    words.map((w) => `%${escapeLike(w)}%`)
  );
  return rows.map((r) => ({
    id: r.id,
    source: r.source as Track["source"],
    sourceId: r.source_id,
    title: r.title,
    artist: r.artist,
    album: r.album ?? undefined,
    durationMs: r.duration_ms,
    thumbnail: r.thumbnail ?? undefined,
    addedAt: r.added_at,
  }));
}
