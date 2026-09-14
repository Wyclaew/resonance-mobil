import * as Extractor from "../../modules/resonance-extractor";
import { resolveCached } from "../audio/urlCache";
import { getDb } from "./db";
import { errorText, isNetworkError } from "./netError";
import { relinkTrack } from "./playlists";
import { searchQueryFor, versionScore } from "./versionMatch";
import type { Track } from "../types";

/**
 * ⭐ ALTERNATİF KAYNAK — masaüstündeki `find_alternative` karşılığı (v1.8.4).
 *
 * YouTube video siliyor/engelliyor ("UNPLAYABLE: This video is not available",
 * "LOGIN_REQUIRED: Please sign in"). O zaman parça ölmez: AYNI şarkının başka
 * bir yüklemesi aranır ve `tracks.source_id` güncellenir.
 *
 * ⚠️ `tracks.id` DEĞİŞMEZ. Değişseydi playlist üyelikleri, oylar ve dinleme
 * geçmişi parçadan kopardı ve senkronda iki ayrı parça oluşurdu.
 *
 * ⛔ BUG'DI (kullanıcı raporu 2026-09-14, "Midnight City"): aday yalnız süreye
 * bakılarak seçilip DOĞRULANMADAN bağlanıyordu → parça aynı sanatçının "Outro"
 * şarkısına bağlandı, üstelik o da oturum istiyordu. Ölçüm (spike/newpipe):
 * M83'ün YT Music kayıtlarının HEPSİ LOGIN_REQUIRED (Android/iOS/VisionOS/gömülü
 * istemcilerin hepsi reddediyor, oturumsuz aşılamaz), resmi video ve söz videoları
 * çalınıyor. Artık:
 *  1. YT Music şarkıları + normal videolar BİRLİKTE aranır;
 *  2. `versionMatch.ts` farklı şarkıyı/remix'i/canlıyı/cover'ı eler, kalanı sıralar;
 *  3. aday bağlanmadan ÖNCE çözülür — çalınamayana bağlanılmaz, sıradaki denenir.
 */
const MAX_VERIFY = 5;
/** Bulunamadıysa aynı parça için bu süre yeniden arama yapılmaz (her çalışta 2 arama olmasın). */
const MISS_TTL_MS = 10 * 60_000;

export type UnavailableKind = "bot" | "age" | "login" | "private" | "region" | "removed" | "unplayable";

/** Sıra önemli: "Sign in to confirm you're not a bot" da "sign in" içerir. */
const KINDS: [UnavailableKind, RegExp][] = [
  ["bot", /not a bot|bot olmad/i],
  ["age", /agerestricted|age.?restrict|confirm your age|inappropriate for some users|yaşınızı/i],
  ["login", /login_required|sign in|oturum aç/i],
  ["private", /privatecontent|private video|\bprivate\b|gizli video/i],
  ["region", /geographicrestriction|geo.?restrict|in your country|bölgenizde|ülkenizde/i],
  ["removed", /removed|terminated|copyright|kaldırıldı/i],
  ["unplayable", /unplayable|not available|contentnotavailable|paidcontent|musicpremium|members.?only|kullanılamıyor/i],
];

/** Çıkarım hatası "bu kayıt çalınamaz" türünden mi? `bot` = IP'ye geçici kısıt, kaydın suçu değil. */
export function unavailableKind(error: unknown): UnavailableKind | null {
  const text = errorText(error);
  for (const [kind, re] of KINDS) if (re.test(text)) return kind;
  return null;
}

/** Video yok/kısıtlı mı (geçici ağ ya da bot doğrulaması DEĞİL)? */
export function isUnavailable(error: unknown): boolean {
  const kind = unavailableKind(error);
  return kind !== null && kind !== "bot";
}

/** Uzun Java yığınından okunur neden: `LOGIN_REQUIRED: "Please sign in"`. */
export function shortReason(error: unknown): string {
  const lines = errorText(error).split("\n").map((l) => l.trim()).filter(Boolean);
  let last = (lines[lines.length - 1] ?? "").replace(/^→?\s*Caused by:\s*/i, "");
  const at = last.lastIndexOf("Exception: ");
  if (at >= 0) last = last.slice(at + "Exception: ".length);
  return last.replace(/^Got error\s*/i, "").slice(0, 140);
}

const relinkListeners = new Set<(trackId: string, sourceId: string) => void>();
export function onRelinked(fn: (trackId: string, sourceId: string) => void): () => void {
  relinkListeners.add(fn);
  return () => relinkListeners.delete(fn);
}

/** Parçayı başka yüklemeye KALICI bağla (senkronla diğer cihazlara da gider). */
export async function applyRelink(track: Track, sourceId: string): Promise<void> {
  if (track.source === "local" || !sourceId || sourceId === track.sourceId) return;
  await relinkTrack(track.id, sourceId);
  announceRelink(track.id, sourceId);
}

/**
 * Kuyruktaki kopyalar da yeni kaynağı taşısın — yoksa aynı parça her çalışta
 * ölü videoyu yeniden deneyip yeniden arama yapıyordu. DB'ye yazmaz (bağlama
 * zaten yapılmışsa, ör. senkronla gelmişse yalnız bellekteki kopyalar tazelenir).
 */
export function announceRelink(trackId: string, sourceId: string): void {
  for (const fn of relinkListeners) fn(trackId, sourceId);
}

export async function findAlternative(track: Track): Promise<string | null> {
  // ⛔ Yerel parçayı YouTube kimliğine bağlama: masaüstündeki dosyayı bozar.
  if (track.source === "local") return null;
  deadIds.add(track.sourceId);
  const best = await verifiedEquivalent(track);
  if (!best) return null;
  await applyRelink(track, best.sourceId);
  return best.sourceId;
}

/** Bulunan eşdeğerler oturum boyunca akılda — her çalışta yeniden arama yapılmasın. */
const standIns = new Map<string, string | null>();

/**
 * Geçici eşdeğer: bulunur ama `tracks` tablosuna YAZILMAZ. Başka cihazdaki
 * yerel dosyayı telefonda çalmak için.
 */
export async function findStandIn(track: Track): Promise<string | null> {
  if (standIns.has(track.id)) return standIns.get(track.id) ?? null;
  const found = await verifiedEquivalent(track);
  standIns.set(track.id, found?.sourceId ?? null);
  return found?.sourceId ?? null;
}

export interface VersionOption {
  track: Track;
  /** `null` = aynı şarkı olduğu doğrulanamadı (elle seçilebilir, otomatik seçilmez). */
  score: number | null;
  fromMusic: boolean;
}

/**
 * Aynı şarkının yüklemeleri: YT Music şarkıları + videolar. Eşleşenler puana
 * göre önde, gerisi arama sırasında (sürüm seçici hepsini gösterir).
 */
export async function searchVersions(track: Track, query = searchQueryFor(track)): Promise<VersionOption[]> {
  if (!query.trim()) return [];
  const safe = (p: Promise<Track[]>) =>
    p.catch((e: unknown) => {
      if (isNetworkError(e)) throw e;
      console.warn("[alternatif] arama başarısız:", shortReason(e));
      return [] as Track[];
    });
  const [music, videos] = await Promise.all([
    safe(Extractor.search(query, 12, true)),
    safe(Extractor.search(query, 12, false)),
  ]);
  const byId = new Map<string, VersionOption>();
  for (const [list, fromMusic] of [
    [music, true],
    [videos, false],
  ] as const) {
    for (const r of list) {
      if (!r.sourceId || byId.has(r.sourceId)) continue;
      byId.set(r.sourceId, { track: r, fromMusic, score: versionScore(track, r, fromMusic) });
    }
  }
  const all = [...byId.values()];
  const matched = all.filter((v) => v.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return [...matched, ...all.filter((v) => v.score === null)];
}

const AUDIT_KEY = "resonance.relinkAudit";

/** Videonun başlığı + kanalı (oEmbed: oturum isteyen kayıtlarda da çalışıyor — ölçüldü). */
async function videoMeta(videoId: string): Promise<{ title: string; author: string } | null> {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
  const res = await fetch(url); // ağ hatası yukarı çıkar: denetim sonra yeniden koşar
  if (!res.ok) return null;
  const j = (await res.json()) as { title?: string; author_name?: string };
  return j.title ? { title: j.title, author: j.author_name ?? "" } : null;
}

/**
 * ⛔ Eski eşleştirme (yalnız süre) parçaları YANLIŞ şarkıya bağlamış olabilir —
 * rapor: telefonda "Midnight City", M83'ün "Outro"suna bağlandı ve senkronla
 * masaüstüne de geçti. Yeniden bağlanmış parçalar (`id` ≠ `youtube:source_id`)
 * azdır: bağlı videonun başlığı alınır, şarkı tutmuyorsa doğrulanmış sürüm aranır.
 * Her bağlantı bir kez denetlenir (Wi-Fi'da, açılıştan sonra).
 */
export async function auditRelinks(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<Track[]>(
    `SELECT id, source, source_id AS sourceId, title, artist, duration_ms AS durationMs, thumbnail
       FROM tracks WHERE source = 'youtube' AND title != '' AND id != 'youtube:' || source_id`
  );
  const store = (globalThis as { localStorage?: Storage }).localStorage;
  let done: Set<string>;
  try {
    done = new Set(JSON.parse(store?.getItem(AUDIT_KEY) ?? "[]") as string[]);
  } catch {
    done = new Set();
  }
  let fixed = 0;
  try {
    for (const track of rows) {
      const key = `${track.id}>${track.sourceId}`;
      if (done.has(key)) continue;
      const meta = await videoMeta(track.sourceId);
      const linked: Track = { ...track, title: meta?.title ?? "", artist: meta?.author ?? "", durationMs: 0 };
      if (meta && versionScore({ ...track, durationMs: 0 }, linked) === null) {
        console.log(`[alternatif] yanlış bağlantı: "${track.title}" → "${meta.title}" (${track.sourceId}) — yeniden aranıyor`);
        const alternative = await findAlternative(track);
        if (alternative) {
          fixed++;
          done.add(`${track.id}>${alternative}`); // doğrulanarak bulundu, yeniden denetleme
        }
      }
      done.add(key);
    }
  } catch (e) {
    console.warn("[alternatif] bağlantı denetimi yarım kaldı:", errorText(e));
  } finally {
    store?.setItem(AUDIT_KEY, JSON.stringify([...done]));
  }
  return fixed;
}

/** Bu oturumda çalınamadığı ölçülen videolar — aynı aday yeniden denenmesin. */
const deadIds = new Set<string>();
/** Aynı parça için eşzamanlı çağrılar (çalma + indirme) TEK aramayı paylaşır. */
const inflight = new Map<string, Promise<Track | null>>();
const lastMiss = new Map<string, number>();

async function verifiedEquivalent(track: Track): Promise<Track | null> {
  const missAt = lastMiss.get(track.id);
  if (missAt && Date.now() - missAt < MISS_TTL_MS) return null;
  let pending = inflight.get(track.id);
  if (!pending) {
    pending = searchAndVerify(track).finally(() => inflight.delete(track.id));
    inflight.set(track.id, pending);
  }
  const found = await pending;
  if (!found) lastMiss.set(track.id, Date.now());
  return found;
}

async function searchAndVerify(track: Track): Promise<Track | null> {
  const ranked = (await searchVersions(track)).filter(
    (v) => v.score !== null && v.track.sourceId !== track.sourceId && !deadIds.has(v.track.sourceId)
  );
  for (const v of ranked.slice(0, MAX_VERIFY)) {
    try {
      const info = await resolveCached(v.track.sourceId);
      if (!info.streams?.length) throw new Error("ses akışı yok");
      console.log(
        `[alternatif] ${track.title} → ${v.track.sourceId} "${v.track.title}" · ${v.track.artist} (puan ${(v.score ?? 0).toFixed(1)})`
      );
      return v.track;
    } catch (e) {
      // Ağ gitti ya da YouTube bot doğrulaması istedi: adayın suçu değil, sonra yeniden denenir.
      if (isNetworkError(e) || unavailableKind(e) === "bot") throw e;
      deadIds.add(v.track.sourceId);
      console.log(`[alternatif] aday çalınamıyor: "${v.track.title}" (${v.track.sourceId}) — ${shortReason(e)}`);
    }
  }
  console.log(`[alternatif] ${track.title}: çalınabilir eşdeğer yok (${ranked.length} eşleşen aday)`);
  return null;
}
