import { displayKarma } from "./karma";
import type { Lang } from "./i18n";

/**
 * Sayı gösterimi — arayüzde HAM SAYI YAZILMAZ, hepsi buradan geçer.
 *
 * ⚠️ BUG'DI: karma zamanla eriyen (decay) ondalıklı bir skor. Şu An ekranı onu
 * olduğu gibi yazıyordu → oy verince "+1" yerine "1.4123123". Masaüstü
 * `displayKarma` (tam sayıya yuvarlama) kullanıyor; mobil de artık aynısını.
 */

const MINUS = "−";

/** Karma: yuvarlanmış, işaretli ("+3", "0", "−2"). */
export function karmaLabel(karma: number): string {
  const k = displayKarma(karma);
  if (k > 0) return `+${k}`;
  if (k < 0) return `${MINUS}${Math.abs(k)}`;
  return "0";
}

/** Oran (0..1) → yüzde. Türkçede işaret sayıdan önce gelir ("%42"). */
export function pct(ratio: number, lang: Lang): string {
  const n = Number.isFinite(ratio) ? Math.round(ratio * 100) : 0;
  return lang === "tr" ? `%${n}` : `${n}%`;
}

/** Tam sayı, binlik ayraçla (1.234 / 1,234). */
export function count(n: number, lang: Lang): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  const sep = lang === "tr" ? "." : ",";
  return String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, sep).replace(/^/, v < 0 ? MINUS : "");
}

/** Saat sayısı: 10'un altında bir ondalık ("2,5"), üstünde tam. */
export function hours(ms: number, lang: Lang): string {
  const h = Math.max(0, ms) / 3_600_000;
  if (h >= 10) return count(h, lang);
  const s = (Math.round(h * 10) / 10).toFixed(1);
  return lang === "tr" ? s.replace(".", ",") : s;
}

/** 3:07 — saniyeden. */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Uzun süre: "3 sa 12 dk" / "3 h 12 min". */
export function duration(ms: number, lang: Lang): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const [hu, mu] = lang === "tr" ? ["sa", "dk"] : ["h", "min"];
  if (h === 0) return `${m} ${mu}`;
  return m ? `${h} ${hu} ${m} ${mu}` : `${h} ${hu}`;
}

/** Bayt → "12,4 MB" / "1,21 GB". */
export function bytes(n: number, lang: Lang): string {
  const mb = Math.max(0, n) / (1024 * 1024);
  const fix = (v: number, d: number) => {
    const s = v.toFixed(d);
    return lang === "tr" ? s.replace(".", ",") : s;
  };
  if (mb < 1) return `${Math.round(Math.max(0, n) / 1024)} KB`;
  if (mb < 1024) return `${fix(mb, mb < 10 ? 1 : 0)} MB`;
  return `${fix(mb / 1024, 2)} GB`;
}

/** "5 dk önce" / "5 min ago". */
export function ago(ts: number, lang: Lang, now = Date.now()): string {
  const mins = Math.max(0, Math.round((now - ts) / 60_000));
  const tr = lang === "tr";
  if (mins < 1) return tr ? "az önce" : "just now";
  if (mins < 60) return tr ? `${mins} dk önce` : `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return tr ? `${h} sa önce` : `${h} h ago`;
  const d = Math.round(h / 24);
  return tr ? `${d} gün önce` : `${d} d ago`;
}

const MONTHS: Record<Lang, string[]> = {
  tr: ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** "13 Eyl 2026" — Intl'e güvenmeden (Hermes'te yerel ayar verisi eksik olabilir). */
export function date(ts: number, lang: Lang, withYear = true): string {
  const d = new Date(ts);
  const base = lang === "tr" ? `${d.getDate()} ${MONTHS.tr[d.getMonth()]}` : `${MONTHS.en[d.getMonth()]} ${d.getDate()}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

/** "14:05". */
export function clock(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
