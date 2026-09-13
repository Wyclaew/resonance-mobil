import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";

import { useAddToPlaylist } from "../src/components/AddToPlaylistSheet";
import { Eyebrow, TrackRow } from "../src/components/TrackRow";
import { useTrackSheet } from "../src/components/TrackSheet";
import { scanLocalAudio } from "../src/lib/localAudio";
import { savePlaylistFromTracks } from "../src/lib/playlists";
import { usePlayerStore } from "../src/store/usePlayerStore";
import { useToastStore } from "../src/store/useToastStore";
import { COLORS } from "../src/theme";
import type { Track } from "../src/types";

const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Telefondaki müzikler. YouTube'da olmayan, kaldırılmış ya da kendi
 * kayıtların — internet gerekmez, veri harcamaz. Öneri motoru bunları da
 * öğrenir: oylar ve dinleme geçmişi normal parçalarla aynı yoldan işler.
 */
export default function LocalMusic() {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const show = useToastStore((s) => s.show);

  async function load() {
    setTracks(null);
    const found = await scanLocalAudio();
    setDenied(found.length === 0);
    setTracks(found);
  }

  useEffect(() => {
    void load();
  }, []);

  const visible = useMemo(() => {
    const q = filter.trim().toLocaleLowerCase("tr");
    if (!tracks || !q) return tracks ?? [];
    return tracks.filter((t) =>
      `${t.title} ${t.artist} ${t.album ?? ""}`.toLocaleLowerCase("tr").includes(q)
    );
  }, [tracks, filter]);

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Telefondaki müzikler",
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Archivo_700Bold", fontSize: 17 },
          headerShadowVisible: false,
        }}
      />

      {tracks === null ? (
        <ActivityIndicator color={COLORS.accent} className="mt-10" />
      ) : denied ? (
        <View className="px-5 pt-6">
          <Text className="text-muted text-sm leading-5">
            Müzik dosyası bulunamadı ya da izin verilmedi. Telefonunda şarkı varsa aşağıdan
            yeniden dene; izin penceresi çıkmazsa Ayarlar → Uygulamalar → Resonance → İzinler'den
            "Müzik ve ses"i aç.
          </Text>
          <Pressable onPress={load} className="mt-4 h-10 items-center justify-center rounded border border-border">
            <Text className="text-muted text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              Yeniden tara
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View className="px-5">
            <View className="flex-row items-center justify-between">
              <Eyebrow>{`${tracks.length} dosya`}</Eyebrow>
              <Pressable
                disabled={saving}
                onPress={async () => {
                  setSaving(true);
                  try {
                    const { added } = await savePlaylistFromTracks("Telefondaki müzikler", visible);
                    show(`"Telefondaki müzikler" listesine ${added} parça eklendi`, "success");
                  } finally {
                    setSaving(false);
                  }
                }}
                className="h-7 justify-center rounded-full border border-border px-3"
              >
                <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {saving ? "aktarılıyor…" : "Listeye aktar"}
                </Text>
              </Pressable>
            </View>
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="dosyalarda ara"
              placeholderTextColor={COLORS.faint}
              selectionColor={COLORS.accent}
              className="mt-3 h-10 rounded border border-border bg-surface px-3 text-text"
              style={{ fontFamily: "Inter_400Regular" }}
            />
          </View>

          <FlatList
            data={visible}
            keyExtractor={(t) => t.id}
            className="mt-2"
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
            renderItem={({ item }) => (
              <TrackRow
                title={item.title}
                artist={item.artist || item.album || "bilinmeyen sanatçı"}
                thumbnail={item.thumbnail}
                meta={mmss(item.durationMs)}
                onPress={() => usePlayerStore.getState().playNow(item, visible)}
                onLongPress={() => useTrackSheet.getState().open(item)}
                right={
                  <Pressable
                    hitSlop={12}
                    onPress={() => useAddToPlaylist.getState().open(item)}
                    className="h-8 w-8 items-center justify-center rounded-full border border-border"
                  >
                    <Text className="text-muted text-sm">＋</Text>
                  </Pressable>
                }
              />
            )}
          />
        </>
      )}
    </View>
  );
}
