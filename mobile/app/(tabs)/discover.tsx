import { Image } from "expo-image";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { reasonText } from "../../src/lib/recommender";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";

/**
 * Keşfet — masaüstündeki DiscoverView'ın mobil karşılığı.
 *
 * Öneriler AYNI motordan gelir (`lib/recommender.ts`, masaüstünden kopya):
 * YouTube Music radyoları, sanatçı başına tek tohum, round-robin, ağırlıklı
 * rastgele örnekleme. Mobilde tek fark kuyruk derinliği (20 → 10, pil + veri).
 */
export default function Discover() {
  const { queue, index, discovery, loading, error, discoverySeedArtists } = usePlayerStore();
  const lang = useSettingsStore((s) => s.language);
  const upcoming = discovery ? queue.slice(index) : [];

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      {discovery && discoverySeedArtists.length ? (
        <Text className="text-muted mb-3 text-xs" numberOfLines={1}>
          {discoverySeedArtists.slice(0, 3).join(" · ")} tarzı
        </Text>
      ) : null}

      <View className="mb-3 flex-row gap-2">
        <Pressable
          disabled={loading}
          onPress={() => usePlayerStore.getState().startDiscovery()}
          className={`flex-1 items-center rounded-lg bg-accent py-3 ${loading ? "opacity-50" : ""}`}
        >
          {loading ? (
            <ActivityIndicator color="#0c0c0d" />
          ) : (
            <Text className="text-bg text-sm font-semibold">
              {discovery ? "Yeni parti" : "Keşfet'i başlat"}
            </Text>
          )}
        </Pressable>
        {discovery ? (
          <Pressable
            disabled={loading}
            onPress={() => usePlayerStore.getState().rerollDiscovery()}
            className={`items-center justify-center rounded-lg bg-surface-2 px-4 ${loading ? "opacity-50" : ""}`}
          >
            <Text className="text-text text-sm">Başka tarz</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text className="text-down mb-2 text-sm">{error}</Text> : null}

      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.uid}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-muted mt-8 text-sm">
              Keşfet, dinlediklerinden ve oylarından öğrenir. Havuz boşsa önce birkaç şarkı
              dinle veya listelerine ekle — öneriler o zaman isabetli gelir.
            </Text>
          )
        }
        renderItem={({ item, index: i }) => (
          <Pressable
            onPress={() => usePlayerStore.getState().playNow(item, upcoming, item.playlistId)}
            className={`mb-2 flex-row items-center gap-3 rounded-lg px-3 py-2 ${
              i === 0 ? "bg-surface-2" : "bg-surface"
            }`}
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
              {/* Gerekçe YAPISAL saklanır, GÖSTERİRKEN çevrilir → dil değişince
                  metin de değişir (CLAUDE.md v1.2.2). */}
              {item.recReason ? (
                <Text className="text-faint text-xs" numberOfLines={1}>
                  {reasonText(item.recReason, lang)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
