import * as Extractor from "../../modules/resonance-extractor";
import { isBlocked, loadBlockedArtists } from "./blocked";
import { invoke } from "@tauri-apps/api/core";
import type { Track } from "../types";
import { getDb } from "./db";
import { queriesFor } from "./filters";
import { artistScore, getProfile, hasStyle, type PlaylistProfile } from "./playlistProfile";
import { getMobileSettings } from "./mobileSettings";
import {
  getRecommendations,
  isLikelySong,
  recordRecommended,
  shuffleArray,
  songCore,
  type Recommendation,
  type RecommendOpts,
} from "./recommender";

/**
 * ⭐ LİSTEYE ÖZEL ÖNERİ — kullanıcı isteği (2026-10): "spor listemi Resonance
 * önerili başlatınca o listedeki gibi şarkılar önersin, zevk profilimden ayrı.
 * Çok Türkçe dinliyorum ama spor listesinde metal varsa metal versin."
 *
 * Paylaşılan öneri motoru (`recommender.ts`, masaüstünden kopya) tohumları
 * HER ZAMAN genel zevkten (tüm kütüphane, oylar, mod) seçiyor; liste yalnız
 * dışlama için kullanılıyordu. Burada tohumlar YALNIZ çalan listenin şarkılarıdır:
 * YouTube Music radyosu o şarkılar için kurulur, sonuçlar listenin tarzında kalır.
 * Genel zevk sıralamaya karışmaz. Keşfet (filtresiz) zevk profiliyle çalışmaya
 * devam eder — kullanıcının istediği ayrım bu.
 *
 * Masaüstüne de taşınmalı (kopya dosyaya değil, bu dosyanın mantığı) — not:
 * docs/MASAUSTU-NOTLARI.md karşılığı olarak mobil kılavuza yazıldı.
 */
const SEEDS = 4;
const PER_RADIO = 40;
const PER_ARTIST = 2;
/** Liste radyosunda tekrar engeli: genel 45 gün yerine kısa (liste dar bir tarz). */
const REPEAT_BLOCK_DAYS = 14;

/** Bu oturumda tohum olmuş parçalar — sıradaki besleme FARKLI tohumlarla gelsin. */
const usedSeeds = new Map<string, Set<string>>();

interface PlTrack {
  id: string;
  source_id: string;
  title: string;
  artist: string;
  weight: number;
}


/** Gerçek (kullanıcı) liste mi? Keşfet, akıllı listeler ve sanal kaynaklar değil. */
export function isRealPlaylist(id: string | null | undefined): id is string {
  return !!id && !id.startsWith("__") && !id.includes(":");
}

/**
 * Liste çalarken öneri: ayar açıksa listeden tohumlanır; sonuç çıkmazsa (ağ,
 * çok küçük liste) genel motora düşülür ki kuyruk boşalıp müzik durmasın.
 */
export async function recommendFor(opts: RecommendOpts): Promise<Recommendation[]> {
  if (isRealPlaylist(opts.playlistId)) {
    const styled = hasStyle(getProfile(opts.playlistId));
    if (styled || getMobileSettings().playlistRadio) {
      try {
        const recs = await playlistRecommendations(opts.playlistId, opts.excludeIds, opts.excludeCores ?? new Set(), opts.limit);
        if (recs.length) {
          await recordRecommended(recs.map((r) => r.id));
          return recs;
        }
        // ⚠️ Tarz atanmış listede genel zevke DÜŞME: kullanıcı "yalnız phonk" dedi;
        // genel öneri tarzı bozar. Liste kendi şarkılarıyla sürer.
        if (styled) {
          console.log("[liste radyosu] tarzlı listede öneri çıkmadı — genel önerilere düşülmüyor");
          return [];
        }
        console.log("[liste radyosu] öneri çıkmadı — genel önerilere düşülüyor");
      } catch (e) {
        console.warn("[liste radyosu] başarısız:", e);
        if (styled) return [];
      }
    }
  }
  return getRecommendations(opts);
}

async function playlistRecommendations(
  playlistId: string,
  excludeIds: Set<string>,
  excludeCores: Set<string>,
  limit: number
): Promise<Recommendation[]> {
  const db = await getDb();
  const profile = getProfile(playlistId);
  const nameRow = await db.select<{ name: string }[]>(`SELECT name FROM playlists WHERE id = $1`, [playlistId]);
  const listName = nameRow[0]?.name ?? "";
  const rows = await db.select<PlTrack[]>(
    `SELECT t.id, t.source_id, t.title, t.artist,
            1 + MAX(0, COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.track_id = t.id), 0)) AS weight
       FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = $1 AND pt.deleted = 0 AND t.source = 'youtube' AND t.title != ''`,
    [playlistId]
  );
  if (!rows.length && !hasStyle(profile)) return [];

  const inList = new Set(rows.map((r) => r.id));
  const listCores = new Set(rows.map((r) => songCore(r.title, r.artist)));
  const listArtists = new Set(rows.map((r) => r.artist.toLowerCase()));
  // Bu listede öğrenilen sanatçı puanı → ağırlık çarpanı (−5..+5 → ~0.13..7.4).
  const learned = (artist: string) => Math.exp(0.4 * artistScore(profile, artist));
  const disliked = (artist: string) => artistScore(profile, artist) <= -2;

  await loadBlockedArtists().catch(() => new Set<string>());

  type Seed = { sourceId: string; artist: string };
  const seeds: Seed[] = [];
  const seedArtists = new Set<string>();
  const pushSeed = (sourceId: string, artist: string) => {
    const a = artist.toLowerCase();
    if (!sourceId || seedArtists.has(a) || isBlocked(artist) || disliked(artist)) return false;
    seedArtists.add(a);
    seeds.push({ sourceId, artist });
    return true;
  };
  const weighted = <T,>(items: T[], w: (x: T) => number) =>
    items
      .map((x) => ({ x, key: -Math.log(Math.random() || 1e-9) / Math.max(0.05, w(x)) }))
      .sort((a, b) => a.key - b.key)
      .map((e) => e.x);

  // ⭐ TARZLI LİSTE (filtre ya da serbest tarz atanmış): tohumlar o tarzın küratörlü
  // YT Music listelerinden (Keşfet'in filtreli moduyla aynı yol) + listede o tarzda
  // görülen kendi sanatçıların. Genel zevk HİÇ karışmaz → "spor listemde yalnız phonk".
  let pool: Track[] = [];
  if (hasStyle(profile)) {
    pool = await stylePool(profile);
    const poolArtists = new Set(pool.map((t) => t.artist.toLowerCase()));
    for (const t of shuffleArray(pool)) {
      if (seeds.length >= 3) break;
      pushSeed(t.sourceId, t.artist);
    }
    const mineInStyle = rows.filter((r) => poolArtists.has(r.artist.toLowerCase()));
    let mine = 0;
    for (const r of weighted(mineInStyle, (x) => x.weight * learned(x.artist))) {
      if (mine >= 2) break;
      if (pushSeed(r.source_id, r.artist)) mine++;
    }
  } else {
    // Tohumlar listenin kendi şarkılarından: oy × bu listede öğrenilen puan; bu
    // oturumda kullanılmamış olanlar önce (besleme listenin başka köşesinden gelsin).
    let used = usedSeeds.get(playlistId);
    if (!used || used.size >= rows.length) {
      used = new Set();
      usedSeeds.set(playlistId, used);
    }
    for (const r of weighted(
      rows.filter((r) => !used!.has(r.source_id)),
      (x) => x.weight * learned(x.artist)
    )) {
      if (seeds.length >= SEEDS) break;
      if (pushSeed(r.source_id, r.artist)) used.add(r.source_id);
    }
  }
  if (!seeds.length && !pool.length) return [];

  const since = Date.now() - REPEAT_BLOCK_DAYS * 24 * 3600 * 1000;
  const recent = new Set(
    (
      await db
        .select<{ track_id: string }[]>(`SELECT DISTINCT track_id FROM recommendation_history WHERE recommended_at > $1`, [since])
        .catch(() => [] as { track_id: string }[])
    ).map((r) => r.track_id)
  );

  const radios: Track[][] = await Promise.all(
    seeds.map((sd) =>
      Extractor.radio(sd.sourceId, PER_RADIO).catch((e) => {
        console.warn(`[liste radyosu] ${sd.artist} radyosu açılamadı:`, e);
        return [] as Track[];
      })
    )
  );
  // Tarzlı listede havuzun kendisi de bir kaynak: radyo sapsa bile tarz garanti.
  const streams = pool.length ? [...radios, shuffleArray(pool)] : radios;
  const seedOf = (i: number) => seeds[i]?.artist ?? listName;
  console.log(
    `[liste radyosu] "${listName}"${hasStyle(profile) ? ` tarz: ${[...profile.filters, ...profile.styles].join(", ")}` : ""} — ` +
      `${seeds.map((sd) => sd.artist).join(", ")} tohumları, ${streams.reduce((n, r) => n + r.length, 0)} aday`
  );

  const takenCores = new Set<string>();
  const perArtist = new Map<string, number>();
  const out: Recommendation[] = [];
  const cursors = streams.map(() => 0);
  let progressed = true;
  // Kaynaklar arasında sırayla — bir radyo kuyruğu doldurmasın (tarz karışımı).
  while (out.length < limit && progressed) {
    progressed = false;
    for (let i = 0; i < streams.length && out.length < limit; i++) {
      const list = streams[i];
      while (cursors[i] < list.length) {
        const r = list[cursors[i]++];
        const core = songCore(r.title, r.artist);
        const a = r.artist.toLowerCase();
        if (
          inList.has(r.id) ||
          excludeIds.has(r.id) ||
          recent.has(r.id) ||
          listCores.has(core) ||
          excludeCores.has(core) ||
          takenCores.has(core) ||
          isBlocked(r.artist) ||
          disliked(r.artist) ||
          (perArtist.get(a) ?? 0) >= PER_ARTIST ||
          !isLikelySong(r)
        ) {
          continue;
        }
        takenCores.add(core);
        perArtist.set(a, (perArtist.get(a) ?? 0) + 1);
        out.push({
          ...r,
          recSource: "youtube",
          seedArtist: seedOf(i),
          reason: listArtists.has(a)
            ? { key: "rec.fromPlaylist", seed: listName }
            : { key: "rec.newDiscovery", seed: listName, artist: r.artist },
        });
        progressed = true;
        break;
      }
    }
  }
  return out;
}

/** Listenin tarz havuzu: filtre sorguları + serbest tarzlar (en fazla 3 sorgu). */
async function stylePool(profile: PlaylistProfile): Promise<Track[]> {
  const queries = [...profile.styles.map((st) => st.trim()).filter(Boolean), ...queriesFor(profile.filters)].slice(0, 3);
  const waves = await Promise.all(
    queries.map((q) =>
      invoke<Track[]>("music_genre_pool", { query: q, limit: 60 }).catch((e) => {
        console.warn("[liste radyosu] tarz havuzu alınamadı:", q, e);
        return [] as Track[];
      })
    )
  );
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const w of waves) {
    for (const t of w) {
      if (!t.sourceId || seen.has(t.id)) continue;
      seen.add(t.id);
      out.push(t);
    }
  }
  return out;
}
