// MOBİL KÖPRÜ — masaüstünde `@tauri-apps/api/core`'un `invoke`'u Rust komutlarını
// çağırıyordu. Mobilde aynı komut adları NewPipeExtractor native modülüne gider.
//
// NEDEN BÖYLE: `recommender.ts` masaüstünden BİREBİR kopyalanıyor (sapma
// olmasın diye). Bu dosya, tsconfig+metro takma adıyla `@tauri-apps/api/core`
// olarak çözülür → kopya dosya tek satır değişmeden çalışır.
// Bkz. scripts/sync-core.py ve CLAUDE.md "Kod paylaşımı".
import * as Extractor from "../../modules/resonance-extractor";
import type { Track } from "../types";

type Args = Record<string, unknown>;

async function musicRadio(args: Args): Promise<Track[]> {
  return Extractor.radio(String(args.videoId), Number(args.limit ?? 50));
}

async function searchYoutube(args: Args): Promise<Track[]> {
  // `cookiesBrowser` mobilde yok (tarayıcı çerezi kavramı yok) — yok sayılır.
  return Extractor.search(String(args.query), Number(args.limit ?? 20), true);
}

/**
 * Tür havuzu: masaüstünde YT Music küratörlü listeler `music_genre_pool` ile
 * çekiliyor. Mobilde aynı sorgu YT Music ŞARKI aramasıyla karşılanır —
 * NewPipe'ın "music_songs" sekmesi süre + sanatçıyı DOLU verir (yt-dlp'nin
 * flat-playlist çıktısı vermiyordu, CLAUDE.md).
 */
async function musicGenrePool(args: Args): Promise<Track[]> {
  return Extractor.search(String(args.query), Number(args.limit ?? 60), true);
}

/**
 * Şarkı sözü — masaüstünde Rust `get_lyrics` komutu lrclib.net'e gidiyordu;
 * mobilde aynı iş saf `fetch` ile yapılır (native gerekmiyor).
 */
async function getLyrics(args: Args): Promise<{ synced: string | null; plain: string | null }> {
  const artist = String(args.artist ?? "");
  const title = cleanTitle(String(args.title ?? ""));
  const url =
    "https://lrclib.net/api/search?" +
    new URLSearchParams({ track_name: title, artist_name: artist }).toString();
  const res = await fetch(url, { headers: { "user-agent": "Resonance (personal music player)" } });
  if (!res.ok) return { synced: null, plain: null };
  const items = (await res.json()) as { syncedLyrics?: string; plainLyrics?: string }[];
  let synced: string | null = null;
  let plain: string | null = null;
  for (const item of Array.isArray(items) ? items : []) {
    if (!synced && item.syncedLyrics?.trim()) synced = item.syncedLyrics;
    if (!plain && item.plainLyrics?.trim()) plain = item.plainLyrics;
    if (synced && plain) break;
  }
  return { synced, plain };
}

/** Rust `clean_title` ile aynı: parantez içi + "feat" kuyruğu atılır. */
function cleanTitle(title: string): string {
  let t = title.replace(/\([^)]*\)/g, "").replace(/\[[^\]]*\]/g, "");
  const lower = t.toLowerCase();
  for (const marker of [" feat.", " feat ", " ft.", " ft ", " featuring "]) {
    const at = lower.indexOf(marker);
    if (at > 0) {
      t = t.slice(0, at);
      break;
    }
  }
  return t.trim();
}

/**
 * Ses yüksekliği — masaüstünde ffmpeg dosyayı ölçüyor; mobilde YouTube'un kendi
 * ölçümü okunuyor (aynı hedef: −14 LUFS). Tepe değeri YouTube vermiyor →
 * `peakDb: -1` bildiriliyor: `loudness.ts`'in kırpma koruması bu durumda
 * YÜKSELTMEYİ tamamen kapatır, yalnız kısma kalır. Zaten track-player ses
 * seviyesi 1'in üstüne çıkamıyor, yani doğru davranış bu.
 */
async function measureLoudness(args: Args): Promise<{ lufs: number; peakDb: number }> {
  const sourceId = String(args.sourceId ?? "");
  if (!/^[\w-]{11}$/.test(sourceId)) throw new Error("yalnız YouTube parçaları ölçülür");
  const { lufs } = await Extractor.loudness(sourceId);
  return { lufs, peakDb: -1 };
}

const COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  music_radio: musicRadio,
  search_youtube: searchYoutube,
  music_genre_pool: musicGenrePool,
  get_lyrics: getLyrics,
  measure_loudness: measureLoudness,
};

export async function invoke<T>(cmd: string, args: Args = {}): Promise<T> {
  const fn = COMMANDS[cmd];
  if (!fn) throw new Error(`[tauriShim] mobilde karşılığı olmayan komut: ${cmd}`);
  return (await fn(args)) as T;
}
