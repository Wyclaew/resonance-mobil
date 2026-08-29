import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { create } from "zustand";

import { addTrackToPlaylist, createPlaylist, listPlaylists } from "../lib/playlists";
import { useToastStore } from "../store/useToastStore";
import type { Playlist, Track } from "../types";

/**
 * "Listeye ekle" — her ekrandan açılabilsin diye küçük bir store ile sürülür.
 *
 * ⭐ NEDEN ÖNEMLİ (CLAUDE.md, öneri motoru): playlist ÜYELİĞİ öğrenme sinyalidir
 * ("listeme ekledim" = beğeni beyanı) ve `artistAffinity`'yi besler. Masaüstünde
 * bu sinyal havuzu 8 sanatçıdan 183'e çıkarmıştı — "hep aynı tarzı öneriyor"
 * şikâyetinin kök çözümü. Mobilde de aynı tabloya yazıyoruz, senkronla paylaşılır.
 */
interface PickerState {
  track: Track | null;
  open: (track: Track) => void;
  close: () => void;
}

export const useAddToPlaylist = create<PickerState>((set) => ({
  track: null,
  open: (track) => set({ track }),
  close: () => set({ track: null }),
}));

export function AddToPlaylistSheet() {
  const { track, close } = useAddToPlaylist();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    if (!track) return;
    // Modal kapanınca bileşen sökülmüyor → alanı AÇILIŞTA temizle, yoksa
    // önceki denemenin metni birikiyor ("TelefonTelefon").
    setNewName("");
    void listPlaylists().then(setPlaylists);
  }, [track]);

  async function add(playlistId: string, playlistName: string) {
    if (!track || busy) return;
    setBusy(true);
    try {
      // addTrackToPlaylist içeride ensureTrack çağırır (gotcha #13'ün önlemi).
      await addTrackToPlaylist(playlistId, track);
      showToast(`"${playlistName}" listesine eklendi`, "success");
      close();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || !track) return;
    setBusy(true);
    try {
      const created = await createPlaylist(name);
      setNewName("");
      await addTrackToPlaylist(created.id, track);
      showToast(`"${name}" oluşturuldu ve eklendi`, "success");
      close();
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={!!track} animationType="slide" transparent onRequestClose={close}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={close}>
        <Pressable className="max-h-[70%] rounded-t-lg border-t border-border bg-surface px-5 pb-10 pt-5">
          <Text className="text-text text-base font-semibold" numberOfLines={1}>
            Listeye ekle
          </Text>
          <Text className="text-muted mt-1 text-xs" numberOfLines={1}>
            {track?.title}
          </Text>

          <ScrollView className="mt-4">
            {playlists.map((p) => (
              <Pressable
                key={p.id}
                disabled={busy}
                onPress={() => add(p.id, p.name)}
                className="mb-2 rounded-lg bg-surface-2 px-4 py-3"
              >
                <Text className="text-text text-sm">{p.name}</Text>
                <Text className="text-faint text-xs">{p.trackCount ?? 0} parça</Text>
              </Pressable>
            ))}
            {playlists.length === 0 ? (
              <Text className="text-muted text-sm">Henüz liste yok — aşağıdan oluştur.</Text>
            ) : null}
          </ScrollView>

          <View className="mt-4 flex-row gap-2">
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="yeni liste adı"
              placeholderTextColor="#5e5e64"
              returnKeyType="done"
              onSubmitEditing={createAndAdd}
              className="flex-1 rounded-lg border border-border bg-bg px-4 py-3 text-text"
            />
            <Pressable
              disabled={busy || !newName.trim()}
              onPress={createAndAdd}
              className={`items-center justify-center rounded-lg bg-accent px-4 ${
                busy || !newName.trim() ? "opacity-40" : ""
              }`}
            >
              <Text className="text-bg text-sm font-semibold">Oluştur</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
