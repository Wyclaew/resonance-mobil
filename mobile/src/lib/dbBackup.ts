// Yerel veritabanı yedeği + JSON dışa/içe aktarma (masaüstü Ayarlar → Veri).
// Masaüstünde Rust `backup_db`/`restore_backup` komutları vardı; mobilde
// dosyayı kopyalıyoruz.
//
// ⚠️ NEDEN ŞART: `firstSyncPullReplace()` YERELİ SİLER (docs/SYNC.md). MOBILE.md
// §8 Faz 3: "İlk testte mutlaka DB yedeği al". Yedek alınmadan o yol çağrılmaz.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { importBackup, type ImportResult } from "./backup";
import { closeDb, getDb } from "./db";

const DB_NAME = "resonance.db";
/** Masaüstüyle aynı: son 12 yedek. */
const KEEP = 12;
/** Her açılışta yedek almak telefonda gereksiz yazma — en fazla 12 saatte bir. */
const AUTO_EVERY_MS = 12 * 3600_000;

export interface BackupInfo {
  name: string;
  size: number;
  /** Dosya adındaki zaman damgası (epoch ms). */
  at: number;
}

function dbDir(): Directory {
  // expo-sqlite veritabanlarını belge dizinindeki SQLite/ klasöründe tutar.
  return new Directory(Paths.document, "SQLite");
}

function backupDir(): Directory {
  const dir = new Directory(Paths.document, "backups");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function stampOf(name: string): number {
  // resonance-2026-09-13T03-57-12-123Z.db → ISO
  const m = /resonance-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(name);
  if (!m) return 0;
  return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) || 0;
}

/** Yedek alır ve dosya yolunu döner. Son {@link KEEP} yedek saklanır. */
export async function backupDb(): Promise<string> {
  const db = await getDb();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = new File(backupDir(), `resonance-${stamp}.db`);
  try {
    // ⭐ `VACUUM INTO`: açık bağlantı kullanılırken bile TUTARLI kopya (WAL
    // dahil) yazar. ⚠️ Eski yol `wal_checkpoint(TRUNCATE)` + dosya kopyasıydı:
    // açılışta başka sorgular sürerken "database table is locked" veriyordu
    // (ölçüldü) ve otomatik yedek hiç alınmıyordu.
    const path = decodeURIComponent(dst.uri.replace(/^file:\/\//, ""));
    await db.execute(`VACUUM INTO '${path.replace(/'/g, "''")}'`);
  } catch (e) {
    console.warn("[backup] VACUUM INTO olmadı, dosya kopyasına düşülüyor:", e);
    await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    const src = new File(dbDir(), DB_NAME);
    if (!src.exists) throw new Error("veritabanı dosyası bulunamadı");
    if (dst.exists) dst.delete();
    src.copy(dst);
  }
  prune();
  return dst.uri;
}

export function listBackups(): BackupInfo[] {
  return backupDir()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith(".db"))
    .map((f) => ({ name: f.name, size: f.size ?? 0, at: stampOf(f.name) }))
    .sort((a, b) => b.at - a.at);
}

function prune(): void {
  for (const { name } of listBackups().slice(KEEP)) {
    try {
      new File(backupDir(), name).delete();
    } catch (e) {
      console.warn("[backup] eski yedek silinemedi:", e);
    }
  }
}

/** Açılışta: veri varsa ve son yedek eskiyse sessizce yedek al. */
export async function autoBackup(): Promise<void> {
  try {
    const last = listBackups()[0];
    if (last && Date.now() - last.at < AUTO_EVERY_MS) return;
    const db = await getDb();
    const rows = await db.select<{ n: number }[]>(
      `SELECT (SELECT COUNT(*) FROM playlists WHERE deleted = 0) + (SELECT COUNT(*) FROM play_history) AS n`
    );
    if (!rows[0]?.n) return;
    await backupDb();
  } catch (e) {
    console.warn("[backup] otomatik yedek alınamadı:", e);
  }
}

/**
 * Yedeği geri yükle. Mevcut durum ÖNCE ayrıca yedeklenir (masaüstüyle aynı
 * güvenlik ağı). Veritabanı kapatılıp dosya değiştirilir; çağıran store'ları
 * yeniden yüklemeli.
 */
export async function restoreBackup(name: string): Promise<void> {
  const src = new File(backupDir(), name);
  if (!src.exists) throw new Error("yedek bulunamadı");
  await backupDb();
  await closeDb();
  const dir = dbDir();
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = new File(dir, DB_NAME + suffix);
    if (f.exists) f.delete();
  }
  src.copy(new File(dir, DB_NAME));
  await getDb(); // yeniden aç + migration
}

/**
 * JSON dışa aktarma — masaüstü `exportData` ile AYNI biçim (sürüm 1), yani
 * dosya iki uygulama arasında taşınabilir. Paylaşım sayfasıyla kaydedilir
 * (Drive, Dosyalar, mesaj…).
 */
export async function exportJson(): Promise<void> {
  const db = await getDb();
  const [playlists, playlistTracks, tracks, votes, settings] = await Promise.all([
    // deleted=0 ŞART: silinmiş satırlar dışa aktarılırsa içe aktarma onları
    // diriltir (masaüstü dersi).
    db.select<Record<string, unknown>[]>("SELECT * FROM playlists WHERE deleted = 0"),
    db.select<Record<string, unknown>[]>("SELECT * FROM playlist_tracks WHERE deleted = 0"),
    db.select<Record<string, unknown>[]>("SELECT * FROM tracks"),
    db.select<Record<string, unknown>[]>("SELECT * FROM votes WHERE deleted = 0"),
    // Gizli/cihaza özel anahtarlar dışarı çıkmaz.
    db.select<Record<string, unknown>[]>(
      `SELECT * FROM settings WHERE key NOT LIKE 'spotify.%' AND key NOT LIKE 'yt.%' AND key NOT LIKE 'playback.resumeState'`
    ),
  ]);
  const json = JSON.stringify({ version: 1, exportedAt: Date.now(), playlists, playlistTracks, tracks, votes, settings });
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `resonance-yedek-${day}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Resonance" });
}

/** JSON yedeğini seç ve MEVCUT veriyle birleştir (silmez). `null` = vazgeçildi. */
export async function importJsonFile(): Promise<ImportResult | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.length) return null;
  const text = await new File(picked.assets[0].uri).text();
  return importBackup(text);
}
