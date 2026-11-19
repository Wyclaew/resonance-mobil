import type { Track } from "../types";
import { getDb } from "./db";

/** Saat penceresi: şimdiki saatin bir öncesi ve bir sonrası. */
const HOUR_SPREAD = 1;
/** Bir parçanın bu saatin şarkısı sayılması için en az kaç kez dinlenmiş olması. */
const MIN_PLAYS = 2;

/**
 * "Bu saatin şarkıları" — bu saat diliminde (±1 saat) en çok sonuna kadar dinlediklerin.
 * Saf yerel sorgu (`play_history.hour` + `idx_hist_ctx`); öneri motoruna dokunmaz.
 */
export async function tracksForThisHour(limit = 10, now = new Date()): Promise<Track[]> {
  const h = now.getHours();
  const hours = Array.from({ length: HOUR_SPREAD * 2 + 1 }, (_, i) => (h - HOUR_SPREAD + i + 24) % 24);
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      source: string;
      sourceId: string;
      title: string;
      artist: string;
      album: string | null;
      durationMs: number;
      thumbnail: string | null;
    }[]
  >(
    `SELECT t.id, t.source, t.source_id AS sourceId, t.title, t.artist, t.album,
            t.duration_ms AS durationMs, t.thumbnail
       FROM play_history h JOIN tracks t ON t.id = h.track_id
      WHERE h.hour IN (${hours.map((_, i) => `$${i + 1}`).join(", ")}) AND t.title != ''
      GROUP BY t.id
     HAVING COUNT(*) >= ${MIN_PLAYS}
      ORDER BY SUM(h.ms_played) DESC
      LIMIT ${limit}`,
    hours
  );
  return rows.map((r) => ({
    ...r,
    source: r.source as Track["source"],
    album: r.album ?? undefined,
    thumbnail: r.thumbnail ?? undefined,
  }));
}
