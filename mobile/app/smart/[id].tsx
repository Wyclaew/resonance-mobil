import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";

import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { t } from "../../src/lib/i18n";
import { SMART_LISTS, runSmartList, type SmartListId } from "../../src/lib/smartLists";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { COLORS } from "../../src/theme";
import type { Track } from "../../src/types";

/**
 * Akıllı listeler — dinleme geçmişinden TÜRETİLİR, kalıcı satır yazmaz
 * (senkron yükü sıfır). Masaüstündeki `smartLists.ts` sorgularının aynısı.
 */
export default function SmartList() {
  const { id } = useLocalSearchParams<{ id: SmartListId }>();
  const meta = SMART_LISTS.find((l) => l.id === id);
  const [tracks, setTracks] = useState<Track[] | null>(null);

  useEffect(() => {
    if (!id) return;
    void runSmartList(id).then(setTracks).catch(() => setTracks([]));
  }, [id]);

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen
        options={{
          headerShown: true,
          title: meta ? t(meta.labelKey) : "Liste",
          headerStyle: { backgroundColor: COLORS.bg },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Archivo_700Bold", fontSize: 17 },
          headerShadowVisible: false,
        }}
      />

      <View className="flex-row items-center justify-between px-5 pb-2">
        <View className="flex-1 pr-3">
          {meta ? <Text className="text-muted text-xs leading-4">{t(meta.descKey)}</Text> : null}
        </View>
        {tracks?.length ? (
          <Pressable
            onPress={() => usePlayerStore.getState().playNow(tracks[0], tracks)}
            className="h-8 justify-center rounded-full border border-accent-dim px-3"
          >
            <Text className="text-accent text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              Çal
            </Text>
          </Pressable>
        ) : null}
      </View>

      {tracks === null ? (
        <ActivityIndicator color={COLORS.accent} className="mt-8" />
      ) : (
        <FlatList
          data={tracks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text className="text-muted mt-10 px-4 text-sm">
              Bu liste için yeterli dinleme geçmişi yok.
            </Text>
          }
          renderItem={({ item }) => (
            <TrackRow
              title={item.title}
              artist={item.artist}
              thumbnail={item.thumbnail}
              onPress={() => usePlayerStore.getState().playNow(item, tracks)}
            />
          )}
        />
      )}
    </View>
  );
}
