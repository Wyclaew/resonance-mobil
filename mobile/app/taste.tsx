import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Meter, RatioBars } from "../src/components/Charts";
import { useBottomSpace } from "../src/components/MiniPlayer";
import { Button, Card, Chip, EmptyState, Section, Stat, TopBar } from "../src/components/ui";
import {
  acceptanceRate,
  acceptanceReport,
  acceptanceShown,
  buildAcceptance,
  type AcceptanceReport,
} from "../src/lib/acceptance";
import { blockArtist, blockedArtists, loadBlockedArtists, unblockArtist } from "../src/lib/blocked";
import { pct } from "../src/lib/fmt";
import { graphSize } from "../src/lib/graph";
import { useLang, useT, type Key } from "../src/lib/i18n.mobile";
import { PREF_LESS, PREF_MORE, PREF_NORMAL, loadArtistPrefs, prefWeight, setArtistPref } from "../src/lib/prefs";
import { buildSignals } from "../src/lib/recommender";
import {
  allBuckets,
  bucketOf,
  buildTasteProfile,
  currentBucketPlays,
  currentConfidence,
  splitBucket,
} from "../src/lib/taste";
import { useSettingsStore } from "../src/store/useSettingsStore";
import { useColors } from "../src/theme";

type Row = { artist: string; affinity: number; rate: number | null; shown: number };

const PART_KEYS: Record<string, Key> = {
  lateNight: "taste.part.lateNight",
  morning: "taste.part.morning",
  afternoon: "taste.part.afternoon",
  evening: "taste.part.evening",
  night: "taste.part.night",
};

/**
 * Zevk profili — masaüstü `TasteView`: Resonance seni nasıl tanıyor ve nerede
 * yanılıyor. Bu sıralamayı öneri motorunun KENDİSİ kullanıyor; buradaki
 * "daha çok / daha az / önerme" doğrudan motoru düzeltir.
 */
export default function Taste() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const halfLife = useSettingsStore((s) => s.karmaHalfLifeDays);
  const [rows, setRows] = useState<Row[]>([]);
  const [report, setReport] = useState<AcceptanceReport | null>(null);
  const [buckets, setBuckets] = useState<ReturnType<typeof allBuckets>>([]);
  const [conf, setConf] = useState(0);
  const [bucketPlays, setBucketPlays] = useState(0);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [graph, setGraph] = useState({ seeds: 0, edges: 0 });
  const [loading, setLoading] = useState(true);
  const [, setVersion] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([buildTasteProfile(true), buildAcceptance(true), loadArtistPrefs(true), loadBlockedArtists(true)]);
      const [signals, rep, gs] = await Promise.all([buildSignals(halfLife), acceptanceReport(), graphSize()]);
      setRows(
        [...signals.artistAffinity.entries()]
          .filter(([a, v]) => a.trim() !== "" && v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([artist, affinity]) => ({ artist, affinity, rate: acceptanceRate(artist), shown: acceptanceShown(artist) }))
      );
      setReport(rep);
      setBuckets(allBuckets());
      setConf(currentConfidence());
      setBucketPlays(currentBucketPlays());
      setBlocked(blockedArtists());
      setGraph(gs);
    } catch (e) {
      console.error("[zevk] profil yüklenemedi:", e);
    } finally {
      setLoading(false);
    }
  }, [halfLife]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const cur = splitBucket(bucketOf());
  const partLabel = (part: string, weekend: boolean) =>
    `${t(weekend ? "taste.weekend" : "taste.weekday")} · ${t(PART_KEYS[part] ?? "taste.part.morning")}`;
  const maxAffinity = Math.max(0.0001, ...rows.map((r) => r.affinity));

  async function applyPref(artist: string, weight: number) {
    await setArtistPref(artist, weight);
    setVersion((v) => v + 1);
  }

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("taste.title")} right={<Button small kind="ghost" icon="refresh" label={t("taste.refresh")} busy={loading} onPress={reload} />} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <Text className="text-muted px-5 text-[13px]">{t("taste.subtitle")}</Text>

        {loading && !rows.length ? (
          <View className="items-center pt-12">
            <ActivityIndicator color={c.accent} />
            <Text className="text-muted mt-3 text-[12px]">{t("taste.loading")}</Text>
          </View>
        ) : !rows.length ? (
          <EmptyState icon="sparkles" text={t("taste.empty")} />
        ) : (
          <>
            <View className="px-5 pt-5">
              <Card>
                <View className="p-4">
                  <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}>
                    {t("taste.nowContext").toLocaleUpperCase(lang)}
                  </Text>
                  <Text className="text-text mt-2 text-[14px] leading-5">
                    {t("taste.nowSummary", { context: partLabel(cur.part, cur.weekend), plays: bucketPlays })}
                  </Text>
                  <View className="mt-3 flex-row items-center">
                    <View className="flex-1">
                      <Meter ratio={conf} height={5} />
                    </View>
                    <Text className="text-accent ml-3 text-[12px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
                      {t("taste.confidence", { pct: Math.round(conf * 100) })}
                    </Text>
                  </View>
                  <Text className="text-faint mt-2 text-[11px] leading-4">{t("taste.confidenceHelp")}</Text>
                </View>
              </Card>
            </View>

            {report && report.total.shown > 0 ? (
              <Section title={t("taste.quality")}>
                <View className="flex-row px-5">
                  <Stat value={pct(report.total.accepted / report.total.shown, lang)} label={t("taste.acceptRate")} accent />
                  <Stat
                    value={report.discovery.shown ? pct(report.discovery.accepted / report.discovery.shown, lang) : "—"}
                    label={t("taste.discoveryRate")}
                  />
                  <Stat value={String(graph.seeds)} label={t("taste.graphArtists")} />
                </View>
                <Text className="text-faint mt-1 px-5 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {`${t("taste.ofN", { n: report.total.shown })} · ${t("taste.graphEdges", { n: graph.edges })}`}
                </Text>
                {report.weeks.length > 1 ? (
                  <View className="px-5 pt-4">
                    <RatioBars values={report.weeks.slice(-12).map((w) => (w.shown ? w.accepted / w.shown : null))} height={56} />
                    <Text className="text-faint mt-2 text-[11px] leading-4">{t("taste.weeklyHelp")}</Text>
                  </View>
                ) : null}
              </Section>
            ) : null}

            <Section title={t("taste.artists")}>
              <Text className="text-muted -mt-1 px-5 pb-2 text-[12px] leading-[17px]">{t("taste.artistsHelp")}</Text>
              {rows.map((r) => {
                const w = prefWeight(r.artist);
                return (
                  <View key={r.artist} className="px-5 py-2.5">
                    <View className="flex-row items-center">
                      <Pressable className="flex-1" onPress={() => router.push({ pathname: "/artist/[name]", params: { name: r.artist } })}>
                        <Text className="text-text text-[14px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                          {r.artist}
                        </Text>
                      </Pressable>
                      {r.rate !== null && r.shown >= 4 ? (
                        <Text
                          className="ml-2 text-[11px]"
                          style={{ fontFamily: "JetBrainsMono_500Medium", color: r.rate >= 0.6 ? c.up : r.rate <= 0.3 ? c.down : c.muted }}
                        >
                          {pct(r.rate, lang)}
                        </Text>
                      ) : null}
                    </View>
                    <View className="mt-2">
                      <Meter ratio={r.affinity / maxAffinity} tone={w === PREF_LESS ? "muted" : "accent"} height={3} />
                    </View>
                    <View className="mt-2 flex-row gap-2">
                      <Chip icon="minus" label={t("taste.less")} active={w === PREF_LESS} onPress={() => void applyPref(r.artist, w === PREF_LESS ? PREF_NORMAL : PREF_LESS)} />
                      <Chip icon="plus" label={t("taste.more")} active={w === PREF_MORE} onPress={() => void applyPref(r.artist, w === PREF_MORE ? PREF_NORMAL : PREF_MORE)} />
                      <Chip
                        icon="ban"
                        tone="down"
                        label={t("taste.block")}
                        onPress={async () => {
                          await blockArtist(r.artist);
                          setBlocked(blockedArtists());
                          setRows((rs) => rs.filter((x) => x.artist.toLowerCase() !== r.artist.toLowerCase()));
                        }}
                      />
                    </View>
                  </View>
                );
              })}
            </Section>

            <Section title={t("taste.byContext")}>
              {buckets.map((b) => {
                const s = splitBucket(b.bucket);
                return (
                  <View key={b.bucket} className="flex-row items-center px-5 py-2">
                    <View className="flex-1">
                      <Text className="text-text text-[13px]" style={{ fontFamily: "Inter_500Medium" }}>
                        {partLabel(s.part, s.weekend)}
                      </Text>
                      <Text className="text-muted text-[12px]" numberOfLines={1}>
                        {b.top.join(" · ") || t("taste.noPrediction")}
                      </Text>
                    </View>
                    <Text className="text-faint ml-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                      {t("taste.confidence", { pct: Math.round(b.confidence * 100) })}
                    </Text>
                  </View>
                );
              })}
            </Section>

            {blocked.length ? (
              <Section title={t("taste.blocked")}>
                <View className="flex-row flex-wrap gap-2 px-5">
                  {blocked.map((a) => (
                    <Chip
                      key={a}
                      icon="x"
                      label={a}
                      onPress={async () => {
                        await unblockArtist(a);
                        setBlocked(blockedArtists());
                      }}
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            <Text className="text-faint px-5 pt-8 text-[11px] leading-4">{t("taste.footer")}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
