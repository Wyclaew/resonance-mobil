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
 * ⚠️ İKİ BUG'DI (kullanıcı: "listemde bazı şarkıların kapağı ve adı yok"):
 *  1. Açılış başına yalnız 8 parça deneniyordu → yeni kurulumda onlarca yer
 *     tutucu günlerce isimsiz kaldı.
 *  2. Çözülemeyen (silinmiş / bölgede kapalı) parçalar `title = ''` kaldığı için
 *     HER turda sorgunun başına geliyordu → onarım aynı 8 parçada takılı kaldı.
 * Artık: tur, bitene kadar partiler hâlinde sürer; çözülemeyenler bu oturumda
 * atlanır; YouTube çözümü olmazsa oEmbed'den (bölge kısıtı yok) başlık alınır.
 *
 * `updated_at` 0 kalır: gerçek satır buluttan gelirse (daha yeni) onu ezer.
 */
const BATCH = 8;
/** Bir turda en fazla bu kadar parça — pil ve istek sınırı. */
const MAX_PER_RUN = 240;

let running = false;
const failedThisSession = new Set<string>();

type MetaListener = (trackId: string, meta: { title: string; artist: string; durationMs: number; thumbnail: string | null }) => void;
const metaListeners = new Set<MetaListener>();
const repairedListeners = new Set<() => void>();

/** Bir yer tutucu dolduruldu (kuyruktaki kopyası güncellensin). */
export function onMetaFilled(fn: MetaListener): () => void {
  metaListeners.add(fn);
  return () => metaListeners.delete(fn);
}

/** Onarım turu en az bir parça doldurdu (açık liste ekranı tazelensin). */
export function onTracksRepaired(fn: () => void): () => void {
  repairedListeners.add(fn);
  return () => repairedListeners.delete(fn);
}

interface Meta {
  title: string;
  artist: string;
  durationMs: number;
  thumbnail: string | null;
}

/** oEmbed: video bölgede kapalı olsa bile başlık/kanal döner (silinmişse 404). */
async function oembed(videoId: string): Promise<Meta | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    if (!j.title) return null;
    return {
      title: j.title,
      artist: (j.author_name ?? "").replace(/\s*-\s*Topic$/i, ""),
      durationMs: 0,
      thumbnail: j.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    };
  } catch {
    return null;
  }
}

async function writeMeta(id: string, m: Meta): Promise<void> {
  const db = await getDb();
  await db.execute(
    // ⚠️ `updated_at` ŞART: yer tutucu 0 ile açılıyor, push `updated_at > last_pushed`
    // ile seçiyor → damgasız yazılan ad buluta HİÇ çıkmıyordu (masaüstündeki oy
    // hatasının aynısı). Sunucudaki `keep_newer_row` tetikleyicisi de damgayı
    // artırmayan yazmayı sessizce reddediyor.
    `UPDATE tracks SET title = $1, artist = $2,
            duration_ms = CASE WHEN $3 > 0 THEN $3 ELSE duration_ms END,
            thumbnail = COALESCE($4, thumbnail),
            updated_at = $6
      WHERE id = $5 AND title = ''`,
    [m.title, m.artist, m.durationMs, m.thumbnail, id, Date.now()]
  );
  for (const fn of metaListeners) fn(id, m);
}

/** Çalınırken çözülen parça yer tutucuysa meta verisini hemen yaz (onarımı beklemeden). */
export async function fillIfPlaceholder(trackId: string, info: Extractor.ResolvedTrack): Promise<boolean> {
  if (!info?.title) return false;
  await writeMeta(trackId, {
    title: info.title,
    artist: info.artist ?? "",
    durationMs: info.durationMs ?? 0,
    thumbnail: info.thumbnail ?? null,
  });
  return true;
}

export async function placeholderCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM tracks WHERE title = '' AND source = 'youtube'`);
  return rows[0]?.n ?? 0;
}

export async function repairPlaceholderTracks(onProgress?: (fixed: number) => void): Promise<number> {
  if (running) return 0;
  running = true;
  let fixed = 0;
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) return 0;
    const db = await getDb();
    let tried = 0;
    while (tried < MAX_PER_RUN) {
      const skip = Array.from(failedThisSession);
      const rows = await db.select<{ id: string; source_id: string }[]>(
        `SELECT id, source_id FROM tracks
          WHERE title = '' AND source = 'youtube'
            ${skip.length ? `AND id NOT IN (${skip.map((_, i) => `$${i + 2}`).join(",")})` : ""}
          LIMIT $1`,
        [BATCH, ...skip]
      );
      if (!rows.length) break;
      tried += rows.length;
      const resolved = await Extractor.resolveMany(rows.map((r) => r.source_id), 3);
      const bySource = new Map(resolved.map((r) => [r.sourceId, r]));
      for (const row of rows) {
        const info = bySource.get(row.source_id);
        let meta: Meta | null =
          info && !info.error && info.title
            ? { title: info.title, artist: info.artist ?? "", durationMs: info.durationMs ?? 0, thumbnail: info.thumbnail ?? null }
            : null;
        if (!meta) meta = await oembed(row.source_id);
        if (meta) {
          await writeMeta(row.id, meta);
          fixed += 1;
          onProgress?.(fixed);
        } else {
          failedThisSession.add(row.id);
        }
      }
    }
    if (fixed || failedThisSession.size) {
      console.log(`[onarım] ${fixed} yer tutucu dolduruldu, ${failedThisSession.size} çözülemedi`);
    }
    if (fixed) for (const fn of repairedListeners) fn();
    return fixed;
  } catch (e) {
    console.warn("[onarım] başarısız:", e);
    return fixed;
  } finally {
    running = false;
  }
}
