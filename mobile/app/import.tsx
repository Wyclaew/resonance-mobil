import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import * as Extractor from "../modules/resonance-extractor";
import { Eyebrow } from "../src/components/TrackRow";
import { savePlaylistFromTracks } from "../src/lib/playlists";
import { isLikelySong } from "../src/lib/recommender";
import { decodePlaylist, isShareCode } from "../src/lib/share";
import { importSpotifyPlaylist, spotifyPlaylistId } from "../src/lib/spotify";
import { useToastStore } from "../src/store/useToastStore";
import { COLORS } from "../src/theme";

/**
 * İçe aktarma — YouTube/YT Music liste adresi ya da Resonance paylaşım kodu.
 *
 * Spotify: masaüstündeki ANAHTARSIZ yolun aynısı (embed sayfası, ~100 şarkı).
 */
export default function Import() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const show = useToastStore((s) => s.show);

  async function run() {
    const input = text.trim();
    if (!input || busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (isShareCode(input)) {
        const decoded = decodePlaylist(input);
        if (!decoded) throw new Error("Paylaşım kodu okunamadı");
        const { added } = await savePlaylistFromTracks(decoded.name, decoded.tracks);
        finish(decoded.name, added);
        return;
      }
      if (/spotify\.com/i.test(input) && spotifyPlaylistId(input)) {
        const { name, tracks, missed } = await importSpotifyPlaylist(input, (done, total) =>
          setProgress(`YouTube'da eşleştiriliyor · ${done}/${total}`)
        );
        if (!tracks.length) throw new Error("Hiçbir şarkı YouTube'da eşleşmedi");
        const { added } = await savePlaylistFromTracks(name, tracks);
        if (missed) show(`${missed} şarkı eşleşmedi`, "info");
        finish(name, added);
        return;
      }
      if (!/^https?:\/\//i.test(input)) {
        throw new Error("Bir liste adresi ya da RSNC1 kodu yapıştır");
      }
      const { name, tracks } = await Extractor.playlist(input, 500);
      const songs = tracks.filter(isLikelySong);
      if (!songs.length) throw new Error("Listede şarkı bulunamadı");
      const { added } = await savePlaylistFromTracks(name || "İçe aktarılan", songs);
      finish(name || "İçe aktarılan", added);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function finish(name: string, added: number) {
    setText("");
    show(`"${name}" içe aktarıldı · ${added} parça`, "success");
    router.back();
  }

  return (
    <ScrollView className="flex-1 bg-bg px-5 pt-14" keyboardShouldPersistTaps="handled">
      <Eyebrow>İçe aktar</Eyebrow>
      <Text className="text-text mt-2 text-[26px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
        Liste getir
      </Text>
      <Text className="text-muted mt-2 text-sm leading-5">
        YouTube, YouTube Music ya da herkese açık Spotify liste adresini yapıştır. Resonance
        paylaşım kodu (RSNC1…) da olur. Spotify'da ses gelmez: her şarkı YouTube Music'te
        eşleştirilir (en fazla ~100 şarkı).
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="https://music.youtube.com/playlist?list=…"
        placeholderTextColor={COLORS.faint}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        selectionColor={COLORS.accent}
        className="mt-5 min-h-[88px] rounded border border-border bg-surface px-4 py-3 text-text"
        style={{ fontFamily: "Inter_400Regular" }}
      />

      <Pressable
        disabled={busy || !text.trim()}
        onPress={run}
        className={`mt-4 h-11 items-center justify-center rounded bg-accent ${
          busy || !text.trim() ? "opacity-40" : ""
        }`}
      >
        {busy ? (
          <ActivityIndicator color={COLORS.bg} />
        ) : (
          <Text className="text-bg text-[13px]" style={{ fontFamily: "Archivo_700Bold" }}>
            İçe aktar
          </Text>
        )}
      </Pressable>

      {progress ? (
        <Text className="text-muted mt-4 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          {progress}
        </Text>
      ) : null}
      {note ? <Text className="text-down mt-4 text-xs">{note}</Text> : null}

      <Pressable onPress={() => router.back()} className="mt-8 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}
