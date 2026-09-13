import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon, type IconName } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { Sheet } from "../../src/components/Sheet";
import { Button, EmptyState, IconButton, Mosaic, Section } from "../../src/components/ui";
import { useCovers } from "../../src/store/useCovers";
import { getDb } from "../../src/lib/db";
import { count } from "../../src/lib/fmt";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { SMART_LISTS } from "../../src/lib/smartLists";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useToastStore } from "../../src/store/useToastStore";
import { useColors } from "../../src/theme";

/**
 * Kütüphane — masaüstü `LibraryView` + kenar çubuğunun liste bölümü:
 * listeler, akıllı listeler, indirilenler, telefondaki müzikler, içe aktarma.
 */
export default function Library() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(true);
  const playlists = usePlaylistStore((s) => s.playlists);
  const downloadedCount = useDownloadStore((s) => s.downloaded.size);
  const covers = useCovers((s) => s.covers);
  const [trackTotal, setTrackTotal] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useFocusEffect(
    useCallback(() => {
      void usePlaylistStore.getState().refresh();
      void useCovers.getState().refresh();
      void (async () => {
        const db = await getDb();
        const rows = await db.select<{ n: number }[]>(
          `SELECT COUNT(DISTINCT track_id) AS n FROM playlist_tracks WHERE deleted = 0`
        );
        setTrackTotal(rows[0]?.n ?? 0);
      })();
    }, [])
  );

  async function create() {
    const n = name.trim();
    if (!n) return;
    const p = await usePlaylistStore.getState().create(n);
    setCreating(false);
    setName("");
    if (p) {
      useToastStore.getState().show(t("toast.playlistCreated", { name: n }), "success");
      router.push({ pathname: "/playlist/[id]", params: { id: p.id } });
    }
  }

  return (
    <ScrollView className="bg-bg flex-1" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottom }}>
      <View className="flex-row items-center px-5">
        <View className="flex-1">
          <Text className="text-text text-[30px] leading-[34px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
            {t("library.title")}
          </Text>
          <Text className="text-muted mt-1 text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {`${t("playlist.trackCount", { count: count(trackTotal, lang) })} · ${playlists.length} ${t("m.library.lists")}`}
          </Text>
        </View>
        <IconButton name="plus" label={t("library.newList")} onPress={() => setCreating(true)} />
      </View>

      <View className="mt-5 flex-row flex-wrap gap-2.5 px-5">
        <Tile icon="download" label={t("nav.downloads")} value={String(downloadedCount)} onPress={() => router.push("/downloads")} />
        <Tile icon="phone" label={t("m.library.onDevice")} onPress={() => router.push("/local")} />
        <Tile icon="fileDown" label={t("nav.import")} onPress={() => router.push("/import")} />
        <Tile icon="chart" label={t("profile.stats")} onPress={() => router.push("/stats")} />
      </View>

      <Section title={t("nav.playlists")} action={t("library.newList")} onAction={() => setCreating(true)}>
        {playlists.length ? (
          playlists.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: "/playlist/[id]", params: { id: p.id } })}
              android_ripple={{ color: c.surface2 }}
              className="flex-row items-center px-5 py-2.5"
            >
              <Mosaic uris={covers[p.id]} size={56} radius={12} />
              <View className="ml-3.5 flex-1">
                <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text className="text-faint mt-0.5 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {t("playlist.trackCount", { count: p.trackCount ?? 0 })}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={c.faint} />
            </Pressable>
          ))
        ) : (
          <EmptyState text={t("library.emptyState")} action={t("library.newList")} onAction={() => setCreating(true)} />
        )}
      </Section>

      <Section title={t("smart.header")}>
        <Text className="text-muted -mt-1 mb-2 px-5 text-[12px]">{t("smart.headerDesc")}</Text>
        {SMART_LISTS.map((l) => (
          <Pressable
            key={l.id}
            onPress={() => router.push({ pathname: "/smart/[id]", params: { id: l.id } })}
            android_ripple={{ color: c.surface2 }}
            className="flex-row items-center px-5 py-2.5"
          >
            <View className="bg-surface-2 h-11 w-11 items-center justify-center rounded-xl">
              <Icon name="wand" size={18} color={c.accent} />
            </View>
            <View className="ml-3.5 flex-1">
              <Text className="text-text text-[14px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                {t(l.labelKey)}
              </Text>
              <Text className="text-muted text-[12px]" numberOfLines={1}>
                {t(l.descKey)}
              </Text>
            </View>
          </Pressable>
        ))}
      </Section>

      <Sheet visible={creating} onClose={() => setCreating(false)} title={t("library.newList")}>
        <View className="flex-row items-center gap-2 px-5 pb-4 pt-1">
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            placeholder={t("playlist.untitled")}
            placeholderTextColor={c.faint}
            returnKeyType="done"
            onSubmitEditing={create}
            className="bg-bg border-border text-text h-12 flex-1 rounded-full border px-4 text-[15px]"
          />
          <Button kind="primary" label={t("m.common.create")} onPress={create} disabled={!name.trim()} />
        </View>
      </Sheet>
    </ScrollView>
  );
}

function Tile({ icon, label, value, onPress }: { icon: IconName; label: string; value?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface border-border flex-row items-center rounded-2xl border px-3.5 py-3 active:opacity-80"
      style={{ width: "48.5%" }}
    >
      <Icon name={icon} size={18} color={c.accent} />
      <Text className="text-text ml-2.5 flex-1 text-[13px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
        {label}
      </Text>
      {value ? (
        <Text className="text-muted text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          {value}
        </Text>
      ) : null}
    </Pressable>
  );
}
