import { songCore } from "./recommender";

/**
 * "30 GÜN ÖNERME" — Spotify'ın `collection_snooze` fikri: şarkıyı (ya da sanatçıyı)
 * kalıcı engellemeden bir süre önerilerden çeker. Kalıcı yol zaten var
 * (`blocked.ts`, sanatçı bazında ve senkronlu); bu şarkı bazında ve geçicidir.
 *
 * Anahtar = şarkı çekirdeği (`songCore`), yani aynı şarkının başka yüklemesi de
 * elenir. Önerilen her yol `excludeCores`'tan geçtiği için motora dokunulmaz.
 * Cihaza özel: masaüstünde karşılığı yok, senkronlanmaz.
 */
const KEY = "resonance.snoozed";
const SNOOZE_DAYS = 30;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 3600 * 1000;

type SnoozeMap = Record<string, number>;

function storage(): Storage | null {
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

function read(): SnoozeMap {
  try {
    const parsed = JSON.parse(storage()?.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SnoozeMap) : {};
  } catch {
    return {};
  }
}

function write(map: SnoozeMap): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(map));
  } catch (e) {
    console.warn("[snooze] yazılamadı:", e);
  }
}

/** Süresi geçenler düşer, yazma sırasında temizlenir. */
function active(map: SnoozeMap, now = Date.now()): SnoozeMap {
  return Object.fromEntries(Object.entries(map).filter(([, until]) => until > now));
}

export function snoozeSong(title: string, artist: string): void {
  write({ ...active(read()), [songCore(title, artist)]: Date.now() + SNOOZE_MS });
}

/** Geri al: önceki erteleme varsa ona döner (yoksa kaldırır). */
export function unsnoozeSong(title: string, artist: string, previousUntil?: number): void {
  const key = songCore(title, artist);
  const { [key]: _removed, ...rest } = active(read());
  write(previousUntil && previousUntil > Date.now() ? { ...rest, [key]: previousUntil } : rest);
}

export function snoozedUntil(title: string, artist: string): number | undefined {
  return active(read())[songCore(title, artist)];
}

export function snoozedCores(): Set<string> {
  return new Set(Object.keys(active(read())));
}
