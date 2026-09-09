import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { DISCOVERY_FILTERS } from "../../src/lib/filters";
import { t } from "../../src/lib/i18n";
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
  const [selected, setSelected] = useState<string[]>(usePlayerStore.getState().discoveryFilters);

  // Filtreler ruh hali × tür olarak BİRLEŞİR ("energetic" + "rock"); boş
  // bırakılırsa saf öğrenme algoritması çalışır (lib/filters.ts).
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <View className="flex-1 bg-bg px-4 pt-4">
      {discovery && discoverySeedArtists.length ? (
        <Text className="text-muted mb-3 text-xs" numberOfLines={1}>
          {discoverySeedArtists.slice(0, 3).join(" · ")} tarzı
        </Text>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3 max-h-10">
        {DISCOVERY_FILTERS.map((f) => {
          const on = selected.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => toggle(f.id)}
              className={`mr-2 h-9 justify-center rounded-full px-4 ${
                on ? "bg-accent" : "bg-surface-2"
              }`}
            >
              <Text className={on ? "text-bg text-xs font-semibold" : "text-muted text-xs"}>
                {t(f.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="mb-3 flex-row gap-2">
        <Pressable
          disabled={loading}
          onPress={() => usePlayerStore.getState().startDiscovery(selected)}
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
