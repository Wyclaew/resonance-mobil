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

const COMMANDS: Record<string, (args: Args) => Promise<unknown>> = {
  music_radio: musicRadio,
  search_youtube: searchYoutube,
  music_genre_pool: musicGenrePool,
};

export async function invoke<T>(cmd: string, args: Args = {}): Promise<T> {
  const fn = COMMANDS[cmd];
  if (!fn) throw new Error(`[tauriShim] mobilde karşılığı olmayan komut: ${cmd}`);
  return (await fn(args)) as T;
}
