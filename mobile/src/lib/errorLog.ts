/**
 * Son hata/uyarı kayıtları (halka tampon) — hata raporuna eklenir.
 *
 * Neden: sürüm APK'sında logcat'e erişim yok; kullanıcı "çalmıyor" dediğinde
 * elde yalnız ekrandaki bildirim kalıyordu. `console.error/warn` ve yakalanmamış
 * JS hataları burada son 80 kayıtla tutulur, rapor düğmesi bunları taşır.
 */
export interface LogEntry {
  at: number;
  level: "error" | "warn" | "info";
  text: string;
}

const MAX = 80;
const entries: LogEntry[] = [];
let installed = false;

/** Geliştirme gürültüsü — raporu doldurmasın. */
const NOISE = [/Require cycle/i, /Require cycles are allowed/i];

function describe(a: unknown): string {
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  if (typeof a === "string") return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

function push(level: LogEntry["level"], args: unknown[]): void {
  const text = args.map(describe).join(" ").slice(0, 700);
  if (!text || NOISE.some((re) => re.test(text))) return;
  entries.push({ at: Date.now(), level, text });
  if (entries.length > MAX) entries.splice(0, entries.length - MAX);
}

export function installErrorCapture(): void {
  if (installed) return;
  installed = true;
  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  const origLog = console.log.bind(console);
  // Etiketli bilgi satırları da ("[devam] …", "[audio] …") — hata olmayan ama
  // "ne oldu?" sorusunu cevaplayan olaylar (geri yükleme, geçiş) rapora girsin.
  console.log = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("[")) push("info", args);
    origLog(...args);
  };
  console.error = (...args: unknown[]) => {
    push("error", args);
    origError(...args);
  };
  console.warn = (...args: unknown[]) => {
    push("warn", args);
    origWarn(...args);
  };
  const eu = (globalThis as { ErrorUtils?: { getGlobalHandler: () => (e: unknown, fatal?: boolean) => void; setGlobalHandler: (h: (e: unknown, fatal?: boolean) => void) => void } }).ErrorUtils;
  if (eu) {
    const prev = eu.getGlobalHandler();
    eu.setGlobalHandler((e, fatal) => {
      push("error", [fatal ? "YAKALANMAYAN (ölümcül)" : "YAKALANMAYAN", e]);
      prev(e, fatal);
    });
  }
}

export function recentLogs(): LogEntry[] {
  return [...entries];
}
