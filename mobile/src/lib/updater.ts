import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";
import { getContentUriAsync } from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { Linking } from "react-native";

import { loadSettings, setSetting } from "./settings";

/**
 * ⭐ UYGULAMA İÇİ GÜNCELLEME (masaüstündeki güncelleme denetiminin mobil karşılığı).
 * Kullanıcı isteği (2026-09-16): "PC'deki gibi açınca 'yeni sürüm var, indirilsin mi?'
 * sorsun". Mağaza yok → kaynak GitHub Releases: sürüm etiketi + APK eki.
 *
 * ⚠️ APK kurulumu için `REQUEST_INSTALL_PACKAGES` izni ve içerik adresi (FileProvider)
 * gerekir; olmazsa yayın sayfası tarayıcıda açılır (kullanıcı oradan kurar).
 * ⚠️ İmza AYNI anahtarla atılmalı — anahtar değişirse Android "üzerine kurma"yı
 * reddeder (önce kaldırmak gerekir). Bkz. `plugins/withReleaseSigning.js`.
 * ℹ️ iOS kapsam dışı: App Store dışından kurulum yok (kullanıcı da böyle dedi).
 */
const REPO = "Wyclaew/resonance-mobil";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const SKIP_KEY = "mobile.updateSkip";
const CHECK_TIMEOUT_MS = 8000;

export interface UpdateInfo {
  version: string;
  notes: string;
  /** APK'nın doğrudan indirme adresi. */
  url: string;
  bytes: number;
  /** Yayın sayfası — indirme/kurulum yapılamazsa buraya düşülür. */
  page: string;
}

export function currentVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

/** "1.0.10" > "1.0.9" — noktalı sayılar, sayısal karşılaştırma. */
export function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function fetchLatest(): Promise<UpdateInfo | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(LATEST, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctl.signal,
    });
    if (!res.ok) return null; // 404 = henüz yayın yok, 403 = istek sınırı
    const j = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      html_url?: string;
      assets?: { name?: string; browser_download_url?: string; size?: number }[];
    };
    if (j.draft || j.prerelease) return null;
    const version = (j.tag_name ?? "").replace(/^v/i, "").trim();
    const apk = (j.assets ?? []).find((a) => (a.name ?? "").toLowerCase().endsWith(".apk"));
    if (!version || !apk?.browser_download_url) return null;
    return {
      version,
      notes: (j.body ?? "").trim().slice(0, 600),
      url: apk.browser_download_url,
      bytes: apk.size ?? 0,
      page: j.html_url ?? `https://github.com/${REPO}/releases/latest`,
    };
  } catch {
    return null; // ağ yok / zaman aşımı: sessiz, açılışı bekletme
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yeni sürüm var mı? `manual` değilse kullanıcının "atla" dediği sürüm sessiz geçilir.
 */
export async function checkForUpdate(opts: { manual?: boolean } = {}): Promise<UpdateInfo | null> {
  const info = await fetchLatest();
  if (!info || !isNewer(info.version, currentVersion())) return null;
  if (!opts.manual) {
    const all: Record<string, string> = await loadSettings().catch(() => ({}));
    const skipped = all[SKIP_KEY];
    if (skipped === info.version) return null;
  }
  return info;
}

/** "Bu sürümü atla" — bir daha kendiliğinden sorulmaz (elle denetim yine gösterir). */
export async function skipVersion(version: string): Promise<void> {
  await setSetting(SKIP_KEY, version).catch(() => {});
}

function apkFile(version: string): File {
  const dir = new Directory(Paths.cache, "updates");
  if (!dir.exists) dir.create({ intermediates: true });
  return new File(dir, `Resonance-${version}.apk`);
}

/** APK'yı önbelleğe indirir (varsa yeniden indirmez). */
export async function downloadUpdate(
  info: UpdateInfo,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal
): Promise<File> {
  const target = apkFile(info.version);
  if (target.exists && info.bytes > 0 && (target.size ?? 0) === info.bytes) return target;
  if (target.exists) target.delete();
  const file = await File.downloadFileAsync(info.url, target, {
    idempotent: true,
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      const total = totalBytes > 0 ? totalBytes : info.bytes;
      if (total > 0) onProgress?.(Math.min(1, bytesWritten / total));
    },
  });
  return file;
}

/**
 * Kurulumu başlat: paket yükleyiciyi açar. İzin yoksa Android ayar ekranına
 * yönlendirir; o da olmazsa yayın sayfası tarayıcıda açılır.
 */
export async function installUpdate(file: File, info: UpdateInfo): Promise<void> {
  try {
    const uri = await getContentUriAsync(file.uri);
    await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
      data: uri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: "application/vnd.android.package-archive",
    });
  } catch (e) {
    console.warn("[güncelleme] kurulum açılamadı:", e);
    await Linking.openURL(info.page);
  }
}
