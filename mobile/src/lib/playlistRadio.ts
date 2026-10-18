import * as Extractor from "../../modules/resonance-extractor";
import { isBlocked, loadBlockedArtists } from "./blocked";
import { getDb } from "./db";
import { getMobileSettings } from "./mobileSettings";
import { getRecommendations, isLikelySong, recordRecommended, songCore, type Recommendation, type RecommendOpts } from "./recommender";

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
  if (isRealPlaylist(opts.playlistId) && getMobileSettings().playlistRadio) {
    try {
      const recs = await playlistRecommendations(opts.playlistId, opts.excludeIds, opts.excludeCores ?? new Set(), opts.limit);
      if (recs.length) {
        await recordRecommended(recs.map((r) => r.id));
        return recs;
      }
      console.log("[liste radyosu] öneri çıkmadı — genel önerilere düşülüyor");
    } catch (e) {
      console.warn("[liste radyosu] başarısız, genel önerilere düşülüyor:", e);
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
  const nameRow = await db.select<{ name: string }[]>(`SELECT name FROM playlists WHERE id = $1`, [playlistId]);
  const listName = nameRow[0]?.name ?? "";
  const rows = await db.select<PlTrack[]>(
    `SELECT t.id, t.source_id, t.title, t.artist,
            1 + MAX(0, COALESCE((SELECT SUM(v.value) FROM votes v WHERE v.track_id = t.id), 0)) AS weight
       FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
      WHERE pt.playlist_id = $1 AND pt.deleted = 0 AND t.source = 'youtube' AND t.title != ''`,
    [playlistId]
  );
  if (!rows.length) return [];

  const inList = new Set(rows.map((r) => r.id));
  const listCores = new Set(rows.map((r) => songCore(r.title, r.artist)));
  const listArtists = new Set(rows.map((r) => r.artist.toLowerCase()));

  // Tohumlar: farklı sanatçılardan, oyla ağırlıklı rastgele (Gumbel); bu oturumda
  // kullanılmamış olanlar önce — besleme her seferinde listenin başka köşesinden gelsin.
  let used = usedSeeds.get(playlistId);
  if (!used || used.size >= rows.length) {
    used = new Set();
    usedSeeds.set(playlistId, used);
  }
  const pool = rows
    .filter((r) => !used!.has(r.source_id))
    .map((r) => ({ r, key: -Math.log(Math.random() || 1e-9) / Math.max(0.1, r.weight) }))
    .sort((a, b) => a.key - b.key);
  const seeds: PlTrack[] = [];
  const seedArtists = new Set<string>();
  for (const { r } of pool) {
    if (seeds.length >= SEEDS) break;
    const a = r.artist.toLowerCase();
    if (seedArtists.has(a)) continue;
    seedArtists.add(a);
    seeds.push(r);
    used.add(r.source_id);
  }
  if (!seeds.length) return [];

  await loadBlockedArtists().catch(() => new Set<string>());
  const since = Date.now() - REPEAT_BLOCK_DAYS * 24 * 3600 * 1000;
  const recent = new Set(
    (
      await db
        .select<{ track_id: string }[]>(`SELECT DISTINCT track_id FROM recommendation_history WHERE recommended_at > $1`, [since])
        .catch(() => [] as { track_id: string }[])
    ).map((r) => r.track_id)
  );

  const radios = await Promise.all(
    seeds.map((s) =>
      Extractor.radio(s.source_id, PER_RADIO).catch((e) => {
        console.warn(`[liste radyosu] ${s.title} radyosu açılamadı:`, e);
        return [];
      })
    )
  );
  console.log(
    `[liste radyosu] "${listName}": ${seeds.map((s) => s.artist).join(", ")} tohumlarından ${radios.reduce((n, r) => n + r.length, 0)} aday`
  );

  const takenCores = new Set<string>();
  const perArtist = new Map<string, number>();
  const out: Recommendation[] = [];
  const cursors = radios.map(() => 0);
  let progressed = true;
  // Tohumlar arasında sırayla — bir radyo kuyruğu doldurmasın (tarz karışımı).
  while (out.length < limit && progressed) {
    progressed = false;
    for (let i = 0; i < radios.length && out.length < limit; i++) {
      const list = radios[i];
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
          seedArtist: seeds[i].artist,
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
