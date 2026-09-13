import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { create } from "zustand";

import { hapticSuccess } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { usePlaylistStore } from "../store/usePlaylistStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import type { Track } from "../types";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { useCovers } from "../store/useCovers";
import { Button, Mosaic } from "./ui";

interface PickerState {
  /** Tek parça ya da (Keşfet sırasını kaydet gibi) birden çok parça. */
  tracks: Track[];
  open: (track: Track | Track[]) => void;
  close: () => void;
}

export const useAddToPlaylist = create<PickerState>((set) => ({
  tracks: [],
  open: (track) => set({ tracks: Array.isArray(track) ? track : [track] }),
  close: () => set({ tracks: [] }),
}));

/** "Listeye ekle" — var olan listeye ya da adını yazıp yeni listeye. */
export function AddToPlaylistSheet() {
  const { tracks, close } = useAddToPlaylist();
  const t = useT();
  const c = useColors();
  const playlists = usePlaylistStore((s) => s.playlists);
  const covers = useCovers((s) => s.covers);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const show = useToastStore((s) => s.show);
  const visible = tracks.length > 0;

  useEffect(() => {
    if (!visible) return;
    setName(""); // ⚠️ önceki açılışın adı birikiyordu
    void usePlaylistStore.getState().refresh();
  }, [visible]);

  async function addAll(playlistId: string, playlistName: string) {
    if (busy) return;
    setBusy(true);
    try {
      let added = 0;
      for (const tr of tracks) {
        if (await usePlaylistStore.getState().addTrack(playlistId, tr)) added++;
      }
      hapticSuccess();
      show(
        tracks.length === 1
          ? t("toast.addedToPlaylist", { name: playlistName })
          : t("discover.saveQueueDone", { count: added, name: playlistName }),
        "success"
      );
      close();
    } catch (e) {
      show(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      const created = await usePlaylistStore.getState().create(n);
      setBusy(false);
      if (created) await addAll(created.id, n);
    } catch (e) {
      show(e instanceof Error ? e.message : String(e), "error");
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={close} title={t("addTo.title")} scroll>
      <Text className="text-muted -mt-1 px-5 pb-3 text-[12px]" numberOfLines={1}>
        {tracks.length === 1 ? tracks[0].title : t("m.addTo.count", { count: tracks.length })}
      </Text>
      <View className="flex-row items-center gap-2 px-5 pb-3">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("addTo.newList")}
          placeholderTextColor={c.faint}
          returnKeyType="done"
          onSubmitEditing={createAndAdd}
          className="bg-bg border-border text-text h-11 flex-1 rounded-full border px-4 text-[14px]"
          style={{ fontFamily: "Inter_400Regular" }}
        />
        <Button label={t("m.common.create")} kind="primary" small onPress={createAndAdd} disabled={!name.trim()} busy={busy} />
      </View>
      {playlists.map((p) => (
        <Pressable
          key={p.id}
          disabled={busy}
          onPress={() => addAll(p.id, p.name)}
          android_ripple={{ color: c.surface3 }}
          className="min-h-[52px] flex-row items-center px-5 py-2"
        >
          <Mosaic uris={covers[p.id]} size={40} radius={8} />
          <View className="ml-3 flex-1">
            <Text className="text-text text-[14px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
              {p.name}
            </Text>
            <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              {t("playlist.trackCount", { count: p.trackCount ?? 0 })}
            </Text>
          </View>
        </Pressable>
      ))}
    </Sheet>
  );
}
