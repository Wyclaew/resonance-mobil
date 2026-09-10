import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import * as Extractor from "../../modules/resonance-extractor";
import { useAddToPlaylist } from "../../src/components/AddToPlaylistSheet";
import { TrackRow } from "../../src/components/TrackRow";
import { isLikelySong } from "../../src/lib/recommender";
import { useTrackSheet } from "../../src/components/TrackSheet";
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

  const token = useRef(0);

  async function run(term: string) {
    const text = term.trim();
    if (!text) {
      setResults([]);
      setSearched(false);
      return;
    }
    const mine = ++token.current;
    setBusy(true);
    setError(null);
    try {
      const found = await Extractor.search(text, 25, true);
      // Yazmaya devam edildiyse eski sonucu YAZMA — geç dönen istek listeyi
      // geri almamalı (masaüstündeki stale-token dersi).
      if (mine !== token.current) return;
      // Podcast/röportaj/mix elemesi masaüstüyle AYNI fonksiyondan geçer.
      setResults(found.filter(isLikelySong));
      setSearched(true);
    } catch (e) {
      if (mine !== token.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mine === token.current) setBusy(false);
    }
  }

  /**
   * Yazarken ara — Enter'a basmak gerekmiyor. 450 ms bekleme, her harfte
   * YouTube'a gitmemek için: hem hız hem veri (mobil şebeke).
   */
  useEffect(() => {
    const id = setTimeout(() => void run(query), 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <View className="flex-1 bg-bg">
      <View className="px-5">
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void run(query)}
          placeholder="yazmaya başla — kendi arar"
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
            onLongPress={() => useTrackSheet.getState().open(item)}
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
