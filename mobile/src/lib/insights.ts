import { getDb } from "./db";

/**
 * İstatistik sorguları — masaüstü `StatsView` ile aynı SQL. Ekrandan ayrı
 * tutuldu: aynı sayılar ana sayfada ve yıllık özette de kullanılabilsin.
 */

export interface TopRow {
  name: string;
  /** Sanatçı satırında sanatçı adı; parça satırında parçanın sanatçısı. */
  artist?: string;
  plays: number;
  ms: number;
}

export interface HistoryRow {
  id: string;
  title: string;
  artist: string;
  thumbnail?: string;
  at: number;
  ms: number;
}

export interface RangeStats {
  totalMs: number;
  plays: number;
  /** Aralıkta dinlenen FARKLI sanatçı sayısı. */
  artists: number;
  /** Aralıktan önce hiç dinlenmemiş sanatçılar. */
  newArtists: number;
  topArtists: TopRow[];
  topTracks: TopRow[];
  byHour: number[];
  recent: HistoryRow[];
}

/**
 * Liste kapakları: her listenin ilk 4 FARKLI kapağı (2×2 mozaik). Tek sorgu —
 * liste başına ayrı sorgu atmak kütüphane açılışını yavaşlatırdı.
 */
export async function playlistCovers(): Promise<Record<string, string[]>> {
  const db = await getDb();
  const rows = await db.select<{ playlist_id: string; thumbnail: string }[]>(
    `SELECT pt.playlist_id, t.thumbnail
       FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
      WHERE pt.deleted = 0 AND t.thumbnail IS NOT NULL AND t.thumbnail <> ''
      ORDER BY pt.playlist_id, pt.position`
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) {
    const list = (out[r.playlist_id] ??= []);
    if (list.length < 4 && !list.includes(r.thumbnail)) list.push(r.thumbnail);
  }
  return out;
}

export async function statsFor(days: number): Promise<RangeStats> {
  const db = await getDb();
  const since = Date.now() - days * 24 * 3600 * 1000;
  const [tot, art, trk, hrs, rec, fresh, distinct] = await Promise.all([
    db.select<{ ms: number; c: number }[]>(
      `SELECT COALESCE(SUM(ms_played),0) AS ms, COUNT(*) AS c FROM play_history WHERE played_at >= $1`,
      [since]
    ),
    db.select<TopRow[]>(
      `SELECT t.artist AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
         FROM play_history h JOIN tracks t ON t.id = h.track_id
        WHERE h.played_at >= $1 AND t.artist <> ''
        GROUP BY t.artist ORDER BY ms DESC LIMIT 10`,
      [since]
    ),
    db.select<TopRow[]>(
      `SELECT t.title AS name, t.artist AS artist, COUNT(*) AS plays, SUM(h.ms_played) AS ms
         FROM play_history h JOIN tracks t ON t.id = h.track_id
        WHERE h.played_at >= $1
        GROUP BY t.id ORDER BY plays DESC, ms DESC LIMIT 10`,
      [since]
    ),
    db.select<{ hour: number; ms: number }[]>(
      `SELECT hour, SUM(ms_played) AS ms FROM play_history WHERE played_at >= $1 GROUP BY hour`,
      [since]
    ),
    db.select<(HistoryRow & { thumbnail: string | null })[]>(
      `SELECT t.id, t.title, t.artist, t.thumbnail, h.played_at AS at, h.ms_played AS ms
         FROM play_history h JOIN tracks t ON t.id = h.track_id
        WHERE h.played_at >= $1 AND h.ms_played > 20000
        ORDER BY h.played_at DESC LIMIT 60`,
      [since]
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(*) AS c FROM (
         SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1 AND t.artist <> '' GROUP BY t.artist
         EXCEPT
         SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at < $1 AND t.artist <> '' GROUP BY t.artist
       )`,
      [since]
    ),
    db.select<{ c: number }[]>(
      `SELECT COUNT(DISTINCT t.artist) AS c
         FROM play_history h JOIN tracks t ON t.id = h.track_id
        WHERE h.played_at >= $1 AND t.artist <> ''`,
      [since]
    ),
  ]);
  const byHour = Array(24).fill(0) as number[];
  for (const h of hrs) byHour[h.hour % 24] = h.ms;
  return {
    totalMs: tot[0]?.ms ?? 0,
    plays: tot[0]?.c ?? 0,
    artists: distinct[0]?.c ?? 0,
    newArtists: fresh[0]?.c ?? 0,
    topArtists: art,
    topTracks: trk,
    byHour,
    recent: rec.map((r) => ({ ...r, thumbnail: r.thumbnail ?? undefined })),
  };
}
