import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { ArtistActions } from "../../src/components/ArtistActions";
import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { getDb } from "../../src/lib/db";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { COLORS } from "../../src/theme";
import type { Track } from "../../src/types";

interface ArtistTrack extends Track {
  plays: number;
}

/**
 * Sanatçı sayfası — kütüphanendeki parçaları, dinleme sayıları ve o sanatçıya
 * dair kararlar (daha çok/az, engelle). "Bu tarzda keşfet" öneri motorunu
 * TARZ KİLİDİYLE başlatır: o sanatçının tohum olma ağırlığı yükselir.
 */
export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [totalPlays, setTotalPlays] = useState(0);

  useEffect(() => {
    if (!name) return;
    void (async () => {
      const db = await getDb();
      const rows = await db.select<ArtistTrack[]>(
        `SELECT t.id, t.source, t.source_id AS sourceId, t.title, t.artist,
                t.duration_ms AS durationMs, t.thumbnail,
                (SELECT COUNT(*) FROM play_history h WHERE h.track_id = t.id) AS plays
           FROM tracks t
          WHERE LOWER(t.artist) = LOWER($1)
          ORDER BY plays DESC, t.title
          LIMIT 200`,
        [name]
      );
      setTracks(rows);
      setTotalPlays(rows.reduce((sum, r) => sum + r.plays, 0));
    })();
  }, [name]);

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: name ?? "Sanatçı",
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Archivo_700Bold", fontSize: 17 },
          headerShadowVisible: false,
        }}
      />

      <View className="px-5">
        <Eyebrow>{`${tracks.length} parça · ${totalPlays} çalma`}</Eyebrow>
        <View className="mt-3 flex-row gap-2">
          <Pressable
            disabled={!tracks.length}
            onPress={() => usePlayerStore.getState().playNow(tracks[0], tracks)}
            className={`h-9 flex-1 items-center justify-center rounded bg-accent ${
              tracks.length ? "" : "opacity-40"
            }`}
          >
            <Text className="text-bg text-[12px]" style={{ fontFamily: "Archivo_700Bold" }}>
              Hepsini çal
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void usePlayerStore.getState().startDiscovery([], name);
              router.push("/(tabs)/discover");
            }}
            className="h-9 flex-1 items-center justify-center rounded border border-accent-dim"
          >
            <Text className="text-accent text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              Bu tarzda keşfet
            </Text>
          </Pressable>
        </View>
        {name ? <ArtistActions artist={name} /> : null}
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        className="mt-4"
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        ListEmptyComponent={
          <Text className="text-muted mt-8 px-4 text-sm">
            Bu sanatçıdan kütüphanende parça yok.
          </Text>
        }
        renderItem={({ item }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            thumbnail={item.thumbnail}
            meta={item.plays ? `${item.plays}×` : undefined}
            onPress={() => usePlayerStore.getState().playNow(item, tracks)}
          />
        )}
      />
    </View>
  );
}
