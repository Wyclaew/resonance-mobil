import Constants from "expo-constants";
import * as Network from "expo-network";
import { Linking, Platform, Share } from "react-native";

import type { DiagStep } from "./diagnose";
import { recentLogs } from "./errorLog";
import { getMobileSettings } from "./mobileSettings";
import { getSyncState } from "./sync/engine";
import { isSyncConfigured } from "./sync/config";
import { t } from "./i18n.mobile";
import { usePlayerStore } from "../store/usePlayerStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";

/**
 * Hata raporu — kullanıcının isteği: "hata alınınca detaylı şekilde maile
 * yapıştıran bir düğme".
 *
 * ⚠️ TAM OTOMATİK GÖNDERİM YOK: arka planda e-posta atmak bir posta servisi ve
 * gizli anahtar gerektirir (uygulamaya gömülen anahtar APK'dan okunur). Bunun
 * yerine rapor, alıcı/konu/gövde dolu hâlde posta uygulamasında açılır — tek
 * dokunuş "Gönder". Posta uygulaması yoksa paylaşım sayfasına düşülür.
 *
 * Rapor gizli bilgi TAŞIMAZ: oturum anahtarı, e-posta adresi, liste içerikleri yok.
 */

/** Raporların gideceği adres — uygulamanın sahibi (kullanıcının kendi isteği). */
export const REPORT_EMAIL = "erensemihyildiz4343@gmail.com";

/** mailto gövdesi uzun olunca bazı posta uygulamaları kesiyor. */
const MAX_BODY = 7000;

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** "Kapatıp açınca hatırlamıyor" gibi raporlar için: cihazda ne kayıtlı? */
function resumeSummary(raw: string): string {
  if (!raw) return "yok";
  try {
    const r = JSON.parse(raw) as { mode?: string; queue?: unknown[]; queueIndex?: number; savedAt?: number };
    return `${r.mode ?? "tek parça"} · ${(r.queueIndex ?? 0) + 1}/${r.queue?.length ?? 1} · ${
      r.savedAt ? new Date(r.savedAt).toISOString() : "zamanı yok"
    } · ${Math.round(raw.length / 1024)} KB`;
  } catch {
    return `okunamadı (${raw.length} karakter)`;
  }
}

export async function buildReport(opts: { error?: string; steps?: DiagStep[] } = {}): Promise<string> {
  const c = (Platform.constants ?? {}) as { Brand?: string; Model?: string; Release?: string; Manufacturer?: string };
  const net = await withTimeout(
    Network.getNetworkStateAsync().then((n) => `${n.type}${n.isConnected ? "" : " (bağlı değil)"}`),
    2500,
    "bilinmiyor"
  ).catch(() => "bilinmiyor");
  const s = useSettingsStore.getState();
  const m = getMobileSettings();
  const p = usePlayerStore.getState();
  const sync = getSyncState();
  const lines: string[] = [
    `Resonance Mobil ${Constants.expoConfig?.version ?? "?"}`,
    `Android ${c.Release ?? "?"} (API ${Platform.Version}) · ${c.Manufacturer ?? c.Brand ?? ""} ${c.Model ?? ""}`.trim(),
    `Zaman: ${new Date().toISOString()}`,
    `Ağ: ${net}`,
    "",
  ];
  if (opts.error) lines.push("── Hata ──", opts.error, "");
  if (opts.steps?.length) {
    lines.push("── Bağlantı testi ──");
    for (const st of opts.steps) lines.push(`${st.ok ? "✓" : "✗"} ${st.label.padEnd(8)} ${String(st.ms).padStart(5)} ms  ${st.detail}`);
    lines.push("");
  }
  lines.push(
    "── Çalma ──",
    p.current ? `Çalan: ${p.current.artist} — ${p.current.title} (${p.current.id})` : "Çalan: yok",
    `Sıra: ${p.index + 1}/${p.queue.length} · radyo: ${p.radioActive ? (p.radioPlaylistId ?? "?") : "kapalı"} · karışık: ${p.shuffleMode} · tekrar: ${p.repeat}`,
    `Durum: ${p.loading ? "yükleniyor" : "hazır"}${p.error ? ` · hata: ${p.error}` : ""}`,
    `Kayıtlı devam: ${resumeSummary(s.resumeState)}`,
    `Kenardaki keşif: ${
      p.savedDiscovery
        ? `${p.savedDiscovery.index + 1}/${p.savedDiscovery.queue.length} · ${new Date(p.savedDiscovery.savedAt).toISOString()}`
        : "yok"
    }`,
    "",
    "── Ayarlar ──",
    `dil ${s.language} · tema ${s.theme} · kalite ${s.audioQuality} · eşitleme ${s.normalizeVolume ? "açık" : "kapalı"} · önden indirme ${s.prefetchEnabled ? "açık" : "kapalı"}`,
    `yalnız Wi-Fi ${m.wifiOnly ? "açık" : "kapalı"} · veri tasarrufu ${m.dataSaver ? "açık" : "kapalı"} · öneri ${s.recEnabled ? "açık" : "kapalı"}`,
    "",
    "── Senkron ──",
    isSyncConfigured()
      ? `${sync.status}${sync.lastSyncAt ? ` · son ${new Date(sync.lastSyncAt).toISOString()}` : ""}${sync.lastError ? ` · hata: ${sync.lastError}` : ""}`
      : "yapılandırılmamış",
    ""
  );
  const problems = useToastStore.getState().problems;
  if (problems.length) {
    lines.push("── Son sorunlar ──");
    for (const pr of problems.slice(0, 12)) lines.push(`${new Date(pr.at).toISOString()} ×${pr.count} ${pr.message}`);
    lines.push("");
  }
  const logs = recentLogs().slice(-40);
  if (logs.length) {
    lines.push("── Son kayıtlar ──");
    for (const l of logs) {
      lines.push(`${new Date(l.at).toISOString().slice(11, 19)} ${l.level === "error" ? "E" : l.level === "warn" ? "W" : "I"} ${l.text}`);
    }
  }
  return lines.join("\n");
}

/** Raporu posta uygulamasında açar (olmazsa paylaşım sayfası). */
export async function sendReport(opts: { error?: string; steps?: DiagStep[] } = {}): Promise<void> {
  const body = await buildReport(opts);
  const subject = `${t("m.report.subject")} · ${Constants.expoConfig?.version ?? ""}`;
  const clipped = body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n… (kısaltıldı)` : body;
  const url = `mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(clipped)}`;
  try {
    await Linking.openURL(url);
  } catch {
    useToastStore.getState().show(t("m.report.noMail"), "info");
    await Share.share({ title: subject, message: body });
  }
}
