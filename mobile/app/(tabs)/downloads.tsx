import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Text, View } from "react-native";

import { getDb } from "../../src/lib/db";

interface CacheRow {
  track_id: string;
  title: string;
  artist: string;
  bytes: number;
  downloaded: number;
}

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

/** İndirilenler — offline çalınabilir parçalar + kota görünümü. */
export default function Downloads() {
  const [rows, setRows] = useState<CacheRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const db = await getDb();
        setRows(
          await db.select<CacheRow[]>(
            `SELECT c.track_id, t.title, t.artist, c.bytes, c.downloaded
             FROM cache c JOIN tracks t ON t.id = c.track_id
             ORDER BY c.downloaded DESC, c.last_played DESC`
          )
        );
      })();
    }, [])
  );

  const total = rows.reduce((sum, r) => sum + r.bytes, 0);

  return (
    <View className="flex-1 bg-bg px-4 pt-16">
      <Text className="text-text text-2xl font-semibold">İndirilenler</Text>
      <Text className="text-faint mt-1 text-xs">
        {rows.length} parça · {mb(total)}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.track_id}
        className="mt-4"
        ListEmptyComponent={
          <Text className="text-muted mt-8 text-sm">Henüz indirilmiş parça yok.</Text>
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
      />
    </View>
  );
}
