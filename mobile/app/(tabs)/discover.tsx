import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BarMark } from "../../src/components/BarMark";
import { Icon } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { TrackRow } from "../../src/components/TrackRow";
import { Artwork, Button, Card, Chip, EmptyState, Eyebrow } from "../../src/components/ui";
import { blockArtist } from "../../src/lib/blocked";
import type { DiscoverySession } from "../../src/lib/discoverySession";
import { ago, date } from "../../src/lib/fmt";
import { DISCOVERY_FILTERS } from "../../src/lib/filters";
import { hapticSuccess } from "../../src/lib/haptics";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { topStyles } from "../../src/lib/mood";
import { reasonText } from "../../src/lib/recommender";
import { labelsForArtists, loadTags } from "../../src/lib/tags";
import { usePlayback } from "../../src/store/usePlayback";
import { DISCOVERY_ID, usePlayerStore } from "../../src/store/usePlayerStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useToastStore } from "../../src/store/useToastStore";
import { savePlaylistFromTracks } from "../../src/lib/playlists";
import { useColors } from "../../src/theme";

/**
 * Keşfet — masaüstü `DiscoverView`: zevkini ve o anki modunu öğrenen sonsuz
 * keşif. Tür/ruh hali filtreleri, tarz kilidi, "böyle devam et", mod testi,
 * sırayı listeye kaydetme.
 */
export default function Discover() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(true);
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const current = usePlayerStore((s) => s.current);
  const active = usePlayerStore((s) => s.radioActive && s.radioPlaylistId === DISCOVERY_ID);
  const discovering = usePlayerStore((s) => s.discovering);
  const activeFilters = usePlayerStore((s) => s.discoveryFilters);
  const locked = usePlayerStore((s) => s.lockedSeedArtist);
  const seeds = usePlayerStore((s) => s.discoverySeedArtists);
  const error = usePlayerStore((s) => s.error);
  const saved = usePlayerStore((s) => s.savedDiscovery);
  const playing = usePlayback((s) => s.playing);
  const [draft, setDraft] = useState<string[]>(activeFilters);
  const [filtersOpen, setFiltersOpen] = useState(!active && !saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadTags();
  }, []);
  useEffect(() => setDraft(activeFilters), [activeFilters]);

  const moods = useMemo(() => DISCOVERY_FILTERS.filter((f) => f.kind === "mood"), []);
  const genres = useMemo(() => DISCOVERY_FILTERS.filter((f) => f.kind === "genre"), []);
  const upcoming = active ? queue.slice(index + 1) : [];
  // Sanatçı adı yerine anlaşılır etiket ("sakin · rock") — etiket henüz
  // birikmediyse sanatçı adına düşülür (masaüstüyle aynı dürüstlük kuralı).
  const moodArtists = topStyles(3);
  const moodLabels = labelsForArtists(moodArtists);
  const mood = moodLabels.length ? moodLabels : moodArtists;
  const dirty = draft.length !== activeFilters.length || draft.some((f) => !activeFilters.includes(f));

  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  async function apply(ids: string[]) {
    setDraft(ids);
    setFiltersOpen(false);
    usePlayerStore.getState().setDiscoveryFilters(ids);
    await usePlayerStore.getState().startDiscovery({ force: true });
  }

  async function saveQueue() {
    if (!queue.length || saving) return;
    setSaving(true);
    try {
      const label = activeFilters
        .map((id) => DISCOVERY_FILTERS.find((f) => f.id === id))
        .filter(Boolean)
        .map((f) => t(f!.labelKey))
        .join(" · ");
      const name = `${t("discover.savedName")} — ${label || date(Date.now(), lang)}`;
      const { added } = await savePlaylistFromTracks(name, queue);
      await usePlaylistStore.getState().refresh();
      hapticSuccess();
      useToastStore.getState().show(t("discover.saveQueueDone", { count: added, name }), "success");
    } catch (e) {
      console.error("[keşfet] kuyruk kaydedilemedi:", e);
      useToastStore.getState().show(t("discover.saveQueueFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView className="bg-bg flex-1" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottom }}>
      <View className="flex-row items-end px-5">
        <View className="flex-1">
          <Eyebrow>{active ? t("m.discover.live") : t("discover.subtitle")}</Eyebrow>
          <Text className="text-text mt-1 text-[30px] leading-[34px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
            {t("discover.title")}
          </Text>
        </View>
        {active && queue.length ? (
          <Button small kind="ghost" icon="listPlus" label={t("discover.saveQueue")} busy={saving} onPress={saveQueue} />
        ) : null}
      </View>

      {mood.length ? (
        <Text className="text-muted mt-2 px-5 text-[13px]" numberOfLines={2}>
          {t("discover.moodNow", { styles: mood.join(" · ") })}
        </Text>
      ) : null}

      {/* Filtreler */}
      <View className="px-5 pt-5">
        <Card>
          <Pressable onPress={() => setFiltersOpen((v) => !v)} className="flex-row items-center px-4 py-3.5">
            <Icon name="sliders" size={18} color={draft.length ? c.accent : c.muted} />
            <Text className="text-text ml-3 flex-1 text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }}>
              {t("discover.filters")}
            </Text>
            <Text className="text-muted mr-2 text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              {draft.length ? t("discover.filtersActive", { count: draft.length }) : t("discover.filtersNone")}
            </Text>
            <Icon name={filtersOpen ? "chevronUp" : "chevronDown"} size={18} color={c.faint} />
          </Pressable>
          {!filtersOpen && draft.length ? (
            <Text className="text-accent -mt-1 px-4 pb-3 text-[12px]" numberOfLines={1}>
              {draft
                .map((id) => DISCOVERY_FILTERS.find((f) => f.id === id))
                .filter(Boolean)
                .map((f) => t(f!.labelKey))
                .join(" · ")}
            </Text>
          ) : null}
          {filtersOpen ? (
            <View className="px-4 pb-4">
              <FilterGroup title={t("discover.moodGroup")} items={moods} selected={draft} onToggle={toggle} />
              <FilterGroup title={t("discover.genreGroup")} items={genres} selected={draft} onToggle={toggle} />
              <Text className="text-faint mt-3 text-[12px] leading-[17px]">
                {draft.length ? t("discover.filterHint", { count: draft.length }) : t("discover.noFilterHint")}
              </Text>
              {draft.length ? (
                <Pressable onPress={() => setDraft([])} className="mt-2 self-start" hitSlop={8}>
                  <Text className="text-muted text-[12px] underline">{t("discover.clear")}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </Card>
      </View>

      <View className="flex-row gap-2 px-5 pt-3">
        {/* ⭐ İKİ DÜĞME BİRBİRİNİ DIŞLAR (masaüstü v1.8.0): "Rastgele" tanımı
            gereği FİLTRESİZDİR; filtre seçiliyken basılırsa seçim sessizce
            çöpe gidiyordu. */}
        <Button
          kind="secondary"
          icon="shuffle"
          label={t("discover.random")}
          disabled={discovering || draft.length > 0}
          onPress={() => void apply([])}
          className="flex-1"
        />
        <Button
          kind={draft.length || (!active && !saved) ? "primary" : "secondary"}
          icon="compass"
          label={
            active && !dirty
              ? t("discover.apply")
              : draft.length
                ? t("discover.apply")
                : saved && !active
                  ? t("m.discover.newBatch")
                  : t("discover.start")
          }
          busy={discovering}
          onPress={() => {
            if (!draft.length && !active) return void apply([]);
            if (!draft.length) {
              setFiltersOpen(true);
              useToastStore.getState().show(t("discover.pickFilterFirst"), "info");
              return;
            }
            void apply(draft);
          }}
          className="flex-1"
        />
      </View>

      {error && !active ? <Text className="text-down mt-3 px-5 text-[12px]">{error}</Text> : null}

      {!active && saved ? <SavedDiscovery session={saved} /> : null}

      {active && current ? (
        <View className="px-5 pt-6">
          <Eyebrow>{t("discover.nowPlaying")}</Eyebrow>
          <Card className="mt-2" onPress={() => router.push("/player")}>
            <View className="flex-row items-center p-3.5">
              <Artwork uri={current.thumbnail} size={64} radius={10} />
              <View className="ml-3.5 flex-1">
                <View className="flex-row items-center">
                  <BarMark size={10} alive={playing} />
                  <Text className="text-accent ml-1.5 flex-1 text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium" }} numberOfLines={1}>
                    {current.isProbe ? t("discover.probe") : reasonText(current.recReason, lang)}
                  </Text>
                </View>
                <Text className="text-text mt-1 text-[16px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                  {current.title}
                </Text>
                <Text className="text-muted text-[13px]" numberOfLines={1}>
                  {current.artist}
                </Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
              <Chip icon="radio" label={t("discover.moreLike")} onPress={() => void usePlayerStore.getState().moreLikeThis(current)} />
              <Chip icon="refresh" label={t("queue.reroll")} onPress={() => void usePlayerStore.getState().rerollDiscovery()} />
              <Chip
                icon="lock"
                label={t("m.discover.lock")}
                active={!!locked && locked === (current.seedArtist ?? current.artist).toLowerCase()}
                onPress={() => usePlayerStore.getState().setLockedSeedArtist(current.seedArtist ?? current.artist)}
              />
              <Chip
                icon="ban"
                tone="down"
                label={t("taste.block")}
                onPress={async () => {
                  const artist = current.artist;
                  await blockArtist(artist);
                  useToastStore.getState().show(t("discover.blocked", { artist }), "info");
                  await usePlayerStore.getState().next("next");
                }}
              />
            </ScrollView>
          </Card>
          {locked ? (
            <View className="mt-3 flex-row items-center">
              <Icon name="lock" size={13} color={c.accent} />
              <Text className="text-accent ml-1.5 text-[12px]">{t("discover.lockedOn", { artist: locked })}</Text>
              <Pressable onPress={() => usePlayerStore.getState().setLockedSeedArtist(null)} hitSlop={8} className="ml-2">
                <Text className="text-muted text-[12px] underline">{t("discover.unlock")}</Text>
              </Pressable>
            </View>
          ) : seeds.length ? (
            <Text className="text-faint mt-3 text-[12px]" numberOfLines={1}>
              {t("queue.styleOf", { artists: seeds.slice(0, 3).join(", ") })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {upcoming.length ? (
        <View className="pt-6">
          <View className="px-5">
            <Eyebrow>{`${t("discover.upNext")} · ${upcoming.length}`}</Eyebrow>
          </View>
          <View className="mt-1 px-1">
            {upcoming.slice(0, 30).map((item, i) => (
              <TrackRow
                key={item.uid}
                track={item}
                note={item.isProbe ? `◆ ${t("discover.probe")}` : reasonText(item.recReason, lang)}
                sheet={{ queueUid: item.uid }}
                onPress={() => void usePlayerStore.getState().jumpTo(index + 1 + i)}
              />
            ))}
          </View>
        </View>
      ) : !active && !saved ? (
        <EmptyState text={t("discover.empty")} />
      ) : null}
    </ScrollView>
  );
}

/**
 * Kenara konmuş keşif (Keşfet çalarken listeden başka şarkı açıldı): parti
 * silinmez; buradan kaldığı şarkıdan ve saniyeden ya da seçilen şarkıdan sürer.
 */
function SavedDiscovery({ session }: { session: DiscoverySession }) {
  const t = useT();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const cur = session.queue[session.index];
  const upcoming = session.queue.slice(session.index + 1);
  const filters = session.filters
    .map((id) => DISCOVERY_FILTERS.find((f) => f.id === id))
    .filter(Boolean)
    .map((f) => t(f!.labelKey))
    .join(" · ");

  async function resume(at?: number) {
    setBusy(true);
    try {
      await usePlayerStore.getState().resumeDiscovery(at);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <View className="px-5 pt-6">
        <Eyebrow>{t("m.discover.saved")}</Eyebrow>
        <Card className="mt-2">
          <View className="flex-row items-center p-3.5">
            <Artwork uri={cur?.thumbnail} size={64} radius={10} />
            <View className="ml-3.5 flex-1">
              <Text className="text-accent text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium" }} numberOfLines={1}>
                {cur?.isProbe ? t("discover.probe") : reasonText(cur?.recReason, lang)}
              </Text>
              <Text className="text-text mt-1 text-[16px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                {cur?.title}
              </Text>
              <Text className="text-muted text-[13px]" numberOfLines={1}>
                {cur?.artist}
              </Text>
            </View>
          </View>
          <View className="px-3.5 pb-3.5">
            <Text className="text-faint text-[12px]" numberOfLines={2}>
              {[
                t("m.discover.savedMeta", { n: upcoming.length, ago: ago(session.savedAt, lang) }),
                filters,
                session.lockedSeedArtist ? t("discover.lockedOn", { artist: session.lockedSeedArtist }) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <Button
              kind="primary"
              icon="play"
              label={t("m.discover.resume")}
              busy={busy}
              onPress={() => void resume()}
              className="mt-3 self-start"
            />
          </View>
        </Card>
        <Text className="text-faint mt-2 text-[12px] leading-[17px]">{t("m.discover.savedHint")}</Text>
      </View>
      {upcoming.length ? (
        <View className="pt-6">
          <View className="px-5">
            <Eyebrow>{`${t("discover.upNext")} · ${upcoming.length}`}</Eyebrow>
          </View>
          <View className="mt-1 px-1">
            {upcoming.slice(0, 30).map((item, i) => (
              <TrackRow
                key={item.uid}
                track={item}
                note={item.isProbe ? `◆ ${t("discover.probe")}` : reasonText(item.recReason, lang)}
                onPress={() => void resume(session.index + 1 + i)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function FilterGroup({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: typeof DISCOVERY_FILTERS;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const t = useT();
  return (
    <View className="mt-2">
      <View className="mb-2 mt-1">
        <Eyebrow>{title}</Eyebrow>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {items.map((f) => (
          <Chip key={f.id} label={t(f.labelKey)} active={selected.includes(f.id)} onPress={() => onToggle(f.id)} />
        ))}
      </View>
    </View>
  );
}
