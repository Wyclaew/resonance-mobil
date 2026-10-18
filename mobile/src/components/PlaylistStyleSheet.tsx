import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { create } from "zustand";

import { DISCOVERY_FILTERS } from "../lib/filters";
import { hapticSuccess } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { getProfile, updateProfile } from "../lib/playlistProfile";
import { usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Button, Chip, Eyebrow, Toggle } from "./ui";

/** Hazır serbest tarz önerileri — paylaşılan filtre listesinde olmayan sık türler. */
const STYLE_SUGGESTIONS = ["phonk", "drift phonk", "hardstyle", "gym motivation", "lo-fi", "techno", "drill", "synthwave"];
const MAX_STYLES = 3;

interface StyleSheetState {
  playlist: { id: string; name: string } | null;
  open: (id: string, name: string) => void;
  close: () => void;
}

export const usePlaylistStyleSheet = create<StyleSheetState>((set) => ({
  playlist: null,
  open: (id, name) => set({ playlist: { id, name } }),
  close: () => set({ playlist: null }),
}));

/**
 * "Bu listenin öneri tarzı" — kullanıcı isteği (2026-10-18). Listeye filtre/serbest tarz
 * atanır; önerili karışık çalarken öneriler yalnız o tarzdan gelir, genel zevk karışmaz.
 * Ayrıntı: `lib/playlistProfile.ts`, `lib/playlistRadio.ts`.
 */
export function PlaylistStyleSheet() {
  const { playlist, close } = usePlaylistStyleSheet();
  const t = useT();
  const c = useColors();
  const [filters, setFilters] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [isolate, setIsolate] = useState(true);
  const [artists, setArtists] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!playlist) return;
    const p = getProfile(playlist.id);
    setFilters(p.filters);
    setStyles(p.styles);
    setIsolate(p.isolate);
    setArtists(p.artists);
    setDraft("");
  }, [playlist]);

  const moods = useMemo(() => DISCOVERY_FILTERS.filter((f) => f.kind === "mood"), []);
  const genres = useMemo(() => DISCOVERY_FILTERS.filter((f) => f.kind === "genre"), []);
  const liked = Object.entries(artists).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const skipped = Object.entries(artists).filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 5);

  if (!playlist) return null;

  const toggleFilter = (id: string) => setFilters((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));
  const addStyle = (raw: string) => {
    const v = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (!v) return;
    setStyles((st) => (st.includes(v) || st.length >= MAX_STYLES ? st : [...st, v]));
    setDraft("");
  };

  function save() {
    if (!playlist) return;
    const id = playlist.id;
    updateProfile(id, { filters, styles, isolate, artists });
    hapticSuccess();
    // Bu liste şu an önerili çalıyorsa sıradaki öneriler yeni tarzla hemen yenilensin.
    const live = usePlayerStore.getState().restylePlaylist(id);
    useToastStore.getState().show(live ? t("m.plStyle.savedLive") : t("m.plStyle.saved"), "success");
    close();
  }

  return (
    <Sheet visible onClose={close} scroll title={t("m.plStyle.sheetTitle")}>
      <View className="px-5">
        <Text className="text-muted text-[13px]" numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text className="text-faint mt-1 text-[12px] leading-[17px]">{t("m.plStyle.body")}</Text>

        <View className="mt-4">
          <Eyebrow>{t("m.plStyle.custom")}</Eyebrow>
        </View>
        <View className="bg-surface-2 mt-2 h-11 flex-row items-center rounded-2xl pl-3.5 pr-1.5">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => addStyle(draft)}
            placeholder={t("m.plStyle.customPh")}
            placeholderTextColor={c.faint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            editable={styles.length < MAX_STYLES}
            className="text-text h-11 flex-1 text-[14px]"
            style={{ fontFamily: "Inter_400Regular" }}
          />
          {draft.trim() ? (
            <Pressable onPress={() => addStyle(draft)} hitSlop={8} className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: c.accent }}>
              <Icon name="plus" size={16} color="#ffffff" />
            </Pressable>
          ) : null}
        </View>
        <View className="mt-2 flex-row flex-wrap gap-2">
          {styles.map((st) => (
            <Chip key={st} label={`${st}  ✕`} active onPress={() => setStyles((x) => x.filter((y) => y !== st))} />
          ))}
          {styles.length < MAX_STYLES
            ? STYLE_SUGGESTIONS.filter((x) => !styles.includes(x))
                .slice(0, 5)
                .map((x) => <Chip key={x} label={`+ ${x}`} onPress={() => addStyle(x)} />)
            : null}
        </View>

        <View className="mb-2 mt-5">
          <Eyebrow>{t("discover.genreGroup")}</Eyebrow>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {genres.map((f) => (
            <Chip key={f.id} label={t(f.labelKey)} active={filters.includes(f.id)} onPress={() => toggleFilter(f.id)} />
          ))}
        </View>
        <View className="mb-2 mt-4">
          <Eyebrow>{t("discover.moodGroup")}</Eyebrow>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {moods.map((f) => (
            <Chip key={f.id} label={t(f.labelKey)} active={filters.includes(f.id)} onPress={() => toggleFilter(f.id)} />
          ))}
        </View>

        <View className="mt-5 flex-row items-center">
          <View className="flex-1 pr-3">
            <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_500Medium" }}>
              {t("m.plStyle.isolate")}
            </Text>
            <Text className="text-muted mt-0.5 text-[12px] leading-[17px]">{t("m.plStyle.isolateSub")}</Text>
          </View>
          <Toggle value={isolate} onChange={setIsolate} />
        </View>

        {liked.length || skipped.length ? (
          <View className="bg-surface-2 mt-5 rounded-2xl p-3.5">
            <View className="flex-row items-center justify-between">
              <Eyebrow>{t("m.plStyle.learned")}</Eyebrow>
              <Pressable onPress={() => setArtists({})} hitSlop={8}>
                <Text className="text-muted text-[12px] underline">{t("m.plStyle.reset")}</Text>
              </Pressable>
            </View>
            {liked.length ? (
              <Text className="text-text mt-2 text-[12px] leading-[17px]">
                {`▲ ${t("m.plStyle.liked")}: ${liked.map(([a]) => a).join(", ")}`}
              </Text>
            ) : null}
            {skipped.length ? (
              <Text className="text-muted mt-1 text-[12px] leading-[17px]">
                {`▼ ${t("m.plStyle.skipped")}: ${skipped.map(([a]) => a).join(", ")}`}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="mb-2 mt-5 flex-row gap-2">
          <Button kind="primary" icon="check" label={t("m.common.save")} onPress={save} className="flex-1" />
          {filters.length || styles.length ? (
            <Button
              kind="ghost"
              label={t("discover.clear")}
              onPress={() => {
                setFilters([]);
                setStyles([]);
              }}
            />
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
