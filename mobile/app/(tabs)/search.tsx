import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";
import { useAddToPlaylist } from "../../src/components/AddToPlaylistSheet";
import { TrackRow } from "../../src/components/TrackRow";
import { isLikelySong } from "../../src/lib/recommender";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { COLORS } from "../../src/theme";
import type { Track } from "../../src/types";

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "";
};

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function run() {
    if (!query.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const found = await Extractor.search(query.trim(), 25, true);
      // Podcast/röportaj/mix elemesi masaüstüyle AYNI fonksiyondan geçer.
      setResults(found.filter(isLikelySong));
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="flex-1 bg-bg">
      <View className="px-5">
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={run}
          placeholder="şarkı ya da sanatçı"
          placeholderTextColor={COLORS.faint}
          returnKeyType="search"
          selectionColor={COLORS.accent}
          className="h-11 rounded border border-border bg-surface px-4 text-text"
          style={{ fontFamily: "Inter_400Regular" }}
        />
      </View>

      {busy ? <ActivityIndicator color={COLORS.accent} className="mt-8" /> : null}
      {error ? <Text className="text-down mt-4 px-5 text-xs">{error}</Text> : null}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        className="mt-2"
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          busy ? null : (
            <Text className="text-muted mt-10 px-4 text-sm leading-5">
              {searched
                ? "Sonuç yok. Başka bir yazımla dene."
                : "YouTube Music'te ara. Bulduğunu çal ya da ＋ ile bir listeye ekle — listeye ekleme öneri motorunu da besler."}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <TrackRow
            title={item.title}
            artist={item.artist}
            thumbnail={item.thumbnail}
            meta={mmss(item.durationMs)}
            onPress={() => usePlayerStore.getState().playNow(item, results)}
            right={
              <Pressable
                hitSlop={12}
                onPress={() => useAddToPlaylist.getState().open(item)}
                className="h-8 w-8 items-center justify-center rounded-full border border-border"
              >
                <Text className="text-muted text-sm">＋</Text>
              </Pressable>
            }
          />
        )}
      />
    </View>
  );
}
