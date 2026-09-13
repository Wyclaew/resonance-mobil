// İndirme katmanı — masaüstündeki `native_dl.rs`'in mobil karşılığı.
//
// ⭐ NEDEN PARÇALI (Faz 0'da ÖLÇÜLDÜ, docs/FAZ0-SES-YOLU.md): googlevideo tek
// seferlik tam indirmede bağlantıyı kesiyor (5.03 MB'lık dosyada 4.78 MB'ta
// "connection reset"). Range istekleri ise sorunsuz 206 dönüyor. Yani parçalı
// indirme bir optimizasyon değil, ÇALIŞMA ŞARTI.
//
// ⭐ DEVAM EDEBİLİRLİK: mobilde şebeke kopması masaüstünden çok daha sık
// (MOBILE.md §5). Yarım dosya diskte kalır, sonraki denemede kaldığı bayttan
// devam eder.
import { Directory, File, FileMode, Paths } from "expo-file-system";

import * as Extractor from "../../modules/resonance-extractor";
import type { AudioStreamInfo, StreamQuality } from "../../modules/resonance-extractor";
import { invalidateUrl, resolveCached } from "../audio/urlCache";
import { getDb } from "./db";
import { ensureTrack } from "./playlists";
import type { Track } from "../types";

const CHUNK = 1024 * 1024; // 1 MB
const MAX_RETRY = 3;

export interface DownloadProgress {
  bytes: number;
  total: number;
  /** 0..1 */
  ratio: number;
}

export function audioDir(): Directory {
  const dir = new Directory(Paths.document, "audio");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function extensionFor(stream: AudioStreamInfo): string {
  const mime = (stream.mimeType || "").toLowerCase();
  if (mime.includes("webm") || mime.includes("opus")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  return "bin";
}

/**
 * ⭐ ADRES SAĞLIK TESTİ (masaüstü v1.8.4): indirmeye başlamadan önce dosyanın
 * SON parçasını iste. Kısıtlı adres 403 verir, sağlam adres 206 — maliyeti
 * ~0.1 sn. Mobilde ayrıca veri kotası açısından değerli: boşa 1 MB inmez.
 */
async function urlIsHealthy(url: string, contentLength: number): Promise<boolean> {
  if (contentLength <= 2048) return true;
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=${contentLength - 1024}-${contentLength - 1}` },
    });
    return res.status === 206 || res.status === 200;
  } catch {
    return false;
  }
}

async function fetchRange(url: string, from: number, to: number): Promise<Uint8Array> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
      if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`parça indirilemedi (${from}-${to}): ${String(lastError)}`);
}

export interface DownloadResult {
  path: string;
  bytes: number;
  format: string;
}

/**
 * Bir parçayı indirir (varsa kaldığı yerden devam eder) ve `cache` tablosuna yazar.
 * `permanent` = kullanıcının açıkça indirdiği (LRU budamasından muaf).
 */
export async function downloadTrack(
  track: Track,
  opts: {
    permanent?: boolean;
    /** Ayarlar → Ses kalitesi (masaüstündeki `audioQuality`). */
    quality?: StreamQuality;
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<DownloadResult> {
  // ⚠️ ÖNCE parçayı `tracks`'e yaz: `cache.track_id` oraya FK ile bağlı ve
  // Keşfet'ten gelen öneri henüz kayıtlı DEĞİL → "FOREIGN KEY constraint failed"
  // (ölçüldü). Aynı ders masaüstünde gotcha #13 olarak duruyor: yazan her yol
  // `ensureTrack`'ten geçmeli.
  await ensureTrack(track);
  const trackId = track.id;
  const videoId = track.sourceId;
  const info = await resolveCached(videoId);
  const stream = Extractor.pickStream(info.streams, opts.quality ?? "high");
  if (!stream) throw new Error("çalınabilir ses akışı yok");

  const total = stream.contentLength;
  if (total > 0 && !(await urlIsHealthy(stream.url, total))) {
    invalidateUrl(videoId);
    throw new Error("adres kısıtlı (sağlık testi başarısız)");
  }

  const file = new File(audioDir(), `${videoId}.${extensionFor(stream)}`);
  let written = file.exists ? (file.size ?? 0) : 0;
  if (total > 0 && written >= total) {
    await recordCache(trackId, file.uri, written, stream.format, opts.permanent ?? false);
    return { path: file.uri, bytes: written, format: stream.format };
  }
  if (!file.exists) file.create({ intermediates: true });

  // ReadWrite: imleci elle kaydırıp KALDIĞI BAYTTAN devam ederiz (Truncate
  // yarım dosyayı siler, Append ise SAF'ta imleci kaydırmaya izin vermez).
  const handle = file.open(FileMode.ReadWrite);
  try {
    handle.offset = written;
    while (total === 0 || written < total) {
      if (opts.signal?.aborted) throw new Error("indirme iptal edildi");
      const to = total > 0 ? Math.min(written + CHUNK, total) - 1 : written + CHUNK - 1;
      const chunk = await fetchRange(stream.url, written, to);
      if (chunk.length === 0) break;
      handle.writeBytes(chunk);
      written += chunk.length;
      opts.onProgress?.({ bytes: written, total, ratio: total > 0 ? written / total : 0 });
      if (total === 0 && chunk.length < CHUNK) break;
    }
  } finally {
    handle.close();
  }

  await recordCache(trackId, file.uri, written, stream.format, opts.permanent ?? false);
  return { path: file.uri, bytes: written, format: stream.format };
}

async function recordCache(
  trackId: string,
  path: string,
  bytes: number,
  format: string,
  permanent: boolean
): Promise<void> {
  const db = await getDb();
  // ⚠️ `cache` senkronlanmaz (MOBILE.md §5) — her cihaz kendi dosyasını indirir.
  await db.execute(
    `INSERT INTO cache (track_id, file_path, bytes, format, last_played, downloaded)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(track_id) DO UPDATE SET
       file_path = excluded.file_path,
       bytes = excluded.bytes,
       format = excluded.format,
       downloaded = MAX(cache.downloaded, excluded.downloaded)`,
    [trackId, path, bytes, format, Date.now(), permanent ? 1 : 0]
  );
}

/**
 * Önbellekte hazır dosya var mı? (offline çalma)
 * `touch`: çalınacaksa son çalma zamanını tazele — ⚠️ BUG'DI: `last_played`
 * yalnız indirme anında yazılıyordu, LRU "en eski indirileni" siliyordu,
 * "en uzun süredir çalınmayanı" değil.
 */
export async function cachedPath(trackId: string, touch = false): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ file_path: string; bytes: number }[]>(
    `SELECT file_path, bytes FROM cache WHERE track_id = $1`,
    [trackId]
  );
  const row = rows[0];
  if (!row) return null;
  const file = new File(row.file_path);
  if (!file.exists || (file.size ?? 0) === 0) {
    // Dosya dışarıdan silinmiş (depolama temizliği): kaydı da düşür, yoksa
    // parça "indirildi" görünür ama çalınamaz.
    await db.execute(`DELETE FROM cache WHERE track_id = $1`, [trackId]);
    return null;
  }
  if (touch) {
    await db.execute(`UPDATE cache SET last_played = $1 WHERE track_id = $2`, [Date.now(), trackId]);
  }
  return row.file_path;
}

/** Kullanıcının kalıcı indirdiği parça kimlikleri (arayüzdeki ✓ işareti). */
export async function downloadedIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select<{ track_id: string }[]>(`SELECT track_id FROM cache WHERE downloaded = 1`);
  return rows.map((r) => r.track_id);
}

/** İndirileni kaldır: dosya + kayıt. */
export async function removeDownload(trackId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ file_path: string }[]>(`SELECT file_path FROM cache WHERE track_id = $1`, [trackId]);
  for (const r of rows) {
    try {
      const f = new File(r.file_path);
      if (f.exists) f.delete();
    } catch (e) {
      console.warn("[downloads] dosya silinemedi:", e);
    }
  }
  await db.execute(`DELETE FROM cache WHERE track_id = $1`, [trackId]);
}

export interface CacheUsage {
  tempBytes: number;
  tempCount: number;
  keptBytes: number;
  keptCount: number;
}

export async function cacheUsage(): Promise<CacheUsage> {
  const db = await getDb();
  const rows = await db.select<{ downloaded: number; bytes: number; n: number }[]>(
    `SELECT downloaded, COALESCE(SUM(bytes),0) AS bytes, COUNT(*) AS n FROM cache GROUP BY downloaded`
  );
  const u: CacheUsage = { tempBytes: 0, tempCount: 0, keptBytes: 0, keptCount: 0 };
  for (const r of rows) {
    if (r.downloaded) {
      u.keptBytes = r.bytes;
      u.keptCount = r.n;
    } else {
      u.tempBytes = r.bytes;
      u.tempCount = r.n;
    }
  }
  return u;
}

/** Geçici önbelleği (kullanıcının indirmedikleri) temizle. İndirilenler kalır. */
export async function clearTempCache(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ track_id: string; file_path: string; bytes: number }[]>(
    `SELECT track_id, file_path, bytes FROM cache WHERE downloaded = 0`
  );
  let freed = 0;
  for (const r of rows) {
    try {
      const f = new File(r.file_path);
      if (f.exists) f.delete();
    } catch {
      // silinemeyen dosya bir sonraki budamada yeniden denenir
    }
    freed += r.bytes;
  }
  await db.execute(`DELETE FROM cache WHERE downloaded = 0`);
  return freed;
}

/**
 * ⭐ LRU budama — mobilde ŞART (MOBILE.md §1: depolama sınırlı).
 * Kullanıcının açıkça indirdikleri (`downloaded = 1`) korunur.
 * `limitBytes <= 0` = SINIRSIZ (masaüstündeki "0 = sınırsız" anlamı) —
 * ⚠️ BUG'DI: 0 sınır her geçici dosyayı siliyordu.
 */
export async function pruneCache(limitBytes: number): Promise<{ freed: number; removed: number }> {
  if (!(limitBytes > 0)) return { freed: 0, removed: 0 };
  const db = await getDb();
  const rows = await db.select<{ track_id: string; file_path: string; bytes: number }[]>(
    `SELECT track_id, file_path, bytes FROM cache
     WHERE downloaded = 0 ORDER BY COALESCE(last_played, 0) ASC`
  );
  const totalRows = await db.select<{ total: number }[]>(`SELECT COALESCE(SUM(bytes),0) AS total FROM cache`);
  let total = totalRows[0]?.total ?? 0;
  let freed = 0;
  let removed = 0;
  for (const row of rows) {
    if (total <= limitBytes) break;
    try {
      const file = new File(row.file_path);
      if (file.exists) file.delete();
    } catch (e) {
      console.warn("[downloads] dosya silinemedi:", e);
    }
    await db.execute(`DELETE FROM cache WHERE track_id = $1`, [row.track_id]);
    total -= row.bytes;
    freed += row.bytes;
    removed += 1;
  }
  return { freed, removed };
}
