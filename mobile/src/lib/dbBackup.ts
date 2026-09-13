// Yerel veritabanı yedeği. Masaüstünde Rust `backup_db` komutu vardı; mobilde
// dosyayı kopyalıyoruz.
//
// ⚠️ NEDEN ŞART: `firstSyncPullReplace()` YERELİ SİLER (docs/SYNC.md). MOBILE.md
// §8 Faz 3: "İlk testte mutlaka DB yedeği al". Yedek alınmadan o yol çağrılmaz.
import { Directory, File, Paths } from "expo-file-system";

import { getDb } from "./db";

const DB_NAME = "resonance.db";
const KEEP = 5;

function dbFile(): File {
  // expo-sqlite veritabanlarını belge dizinindeki SQLite/ klasöründe tutar.
  return new File(new Directory(Paths.document, "SQLite"), DB_NAME);
}

function backupDir(): Directory {
  const dir = new Directory(Paths.document, "backups");
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Yedek alır ve dosya yolunu döner. Son {@link KEEP} yedek saklanır. */
export async function backupDb(): Promise<string> {
  // WAL açık: değişikliklerin bir kısmı -wal dosyasında olabilir. Kopyadan
  // önce ana dosyaya yazdır, yoksa yedek EKSİK olur.
  const db = await getDb();
  await db.execute("PRAGMA wal_checkpoint(TRUNCATE)");

  const src = dbFile();
  if (!src.exists) throw new Error("veritabanı dosyası bulunamadı");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = new File(backupDir(), `resonance-${stamp}.db`);
  src.copy(dst);
  prune();
  return dst.uri;
}

export function listBackups(): { name: string; size: number }[] {
  return backupDir()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith(".db"))
    .map((f) => ({ name: f.name, size: f.size ?? 0 }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function prune(): void {
  const extra = listBackups().slice(KEEP);
  for (const { name } of extra) {
    try {
      new File(backupDir(), name).delete();
    } catch (e) {
      console.warn("[backup] eski yedek silinemedi:", e);
    }
  }
}
