import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { getPlaylist, getPlaylistTracks } from "../../src/lib/playlists";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import type { PlaylistTrack } from "../../src/types";

/**
 * Liste detayı. Buradan çalınan parçalar `playlistId` taşır → oy verilebilir
 * (oylar liste bazlı, masaüstüyle aynı) ve karma/öneri motoru beslenir.
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

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: name || "Liste",
          headerStyle: { backgroundColor: "#0c0c0d" },
          headerTintColor: "#e9e7e1",
          headerShadowVisible: false,
        }}
      />
      <FlatList
        data={tracks}
        keyExtractor={(t) => t.id}
        contentContainerClassName="px-4 pb-8"
        ListEmptyComponent={<Text className="text-muted mt-8 text-sm">Bu listede parça yok.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              // Kuyruğun tamamı listeden gelir → her öğe playlistId taşır (oy şartı).
              usePlayerStore.getState().playNow(item, tracks, id)
            }
            className="mb-2 flex-row items-center gap-3 rounded-lg bg-surface px-3 py-2"
          >
            <Image
              source={{ uri: item.thumbnail }}
              style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: "#1c1c1f" }}
              contentFit="cover"
            />
            <View className="flex-1">
              <Text className="text-text text-sm" numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-muted text-xs" numberOfLines={1}>
                {item.artist}
              </Text>
            </View>
            {item.karma !== 0 ? (
              <Text className={item.karma > 0 ? "text-up text-xs" : "text-down text-xs"}>
                {item.karma > 0 ? "+" : ""}
                {item.karma}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
