import { router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";

import { Eyebrow, TrackRow } from "../src/components/TrackRow";
import { reasonText } from "../src/lib/recommender";
import { useTrackSheet } from "../src/components/TrackSheet";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { useSettingsStore } from "../src/store/useSettingsStore";

/**
 * Sıra — çalan kuyruğun tamamı. Keşfet sekmesi yalnız keşif partisini
 * gösteriyor; listeden çalarken de kuyruğu görebilmek gerek.
 */
export default function QueueScreen() {
  const { queue, index, discovery } = usePlayerStore();
  const lang = useSettingsStore((s) => s.language);
  const played = index;

  return (
    <View className="flex-1 bg-bg px-5 pt-14">
      <Eyebrow>{`Sıra · ${queue.length} parça${discovery ? " · keşfet" : ""}`}</Eyebrow>

      <FlatList
        data={queue}
        keyExtractor={(item) => item.uid}
        className="-mx-3 mt-3"
        contentContainerStyle={{ paddingBottom: 20 }}
        initialScrollIndex={Math.max(0, index - 1)}
        getItemLayout={(_, i) => ({ length: 62, offset: 62 * i, index: i })}
        onScrollToIndexFailed={() => undefined}
        ListEmptyComponent={<Text className="text-muted mt-8 px-4 text-sm">Kuyruk boş.</Text>}
        renderItem={({ item, index: i }) => (
          <View className={i < played ? "opacity-40" : ""}>
            <TrackRow
              title={item.title}
              artist={item.artist}
              thumbnail={item.thumbnail}
              note={item.recReason ? reasonText(item.recReason, lang) : undefined}
              active={i === index}
              onPress={() => usePlayerStore.getState().playNow(item, queue, item.playlistId)}
              onLongPress={() => useTrackSheet.getState().open(item)}
            />
          </View>
        )}
      />

      <Pressable onPress={() => router.back()} className="items-center py-4">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </View>
  );
}
