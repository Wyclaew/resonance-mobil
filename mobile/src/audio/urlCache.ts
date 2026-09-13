import * as Extractor from "../../modules/resonance-extractor";
import type { ResolvedTrack } from "../../modules/resonance-extractor";

/**
 * Çözülmüş akış adresleri önbelleği.
 *
 * ⚠️ BUG'DI: Keşfet sıradaki parçaları `resolveMany` ile "ısıtıyordu" ama
 * sonuç hiçbir yerde tutulmuyordu (native tarafta önbellek yok) → ağ işi boşa
 * gidiyor, parça sırası gelince yeniden çözülüyordu. Isıtma ancak sonucu
 * saklarsa işe yarar; bu modül o saklama.
 *
 * Ömür: YouTube adresi `expire=<unix sn>` taşır (~6 sa). O değerden 20 dk
 * önce eskimiş sayılır; bulunamazsa 3 sa varsayılır.
 */
const MARGIN_MS = 20 * 60_000;
const MAX_ENTRIES = 80;

interface Entry {
  info: ResolvedTrack;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<ResolvedTrack>>();

function expiryOf(info: ResolvedTrack): number {
  for (const s of info.streams ?? []) {
    const m = /[?&]expire=(\d+)/.exec(s.url);
    if (m) return Number(m[1]) * 1000 - MARGIN_MS;
  }
  return Date.now() + 3 * 3600_000;
}

function remember(sourceId: string, info: ResolvedTrack): void {
  cache.delete(sourceId); // Map sırası = ekleme sırası → en yeni sona
  cache.set(sourceId, { info, expiresAt: expiryOf(info) });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function fresh(sourceId: string): ResolvedTrack | null {
  const hit = cache.get(sourceId);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(sourceId);
    return null;
  }
  return hit.info;
}

/** Aynı parça için eşzamanlı istekler TEK ağ çağrısını paylaşır. */
export function resolveCached(sourceId: string): Promise<ResolvedTrack> {
  const hit = fresh(sourceId);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(sourceId);
  if (pending) return pending;
  const p = Extractor.resolve(sourceId)
    .then((info) => {
      remember(sourceId, info);
      return info;
    })
    .finally(() => inflight.delete(sourceId));
  inflight.set(sourceId, p);
  return p;
}

/** Adres reddedildiğinde (403 / süresi dolmuş) bir sonraki çağrı taze çözsün. */
export function invalidateUrl(sourceId: string): void {
  cache.delete(sourceId);
}

/**
 * Sıradaki parçaların adreslerini önden çöz. Ucuz (birkaç KB meta veri),
 * ama pil için sınırlı: yalnız henüz önbellekte olmayanlar, en fazla 4.
 */
export async function prewarmUrls(sourceIds: string[]): Promise<void> {
  const todo = Array.from(new Set(sourceIds))
    .filter((id) => /^[\w-]{11}$/.test(id) && !fresh(id) && !inflight.has(id))
    .slice(0, 4);
  if (!todo.length) return;
  try {
    const results = await Extractor.resolveMany(todo, 3);
    for (const r of results) {
      if (!r.error && r.streams?.length) remember(r.sourceId, r);
    }
  } catch (e) {
    console.warn("[audio] adres ısıtma başarısız:", e);
  }
}
