import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import * as Extractor from "../modules/resonance-extractor";
import { useBottomSpace } from "../src/components/MiniPlayer";
import { Button, Card, Eyebrow, TopBar } from "../src/components/ui";
import { hapticSuccess } from "../src/lib/haptics";
import { useT } from "../src/lib/i18n.mobile";
import { savePlaylistFromTracks } from "../src/lib/playlists";
import { isLikelySong } from "../src/lib/recommender";
import { decodePlaylist, isShareCode } from "../src/lib/share";
import { importSpotifyPlaylist, spotifyPlaylistId } from "../src/lib/spotify";
import { usePlaylistStore } from "../src/store/usePlaylistStore";
import { useColors } from "../src/theme";

type Source = "spotify" | "youtube" | "code" | null;

function detect(input: string): Source {
  const s = input.trim();
  if (!s) return null;
  if (isShareCode(s)) return "code";
  if (/spotify\.com/i.test(s) && spotifyPlaylistId(s)) return "spotify";
  if (/^https?:\/\/(www\.|music\.|m\.)?youtu(be\.com|\.be)\//i.test(s) && /list=/i.test(s)) return "youtube";
  return null;
}

/**
 * İçe aktar — masaüstü `ImportView`: YouTube / YouTube Music liste adresi,
 * herkese açık Spotify listesi (anahtarsız, ≤100 şarkı, YouTube'da eşleştirilir)
 * ya da Resonance paylaşım kodu (RSNC1). Telefondaki dosyalar ayrı ekranda.
 */
export default function Import() {
  const c = useColors();
  const t = useT();
  const bottom = useBottomSpace(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; name: string; count: number; note?: string } | null>(null);
  const source = detect(text);

  async function run() {
    const input = text.trim();
    if (!input || busy) return;
    if (!source) {
      setError(t("import.invalidLong"));
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      let name = "";
      let tracks: Parameters<typeof savePlaylistFromTracks>[1] = [];
      let note: string | undefined;
      if (source === "code") {
        const decoded = decodePlaylist(input);
        if (!decoded) throw new Error(t("import.codeFailed"));
        name = decoded.name;
        tracks = decoded.tracks;
      } else if (source === "spotify") {
        setStage(t("import.reading"));
        const res = await importSpotifyPlaylist(input, (n, total) => setStage(`${t("import.matching")} ${n}/${total}`));
        name = res.name;
        tracks = res.tracks;
        if (res.missed) note = t("m.import.missed", { n: res.missed });
      } else {
        setStage(t("import.reading"));
        const res = await Extractor.playlist(input, 500);
        name = res.name || t("backup.importedList");
        tracks = res.tracks.filter(isLikelySong);
        // Kimliksiz YouTube ~100 öğe verir (masaüstündeki `import.partial` uyarısı).
        if (res.tracks.length >= 100) note = t("m.import.maybePartial");
      }
      if (!tracks.length) throw new Error(t("search.noResults"));
      setStage(t("import.adding"));
      const { playlist, added } = await savePlaylistFromTracks(name, tracks);
      await usePlaylistStore.getState().refresh();
      hapticSuccess();
      setText("");
      setDone({ id: playlist.id, name, count: added, note });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("import.title")} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom }}>
        <Text className="text-muted text-[13px] leading-5">{t("import.subtitle")}</Text>

        <View className="bg-surface-2 mt-5 rounded-2xl p-1">
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              setError(null);
            }}
            placeholder="https://music.youtube.com/playlist?list=…"
            placeholderTextColor={c.faint}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            className="text-text min-h-[84px] px-3 py-2.5 text-[14px]"
            style={{ fontFamily: "Inter_400Regular", textAlignVertical: "top" }}
          />
        </View>
        <View className="mt-2 flex-row items-center">
          <Text className="text-faint flex-1 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {source
              ? t("import.detected", { source: source === "code" ? "Resonance" : source === "spotify" ? "Spotify" : "YouTube" })
              : " "}
          </Text>
          <Button
            small
            kind="ghost"
            icon="copy"
            label={t("m.import.paste")}
            onPress={async () => {
              const v = await Clipboard.getStringAsync();
              if (v) setText(v.trim());
            }}
          />
        </View>

        <Button kind="primary" icon="fileDown" label={t("import.button")} busy={busy} disabled={!text.trim()} onPress={run} className="mt-4" />

        {stage ? (
          <Text className="text-muted mt-3 text-center text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {stage}
          </Text>
        ) : null}
        {error ? <Text className="text-down mt-3 text-[13px]">{error}</Text> : null}

        {done ? (
          <Card className="mt-5">
            <View className="p-4">
              <Text className="text-text text-[14px] leading-5">{t("import.done", { count: done.count, name: done.name })}</Text>
              {done.note ? <Text className="text-muted mt-2 text-[12px] leading-[17px]">{done.note}</Text> : null}
              <Button
                small
                kind="secondary"
                label={t("import.openList")}
                className="mt-3 self-start"
                onPress={() => router.replace({ pathname: "/playlist/[id]", params: { id: done.id } })}
              />
            </View>
          </Card>
        ) : null}

        <View className="mt-8">
          <Eyebrow>{t("import.howTitle")}</Eyebrow>
          <Text className="text-muted mt-2 text-[13px] leading-5">{t("import.howYt")}</Text>
          <Text className="text-muted mt-2 text-[13px] leading-5">
            <Text className="text-text" style={{ fontFamily: "Inter_600SemiBold" }}>
              {t("import.howSpotifyBold")}
            </Text>
            {t("import.howSpotify")}
          </Text>
          <Text className="text-faint mt-2 text-[12px] leading-[17px]">{t("m.import.spotifyLimit")}</Text>
        </View>

        <Button kind="ghost" icon="phone" label={t("m.library.onDevice")} className="mt-6 self-start" onPress={() => router.push("/local")} />
      </ScrollView>
    </View>
  );
}
