import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";

import { useBottomSpace } from "../../src/components/MiniPlayer";
import { TrackRow } from "../../src/components/TrackRow";
import { Button, EmptyState, Eyebrow, IconButton, TopBar } from "../../src/components/ui";
import { useT } from "../../src/lib/i18n.mobile";
import { SMART_LISTS, runSmartList, type SmartListId } from "../../src/lib/smartLists";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { useColors } from "../../src/theme";
import type { Track } from "../../src/types";

/** Akıllı liste — dinledikçe kendini güncelleyen listeler (masaüstü `smartLists.ts`). */
export default function SmartListScreen() {
  const { id } = useLocalSearchParams<{ id: SmartListId }>();
  const c = useColors();
  const t = useT();
  const bottom = useBottomSpace(false);
  const meta = SMART_LISTS.find((l) => l.id === id);
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    if (!id) return;
    void runSmartList(id)
      .then(setTracks)
      .catch(() => setTracks([]));
  }, [id]);

  return (
    <View className="bg-bg flex-1">
      <TopBar title={meta ? t(meta.labelKey) : ""} />
      <FlatList
        data={tracks ?? []}
        keyExtractor={(tr) => tr.id}
        contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
        ListHeaderComponent={
          <View className="px-4 pb-3">
            <Eyebrow>{t("smart.header")}</Eyebrow>
            <Text className="text-text mt-1 text-[28px] leading-[32px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
              {meta ? t(meta.labelKey) : ""}
            </Text>
            <Text className="text-muted mt-1 text-[13px]">{meta ? t(meta.descKey) : ""}</Text>
            {tracks?.length ? (
              <View className="mt-4 flex-row items-center gap-2">
                <Button kind="primary" icon="play" label={t("playlist.playOrdered")} onPress={() => void usePlayerStore.getState().playNow(tracks[0], tracks)} />
                <IconButton name="shuffle" label={t("playlist.playShuffled")} onPress={() => void usePlayerStore.getState().playShuffled(tracks)} />
                <Text className="text-faint ml-auto text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {t("smart.count", { n: tracks.length })}
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <TrackRow track={item} onPress={() => void usePlayerStore.getState().playNow(item, tracks ?? [])} />}
        ListEmptyComponent={
          tracks === null ? (
            <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState icon="wand" text={t("smart.empty")} />
          )
        }
      />
    </View>
  );
}
