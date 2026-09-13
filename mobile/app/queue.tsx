import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAddToPlaylist } from "../src/components/AddToPlaylistSheet";
import { TrackRow } from "../src/components/TrackRow";
import { Button, EmptyState, Eyebrow, IconButton } from "../src/components/ui";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { reasonText } from "../src/lib/recommender";
import { DISCOVERY_ID, usePlayerStore } from "../src/store/usePlayerStore";

/**
 * Sıra — masaüstü `QueuePanel`: çalan, sıradakiler (atla, çıkar, yer
 * değiştir), öneri rozetleri; Keşfet'te "başka tarz" ve listeye kaydet.
 */
export default function QueueScreen() {
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);
  const discovery = usePlayerStore((s) => s.radioActive && s.radioPlaylistId === DISCOVERY_ID);
  const smart = usePlayerStore((s) => s.shuffleMode === "smart");
  const discovering = usePlayerStore((s) => s.discovering);
  const seeds = usePlayerStore((s) => s.discoverySeedArtists);
  const [editing, setEditing] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const upcoming = queue.slice(index + 1);
  const past = queue.slice(0, Math.max(0, index));

  return (
    <View className="bg-bg flex-1" style={{ paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center px-2">
        <IconButton name="chevronDown" label={t("common.close")} size={26} onPress={() => router.back()} />
        <Text className="text-text ml-1 flex-1 text-[17px]" style={{ fontFamily: "Archivo_700Bold" }}>
          {t("queue.title")}
        </Text>
        {upcoming.length > 1 ? (
          <IconButton name={editing ? "check" : "grip"} label={t("m.playlist.reorder")} active={editing} onPress={() => setEditing((v) => !v)} />
        ) : null}
        {queue.length ? (
          <IconButton name="listPlus" label={t("discover.saveQueue")} onPress={() => useAddToPlaylist.getState().open(queue)} />
        ) : null}
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={(i) => i.uid}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 4 }}
        ListHeaderComponent={
          <View>
            {discovery ? (
              <View className="flex-row items-center px-4 pb-3">
                <Text className="text-muted flex-1 text-[12px]" numberOfLines={2}>
                  {seeds.length ? t("queue.styleOf", { artists: seeds.slice(0, 3).join(", ") }) : t("queue.rerollHint")}
                </Text>
                <Button small kind="secondary" icon="refresh" label={t("queue.reroll")} busy={discovering} onPress={() => void usePlayerStore.getState().rerollDiscovery()} />
              </View>
            ) : smart ? (
              <Text className="text-muted px-4 pb-3 text-[12px]">{t("player.shuffleSmart")}</Text>
            ) : null}

            {past.length ? (
              <View className="px-4 pb-1">
                <Text onPress={() => setShowPast((v) => !v)} className="text-muted py-2 text-[12px] underline">
                  {showPast ? t("m.queue.hidePast") : t("m.queue.showPast", { n: past.length })}
                </Text>
              </View>
            ) : null}
            {showPast
              ? past.map((item, i) => (
                  <TrackRow key={item.uid} track={item} dim onPress={() => void usePlayerStore.getState().jumpTo(i)} />
                ))
              : null}

            {current ? (
              <View className="pt-2">
                <View className="px-4">
                  <Eyebrow accent>{t("queue.nowPlaying")}</Eyebrow>
                </View>
                <TrackRow track={current} onPress={() => router.push("/player")} />
              </View>
            ) : null}
            <View className="px-4 pt-4">
              <Eyebrow>{upcoming.length ? t("queue.upcomingCount", { count: upcoming.length }) : t("queue.upcoming")}</Eyebrow>
            </View>
          </View>
        }
        renderItem={({ item, index: i }) => (
          <TrackRow
            track={item}
            note={item.isProbe ? `◆ ${t("discover.probe")}` : item.recReason ? `${t("queue.pickBadge")} · ${reasonText(item.recReason, lang)}` : undefined}
            sheet={editing ? false : { queueUid: item.uid }}
            onPress={() => void usePlayerStore.getState().jumpTo(index + 1 + i)}
            right={
              editing ? (
                <View className="flex-row">
                  <IconButton name="chevronUp" label="↑" size={18} disabled={i === 0} onPress={() => usePlayerStore.getState().moveInQueue(index + 1 + i, index + i)} />
                  <IconButton
                    name="chevronDown"
                    label="↓"
                    size={18}
                    disabled={i === upcoming.length - 1}
                    onPress={() => usePlayerStore.getState().moveInQueue(index + 1 + i, index + 2 + i)}
                  />
                  <IconButton name="x" label={t("queue.remove")} size={18} onPress={() => usePlayerStore.getState().removeFromQueue(item.uid)} />
                </View>
              ) : undefined
            }
          />
        )}
        ListEmptyComponent={<EmptyState text={queue.length ? t("queue.noMore") : t("queue.empty")} />}
      />
    </View>
  );
}
