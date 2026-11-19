/**
 * Kaldığın yer — KONUM ayrı, küçük anahtarda (optimizasyon, 2026-11).
 * `playback.resumeState` kuyruğun tamamını (60 KB'a kadar) taşıyor; eskiden her
 * 10 sn'de hem zustand'a (ayar ekranları yeniden çiziliyordu) hem SQLite'a
 * yazılıyordu. Artık gövde yalnız kuyruk/parça değişince yazılır; aradaki konum
 * buraya (localStorage → AsyncStorage) gider, geri yüklemede birleştirilir.
 */
const KEY = "resonance.resumePos";

interface ResumePos {
  trackId: string;
  positionMs: number;
  savedAt: number;
}

function storage(): Storage | null {
  return (globalThis as { localStorage?: Storage }).localStorage ?? null;
}

export function saveResumePosition(trackId: string, positionMs: number): void {
  try {
    const entry: ResumePos = { trackId, positionMs, savedAt: Date.now() };
    storage()?.setItem(KEY, JSON.stringify(entry));
  } catch {
    /* depo yoksa gövdedeki konum kullanılır */
  }
}

/** Gövdeden daha yeni bir konum varsa onu döner. */
export function newerResumePosition(trackId: string | undefined, bodySavedAt: number): number | null {
  if (!trackId) return null;
  try {
    const p = JSON.parse(storage()?.getItem(KEY) ?? "null") as ResumePos | null;
    return p && p.trackId === trackId && p.savedAt > bodySavedAt ? p.positionMs : null;
  } catch {
    return null;
  }
}
