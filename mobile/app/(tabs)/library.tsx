import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Text, View } from "react-native";

import { getDb } from "../../src/lib/db";

interface PlaylistRow {
  id: string;
  name: string;
  track_count: number;
}

/** Kütüphane — senkronla gelen listeler. (Liste detayı/oy verme Faz 3'te.) */
export default function Library() {
  const [rows, setRows] = useState<PlaylistRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const db = await getDb();
        // ⚠️ Tombstone: her okuma `deleted = 0` filtreler (MOBILE.md §5).
        setRows(
          await db.select<PlaylistRow[]>(
            `SELECT p.id, p.name,
                    (SELECT COUNT(*) FROM playlist_tracks pt
                      WHERE pt.playlist_id = p.id AND pt.deleted = 0) AS track_count
             FROM playlists p WHERE p.deleted = 0 ORDER BY p.name COLLATE NOCASE`
          )
        );
      })();
    }, [])
  );

  return (
    <View className="flex-1 bg-bg px-4 pt-16">
      <Text className="text-text text-2xl font-semibold">Kütüphane</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        className="mt-4"
        ListEmptyComponent={
          <Text className="text-muted mt-8 text-sm">
            Henüz liste yok. Senkron bağlandığında masaüstündeki listeler burada görünecek.
          </Text>
        }
        renderItem={({ item }) => (
          <View className="mb-2 rounded-lg bg-surface px-3 py-3">
            <Text className="text-text text-sm">{item.name}</Text>
            <Text className="text-faint text-xs">{item.track_count} parça</Text>
          </View>
        )}
      />
    </View>
  );
}
