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
import type { AudioStreamInfo } from "../../modules/resonance-extractor";
import { getDb } from "./db";

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
  trackId: string,
  videoId: string,
  opts: {
    permanent?: boolean;
    preferSmall?: boolean;
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<DownloadResult> {
  const info = await Extractor.resolve(videoId);
  const stream = Extractor.pickStream(info.streams, { preferSmall: opts.preferSmall });
  if (!stream) throw new Error("çalınabilir ses akışı yok");

  const total = stream.contentLength;
  if (total > 0 && !(await urlIsHealthy(stream.url, total))) {
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

/** Önbellekte hazır dosya var mı? (offline çalma) */
export async function cachedPath(trackId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ file_path: string; bytes: number }[]>(
    `SELECT file_path, bytes FROM cache WHERE track_id = $1`,
    [trackId]
  );
  const row = rows[0];
  if (!row) return null;
  const file = new File(row.file_path);
  return file.exists && (file.size ?? 0) > 0 ? row.file_path : null;
}

/**
 * ⭐ LRU budama — mobilde ŞART (MOBILE.md §1: depolama sınırlı).
 * Kullanıcının açıkça indirdikleri (`downloaded = 1`) korunur.
 */
export async function pruneCache(limitBytes: number): Promise<{ freed: number; removed: number }> {
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
