import { requireNativeModule } from "expo-modules-core";

import type { Track } from "../../src/types";

/** Tek bir çalınabilir ses akışı (NewPipeExtractor'dan). */
export interface AudioStreamInfo {
  itag: number;
  url: string;
  /** "M4A" | "WEBMA_OPUS" | … */
  format: string;
  mimeType: string;
  /** ortalama kbps */
  bitrate: number;
  contentLength: number;
  isProgressive: boolean;
}

export interface ResolvedTrack {
  id: string;
  sourceId: string;
  title: string;
  artist: string;
  durationMs: number;
  thumbnail?: string;
  streams: AudioStreamInfo[];
}

interface Native {
  resolve(videoId: string): Promise<ResolvedTrack>;
  resolveMany(videoIds: string[], concurrency: number): Promise<(ResolvedTrack & { error?: string })[]>;
  radio(videoId: string, limit: number): Promise<Track[]>;
  search(query: string, limit: number, musicOnly: boolean): Promise<Track[]>;
  playlist(playlistUrl: string, limit: number): Promise<{ name: string; tracks: Track[] }>;
}

const native = requireNativeModule<Native>("ResonanceExtractor");

/** Bir videonun ses akışları. Hata fırlatır — çağıran yerde yakala. */
export const resolve = (videoId: string) => native.resolve(videoId);

/**
 * Toplu adres çözümü. Süre ölçümü (masaüstü): hazır olmanın %70'i adres çözümü,
 * indirme yalnız %30 → kuyruğu önden ısıtmak en büyük kaldıraç.
 */
export const resolveMany = (videoIds: string[], concurrency = 3) =>
  native.resolveMany(videoIds, concurrency);

/** YouTube Music radyosu — öneri motorunun YouTube kaynağı. */
export const radio = (videoId: string, limit = 50) => native.radio(videoId, limit);

/** Arama. `musicOnly` YT Music şarkı sekmesini kullanır (süre + sanatçı dolu). */
export const search = (query: string, limit = 20, musicOnly = true) =>
  native.search(query, limit, musicOnly);

export const playlist = (playlistUrl: string, limit = 500) => native.playlist(playlistUrl, limit);

/**
 * ⭐ En iyi ses akışını seç.
 *
 * Masaüstünden FARKLI: orada rodio m4a'da paniklediği için ADTS zorunluydu
 * (CLAUDE.md gotcha #1). ExoPlayer opus/webm'i sorunsuz çalar → itag 251
 * (Opus ~160k) masaüstündeki 128k m4a'dan İYİ. Veri kotası için `preferSmall`.
 */
export function pickStream(
  streams: AudioStreamInfo[],
  opts: { preferSmall?: boolean } = {}
): AudioStreamInfo | undefined {
  const usable = streams.filter((s) => s.isProgressive && !!s.url);
  if (!usable.length) return undefined;
  if (opts.preferSmall) {
    // Mobil veride: 64–100 kbps yeter; yoksa en düşüğü.
    const small = usable.filter((s) => s.bitrate > 0 && s.bitrate <= 100);
    return small.sort((a, b) => b.bitrate - a.bitrate)[0] ?? usable[usable.length - 1];
  }
  return usable.sort((a, b) => b.bitrate - a.bitrate)[0];
}
