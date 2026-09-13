import * as Network from "expo-network";

import { prewarmUrls } from "../audio/urlCache";
import { autoBackup } from "./dbBackup";
import { getDb } from "./db";
import { pruneCache } from "./downloads";
import { t } from "./i18n.mobile";
import { getSupabase, wasSignOutIntentional } from "./sync/client";
import { onRemoteApplied } from "./sync/engine";
import { useCovers } from "../store/useCovers";
import { useDownloadStore } from "../store/useDownloadStore";
import { prewarmDiscovery, usePlayerStore } from "../store/usePlayerStore";
import { usePlaylistStore } from "../store/usePlaylistStore";
import { useSettingsStore } from "../store/useSettingsStore";
import { useToastStore } from "../store/useToastStore";
import type { Track } from "../types";

/**
 * Açılıştan SONRA arka planda koşan işler (masaüstü App.tsx açılış bloğunun
 * karşılığı). Hiçbiri arayüzü bekletmez; hiçbirinin hatası uygulamayı durdurmaz.
 */
export function runStartupTasks(): void {
  // Kütüphane durumu: listeler + indirilenler (satırlardaki ✓).
  void usePlaylistStore.getState().refresh();
  void useDownloadStore.getState().refresh();
  void useCovers.getState().refresh();
  // Başka cihazdan liste geldiyse kütüphane tazelensin.
  onRemoteApplied(() => void usePlaylistStore.getState().refresh());

  // Kaldığın yerden devam: kuyruk duraklatılmış gelir, adresi şimdiden ısıtılır.
  usePlayerStore.getState().restore();
  const st = usePlayerStore.getState();
  if (st.current && st.current.source !== "local") void prewarmUrls([st.current.sourceId]);

  // ⚠️ Budama AYARLAR YÜKLENDİKTEN SONRA (masaüstü dersi): önce çağrılırsa
  // varsayılan sınır uygulanır, kullanıcının küçük sınırı hiç işlemez.
  const limit = useSettingsStore.getState().cacheLimitGb * 1024 ** 3;
  void pruneCache(limit).catch(() => {});

  // Açılışın yoğun okuma anından sonra (senkron ilk turu, ana sayfa sorguları).
  setTimeout(() => void autoBackup(), 20_000);


  // ⚠️ SENKRON OTURUMU SESSİZCE DÜŞEBİLİYOR (jeton süresi dolar). Masaüstünde
  // kullanıcı senkronun çalıştığını sanıyordu; artık haber veriyoruz.
  getSupabase()?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && !wasSignOutIntentional()) {
      useToastStore.getState().show(t("sync.sessionLost"), "error");
    }
  });

  // Ağ işleri yalnız Wi-Fi'da ve biraz gecikmeli: açılış anı zaten yoğun.
  setTimeout(() => void wifiTasks(), 6000);
}

async function wifiTasks(): Promise<void> {
  try {
    const net = await Network.getNetworkStateAsync();
    if (net.type !== Network.NetworkStateType.WIFI) return;
    // Keşfet'e basınca anında başlasın (kayıt yazılmaz, kullanılınca yazılır).
    if (!usePlayerStore.getState().current) void prewarmDiscovery();
    await autoDownloadTop();
  } catch (e) {
    console.warn("[açılış] arka plan işleri:", e);
  }
}

/** En çok dinlenen N parçayı çevrimdışına al (Ayarlar → Otomatik indirme). */
async function autoDownloadTop(): Promise<void> {
  const n = useSettingsStore.getState().autoDownloadTop;
  if (!n || n <= 0) return;
  const db = await getDb();
  const rows = await db.select<(Track & { durationMs: number })[]>(
    `SELECT t.id, t.source, t.source_id AS sourceId, t.title, t.artist, t.album,
            t.duration_ms AS durationMs, t.thumbnail
       FROM play_history h JOIN tracks t ON t.id = h.track_id
      WHERE t.source = 'youtube'
        AND t.id NOT IN (SELECT track_id FROM cache WHERE downloaded = 1)
      GROUP BY t.id
      ORDER BY SUM(h.ms_played) DESC
      LIMIT $1`,
    [n]
  );
  if (!rows.length) return;
  console.log(`[açılış] otomatik indirme: ${rows.length} parça`);
  await useDownloadStore.getState().enqueueMany(rows.map((r) => ({ ...r, thumbnail: r.thumbnail ?? undefined })));
}
