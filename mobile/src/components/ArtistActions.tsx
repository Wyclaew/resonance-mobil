import { useEffect, useState } from "react";
import { ScrollView } from "react-native";

import { blockArtist, isBlocked, loadBlockedArtists, unblockArtist } from "../lib/blocked";
import { useT } from "../lib/i18n.mobile";
import { PREF_LESS, PREF_MORE, PREF_NORMAL, loadArtistPrefs, prefWeight, setArtistPref } from "../lib/prefs";
import { useToastStore } from "../store/useToastStore";
import { Chip } from "./ui";

/**
 * Sanatçı tercihleri (masaüstü Zevk profili / Sanatçı sayfası düğmeleri):
 * daha çok öner · daha az öner · bir daha önerme. Aynı düğmeye tekrar basmak
 * tercihi sıfırlar.
 */
export function ArtistActions({ artist, children }: { artist: string; children?: React.ReactNode }) {
  const t = useT();
  const [weight, setWeight] = useState(PREF_NORMAL);
  const [blocked, setBlocked] = useState(false);
  const show = useToastStore((s) => s.show);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await Promise.all([loadArtistPrefs(), loadBlockedArtists()]);
      if (!alive) return;
      setWeight(prefWeight(artist));
      setBlocked(isBlocked(artist));
    })();
    return () => {
      alive = false;
    };
  }, [artist]);

  if (!artist) return null;

  async function apply(next: number) {
    const value = weight === next ? PREF_NORMAL : next;
    setWeight(value);
    await setArtistPref(artist, value);
    show(
      value === PREF_MORE
        ? t("m.artist.moreDone", { artist })
        : value === PREF_LESS
          ? t("m.artist.lessDone", { artist })
          : t("m.artist.prefReset", { artist }),
      "info"
    );
  }

  async function toggleBlock() {
    if (blocked) {
      await unblockArtist(artist);
      setBlocked(false);
      show(t("m.artist.unblocked", { artist }), "info");
      return;
    }
    await blockArtist(artist);
    setBlocked(true);
    show(t("discover.blocked", { artist }), "info");
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}
    >
      {children}
      <Chip icon="plus" label={t("taste.more")} active={weight === PREF_MORE} onPress={() => apply(PREF_MORE)} />
      <Chip icon="minus" label={t("taste.less")} active={weight === PREF_LESS} onPress={() => apply(PREF_LESS)} />
      <Chip icon="ban" label={blocked ? t("m.artist.blocked") : t("taste.block")} active={blocked} tone="down" onPress={toggleBlock} />
    </ScrollView>
  );
}
