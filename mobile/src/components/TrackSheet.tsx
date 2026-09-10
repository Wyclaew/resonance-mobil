import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, Share, Text, View } from "react-native";
import { create } from "zustand";

import { getTrackStats, type TrackStats } from "../lib/history";
import { encodePlaylist } from "../lib/share";
import { bestThumb } from "../lib/thumbs";
import { useAddToPlaylist } from "./AddToPlaylistSheet";
import { useDownloadStore } from "../store/useDownloadStore";
import { useToastStore } from "../store/useToastStore";
import { COLORS } from "../theme";
import type { Track } from "../types";

/**
 * Parça sayfası — herhangi bir satıra UZUN BASINCA açılır.
 * Masaüstündeki `TrackDetail` + sağ tık menüsünün mobil karşılığı.
 */
interface SheetState {
  track: Track | null;
  open: (track: Track) => void;
  close: () => void;
}

export const useTrackSheet = create<SheetState>((set) => ({
  track: null,
  open: (track) => set({ track }),
  close: () => set({ track: null }),
}));

const hm = (ms: number) => {
  const mins = Math.round(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)} sa ${mins % 60} dk` : `${mins} dk`;
};

export function TrackSheet() {
  const { track, close } = useTrackSheet();
  const [stats, setStats] = useState<TrackStats | null>(null);
  const show = useToastStore((s) => s.show);

  useEffect(() => {
    if (!track) {
      setStats(null);
      return;
    }
    void getTrackStats(track.id, track.durationMs).then(setStats).catch(() => setStats(null));
  }, [track]);

  if (!track) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={close}>
        <Pressable className="rounded-t-lg border-t border-border bg-surface px-5 pb-10 pt-5">
          <View className="flex-row items-center gap-3">
            <Image
              source={{ uri: bestThumb(track.thumbnail, 240) }}
              style={{ width: 56, height: 56, borderRadius: 3, backgroundColor: COLORS.surface2 }}
              contentFit="cover"
            />
            <View className="flex-1">
              <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>
                {track.title}
              </Text>
              <Text className="text-muted text-xs" numberOfLines={1}>
                {track.artist}
              </Text>
            </View>
          </View>

          {stats ? (
            <View className="mt-4 flex-row justify-between rounded border border-border px-4 py-3">
              <Stat label="çalma" value={String(stats.plays)} />
              <Stat label="tamamlanan" value={String(stats.completed)} />
              <Stat label="atlanan" value={String(stats.skipped)} />
              <Stat label="toplam" value={hm(stats.totalMs)} />
            </View>
          ) : null}

          <Action
            label="Listeye ekle"
            onPress={() => {
              const t = track;
              close();
              useAddToPlaylist.getState().open(t);
            }}
          />
          <Action
            label={`Sanatçı: ${track.artist}`}
            onPress={() => {
              const artist = track.artist;
              close();
              router.push({ pathname: "/artist/[name]", params: { name: artist } });
            }}
          />
          <Action
            label="Çevrimdışı indir"
            onPress={() => {
              void useDownloadStore.getState().enqueue(track);
              close();
            }}
          />
          <Action
            label="Paylaşım kodu gönder"
            onPress={async () => {
              // RSNC1 kodu — masaüstü de aynı kodu okur (`share.ts`).
              const code = encodePlaylist(track.title, [track]);
              close();
              try {
                await Share.share({ message: code });
              } catch {
                show("Paylaşılamadı", "error");
              }
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="items-center">
      <Text className="text-text text-[15px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
        {value}
      </Text>
      <Text className="text-faint mt-0.5 text-[10px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
        {label}
      </Text>
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: COLORS.surface2 }}
      className="mt-2 rounded border border-border px-4 py-3"
    >
      <Text className="text-text text-sm" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
