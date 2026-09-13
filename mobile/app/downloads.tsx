import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { getDb } from "../../src/lib/db";
import { pruneCache } from "../../src/lib/downloads";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";

interface CacheRow {
  track_id: string;
  title: string;
  artist: string;
  thumbnail: string | null;
  bytes: number;
  downloaded: number;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** İndirilenler — çevrimdışı çalınabilir parçalar, iniş durumu ve kota. */
export default function Downloads() {
  const [rows, setRows] = useState<CacheRow[]>([]);
  const jobs = useDownloadStore((s) => s.jobs);
  const limitGb = useSettingsStore((s) => s.cacheLimitGb);

  const load = useCallback(async () => {
    const db = await getDb();
    setRows(
      await db.select<CacheRow[]>(
        `SELECT c.track_id, t.title, t.artist, t.thumbnail, c.bytes, c.downloaded
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
  const ratio = limitBytes ? Math.min(1, total / limitBytes) : 0;

  return (
    <View className="flex-1 bg-bg px-5">
      <Eyebrow>{`${rows.length} parça · ${mb(total)} / ${limitGb} GB`}</Eyebrow>
      <View className="mt-2 h-[2px] w-full bg-surface-3">
        <View
          className={`h-[2px] ${total > limitBytes ? "bg-down" : "bg-accent"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </View>

      {active.length ? (
        <View className="mt-4">
          {active.map((job) => (
            <View key={job.track.id} className="mb-2">
              <Text className="text-text text-[13px]" numberOfLines={1}>
                {job.track.title}
              </Text>
              <Text
                className={job.status === "hata" ? "text-down text-[10px]" : "text-faint text-[10px]"}
                style={{ fontFamily: "JetBrainsMono_400Regular" }}
              >
                {job.status === "hata" ? job.error : `${job.status} · %${Math.round(job.progress * 100)}`}
              </Text>
              <View className="mt-1 h-[2px] w-full bg-surface-3">
                <View className="h-[2px] bg-accent-dim" style={{ width: `${job.progress * 100}%` }} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(r) => r.track_id}
        className="mt-3 -mx-3"
        contentContainerStyle={{ paddingBottom: 20 }}
        ListEmptyComponent={
          <Text className="text-muted mt-10 px-4 text-sm leading-5">
            İndirilmiş parça yok. Şu An ekranındaki “İndir” çevrimdışı çalmak için saklar;
            sıradaki parça zaten Wi-Fi'dayken kendiliğinden inip hazır bekler.
          </Text>
        }
        renderItem={({ item }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            thumbnail={item.thumbnail ?? undefined}
            meta={mb(item.bytes)}
            note={item.downloaded ? "kalıcı" : "önbellek · kota dolunca silinebilir"}
          />
        )}
        ListFooterComponent={
          rows.length ? (
            <Pressable
              onPress={async () => {
                await pruneCache(limitBytes);
                await load();
              }}
              className="mx-3 mt-4 items-center rounded border border-border py-3"
            >
              <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                Kotaya göre buda
              </Text>
            </Pressable>
          ) : null
        }
      />
    </View>
  );
}
