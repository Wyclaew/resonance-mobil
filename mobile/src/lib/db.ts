// MOBİL UYGULAMA — masaüstündeki `src/lib/db.ts`'in karşılığı.
// Aynı API'yi (getDb().select / .execute, isTauri) sunar; böylece masaüstünden
// KOPYALANAN dosyalar (recommender, sync/engine, prefs…) tek satır değişmeden
// çalışır. Bkz. scripts/sync-core.py.
import * as SQLite from "expo-sqlite";

import { MIGRATIONS } from "../db/migrations";

/** Masaüstündeki tauri-plugin-sql `Database`'in kullandığımız yüzeyi. */
export interface DbLike {
  select<T = unknown>(query: string, bindValues?: unknown[]): Promise<T>;
  execute(
    query: string,
    bindValues?: unknown[]
  ): Promise<{ rowsAffected: number; lastInsertId?: number }>;
}

const DB_NAME = "resonance.db";
let dbPromise: Promise<DbLike> | null = null;

/**
 * ⚠️ Masaüstünde "Tauri içinde miyiz" sorusuydu; mobilde veritabanı HER ZAMAN
 * var. Adı kopyalanan dosyalar bunu çağırdığı için korunuyor.
 */
export function isTauri(): boolean {
  return true;
}

/**
 * `$1, $2` → SQLite adlandırılmış parametreleri. Masaüstü sorguları sqlx
 * biçimini kullanıyor ve aynı numarayı birden çok kez kullanabiliyor
 * (`VALUES ($1, $2, $3, $3, …)`) — sırayla eşleme bu yüzden YETMEZ.
 */
function named(bindValues?: unknown[]): Record<string, SQLite.SQLiteBindValue> {
  const out: Record<string, SQLite.SQLiteBindValue> = {};
  (bindValues ?? []).forEach((v, i) => {
    out[`$${i + 1}`] = (v ?? null) as SQLite.SQLiteBindValue;
  });
  return out;
}

async function open(): Promise<DbLike> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await migrate(db);

  await installSyncGuards(db);

  return {
    async select<T>(query: string, bindValues?: unknown[]) {
      return (await db.getAllAsync(query, named(bindValues))) as T;
    },
    async execute(query: string, bindValues?: unknown[]) {
      const res = await db.runAsync(query, named(bindValues));
      return { rowsAffected: res.changes, lastInsertId: res.lastInsertRowId };
    },
  };
}

/**
 * Migration'lar masaüstünde Rust tarafında koşuyordu; mobilde burada.
 * ŞEMA BİREBİR AYNI OLMALI — senkron (docs/SYNC.md) buna dayanır.
 * `migrations.ts` masaüstünün `lib.rs`'inden ÜRETİLİR (scripts/gen-migrations.py).
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  let current = row?.user_version ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    await db.withTransactionAsync(async () => {
      await db.execAsync(m.sql);
    });
    // PRAGMA parametre almaz → sürüm doğrudan gömülür (m.version sayı).
    await db.execAsync(`PRAGMA user_version = ${m.version}`);
    current = m.version;
    console.log(`[db] migration v${m.version} (${m.description}) uygulandı`);
  }
}

export function getDb(): Promise<DbLike> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

/**
 * ⚠️ MOBİLE ÖZEL DAYANIKLILIK (şemayı değiştirmez, yalnız tetikleyici ekler).
 *
 * ÖLÇÜLDÜ: senkron çekerken 54 `playlist_tracks` satırı "FOREIGN KEY
 * constraint failed" ile DÜŞTÜ. Sebep: bu üyeliklerin işaret ettiği parçalar
 * bulutta yok (masaüstünde var, hiç push edilmemiş). Satır düşünce üyelik
 * telefona hiç gelmiyor ve kayıp SESSİZ oluyor.
 *
 * Çözüm: eksik ebeveyn için yer tutucu bir `tracks` satırı aç (`updated_at=0`
 * → gerçek satır buluttan gelince ONU ezer, tersi olmaz). Yer tutucular
 * `repairTracks.ts` tarafından arka planda gerçek meta veriyle doldurulur.
 */
async function installSyncGuards(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TRIGGER IF NOT EXISTS pt_parent_track
    BEFORE INSERT ON playlist_tracks
    FOR EACH ROW WHEN NOT EXISTS (SELECT 1 FROM tracks WHERE id = NEW.track_id)
    BEGIN
      INSERT INTO tracks (id, source, source_id, title, artist, duration_ms, added_at, updated_at)
      VALUES (
        NEW.track_id,
        CASE WHEN instr(NEW.track_id, ':') > 0
             THEN substr(NEW.track_id, 1, instr(NEW.track_id, ':') - 1) ELSE 'youtube' END,
        CASE WHEN instr(NEW.track_id, ':') > 0
             THEN substr(NEW.track_id, instr(NEW.track_id, ':') + 1) ELSE NEW.track_id END,
        '', '', 0, CAST(strftime('%s','now') AS INTEGER) * 1000, 0
      );
    END;
  `);
}
