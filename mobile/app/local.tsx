import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, TextInput, View } from "react-native";

import { useBottomSpace } from "../src/components/MiniPlayer";
import { TrackRow } from "../src/components/TrackRow";
import { Button, EmptyState, Eyebrow, TopBar } from "../src/components/ui";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { scanLocalAudio } from "../src/lib/localAudio";
import { date } from "../src/lib/fmt";
import { savePlaylistFromTracks } from "../src/lib/playlists";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { usePlaylistStore } from "../src/store/usePlaylistStore";
import { useToastStore } from "../src/store/useToastStore";
import { useColors } from "../src/theme";
import type { Track } from "../src/types";

/**
 * Telefondaki müzikler (masaüstü İçe Aktar → "Kendi müzik dosyaların").
 * YouTube'da olmayan, kaldırılmış ya da kendi kayıtların — internet gerekmez.
 * Öneri motoru bunları da öğrenir: oy ve dinleme geçmişi aynı yoldan işler.
 */
export default function LocalMusic() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setTracks(null);
    setTracks(await scanLocalAudio());
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase(lang);
    if (!tracks || !q) return tracks ?? [];
    return tracks.filter((tr) => `${tr.title} ${tr.artist} ${tr.album ?? ""}`.toLocaleLowerCase(lang).includes(q));
  }, [tracks, filter, lang]);

  async function saveAll() {
    setSaving(true);
    try {
      const name = t("import.localListName", { date: date(Date.now(), lang) });
      const { added } = await savePlaylistFromTracks(name, visible);
      await usePlaylistStore.getState().refresh();
      useToastStore.getState().show(t("toast.addedToPlaylist", { name }) + ` · ${added}`, "success");
    } catch {
      useToastStore.getState().show(t("import.localFailed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("m.library.onDevice")} />
      {tracks === null ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : !tracks.length ? (
        <View className="px-5 pt-4">
          <EmptyState icon="phone" text={t("m.local.none")} action={t("m.local.rescan")} onAction={load} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(tr) => tr.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
          ListHeaderComponent={
            <View className="px-4 pb-2">
              <Text className="text-muted text-[13px] leading-5">{t("import.localDesc")}</Text>
              <View className="mt-3 flex-row items-center justify-between">
                <Eyebrow>{t("m.local.files", { n: tracks.length })}</Eyebrow>
                <Button small kind="secondary" icon="listPlus" label={t("m.local.toList")} busy={saving} onPress={saveAll} />
              </View>
              <TextInput
                value={filter}
                onChangeText={setFilter}
                placeholder={t("m.local.filter")}
                placeholderTextColor={c.faint}
                className="bg-surface-2 text-text mt-3 h-11 rounded-2xl px-4 text-[14px]"
              />
            </View>
          }
          renderItem={({ item }) => (
            <TrackRow
              track={{ ...item, artist: item.artist || item.album || t("m.local.unknownArtist") }}
              onPress={() => void usePlayerStore.getState().playNow(item, visible)}
            />
          )}
        />
      )}
    </View>
  );
}
