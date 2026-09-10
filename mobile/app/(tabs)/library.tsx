import { Link, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, Text, View } from "react-native";

import { Eyebrow } from "../../src/components/TrackRow";
import { t } from "../../src/lib/i18n";
import { SMART_LISTS } from "../../src/lib/smartLists";
import { getDb } from "../../src/lib/db";
import { deletePlaylist } from "../../src/lib/playlists";
import { useToastStore } from "../../src/store/useToastStore";
import { COLORS } from "../../src/theme";

interface PlaylistRow {
  id: string;
  name: string;
  track_count: number;
}

/** Kütüphane — senkronla gelen listeler. Uzun basış: listeyi sil. */
export default function Library() {
  const [rows, setRows] = useState<PlaylistRow[]>([]);
  const [trackCount, setTrackCount] = useState(0);
  const show = useToastStore((s) => s.show);

  const load = useCallback(async () => {
    const db = await getDb();
    // ⚠️ Tombstone: her okuma `deleted = 0` filtreler.
    setRows(
      await db.select<PlaylistRow[]>(
        `SELECT p.id, p.name,
                (SELECT COUNT(*) FROM playlist_tracks pt
                  WHERE pt.playlist_id = p.id AND pt.deleted = 0) AS track_count
         FROM playlists p WHERE p.deleted = 0 ORDER BY p.name COLLATE NOCASE`
      )
    );
    const totals = await db.select<{ n: number }[]>(`SELECT COUNT(*) AS n FROM tracks`);
    setTrackCount(totals[0]?.n ?? 0);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  function confirmDelete(row: PlaylistRow) {
    Alert.alert("Listeyi sil", `"${row.name}" silinsin mi? Bu değişiklik diğer cihaza da gider.`, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: async () => {
          await deletePlaylist(row.id);
          show(`"${row.name}" silindi`, "info");
          await load();
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-bg px-5">
      <View className="flex-row items-center justify-between">
        <Eyebrow>{`${rows.length} liste · ${trackCount} parça`}</Eyebrow>
        <Link href="/import" asChild>
          <Pressable hitSlop={10} className="h-7 justify-center rounded-full border border-border px-3">
            <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              İçe aktar
            </Text>
          </Pressable>
        </Link>
      </View>

      {/* Akıllı listeler: dinleme geçmişinden türer, kalıcı satır yazmaz. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="mt-3 max-h-11 grow-0"
        contentContainerStyle={{ gap: 8 }}
      >
        {SMART_LISTS.map((list) => (
          <Link key={list.id} href={{ pathname: "/smart/[id]", params: { id: list.id } }} asChild>
            <Pressable className="h-10 justify-center rounded-full border border-border px-4">
              <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                {t(list.labelKey)}
              </Text>
            </Pressable>
          </Link>
        ))}
      </ScrollView>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        className="mt-4"
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <Text className="text-muted mt-10 text-sm leading-5">
            Liste yok. Hesabına giriş yaptıysan senkron listelerini getirecek; ⚙ → Hesap &
            senkron'dan durumu görebilirsin.
          </Text>
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: "/playlist/[id]", params: { id: item.id } }} asChild>
            <Pressable
              onLongPress={() => confirmDelete(item)}
              android_ripple={{ color: COLORS.surface2 }}
              className="flex-row items-center justify-between border-b border-border py-4"
            >
              <View className="flex-1 pr-3">
                <Text
                  className="text-text text-base"
                  style={{ fontFamily: "Archivo_700Bold" }}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text
                  className="text-faint mt-1 text-[11px]"
                  style={{ fontFamily: "JetBrainsMono_400Regular" }}
                >
                  {item.track_count} parça
                </Text>
              </View>
              <Text className="text-faint text-base">›</Text>
            </Pressable>
          </Link>
        )}
      />
      {rows.length ? (
        <Text className="text-faint pb-3 text-[10px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          uzun bas → sil
        </Text>
      ) : null}
    </View>
  );
}
