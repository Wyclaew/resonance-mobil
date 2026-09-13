import * as Extractor from "../../modules/resonance-extractor";
import { isLikelySong } from "./recommender";
import type { Track } from "../types";

/**
 * Spotify listesi içe aktarma — masaüstündeki `spotify.rs` ANAHTARSIZ yolunun
 * karşılığı. `open.spotify.com/embed/playlist/<id>` sayfası liste adını ve
 * şarkıları gömülü `__NEXT_DATA__` JSON'unda taşıyor; API anahtarı gerekmez.
 *
 * SINIR (masaüstüyle aynı): embed en fazla ~100 şarkı verir.
 * Ses Spotify'dan GELMEZ: her şarkı YouTube Music'te aranıp eşleştirilir.
 */
export function spotifyPlaylistId(url: string): string | null {
  const match = url.match(/playlist\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

interface SpTrack {
  title: string;
  artist: string;
}

async function fetchPublicPlaylist(id: string): Promise<{ name: string; tracks: SpTrack[] }> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${id}`, {
    headers: { "user-agent": "Mozilla/5.0 (Resonance)" },
  });
  if (!res.ok) throw new Error(`Spotify yanıt vermedi (HTTP ${res.status})`);
  const html = await res.text();
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) {
    throw new Error("Liste okunamadı — listenin herkese açık olduğundan emin ol");
  }
  const body = html.slice(start + marker.length);
  const json = JSON.parse(body.slice(0, body.indexOf("</script>")));
  const entity = json?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Liste verisi bulunamadı (liste herkese açık mı?)");

  const tracks: SpTrack[] = [];
  for (const t of entity.trackList ?? []) {
    const title = String(t?.title ?? "").trim();
    if (!title) continue;
    // "Sanatçı1, Sanatçı2" (ayraç bölünmez boşluk olabilir). Eşleşme için ilk
    // sanatçı yeterli ve daha isabetli.
    const artist = String(t?.subtitle ?? "")
      .replace(/\u00a0/g, " ")
      .split(",")[0]
      .trim();
    tracks.push({ title, artist });
  }
  if (!tracks.length) throw new Error("Bu listede şarkı bulunamadı (liste herkese açık mı?)");
  return { name: String(entity.name ?? "Spotify listesi"), tracks };
}

/**
 * Listeyi okur ve her şarkıyı YouTube Music'te eşleştirir. Mobil şebekeyi
 * boğmamak için eşleştirme 3'erli dalgalarla yapılır (masaüstüyle aynı sınır).
 */
export async function importSpotifyPlaylist(
  url: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ name: string; tracks: Track[]; missed: number }> {
  const id = spotifyPlaylistId(url);
  if (!id) throw new Error("Spotify liste adresi tanınmadı");
  const { name, tracks } = await fetchPublicPlaylist(id);

  const matched: Track[] = [];
  let missed = 0;
  for (let i = 0; i < tracks.length; i += 3) {
    const wave = await Promise.all(
      tracks.slice(i, i + 3).map(async (sp) => {
        try {
          const results = await Extractor.search(`${sp.artist} ${sp.title}`.trim(), 5, true);
          return results.find(isLikelySong) ?? null;
        } catch {
          return null;
        }
      })
    );
    for (const hit of wave) {
      if (hit) matched.push(hit);
      else missed += 1;
    }
    onProgress?.(Math.min(tracks.length, i + 3), tracks.length);
  }
  return { name, tracks: matched, missed };
}
