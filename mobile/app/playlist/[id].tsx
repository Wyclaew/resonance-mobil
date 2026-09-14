import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Share, Text, TextInput, View } from "react-native";

import { useBottomSpace } from "../../src/components/MiniPlayer";
import { Sheet, SheetAction } from "../../src/components/Sheet";
import { TrackRow } from "../../src/components/TrackRow";
import { Button, EmptyState, Eyebrow, IconButton, Mosaic, TopBar } from "../../src/components/ui";
import { useCovers } from "../../src/store/useCovers";
import { duration } from "../../src/lib/fmt";
import { hapticSuccess, hapticWarn } from "../../src/lib/haptics";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { cooldownRemaining } from "../../src/lib/karma";
import * as pl from "../../src/lib/playlists";
import { onTracksRepaired } from "../../src/lib/repairTracks";
import { encodePlaylist } from "../../src/lib/share";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useToastStore } from "../../src/store/useToastStore";
import { useColors } from "../../src/theme";
import type { Playlist, PlaylistTrack } from "../../src/types";

/**
 * Çalma listesi — masaüstü `PlaylistView`: sırayla / rastgele / önerili çal,
 * karma ya da elle sıralama, liste içi arama, toplu indirme, yeniden adlandır,
 * paylaşım kodu, sil. Sol raydaki çubuk her satırın karması.
 */
export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sortMode, setSortMode] = useState<"manual" | "karma">("manual");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [reorder, setReorder] = useState(false);
  const downloaded = useDownloadStore((s) => s.downloaded);
  const cover = useCovers((s) => (id ? s.covers[id] : undefined));

  const load = useCallback(async () => {
    if (!id) return;
    const [p, list] = await Promise.all([pl.getPlaylist(id), pl.getPlaylistTracks(id)]);
    setPlaylist(p);
    setTracks(list);
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );
  // Arka planda yer tutucular dolunca açık liste yeniden okunsun (adlar/kapaklar gelsin).
  useEffect(() => onTracksRepaired(() => void load()), [load]);

  const shown = useMemo(() => {
    const sorted = sortMode === "karma" ? [...tracks].sort((a, b) => b.karma - a.karma) : tracks;
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((tr) => tr.title.toLowerCase().includes(q) || tr.artist.toLowerCase().includes(q)) : sorted;
  }, [tracks, sortMode, query]);

  const totalMs = tracks.reduce((a, tr) => a + (tr.durationMs || 0), 0);
  const missing = tracks.filter((tr) => tr.source !== "local" && !downloaded.has(tr.id)).length;

  async function vote(track: PlaylistTrack, dir: 1 | -1) {
    if (!id) return;
    const left = cooldownRemaining(track.lastVoteAt);
    if (left > 0) {
      hapticWarn();
      useToastStore.getState().show(t("karma.cooldown", { mins: Math.ceil(left / 60_000) }), "info");
      return;
    }
    const res = await pl.voteTrack(id, track.id, dir);
    if (!res.ok) return;
    hapticSuccess();
    // Biriken model: taze oyun ağırlığı ≈ 1 → karma += yön (masaüstüyle aynı).
    setTracks((ts) =>
      ts.map((x) => (x.id === track.id ? { ...x, karma: x.karma + dir, lastVoteAt: Date.now(), myVote: dir } : x))
    );
    useToastStore.getState().show(dir > 0 ? t("player.liked") : t("player.disliked"), "info", {
      label: t("player.undo"),
      fn: async () => {
        await pl.undoVote(id, track.id);
        await load();
      },
    });
  }

  async function move(from: number, to: number) {
    if (!id || to < 0 || to >= tracks.length) return;
    const next = [...tracks];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setTracks(next);
    await pl.reorderPlaylist(id, next.map((x) => x.id));
  }

  async function rename() {
    const n = newName.trim();
    if (!id || !n) return;
    await usePlaylistStore.getState().rename(id, n);
    setRenaming(false);
    await load();
  }

  function confirmDelete() {
    if (!id || !playlist) return;
    Alert.alert(t("playlist.deleteConfirmTitle"), t("playlist.deleteConfirmBody", { name: playlist.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("playlist.deleteList"),
        style: "destructive",
        onPress: async () => {
          await usePlaylistStore.getState().remove(id);
          router.back();
        },
      },
    ]);
  }

  const header = (
    <View className="px-5 pb-3">
      <View className="flex-row items-end">
        <Mosaic uris={cover} size={112} radius={14} />
        <View className="ml-4 flex-1">
          <Eyebrow>{playlist?.source === "spotify" ? "Spotify" : playlist?.source === "ytmusic" ? "YouTube Music" : t("playlist.title")}</Eyebrow>
          <Text className="text-text mt-1 text-[24px] leading-[28px]" style={{ fontFamily: "Archivo_800ExtraBold" }} numberOfLines={3}>
            {playlist?.name ?? ""}
          </Text>
          <Text className="text-muted mt-1.5 text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {`${t("playlist.trackCount", { count: tracks.length })} · ${duration(totalMs, lang)}${
              sortMode === "karma" ? ` · ${t("playlist.karma")}` : ""
            }`}
          </Text>
        </View>
      </View>
      {tracks.length ? (
        <View className="mt-4 flex-row gap-2">
          <Button
            kind="primary"
            icon="play"
            label={t("playlist.playOrdered")}
            onPress={() => void usePlayerStore.getState().playNow(shown[0], shown, id)}
            className="flex-1"
          />
          <IconButton name="shuffle" label={t("playlist.playShuffled")} onPress={() => void usePlayerStore.getState().playShuffled(tracks, id)} />
          <IconButton
            name="sparkles"
            label={t("playlist.playSmart")}
            color={c.accent}
            onPress={() => void usePlayerStore.getState().startSmartShuffle(tracks, id!)}
          />
        </View>
      ) : null}
      {searching ? (
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder={t("playlist.searchInList")}
          placeholderTextColor={c.faint}
          className="bg-surface-2 text-text mt-4 h-11 rounded-2xl px-4 text-[14px]"
        />
      ) : null}
      {reorder ? (
        <View className="mt-3 flex-row items-center justify-between">
          <Text className="text-accent text-[12px]">{t("m.playlist.reorderHint")}</Text>
          <Button small kind="secondary" label={t("m.common.done")} onPress={() => setReorder(false)} />
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="bg-bg flex-1">
      <TopBar
        title={playlist?.name}
        right={
          <>
            <IconButton name="search" label={t("playlist.searchInList")} active={searching} onPress={() => { setSearching((v) => !v); setQuery(""); }} />
            <IconButton name="more" label={t("playlist.playOptions")} onPress={() => setMenu(true)} />
          </>
        }
      />
      <FlatList
        data={shown}
        keyExtractor={(tr) => tr.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
        initialNumToRender={14}
        windowSize={9}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            karma={item.karma}
            sheet={{ playlistId: id, onRemoved: load, onVote: (dir) => void vote(item, dir) }}
            onPress={() => void usePlayerStore.getState().playNow(item, shown, id)}
            right={
              reorder ? (
                <View className="flex-row">
                  <IconButton name="chevronUp" label="↑" size={18} disabled={index === 0} onPress={() => void move(index, index - 1)} />
                  <IconButton name="chevronDown" label="↓" size={18} disabled={index === shown.length - 1} onPress={() => void move(index, index + 1)} />
                </View>
              ) : undefined
            }
          />
        )}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              text={query ? t("playlist.noMatchFor", { query }) : `${t("playlist.emptyBefore")} ＋ ${t("playlist.emptyAfter")}`}
            />
          ) : null
        }
      />

      <Sheet visible={menu} onClose={() => setMenu(false)} title={playlist?.name}>
        <SheetAction
          icon="download"
          label={missing ? t("playlist.downloadAllBtn") : t("playlist.allDownloaded")}
          sub={missing ? t("m.playlist.downloadMissing", { n: missing }) : undefined}
          disabled={!missing}
          onPress={async () => {
            setMenu(false);
            const n = await useDownloadStore.getState().enqueueMany(tracks);
            if (n) useToastStore.getState().show(t("m.playlist.downloadQueued", { n }), "info");
          }}
        />
        <SheetAction
          icon="arrowDownUp"
          label={sortMode === "manual" ? t("playlist.sortByKarma") : t("playlist.sortManual")}
          onPress={() => {
            setMenu(false);
            setSortMode((m) => (m === "manual" ? "karma" : "manual"));
            setReorder(false);
          }}
        />
        {sortMode === "manual" ? (
          <SheetAction
            icon="grip"
            label={t("m.playlist.reorder")}
            onPress={() => {
              setMenu(false);
              setQuery("");
              setSearching(false);
              setReorder(true);
            }}
          />
        ) : null}
        <SheetAction
          icon="pencil"
          label={t("playlist.rename")}
          onPress={() => {
            setMenu(false);
            setNewName(playlist?.name ?? "");
            setRenaming(true);
          }}
        />
        <SheetAction
          icon="share"
          label={t("playlist.share")}
          sub={t("playlist.shareDesc")}
          onPress={async () => {
            setMenu(false);
            if (!playlist) return;
            await Share.share({ message: encodePlaylist(playlist.name, tracks) });
          }}
        />
        <SheetAction icon="trash" label={t("playlist.deleteList")} danger onPress={() => { setMenu(false); confirmDelete(); }} />
      </Sheet>

      <Sheet visible={renaming} onClose={() => setRenaming(false)} title={t("playlist.rename")}>
        <View className="flex-row items-center gap-2 px-5 pb-4 pt-1">
          <TextInput
            autoFocus
            value={newName}
            onChangeText={setNewName}
            returnKeyType="done"
            onSubmitEditing={rename}
            className="bg-bg border-border text-text h-12 flex-1 rounded-full border px-4 text-[15px]"
          />
          <Button kind="primary" label={t("m.common.save")} onPress={rename} disabled={!newName.trim()} />
        </View>
      </Sheet>
    </View>
  );
}
