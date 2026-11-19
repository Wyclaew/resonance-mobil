import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { useT } from "../lib/i18n.mobile";
import { suggestForPlaylist } from "../lib/playlistRadio";
import type { Recommendation } from "../lib/recommender";
import { usePlayerStore } from "../store/usePlayerStore";
import { usePlaylistStore } from "../store/usePlaylistStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import { TrackRow } from "./TrackRow";
import { Button, Eyebrow, IconButton } from "./ui";

const SUGGESTION_COUNT = 6;

/**
 * Liste sonunda "bu listeye önerilenler" — Spotify'ın `assisted_curation` fikri.
 * Kaynak, önerili karışığın kullandığı liste radyosu: tarz atanmışsa o tarzdan,
 * yoksa listedeki şarkılara benzer. Genel zevk karışmaz.
 *
 * ⚠️ Her yükleme birkaç radyo isteği demek: liste sonuna gelinmeden başlamaz
 * (`active`). Sonuçlar `recordRecommended` ile yazılmaz; kabul edilmemiş bir öneri
 * liste radyosunun 14 günlük tekrar engeline takılmasın.
 */
export function PlaylistSuggestions({
  playlistId,
  excludeIds,
  active,
  onAdded,
}: {
  playlistId: string;
  excludeIds: Set<string>;
  active: boolean;
  onAdded: () => void;
}) {
  const c = useColors();
  const t = useT();
  const [items, setItems] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;
  const started = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setItems(await suggestForPlaylist(playlistId, excludeRef.current, SUGGESTION_COUNT));
    } catch (e) {
      console.warn("[liste önerisi] alınamadı:", e);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    void load();
  }, [active, load]);

  async function add(item: Recommendation) {
    const added = await usePlaylistStore.getState().addTrack(playlistId, item);
    setItems((list) => list.filter((x) => x.id !== item.id));
    useToastStore.getState().show(t(added ? "m.suggest.added" : "m.addTo.alreadyHere"), added ? "success" : "info");
    if (added) onAdded();
  }

  const empty = !loading && !items.length;
  return (
    <View className="px-1 pt-5">
      <View className="flex-row items-center px-4 pb-1">
        <View className="flex-1">
          <Eyebrow>{t("m.suggest.title")}</Eyebrow>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={c.muted} />
        ) : (
          <IconButton name="refresh" label={t("m.suggest.refresh")} size={18} onPress={() => void load()} />
        )}
      </View>
      {empty ? (
        <View className="items-start px-4 py-2">
          <Text className="text-muted text-[12px]">{t(failed ? "m.suggest.failed" : "m.suggest.none")}</Text>
          {failed ? (
            <View className="mt-2">
              <Button small kind="secondary" icon="refresh" label={t("m.suggest.refresh")} onPress={() => void load()} />
            </View>
          ) : null}
        </View>
      ) : null}
      {items.map((item) => (
        <TrackRow
          key={item.id}
          track={item}
          sheet={{
            snooze: true,
            suggestedFor: playlistId,
            onSnoozed: () => setItems((list) => list.filter((x) => x.id !== item.id)),
          }}
          onPress={() => void usePlayerStore.getState().playNow(item, items)}
          right={<IconButton name="plus" label={t("addTo.title")} onPress={() => void add(item)} />}
        />
      ))}
    </View>
  );
}
