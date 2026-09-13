/**
 * Arama yardımcıları — masaüstü SearchView'daki son aramalar + sözden bulma.
 */

const HISTORY_KEY = "resonance.searchHistory"; // masaüstüyle aynı anahtar
const HISTORY_MAX = 8;

export function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rememberSearch(q: string): string[] {
  const query = q.trim();
  if (!query) return loadSearchHistory();
  const next = [query, ...loadSearchHistory().filter((h) => h.toLowerCase() !== query.toLowerCase())].slice(
    0,
    HISTORY_MAX
  );
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    // depolama doluysa geçmiş tutulmaz — arama çalışmaya devam eder
  }
  return next;
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // yok say
  }
}

export interface LyricHit {
  title: string;
  artist: string;
  snippet: string;
}

/**
 * Sözden şarkı bul (lrclib) — masaüstündeki Rust `search_lyrics` ile aynı
 * mantık: eşleşen satırı özet olarak döndür, yoksa ilk satır. lrclib yalnız
 * "hangi şarkı" sorusunu cevaplar; ses yine YouTube'dan bulunur.
 */
export async function searchLyrics(query: string, signal?: AbortSignal): Promise<LyricHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": "Resonance (personal music player)" },
    signal,
  });
  if (!res.ok) throw new Error(`lrclib ${res.status}`);
  const items = (await res.json()) as { trackName?: string; artistName?: string; plainLyrics?: string }[];
  const needle = q.toLowerCase();
  const out: LyricHit[] = [];
  for (const it of Array.isArray(items) ? items.slice(0, 25) : []) {
    const title = it.trackName ?? "";
    if (!title) continue;
    const plain = it.plainLyrics ?? "";
    const lines = plain.split("\n");
    const snippet = (lines.find((l) => l.toLowerCase().includes(needle)) ?? lines[0] ?? "").trim().slice(0, 90);
    out.push({ title, artist: it.artistName ?? "", snippet });
  }
  return out;
}
