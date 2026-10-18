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
let poolTurn = 0;
async function musicGenrePool(args: Args): Promise<Track[]> {
  const query = String(args.query);
  const limit = Math.min(100, Math.max(10, Number(args.limit ?? 60)));
  // Masaüstü v1.9.7 ile aynı: aramanın getirdiği en fazla 8 KÜRATÖRLÜ listeden
  // ilki (en alakalı) + her çağrıda DÖNEN bir tane. ⛔ Eskiden mobilde yalnız
  // şarkı aramasıydı → aynı filtre hep aynı ~60 şarkıyı veriyordu; 45 günlük
  // tekrar engeli bunları tüketince Keşfet filtrenin DIŞINA taşıyordu.
  try {
    const lists = await Extractor.searchPlaylists(query, 8);
    if (lists.length) {
      const picked = [lists[0]];
      if (lists.length > 1) picked.push(lists[1 + (poolTurn++ % (lists.length - 1))]);
      const out: Track[] = [];
      for (const l of picked) {
        try {
          out.push(...(await Extractor.playlist(l.url, limit)).tracks);
        } catch (e) {
          console.warn("[tür havuzu] liste çekilemedi:", l.name, e);
        }
      }
      if (out.length) return out;
    }
  } catch (e) {
    console.warn("[tür havuzu] liste araması başarısız, şarkı aramasına düşülüyor:", e);
  }
  return Extractor.search(query, limit, true);
}

/**
 * Şarkı sözü — masaüstünde Rust `get_lyrics` komutu lrclib.net'e gidiyordu;
 * mobilde aynı iş saf `fetch` ile yapılır (native gerekmiyor).
 */
/** Aynı şarkının sözü oturumda bir kez istenir (oynatıcı, ambiyans, sözler aynı veriyi ister). */
const lyricsMemo = new Map<string, { synced: string | null; plain: string | null }>();

async function getLyrics(args: Args): Promise<{ synced: string | null; plain: string | null }> {
  const artist = String(args.artist ?? "");
  const title = cleanTitle(String(args.title ?? ""));
  const key = `${artist.toLowerCase()}|${title.toLowerCase()}`;
  const memo = lyricsMemo.get(key);
  if (memo) return memo;
  const url =
    "https://lrclib.net/api/search?" +
    new URLSearchParams({ track_name: title, artist_name: artist }).toString();
  const headers = { "user-agent": "Resonance (personal music player)" };
  let res = await fetch(url, { headers }).catch(() => null);
  // lrclib ara ara 5xx veriyor (ölçüldü: 520) — bir kez kısa beklemeyle yeniden dene.
  if (!res || res.status >= 500) {
    await new Promise((r) => setTimeout(r, 1200));
    res = await fetch(url, { headers }).catch(() => null);
  }
  if (!res || !res.ok) return { synced: null, plain: null };
  const items = (await res.json()) as { syncedLyrics?: string; plainLyrics?: string }[];
  let synced: string | null = null;
  let plain: string | null = null;
  for (const item of Array.isArray(items) ? items : []) {
    if (!synced && item.syncedLyrics?.trim()) synced = item.syncedLyrics;
    if (!plain && item.plainLyrics?.trim()) plain = item.plainLyrics;
    if (synced && plain) break;
  }
  const result = { synced, plain };
  lyricsMemo.set(key, result);
  return result;
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
