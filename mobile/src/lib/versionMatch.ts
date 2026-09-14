import { isLikelySong, songCore } from "./recommender";
import type { Track } from "../types";

/**
 * "Bu arama sonucu AYNI şarkının başka bir yüklemesi mi?" — alternatif kaynak
 * (`relink.ts`) ve elle sürüm seçici ortak kullanır. Saf fonksiyonlar: ağ yok.
 *
 * ⛔ BUG'DI (kullanıcı raporu 2026-09-14, "Midnight City"): eşleşme YALNIZ süreye
 * bakıyordu (masaüstündeki `find_alternative` da öyle). M83'ün YT Music kaydı
 * oturum istiyordu (LOGIN_REQUIRED); arama sonuçlarında süresi 4 sn farklı
 * "Outro" — aynı sanatçının BAŞKA şarkısı — öndeydi → parça "Outro"ya bağlandı.
 * Ölçüm (spike/newpipe AltProbe): aynı aramada başka sanatçının "Radio Edit"i,
 * "slowed + reverb" ve canlı kayıtlar da %20 süre sınırının içindeydi.
 *
 * Kural: başlık çekirdeği aynı + sanatçı tutuyor + orijinalde olmayan bir sürüm
 * işareti (remix, slowed, live, cover…) yok. Kalanlar puanla sıralanır.
 */

/** Orijinal başlıkta yoksa adayı ELER — farklı kayıt, farklı ses. */
const REJECT_MARKERS = [
  "sped up", "speed up", "spedup", "slowed", "reverb", "nightcore", "8d", "remix", "rmx",
  "cover", "karaoke", "instrumental", "enstrumantal", "acoustic", "akustik", "live", "canli",
  "concert", "konser", "mashup", "bass boosted", "lofi", "lo fi", "piano", "type beat", "loop",
  "reaction", "tepki", "tutorial", "unplugged", "acapella", "a cappella", "reversed", "chopped",
  "remake", "orchestral", "symphonic", "tiktok", "shorts", "parody", "phonk", "hardstyle", "demo",
];
/** Aynı ses olabilir ama emin değiliz → puan düşer, elenmez. */
const SOFT_MARKERS = ["edit", "extended", "version", "mix", "clean", "mono", "radio"];

/** Süre sapması: masaüstüyle aynı %20; kısa şarkıda en az 12 sn. */
const DURATION_TOLERANCE = 0.2;
const MIN_TOLERANCE_MS = 12_000;
/**
 * Bunun altı "eşleşiyor" sayılmaz. Ölçüm: "GTA 5 - Ending C with M83 - Midnight City"
 * (oyun klibi, fazladan kelime + süre sapması) ≈ -4.7; resmi video 4, söz videosu -0.7,
 * hayran klibi -2.3, "feat." kuyruklu resmi video -1.
 */
const MIN_MATCH_SCORE = -4;

const FOLD: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };

/** Küçük harf + aksan/Türkçe harf sadeleştirme ("Gül" ile "Gul" eşleşsin). */
export function fold(s: string): string {
  let out = s.replace(/İ/g, "i").toLowerCase().replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch] ?? ch);
  try {
    out = out.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    // normalize yoksa Türkçe eşlemesi yeterli
  }
  return out;
}

const flat = (s: string) => fold(s).replace(/[^a-z0-9]+/g, "");
const stripChannel = (s: string) => s.replace(/\s*-\s*topic\s*$/i, "").replace(/vevo\s*$/i, "").trim();

/** İşaret aramak için: kelimeler boşlukla, "s l o w e d" → "slowed". */
function markerText(title: string): string {
  const words = fold(title)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(?:[a-z0-9] ){2,}[a-z0-9]\b/g, (m) => m.replace(/ /g, ""));
  return ` ${words} `;
}

function countMarker(text: string, marker: string): number {
  const needle = ` ${marker} `;
  let n = 0;
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length - 1)) n++;
  return n;
}

const HOURS = /\b\d+\s*(?:hours?|saat)\b/;

/** Orijinal parçanın sanatçı anahtarları: sanatçı alanı, "Sanatçı - Şarkı" başlığı, "A & B" parçaları. */
export function artistKeys(track: Pick<Track, "title" | "artist">): string[] {
  const names = [track.artist];
  const dash = track.title.split(/\s+[-–—]\s+/);
  if (dash.length > 1) names.push(dash[0]);
  const keys = new Set<string>();
  for (const name of names) {
    const cleaned = stripChannel(name);
    for (const part of [cleaned, ...cleaned.split(/\s*(?:,|&|\+|\/|\bfeat\.?|\bft\.?|\bx\b|\bve\b|\band\b)\s*/i)]) {
      const k = flat(part);
      if (k.length >= 2) keys.add(k);
    }
  }
  return [...keys];
}

function artistWords(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const n of names) {
    for (const w of fold(stripChannel(n)).split(/[^a-z0-9]+/)) if (w.length > 1) set.add(w);
  }
  return set;
}

/** Latin olmayan başlıklar (çekirdek boş kalır) için gevşek karşılaştırma anahtarı. */
function looseKey(s: string): string {
  return fold(s)
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, "")
    .replace(/[\s\-–—_|:;,.!?'"“”‘’«»(){}\/\\・、。！？「」『』]+/g, "");
}

const words = (title: string, artist: string) => songCore(fold(title), fold(artist)).split(" ").filter(Boolean);

/**
 * Adayın puanı; `null` = aynı şarkı DEĞİL (elendi). Yüksek puan önce denenir.
 * `fromMusic`: YT Music "şarkılar" sonucu (temiz ses kaydı).
 */
export function versionScore(original: Track, cand: Track, fromMusic = false): number | null {
  if (!isLikelySong(cand)) return null;
  const a = markerText(original.title);
  const b = markerText(cand.title);
  for (const m of REJECT_MARKERS) if (countMarker(b, m) > countMarker(a, m)) return null;
  if (HOURS.test(b) && !HOURS.test(a)) return null;

  let score = 0;
  const ow = words(original.title, original.artist);
  if (ow.length) {
    const cw = words(cand.title, cand.artist);
    const cset = new Set(cw);
    const missing = ow.filter((w) => !cset.has(w)).length;
    if (missing > (ow.length >= 4 ? 1 : 0)) return null;
    // Adayın başlığındaki sanatçı adı ("M83 'Midnight City' Official video") fazlalık sayılmaz.
    const oset = new Set(ow);
    const dash = original.title.split(/\s+[-–—]\s+/);
    const ignore = artistWords([original.artist, dash.length > 1 ? dash[0] : "", cand.artist]);
    const extra = cw.filter((w) => !oset.has(w) && !ignore.has(w)).length;
    if (extra > 3) return null;
    score -= missing * 2 + extra * 1.5;
  } else {
    const ok = looseKey(original.title);
    const ck = looseKey(cand.title);
    if (!ok || !ck || !(ck.includes(ok) || ok.includes(ck))) return null;
  }

  // Sanatçı tutmalı: aynı adlı başka sanatçının şarkısı (cover, aynı isim) elenir.
  const keys = artistKeys(original);
  const up = flat(stripChannel(cand.artist));
  const candTitle = flat(cand.title);
  if (keys.length && !keys.some((k) => (up.length >= 2 && (up.includes(k) || k.includes(up))) || candTitle.includes(k))) {
    return null;
  }

  if (original.durationMs > 0 && cand.durationMs > 0) {
    const diff = Math.abs(cand.durationMs - original.durationMs);
    if (diff > Math.max(MIN_TOLERANCE_MS, original.durationMs * DURATION_TOLERANCE)) return null;
    score -= Math.min(8, diff / 6000); // 6 sn sapma = 1 puan
  } else {
    score -= 2;
  }
  for (const m of SOFT_MARKERS) if (countMarker(b, m) > countMarker(a, m)) score -= 2;
  // Sanatçının kendi kanalı / "Sanatçı - Topic" / VEVO: en güvenilir yükleme.
  const rawUp = flat(cand.artist);
  if (keys.some((k) => rawUp === k || rawUp === `${k}topic` || rawUp === `${k}vevo` || rawUp === `${k}official`)) score += 4;
  if (fromMusic) score += 1.5;
  if (countMarker(b, "audio")) score += 1;
  if (countMarker(b, "lyrics") || countMarker(b, "lyric") || countMarker(b, "sozleri")) score -= 0.5;
  return score < MIN_MATCH_SCORE ? null : score;
}

/** Arama sorgusu: "Sanatçı - Şarkı" biçimli başlık zaten sanatçıyı taşır. */
export function searchQueryFor(track: Pick<Track, "title" | "artist">): string {
  const title = track.title.replace(/\(.*?\)|\[.*?\]/g, " ").replace(/\s+/g, " ").trim();
  if (!title) return "";
  if (/\s[-–—]\s/.test(title)) return title;
  return `${stripChannel(track.artist)} ${title}`.trim();
}
