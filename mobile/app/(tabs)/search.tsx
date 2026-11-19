import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import * as Extractor from "../../modules/resonance-extractor";
import { Icon } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { TrackRow } from "../../src/components/TrackRow";
import { EmptyState, Eyebrow, Segmented } from "../../src/components/ui";
import { cachedSearch, prewarmTop, searchLibrary, searchRemote } from "../../src/lib/fastSearch";
import { useT } from "../../src/lib/i18n.mobile";
import {
  clearSearchHistory,
  loadSearchHistory,
  rememberSearch,
  searchLyrics,
  type LyricHit,
} from "../../src/lib/searchHistory";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { useToastStore } from "../../src/store/useToastStore";
import { useColors } from "../../src/theme";
import type { Track } from "../../src/types";

// Önbellekte olmayan sorgu için ağ isteği bekleme süresi (yerel sonuçlar beklemez).
const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
/** Kütüphane sorgusu (yerel tarama) her tuşta değil, kısa duraksamada. */
const LIBRARY_DEBOUNCE_MS = 120;

/**
 * Ara — yazdıkça gelir (Enter gerekmez). İki kip (masaüstü SearchView):
 * şarkı/sanatçı (YouTube Music) ve sözden bul (lrclib → YouTube'da eşleştir).
 */
export default function Search() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(true);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"track" | "lyrics">("track");
  const [results, setResults] = useState<Track[]>([]);
  const [local, setLocal] = useState<Track[]>([]);
  const [hits, setHits] = useState<LyricHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(() => loadSearchHistory());
  const reqId = useRef(0);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    if (q.length < MIN_CHARS) {
      setResults([]);
      setLocal([]);
      setHits([]);
      setSearched(false);
      setLoading(false);
      setError(null);
      return;
    }
    // Kütüphane her tuşta, beklemeden (yerel SQLite).
    let libTimer: ReturnType<typeof setTimeout> | null = null;
    if (mode === "track") {
      libTimer = setTimeout(() => {
        void searchLibrary(q)
          .then((found) => id === reqId.current && setLocal(found))
          .catch((e) => console.warn("[ara] kütüphane:", e));
      }, LIBRARY_DEBOUNCE_MS);
      const cached = cachedSearch(q);
      if (cached) {
        setResults(cached);
        setHits([]);
        setSearched(true);
        setLoading(false);
        setError(null);
        return () => {
          if (libTimer) clearTimeout(libTimer);
        };
      }
    } else {
      setLocal([]);
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (mode === "lyrics") {
          const found = await searchLyrics(q);
          if (id !== reqId.current) return;
          setHits(found);
          setResults([]);
        } else {
          const found = await searchRemote(q, 25);
          if (id !== reqId.current) return;
          setResults(found);
          setHits([]);
          prewarmTop(found);
        }
        setSearched(true);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(handle);
      if (libTimer) clearTimeout(libTimer);
    };
  }, [query, mode]);

  // Kütüphane eşleşmeleri üstte; ağ sonuçlarında aynı parça tekrar görünmez.
  const combined = useMemo(() => {
    const seen = new Set(local.map((tr) => tr.id));
    return [...local, ...results.filter((tr) => !seen.has(tr.id))];
  }, [local, results]);

  const combinedRef = useRef(combined);
  combinedRef.current = combined;
  const queryRef = useRef(query);
  queryRef.current = query;
  // Sabit: satırlar yazarken yeniden çizilmesin (TrackRow memo).
  const play = useCallback((track: Track) => {
    Keyboard.dismiss();
    setHistory(rememberSearch(queryRef.current));
    void usePlayerStore.getState().playNow(track, combinedRef.current);
  }, []);

  async function playLyricHit(h: LyricHit) {
    Keyboard.dismiss();
    setLoading(true);
    try {
      const found = await Extractor.search(`${h.artist} ${h.title}`, 5, true);
      if (!found.length) {
        useToastStore.getState().show(t("search.noResults"), "info");
        return;
      }
      setHistory(rememberSearch(query));
      setResults(found);
      setHits([]);
      setMode("track");
      await usePlayerStore.getState().playNow(found[0], found);
    } finally {
      setLoading(false);
    }
  }

  const showHistory = query.trim().length < MIN_CHARS && history.length > 0;

  return (
    <View className="bg-bg flex-1" style={{ paddingTop: insets.top + 8 }}>
      <View className="px-5">
        <Text className="text-text text-[30px] leading-[34px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
          {t("search.title")}
        </Text>
        <View className="bg-surface-2 mt-4 h-12 flex-row items-center rounded-2xl px-4">
          <Icon name="search" size={18} color={c.muted} />
          <TextInput
            ref={input}
            value={query}
            onChangeText={setQuery}
            placeholder={mode === "lyrics" ? t("m.search.lyricsPlaceholder") : t("search.placeholder")}
            placeholderTextColor={c.faint}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={() => setHistory(rememberSearch(query))}
            className="text-text ml-3 h-12 flex-1 text-[15px]"
            style={{ fontFamily: "Inter_400Regular" }}
          />
          {loading ? (
            <ActivityIndicator size="small" color={c.accent} />
          ) : query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel={t("common.clear")}>
              <Icon name="x" size={18} color={c.muted} />
            </Pressable>
          ) : null}
        </View>
        <View className="mt-3">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "track", label: t("search.modeTrack") },
              { value: "lyrics", label: t("search.modeLyrics") },
            ]}
          />
        </View>
      </View>

      {showHistory ? (
        <View className="px-5 pt-6">
          <View className="flex-row items-center justify-between">
            <Eyebrow>{t("search.recent")}</Eyebrow>
            <Pressable
              onPress={() => {
                clearSearchHistory();
                setHistory([]);
              }}
              hitSlop={10}
            >
              <Text className="text-muted text-[12px]">{t("common.clear")}</Text>
            </Pressable>
          </View>
          {history.map((h) => (
            <Pressable
              key={h}
              onPress={() => {
                setQuery(h);
                input.current?.blur();
              }}
              className="flex-row items-center py-3"
            >
              <Icon name="history" size={16} color={c.faint} />
              <Text className="text-text ml-3 flex-1 text-[15px]" numberOfLines={1}>
                {h}
              </Text>
              <Icon name="chevronRight" size={16} color={c.faint} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {mode === "lyrics" && hits.length ? (
        <FlatList
          data={hits}
          keyExtractor={(h, i) => `${h.artist}-${h.title}-${i}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: bottom }}
          renderItem={({ item }) => (
            <Pressable onPress={() => void playLyricHit(item)} android_ripple={{ color: c.surface2 }} className="px-5 py-3">
              <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text className="text-muted text-[12px]" numberOfLines={1}>
                {item.artist}
              </Text>
              {item.snippet ? (
                <Text className="text-faint mt-1 text-[12px] italic" numberOfLines={2}>
                  {`“${item.snippet}”`}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      ) : combined.length ? (
        <FlatList
          data={combined}
          keyExtractor={(tr) => tr.id}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: bottom, paddingHorizontal: 4 }}
          renderItem={({ item, index }) => (
            <View>
              {index === 0 && local.length ? (
                <View className="px-4 pb-1 pt-2">
                  <Eyebrow>{t("m.search.inLibrary")}</Eyebrow>
                </View>
              ) : index === local.length && local.length ? (
                <View className="px-4 pb-1 pt-4">
                  <Eyebrow>{t("m.search.online")}</Eyebrow>
                </View>
              ) : null}
              <TrackRow track={item} onPressTrack={play} />
            </View>
          )}
          ListFooterComponent={loading ? <ActivityIndicator className="py-4" color={c.muted} /> : null}
        />
      ) : searched && !loading ? (
        <EmptyState text={error ?? t("search.noResults")} icon={error ? "warning" : "search"} />
      ) : !showHistory && !loading ? (
        <EmptyState text={t("search.hint")} icon="search" />
      ) : null}
    </View>
  );
}
