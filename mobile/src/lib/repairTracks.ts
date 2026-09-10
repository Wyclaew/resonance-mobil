import * as Network from "expo-network";

import * as Extractor from "../../modules/resonance-extractor";
import { getDb } from "./db";

/**
 * Yer tutucu parçaları onarır.
 *
 * Senkron, bulutta karşılığı olmayan bir parçaya üyelik getirdiğinde `db.ts`
 * içindeki tetikleyici başlıksız bir satır açar (yoksa üyelik tamamen
 * kaybolurdu). Burası o satırları YouTube'dan gerçek meta veriyle doldurur.
 *
 * Muhafazakâr: yalnız Wi-Fi'da, turda en fazla {@link BATCH} parça, hata
 * sessiz. Bu bir arka plan onarımı, kullanıcının beklediği bir iş değil.
 */
const BATCH = 8;
let running = false;

export async function repairPlaceholderTracks(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) return 0;

    const db = await getDb();
    const rows = await db.select<{ id: string; source_id: string }[]>(
      `SELECT id, source_id FROM tracks
        WHERE title = '' AND source = 'youtube'
        LIMIT $1`,
      [BATCH]
    );
    if (!rows.length) return 0;

    const resolved = await Extractor.resolveMany(
      rows.map((r) => r.source_id),
      3
    );
    let fixed = 0;
    for (const info of resolved) {
      if (!info?.title) continue;
      await db.execute(
        `UPDATE tracks SET title = $1, artist = $2, duration_ms = $3, thumbnail = $4
          WHERE id = $5 AND title = ''`,
        [info.title, info.artist ?? "", info.durationMs ?? 0, info.thumbnail ?? null, info.id]
      );
      fixed += 1;
    }
    if (fixed) console.log(`[onarım] ${fixed} yer tutucu parça dolduruldu`);
    return fixed;
  } catch (e) {
    console.warn("[onarım] başarısız:", e);
    return 0;
  } finally {
    running = false;
  }
}
