import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { DISCOVERY_FILTERS } from "../../src/lib/filters";
import { t } from "../../src/lib/i18n";
import { reasonText } from "../../src/lib/recommender";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";
import { COLORS } from "../../src/theme";

/**
 * Keşfet — masaüstündeki DiscoverView'ın mobil karşılığı. Öneriler AYNI
 * motordan gelir; mobilde tek fark kuyruk derinliği (20 → 10, pil + veri).
 *
 * Her satırın sol rayında GEREKÇE var: kuyruk, açıklamalı bir setlist gibi
 * okunur — "neden bu şarkı" sorusu listeyle birlikte cevaplanır.
 */
export default function Discover() {
  const { queue, index, discovery, loading, error, discoverySeedArtists } = usePlayerStore();
  const lang = useSettingsStore((s) => s.language);
  const upcoming = discovery ? queue.slice(index) : [];
  const [selected, setSelected] = useState<string[]>(usePlayerStore.getState().discoveryFilters);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-9 grow-0"
        contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
      >
        {DISCOVERY_FILTERS.map((f) => {
          const on = selected.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => toggle(f.id)}
              className={`h-8 justify-center rounded-full border px-3 ${
                on ? "border-accent-dim bg-surface-2" : "border-border"
              }`}
            >
              <Text
                className={on ? "text-accent text-[11px]" : "text-muted text-[11px]"}
                style={{ fontFamily: "JetBrainsMono_400Regular" }}
              >
                {t(f.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="mt-3 flex-row gap-2 px-5">
        <Pressable
          disabled={loading}
          onPress={() => usePlayerStore.getState().startDiscovery(selected)}
          className={`h-11 flex-1 items-center justify-center rounded bg-accent ${
            loading ? "opacity-50" : ""
          }`}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <Text className="text-bg text-[13px]" style={{ fontFamily: "Archivo_700Bold" }}>
              {discovery ? "Yeni parti" : "Keşfet'i başlat"}
            </Text>
          )}
        </Pressable>
        {discovery ? (
          <Pressable
            disabled={loading}
            onPress={() => usePlayerStore.getState().rerollDiscovery()}
            className={`h-11 justify-center rounded border border-border px-4 ${
              loading ? "opacity-50" : ""
            }`}
          >
            <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              Başka tarz
            </Text>
          </Pressable>
        ) : null}
      </View>

      {discovery && discoverySeedArtists.length ? (
        <View className="mt-4 px-5">
          <Eyebrow>{`${discoverySeedArtists.slice(0, 3).join(" · ")} tarzı`}</Eyebrow>
        </View>
      ) : null}

      {error ? (
        <Text className="text-down mt-3 px-5 text-xs">{error}</Text>
      ) : null}

      <FlatList
        data={upcoming}
        keyExtractor={(item) => item.uid}
        className="mt-2"
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        ListEmptyComponent={
          loading ? null : (
            <Text className="text-muted mt-10 px-4 text-sm leading-5">
              Keşfet, dinlediklerinden ve oylarından öğrenir. Bir tarz seç ya da hiç seçme —
              seçmezsen saf zevk profilin çalışır.
            </Text>
          )
        }
        renderItem={({ item, index: i }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            thumbnail={item.thumbnail}
            note={item.recReason ? reasonText(item.recReason, lang) : undefined}
            active={i === 0}
            onPress={() => usePlayerStore.getState().playNow(item, upcoming, item.playlistId)}
          />
        )}
      />
    </View>
  );
}
