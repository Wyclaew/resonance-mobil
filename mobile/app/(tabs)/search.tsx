import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";
import { isLikelySong } from "../../src/lib/recommender";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import type { Track } from "../../src/types";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const found = await Extractor.search(query.trim(), 25, true);
      // Müzik-dışı içerik filtresi masaüstüyle AYNI fonksiyondan geçer
      // (podcast/röportaj/mix elemesi — CLAUDE.md `isLikelySong`).
      setResults(found.filter(isLikelySong));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-bg px-4 pt-16">
      <TextInput
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={run}
        placeholder="Şarkı veya sanatçı ara"
        placeholderTextColor="#5e5e64"
        returnKeyType="search"
        className="rounded-lg border border-border bg-surface px-4 py-3 text-text"
      />

      {busy ? <ActivityIndicator color="#e0a33c" className="mt-6" /> : null}
      {error ? <Text className="text-down mt-4 text-sm">{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        className="mt-4"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => usePlayerStore.getState().playNow(item, results)}
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
          </Pressable>
        )}
      />
    </View>
  );
}
