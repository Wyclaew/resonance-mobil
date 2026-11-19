import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Keyboard, Pressable, ScrollView, Share, Text, TextInput, View } from "react-native";

import { Icon } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { PlaylistSuggestions } from "../../src/components/PlaylistSuggestions";
import { usePlaylistStyleSheet } from "../../src/components/PlaylistStyleSheet";
import { Sheet, SheetAction } from "../../src/components/Sheet";
import { TrackRow } from "../../src/components/TrackRow";
import { Button, Chip, EmptyState, Eyebrow, IconButton, Mosaic, TopBar } from "../../src/components/ui";
import { useCovers } from "../../src/store/useCovers";
import { duration } from "../../src/lib/fmt";
import { hapticSuccess, hapticWarn } from "../../src/lib/haptics";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { filterById } from "../../src/lib/filters";
import { cooldownRemaining } from "../../src/lib/karma";
import { getProfile, setKeepOffline, usePlaylistProfiles } from "../../src/lib/playlistProfile";
import * as pl from "../../src/lib/playlists";
import { onTracksRepaired } from "../../src/lib/repairTracks";
import { encodePlaylist } from "../../src/lib/share";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useToastStore } from "../../src/store/useToastStore";
import { useColors } from "../../src/theme";
import type { Playlist, PlaylistTrack, Track } from "../../src/types";

type SortKey = "manual" | "recent" | "title" | "artist" | "duration" | "karma";
const SORT_KEYS: SortKey[] = ["manual", "recent", "title", "artist", "duration", "karma"];

/** Görünen sıra: "manual" liste sırasıdır, kopya üzerinde çalışılır. */
function sortTracks(tracks: PlaylistTrack[], key: SortKey, lang: string): PlaylistTrack[] {
  const byText = (a: string, b: string) => a.localeCompare(b, lang);
  switch (key) {
    case "recent":
      return [...tracks].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));
    case "title":
      return [...tracks].sort((a, b) => byText(a.title, b.title));
    case "artist":
      return [...tracks].sort((a, b) => byText(a.artist, b.artist) || byText(a.title, b.title));
    case "duration":
      return [...tracks].sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
    case "karma":
      return [...tracks].sort((a, b) => b.karma - a.karma);
    default:
      return tracks;
  }
}

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
  const [sortKey, setSortKey] = useState<SortKey>("manual");
  const [onlyDownloaded, setOnlyDownloaded] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [reorder, setReorder] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
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
    const sorted = sortTracks(tracks, sortKey, lang);
    const available = onlyDownloaded ? sorted.filter((tr) => tr.source === "local" || downloaded.has(tr.id)) : sorted;
    const q = query.trim().toLowerCase();
    return q ? available.filter((tr) => tr.title.toLowerCase().includes(q) || tr.artist.toLowerCase().includes(q)) : available;
  }, [tracks, sortKey, onlyDownloaded, downloaded, lang, query]);
  const trackIds = useMemo(() => new Set(tracks.map((tr) => tr.id)), [tracks]);
  // Satırlara SABİT geri çağrılar (TrackRow `memo`'su işlesin); güncel liste ref'ten okunur.
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const voteRef = useRef<(track: PlaylistTrack, dir: 1 | -1) => Promise<void>>(async () => {});
  const playItem = useCallback(
    (item: Track) => void usePlayerStore.getState().playNow(item, shownRef.current, id),
    [id]
  );

  // Arama açılınca / sorgu değişince listenin başına dön (sonuçlar görünür kalsın).
  const listRef = useRef<FlatList<PlaylistTrack>>(null);
  const newNameRef = useRef(newName);
  newNameRef.current = newName;
  const nameRef = useRef(playlist?.name);
  nameRef.current = playlist?.name;
  useEffect(() => {
    if (searching) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [searching, query]);

  // Profil depoya etkiyle yüklenir (render sırasında depo güncellenmesin).
  const stored = usePlaylistProfiles((st) => (id ? st.profiles[id] : undefined));
  useEffect(() => {
    if (id) getProfile(id);
  }, [id]);
  const profile = stored ?? { filters: [], styles: [], isolate: true, artists: {}, everyN: 0, blockedCores: [], keepOffline: false };
  const styleLabel = [
    ...profile.styles,
    ...profile.filters.map((f) => {
      const def = filterById(f);
      return def ? t(def.labelKey) : f;
    }),
  ].join(" · ");

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

  voteRef.current = vote;
  const sheetFor = useCallback(
    (tr: Track) => ({ playlistId: id, onRemoved: load, onVote: (dir: 1 | -1) => void voteRef.current(tr as PlaylistTrack, dir) }),
    [id, load]
  );

  async function move(from: number, to: number) {
    if (!id || to < 0 || to >= tracks.length) return;
    const next = [...tracks];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setTracks(next);
    await pl.reorderPlaylist(id, next.map((x) => x.id));
  }

  function startRename() {
    setNewName(playlist?.name ?? "");
    setEditingName(true);
  }

  // Gönder, odak kaybı ve klavyenin kapanması aynı anda gelebilir: ilki kaydeder.
  const commitRename = useCallback(async () => {
    setEditingName(false);
    const n = newNameRef.current.trim();
    if (!id || !n || n === nameRef.current) return;
    nameRef.current = n;
    setPlaylist((p) => (p ? { ...p, name: n } : p));
    await usePlaylistStore.getState().rename(id, n);
    await load();
  }, [id, load]);

  // Android'de geri tuşu klavyeyi kapatır ama odağı bırakmaz → blur gelmez.
  useEffect(() => {
    if (!editingName) return;
    const sub = Keyboard.addListener("keyboardDidHide", () => void commitRename());
    return () => sub.remove();
  }, [editingName, commitRename]);

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
          {editingName ? (
            <TextInput
              autoFocus
              selectTextOnFocus
              value={newName}
              onChangeText={setNewName}
              onBlur={() => void commitRename()}
              onSubmitEditing={() => void commitRename()}
              returnKeyType="done"
              accessibilityLabel={t("playlist.rename")}
              className="text-text border-accent mt-1 border-b text-[24px] leading-[28px]"
              style={{ fontFamily: "Archivo_800ExtraBold", paddingVertical: 0 }}
            />
          ) : (
            <Pressable onPress={startRename} accessibilityRole="button" accessibilityHint={t("playlist.rename")}>
              <Text className="text-text mt-1 text-[24px] leading-[28px]" style={{ fontFamily: "Archivo_800ExtraBold" }} numberOfLines={3}>
                {playlist?.name ?? ""}
              </Text>
            </Pressable>
          )}
          <Text className="text-muted mt-1.5 text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {`${t("playlist.trackCount", { count: tracks.length })} · ${duration(totalMs, lang)}`}
          </Text>
        </View>
      </View>
      {shown.length ? (
        <View className="mt-4 flex-row gap-2">
          <Button
            kind="primary"
            icon="play"
            label={t("playlist.playOrdered")}
            onPress={() => void usePlayerStore.getState().playNow(shown[0], shown, id)}
            className="flex-1"
          />
          <IconButton name="shuffle" label={t("playlist.playShuffled")} onPress={() => void usePlayerStore.getState().playShuffled(shown, id)} />
          {/* Önerili karışık: liste tarzının kullanıldığı yer — simge yerine yazılı düğme
              (yalnız ✦ simgesi bulunmuyordu). */}
          <Button
            kind="secondary"
            icon="sparkles"
            label={t("m.home.smartShuffle")}
            onPress={() => void usePlayerStore.getState().startSmartShuffle(tracks, id!)}
          />
        </View>
      ) : null}
      {/* ⭐ Liste tarzı (kullanıcı isteği): önerili karışıkta öneriler bu tarzdan gelir,
          genel zevk karışmaz. Dokununca `PlaylistStyleSheet`. */}
      {id ? (
        <Pressable
          onPress={() => usePlaylistStyleSheet.getState().open(id, playlist?.name ?? "")}
          android_ripple={{ color: c.surface3 }}
          className="bg-surface border-border mt-3 flex-row items-center rounded-2xl border px-3.5 py-3"
        >
          <Icon name="sliders" size={17} color={styleLabel ? c.accent : c.muted} />
          <View className="ml-3 flex-1">
            <Text className="text-text text-[13px]" style={{ fontFamily: "Inter_600SemiBold" }}>
              {t("m.plStyle.title")}
            </Text>
            <Text className={styleLabel ? "text-accent text-[12px]" : "text-muted text-[12px]"} numberOfLines={1}>
              {(styleLabel || t("m.plStyle.none")) + (profile.isolate ? ` · ${t("m.plStyle.isolatedNote")}` : "")}
            </Text>
          </View>
          <Icon name="chevronRight" size={16} color={c.faint} />
        </Pressable>
      ) : null}
      {tracks.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-5 mt-3" contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <Chip icon="download" label={t("m.sort.downloaded")} active={onlyDownloaded} onPress={() => { setReorder(false); setOnlyDownloaded((v) => !v); }} />
          {SORT_KEYS.map((key) => (
            <Chip key={key} label={t(`m.sort.${key}`)} active={sortKey === key} onPress={() => { setReorder(false); setSortKey(key); }} />
          ))}
        </ScrollView>
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
            <IconButton name="search" label={t("playlist.searchInList")} active={searching} onPress={() => { setReorder(false); setSearching((v) => !v); setQuery(""); }} />
            <IconButton name="more" label={t("playlist.playOptions")} onPress={() => setMenu(true)} />
          </>
        }
      />
      {/* ⛔ BUG'DI (kullanıcı): listenin ortasındayken büyütece basınca ekran bozuluyordu.
          Arama kutusu listenin BAŞLIĞINDAYDI (ekranın çok üstünde): ekran dışındaki kutu
          odaklanıp klavye açılıyor, yazdıkça liste kısalırken kaydırma konumu aşağıda
          kalıyordu → boş/kaymış ekran. Artık kutu üst çubuğun altında sabit, sorgu
          değişince liste başa döner. */}
      {searching ? (
        <View className="flex-row items-center px-4 pb-2">
          <View className="bg-surface-2 h-11 flex-1 flex-row items-center rounded-2xl px-3.5">
            <Icon name="search" size={16} color={c.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t("playlist.searchInList")}
              placeholderTextColor={c.faint}
              autoCorrect={false}
              returnKeyType="search"
              className="text-text ml-2.5 h-11 flex-1 text-[14px]"
              style={{ fontFamily: "Inter_400Regular" }}
            />
            {query ? (
              <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel={t("common.clear")}>
                <Icon name="x" size={16} color={c.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={shown}
        keyExtractor={(tr) => tr.id}
        ListHeaderComponent={searching && query.trim() ? null : header}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
        initialNumToRender={14}
        windowSize={9}
        onEndReached={() => setReachedEnd(true)}
        ListFooterComponent={
          id && tracks.length ? (
            // Aramada/sıralarken GİZLİ ama takılı kalır: yeniden takılınca öneriler sıfırdan çekilmesin.
            <View style={{ display: query.trim() || reorder ? "none" : "flex" }}>
              <PlaylistSuggestions playlistId={id} excludeIds={trackIds} active={reachedEnd} onAdded={() => void load()} />
            </View>
          ) : null
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            karma={item.karma}
            sheet={sheetFor}
            onPressTrack={playItem}
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
              text={
                query
                  ? t("playlist.noMatchFor", { query })
                  : onlyDownloaded
                    ? t("m.sort.noDownloaded")
                    : `${t("playlist.emptyBefore")} ＋ ${t("playlist.emptyAfter")}`
              }
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
        {sortKey === "manual" ? (
          <SheetAction
            icon="grip"
            label={t("m.playlist.reorder")}
            onPress={() => {
              setMenu(false);
              setQuery("");
              setSearching(false);
              setOnlyDownloaded(false);
              setReorder(true);
            }}
          />
        ) : null}
        <SheetAction
          icon="hardDrive"
          label={profile.keepOffline ? t("m.offline.off") : t("m.offline.on")}
          sub={t("m.offline.sub")}
          onPress={() => {
            setMenu(false);
            if (!id) return;
            const on = !profile.keepOffline;
            setKeepOffline(id, on);
            if (on) {
              void useDownloadStore
                .getState()
                .enqueueMany(tracks)
                .then((n) => useToastStore.getState().show(t("m.offline.enabled", { n }), "success"));
            } else {
              useToastStore.getState().show(t("m.offline.disabled"), "info");
            }
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
    </View>
  );
}
