import * as Extractor from "../../modules/resonance-extractor";
import { relinkTrack } from "./playlists";
import { isLikelySong } from "./recommender";
import type { Track } from "../types";

/**
 * ⭐ ALTERNATİF KAYNAK — masaüstündeki `find_alternative` karşılığı (v1.8.4).
 *
 * YouTube video siliyor/engelliyor ("UNPLAYABLE: This video is not available").
 * O zaman parça ölmez: AYNI şarkının başka bir yüklemesi aranır ve
 * `tracks.source_id` güncellenir.
 *
 * ⚠️ `tracks.id` DEĞİŞMEZ. Değişseydi playlist üyelikleri, oylar ve dinleme
 * geçmişi parçadan kopardı ve senkronda iki ayrı parça oluşurdu.
 */
const DURATION_TOLERANCE = 0.2;

export async function findAlternative(track: Track): Promise<string | null> {
  // ⛔ Yerel parçayı YouTube kimliğine bağlama: masaüstündeki dosyayı bozar.
  if (track.source === "local") return null;
  const best = await searchEquivalent(track);
  if (!best) return null;
  await relinkTrack(track.id, best);
  console.log(`[alternatif] ${track.title} → ${best}`);
  return best;
}

/**
 * Geçici eşdeğer: bulunur ama `tracks` tablosuna YAZILMAZ. Başka cihazdaki
 * yerel dosyayı telefonda çalmak için.
 */
export async function findStandIn(track: Track): Promise<string | null> {
  return searchEquivalent(track);
}

async function searchEquivalent(track: Track): Promise<string | null> {
  const query = `${track.artist} ${track.title}`.trim();
  if (!query) return null;
  try {
    const results = await Extractor.search(query, 12, true);
    const best = results
      .filter((r) => r.sourceId !== track.sourceId)
      .filter(isLikelySong)
      .find((r) => {
        if (!track.durationMs || !r.durationMs) return true;
        const diff = Math.abs(r.durationMs - track.durationMs) / track.durationMs;
        return diff <= DURATION_TOLERANCE;
      });
    return best?.sourceId ?? null;
  } catch (e) {
    console.warn("[alternatif] aranamadı:", e);
    return null;
  }
}

/** Çıkarım hatası "video yok" mu, geçici bir ağ sorunu mu? */
export function isUnavailable(error: unknown): boolean {
  const text = String(error instanceof Error ? error.message : error).toLowerCase();
  return (
    text.includes("unplayable") ||
    text.includes("not available") ||
    text.includes("contentnotavailable") ||
    text.includes("private") ||
    text.includes("removed")
  );
}
