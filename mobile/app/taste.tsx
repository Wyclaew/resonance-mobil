import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Eyebrow } from "../src/components/TrackRow";
import { acceptanceSummary, buildAcceptance } from "../src/lib/acceptance";
import { blockedArtists, loadBlockedArtists } from "../src/lib/blocked";
import { listArtistPrefs, loadArtistPrefs, PREF_MORE } from "../src/lib/prefs";
import {
  bucketOf,
  buildTasteProfile,
  currentBucketPlays,
  currentConfidence,
  predictedStyles,
  splitBucket,
} from "../src/lib/taste";
import { COLORS } from "../src/theme";

const PART_TR: Record<string, string> = {
  morning: "sabah",
  afternoon: "öğleden sonra",
  evening: "akşam",
  night: "gece",
};

/**
 * Zevk profili — masaüstündeki TasteView'ın özü.
 *
 * Öneri motorunun İÇİNİ gösterir: şu anki zaman diliminde neyi seviyorsun,
 * hangi sanatçıların önerisi kabul görüyor, elle hangi kararları verdin.
 * Motorun kendini açıklaması, kara kutu olmamasının yolu.
 */
export default function TasteScreen() {
  const [ready, setReady] = useState(false);
  const [styles, setStyles] = useState<string[]>([]);
  const [confidence, setConfidence] = useState(0);
  const [plays, setPlays] = useState(0);
  const [accepted, setAccepted] = useState<{ artist: string; shown: number; avg: number }[]>([]);
  const [prefs, setPrefs] = useState<{ artist: string; weight: number }[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      await Promise.all([
        buildTasteProfile(true),
        buildAcceptance(true),
        loadArtistPrefs(true),
        loadBlockedArtists(true),
      ]);
      setStyles(predictedStyles(4));
      setConfidence(currentConfidence());
      setPlays(currentBucketPlays());
      setAccepted(acceptanceSummary(6));
      setPrefs(listArtistPrefs());
      setBlocked(blockedArtists());
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const bucket = splitBucket(bucketOf());
  const when = `${bucket.weekend ? "hafta sonu" : "hafta içi"} ${PART_TR[bucket.part] ?? bucket.part}`;

  return (
    <ScrollView className="flex-1 bg-bg px-5 pt-14" contentContainerStyle={{ paddingBottom: 40 }}>
      <Eyebrow>Zevk profili</Eyebrow>
      <Text className="text-text mt-2 text-[26px] leading-8" style={{ fontFamily: "Archivo_800ExtraBold" }}>
        Şu an: {when}
      </Text>
      <Text className="text-muted mt-2 text-sm leading-5">
        {plays > 0
          ? `Bu dilimde ${plays} çalma kaydın var; profil güveni %${Math.round(confidence * 100)}.`
          : "Bu zaman diliminde henüz yeterli dinleme yok — öneriler genel zevkinden gelir."}
      </Text>

      {styles.length ? (
        <>
          <SectionTitle>Bu saatlerde yöneldiğin sanatçılar</SectionTitle>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {styles.map((s) => (
              <View key={s} className="rounded-full border border-accent-dim px-3 py-1.5">
                <Text className="text-accent text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {s}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {accepted.length ? (
        <>
          <SectionTitle>Önerileri kabul ettiklerin</SectionTitle>
          <Text className="text-faint mt-1 text-[11px]">
            Motor bu sanatçıları önerdiğinde ne sıklıkla dinliyorsun?
          </Text>
          {accepted.map((row) => (
            <View key={row.artist} className="mt-2 border-b border-border pb-2">
              <View className="flex-row justify-between">
                <Text className="text-text flex-1 pr-3 text-[14px]" numberOfLines={1}>
                  {row.artist}
                </Text>
                <Text
                  className="text-muted text-[11px]"
                  style={{ fontFamily: "JetBrainsMono_400Regular" }}
                >
                  %{Math.round(row.avg * 100)} · {row.shown} öneri
                </Text>
              </View>
              <View className="mt-1 h-[2px] w-full bg-surface-3">
                <View
                  className="h-[2px] bg-accent"
                  style={{ width: `${Math.min(100, row.avg * 100)}%` }}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      {prefs.length ? (
        <>
          <SectionTitle>Elle verdiğin kararlar</SectionTitle>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {prefs.map((p) => (
              <View
                key={p.artist}
                className={`rounded-full border px-3 py-1.5 ${
                  p.weight >= PREF_MORE ? "border-up-dim" : "border-border"
                }`}
              >
                <Text
                  className={p.weight >= PREF_MORE ? "text-up text-[11px]" : "text-muted text-[11px]"}
                  style={{ fontFamily: "JetBrainsMono_400Regular" }}
                >
                  {p.artist} {p.weight >= PREF_MORE ? "↑" : "↓"}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {blocked.length ? (
        <>
          <SectionTitle>Engellenenler</SectionTitle>
          <Text className="text-muted mt-2 text-[13px] leading-5">{blocked.join(" · ")}</Text>
        </>
      ) : null}

      <Pressable onPress={() => router.back()} className="mt-10 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <View className="mt-8">
      <Eyebrow>{children}</Eyebrow>
    </View>
  );
}
