import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";

import { blockArtist, isBlocked, loadBlockedArtists, unblockArtist } from "../lib/blocked";
import { PREF_LESS, PREF_MORE, PREF_NORMAL, loadArtistPrefs, prefWeight, setArtistPref } from "../lib/prefs";
import { useToastStore } from "../store/useToastStore";

/**
 * Sanatçı kararları — ikisi de SENKRONLANIR (karar, türetilmiş veri değil).
 *
 * • "Daha çok / daha az öner" (`artist_prefs`, v1.8.0): elle ağırlık.
 * • "Bir daha önerme" (`blocked_artists`, v1.8.0): MOBILE.md §5.1 bunu mobil
 *   arayüzde ŞART diyor — PC'de engellediğin sanatçı telefonda da gelmemeli,
 *   ve telefonda engellediğin PC'de.
 */
export function ArtistActions({
  artist,
  children,
}: {
  artist: string;
  /** Aynı satırda gösterilecek ek eylemler (indir, uyku). */
  children?: React.ReactNode;
}) {
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
        ? `${artist} daha çok önerilecek`
        : value === PREF_LESS
          ? `${artist} daha az önerilecek`
          : `${artist} için tercih sıfırlandı`,
      "info"
    );
  }

  async function toggleBlock() {
    if (blocked) {
      await unblockArtist(artist);
      setBlocked(false);
      show(`${artist} engeli kaldırıldı`, "info");
      return;
    }
    await blockArtist(artist);
    setBlocked(true);
    show(`${artist} bir daha önerilmeyecek`, "info");
  }

  // Tek satır, yatay kaydırmalı: sanatçı kararları + çalma eylemleri aynı
  // düzlemde durur, ekranın altı kalabalıklaşmaz.
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="mt-5 max-h-9"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
    >
      <Chip label="Daha çok" active={weight === PREF_MORE} onPress={() => apply(PREF_MORE)} />
      <Chip label="Daha az" active={weight === PREF_LESS} onPress={() => apply(PREF_LESS)} />
      <Chip label={blocked ? "Engelli" : "Önerme"} active={blocked} danger onPress={toggleBlock} />
      {children}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  danger,
  onPress,
}: {
  label: string;
  active: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  const border = active ? (danger ? "border-down" : "border-accent-dim") : "border-border";
  const tint = active ? (danger ? "text-down" : "text-accent") : "text-muted";
  return (
    <Pressable
      onPress={onPress}
      className={`h-8 justify-center rounded-full border px-3 ${border} ${active ? "bg-surface-2" : ""}`}
    >
      <Text className={`${tint} text-[11px]`} style={{ fontFamily: "JetBrainsMono_400Regular" }}>
        {label}
      </Text>
    </Pressable>
  );
}
