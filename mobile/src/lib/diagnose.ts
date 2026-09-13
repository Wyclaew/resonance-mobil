import Constants from "expo-constants";
import * as Network from "expo-network";
import { Platform } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";
import { getSupabase } from "./sync/client";
import { isSyncConfigured } from "./sync/config";

/**
 * "İndirme sorunu mu var?" testi — masaüstündeki yt-dlp/ffmpeg teşhisinin
 * mobil karşılığı. YouTube çıkarımı zaman zaman kırılıyor (NewPipe sürümü
 * eskir); bu test sorunun AĞ mı, ÇIKARIM mı, ADRES KISITI mı olduğunu ayırır.
 * Rapor düz metin — kopyalanıp paylaşılabilir.
 */

/** Uzun ömürlü, herkese açık bir video (Rick Astley — Never Gonna Give You Up). */
const PROBE_ID = "dQw4w9WgXcQ";

export interface DiagStep {
  label: string;
  ok: boolean;
  detail: string;
  ms: number;
}

async function step(label: string, fn: () => Promise<string>): Promise<DiagStep> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { label, ok: true, detail, ms: Date.now() - t0 };
  } catch (e) {
    return { label, ok: false, detail: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
  }
}

export async function runDiagnostics(onStep?: (s: DiagStep) => void): Promise<DiagStep[]> {
  const steps: DiagStep[] = [];
  const push = (s: DiagStep) => {
    steps.push(s);
    onStep?.(s);
  };

  push(
    await step("network", async () => {
      // ⚠️ Emülatörde bu çağrı 45 sn sürdü (kullanıcı raporu): erişilebilirlik
      // yoklaması bekliyor. Test ağ TÜRÜNÜ öğrenmek için var — 3 sn yeter.
      const n = await Promise.race([
        Network.getNetworkStateAsync(),
        new Promise<null>((r) => setTimeout(() => r(null), 3000)),
      ]);
      if (!n) return "durum 3 sn'de gelmedi (sonraki adımlar ağı zaten dener)";
      if (!n.isConnected) throw new Error("bağlantı yok");
      return `${n.type}${n.isInternetReachable === false ? " (internet erişilemiyor)" : ""}`;
    })
  );

  let streamUrl = "";
  let contentLength = 0;
  push(
    await step("resolve", async () => {
      const info = await Extractor.resolve(PROBE_ID);
      const s = Extractor.pickStream(info.streams, "high");
      if (!s) throw new Error(`akış yok (${info.streams.length} akış, hiçbiri progresif değil)`);
      streamUrl = s.url;
      contentLength = s.contentLength;
      return `${info.streams.length} akış · itag ${s.itag} · ${Math.round(s.bitrate)} kbps · ${s.format}`;
    })
  );

  if (streamUrl) {
    push(
      await step("range", async () => {
        const from = contentLength > 4096 ? contentLength - 1024 : 0;
        const res = await fetch(streamUrl, { headers: { Range: `bytes=${from}-${from + 1023}` } });
        if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status} (adres kısıtlı)`);
        return `HTTP ${res.status}`;
      })
    );
  }

  push(
    await step("search", async () => {
      const r = await Extractor.search("radiohead creep", 5, true);
      if (!r.length) throw new Error("sonuç yok");
      return `${r.length} sonuç · ${r[0].artist} — ${r[0].title}`;
    })
  );

  push(
    await step("radio", async () => {
      const r = await Extractor.radio(PROBE_ID, 10);
      if (!r.length) throw new Error("radyo boş");
      return `${r.length} parça`;
    })
  );

  push(
    await step("lyrics", async () => {
      const res = await fetch("https://lrclib.net/api/search?q=creep%20radiohead");
      if (res.status >= 500) {
        // 5xx = lrclib'in kendi sunucusu (ölçüldü: 520, Cloudflare kaynak hatası).
        // Uygulamanın hatası değil; sözler sunucu düzelince geri gelir.
        throw new Error(`HTTP ${res.status} — lrclib sunucusu şu an yanıt vermiyor (uygulama tarafı değil)`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return "lrclib erişilebilir";
    })
  );

  push(
    await step("sync", async () => {
      if (!isSyncConfigured()) return "yapılandırılmamış (yerel kip)";
      const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
      return data.session ? "oturum açık" : "oturum yok";
    })
  );

  return steps;
}

export function diagnosticsReport(steps: DiagStep[]): string {
  const head = [
    `Resonance Mobil ${Constants.expoConfig?.version ?? "?"} · Android ${Platform.Version}`,
    new Date().toISOString(),
  ];
  const lines = steps.map((s) => `${s.ok ? "✓" : "✗"} ${s.label.padEnd(8)} ${String(s.ms).padStart(5)} ms  ${s.detail}`);
  return [...head, "", ...lines].join("\n");
}
