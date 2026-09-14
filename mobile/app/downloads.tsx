import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { useBottomSpace } from "../src/components/MiniPlayer";
import { TrackRow } from "../src/components/TrackRow";
import { Button, EmptyState, Eyebrow, Segmented, TopBar } from "../src/components/ui";
import { getDb } from "../src/lib/db";
import { bytes as fmtBytes } from "../src/lib/fmt";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { useDownloadStore } from "../src/store/useDownloadStore";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { useSettingsStore } from "../src/store/useSettingsStore";
import type { Track } from "../src/types";

type Row = Track & { bytes: number; downloaded: number };

/**
 * İndirilenler — masaüstü `DownloadsView`: internet olmadan çalabileceğin
 * şarkılar. Mobilde ayrıca geçici önbellek (çalarken inenler) ayrı sekmede
 * görünür; LRU sınırı ve kalan yer tek satırda.
 */
export default function Downloads() {
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const limitGb = useSettingsStore((s) => s.cacheLimitGb);
  const jobs = useDownloadStore((s) => s.jobs);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<"kept" | "temp">("kept");

  const load = useCallback(async () => {
    const db = await getDb();
    const list = await db.select<(Row & { thumbnail: string | null; album: string | null })[]>(
      `SELECT t.id, t.source, t.source_id AS sourceId, t.title, t.artist, t.album,
              t.duration_ms AS durationMs, t.thumbnail, c.bytes, c.downloaded
         FROM cache c JOIN tracks t ON t.id = c.track_id
        ORDER BY c.last_played DESC`
    );
    setRows(list.map((r) => ({ ...r, thumbnail: r.thumbnail ?? undefined, album: r.album ?? undefined })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const kept = useMemo(() => rows.filter((r) => r.downloaded), [rows]);
  const temp = useMemo(() => rows.filter((r) => !r.downloaded), [rows]);
  const shown = tab === "kept" ? kept : temp;
  const total = rows.reduce((a, r) => a + (r.bytes || 0), 0);
  const active = Object.values(jobs).filter((j) => j.status === "running" || j.status === "queued").length;
  // Kalıcı indirme kuyruğu: sürenler, bağlantı bekleyenler ve nedeniyle başarısızlar.
  const queueJobs = Object.values(jobs).filter((j) => j.status !== "done" && !j.speculative);

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("downloads.title")} />
      <FlatList
        data={shown}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
        ListHeaderComponent={
          <View className="px-4 pb-3">
            <Text className="text-muted text-[13px]">{t("downloads.subtitle")}</Text>
            <Text className="text-faint mt-1 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              {`${fmtBytes(total, lang)} / ${limitGb > 0 ? `${limitGb} GB` : t("settings.cacheLimitOff")}${
                active ? ` · ${t("m.downloads.active", { n: active })}` : ""
              }`}
            </Text>
            {queueJobs.length ? (
              <View className="bg-surface border-border mt-4 rounded-2xl border px-3 py-2">
                <View className="flex-row items-center justify-between px-1 pb-1 pt-1">
                  <Eyebrow>{t("m.downloads.queue", { n: queueJobs.length })}</Eyebrow>
                  {queueJobs.some((j) => j.status === "failed") ? (
                    <Text onPress={() => useDownloadStore.getState().clearFailed()} className="text-muted text-[12px]">
                      {t("common.clear")}
                    </Text>
                  ) : null}
                </View>
                {queueJobs.slice(0, 12).map((j) => (
                  <View key={j.track.id} className="flex-row items-center py-1.5">
                    <View className="flex-1 pl-1">
                      <Text className="text-text text-[13px]" numberOfLines={1}>
                        {j.track.title || j.track.sourceId}
                      </Text>
                      <Text
                        className={j.status === "failed" ? "text-down text-[11px]" : "text-muted text-[11px]"}
                        numberOfLines={2}
                      >
                        {j.status === "running"
                          ? `${Math.round(j.progress * 100)}%`
                          : j.status === "queued"
                            ? t("m.downloads.queued")
                            : (j.error ?? "")}
                      </Text>
                    </View>
                    {j.status === "failed" || j.status === "waiting" ? (
                      <Button small kind="ghost" icon="refresh" label={t("error.retry")} onPress={() => useDownloadStore.getState().retry(j.track.id)} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            <View className="mt-4">
              <Segmented
                value={tab}
                onChange={setTab}
                options={[
                  { value: "kept", label: `${t("settings.downloadsKept")} · ${kept.length}` },
                  { value: "temp", label: `${t("settings.tempCache")} · ${temp.length}` },
                ]}
              />
            </View>
            <View className="mt-3">
              <Eyebrow>{tab === "kept" ? t("downloads.count", { count: kept.length }) : t("settings.tempCacheDesc")}</Eyebrow>
            </View>
            {shown.length ? (
              <Button
                small
                kind="secondary"
                icon="play"
                label={t("playlist.playOrdered")}
                className="mt-3 self-start"
                onPress={() => void usePlayerStore.getState().playNow(shown[0], shown)}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <TrackRow track={item} meta={fmtBytes(item.bytes, lang)} onPress={() => void usePlayerStore.getState().playNow(item, shown)} />
        )}
        ListEmptyComponent={<EmptyState icon="download" text={tab === "kept" ? t("downloads.emptyState") : t("m.downloads.tempEmpty")} />}
      />
    </View>
  );
}
