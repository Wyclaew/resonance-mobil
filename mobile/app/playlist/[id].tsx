import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { getPlaylist, getPlaylistTracks } from "../../src/lib/playlists";
import { useTrackSheet } from "../../src/components/TrackSheet";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { COLORS } from "../../src/theme";
import type { PlaylistTrack } from "../../src/types";

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
};

/**
 * Liste detayı. Buradan çalınan parçalar `playlistId` taşır → oy verilebilir
 * ve karma/öneri motoru beslenir. Sol raydaki çubuk her satırın karmasını
 * gösterir: liste boyunca zevkinin ekolayzırı gibi okunur.
 */
export default function PlaylistDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("");
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!id) return;
        setName((await getPlaylist(id))?.name ?? "");
        setTracks(await getPlaylistTracks(id));
      })();
    }, [id])
  );

  const totalMs = tracks.reduce((sum, t) => sum + t.durationMs, 0);
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.round((totalMs % 3_600_000) / 60_000);

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: name || "Liste",
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Archivo_700Bold", fontSize: 17 },
          headerShadowVisible: false,
        }}
      />

      <View className="flex-row items-center justify-between px-5 pb-1">
        <Eyebrow>{`${tracks.length} parça · ${hours ? `${hours} sa ` : ""}${minutes} dk`}</Eyebrow>
        {tracks.length ? (
          <Pressable
            onPress={() => usePlayerStore.getState().playNow(tracks[0], tracks, id)}
            className="h-8 justify-center rounded-full border border-accent-dim px-3"
          >
            <Text className="text-accent text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              Baştan çal
            </Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        ListEmptyComponent={<Text className="text-muted mt-10 px-4 text-sm">Bu listede parça yok.</Text>}
        renderItem={({ item }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            thumbnail={item.thumbnail}
            karma={item.karma}
            meta={mmss(item.durationMs)}
            onLongPress={() => useTrackSheet.getState().open(item)}
            onPress={() => usePlayerStore.getState().playNow(item, tracks, id)}
          />
        )}
      />
    </View>
  );
}
