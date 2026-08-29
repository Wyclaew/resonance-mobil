import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { getDb } from "../../src/lib/db";
import { pruneCache } from "../../src/lib/downloads";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";

interface CacheRow {
  track_id: string;
  title: string;
  artist: string;
  bytes: number;
  downloaded: number;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** İndirilenler — offline çalınabilir parçalar, iniş durumu ve kota. */
export default function Downloads() {
  const [rows, setRows] = useState<CacheRow[]>([]);
  const jobs = useDownloadStore((s) => s.jobs);
  const limitGb = useSettingsStore((s) => s.cacheLimitGb);

  const load = useCallback(async () => {
    const db = await getDb();
    setRows(
      await db.select<CacheRow[]>(
        `SELECT c.track_id, t.title, t.artist, c.bytes, c.downloaded
         FROM cache c JOIN tracks t ON t.id = c.track_id
         ORDER BY c.downloaded DESC, c.last_played DESC`
      )
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const total = rows.reduce((sum, r) => sum + r.bytes, 0);
  const limitBytes = limitGb * 1024 * 1024 * 1024;
  const active = Object.values(jobs).filter((j) => j.status !== "bitti");

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      <Text className="text-faint text-xs">
        {rows.length} parça · {mb(total)} / {limitGb} GB
      </Text>
      <View className="mt-2 h-1 w-full rounded bg-surface-3">
        <View
          className={`h-1 rounded ${total > limitBytes ? "bg-down" : "bg-accent"}`}
          style={{ width: `${Math.min(100, limitBytes ? (total / limitBytes) * 100 : 0)}%` }}
        />
      </View>

      {active.length ? (
        <View className="mt-4">
          {active.map((job) => (
            <View key={job.track.id} className="mb-2 rounded-lg bg-surface-2 px-3 py-2">
              <Text className="text-text text-sm" numberOfLines={1}>
                {job.track.title}
              </Text>
              <Text className={job.status === "hata" ? "text-down text-xs" : "text-muted text-xs"}>
                {job.status === "hata" ? job.error : `${job.status} · %${Math.round(job.progress * 100)}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.track_id}
        className="mt-4"
        ListEmptyComponent={
          <Text className="text-muted mt-8 text-sm">
            Henüz indirilmiş parça yok. “Şu An” ekranındaki ⬇ ile çalan şarkıyı indir —
            indirilen parça çevrimdışı da çalar, veri harcamaz.
          </Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 flex-row items-center justify-between rounded-lg bg-surface px-3 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-text text-sm" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-muted text-xs" numberOfLines={1}>
                {item.artist}
              </Text>
            </View>
            <Text className={item.downloaded ? "text-accent text-xs" : "text-faint text-xs"}>
              {mb(item.bytes)}
            </Text>
          </View>
        )}
        ListFooterComponent={
          rows.length ? (
            <Pressable
              onPress={async () => {
                // Kalıcı indirilenler korunur; yalnız geçici önbellek budanır.
                await pruneCache(limitBytes);
                await load();
              }}
              className="mt-4 items-center rounded-lg bg-surface-2 py-3"
            >
              <Text className="text-text text-sm">Kotaya göre buda</Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
