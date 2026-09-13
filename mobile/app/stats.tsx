import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { HourBars, Meter } from "../src/components/Charts";
import { useBottomSpace } from "../src/components/MiniPlayer";
import { Button, Card, EmptyState, Eyebrow, Section, Segmented, Stat, TopBar } from "../src/components/ui";
import { clock, count, date, duration, hours } from "../src/lib/fmt";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { statsFor, type RangeStats, type TopRow } from "../src/lib/insights";
import { useColors } from "../src/theme";

/**
 * Dinleme etkinliği — masaüstü `StatsView`: neyi ne zaman dinledin, tüm
 * cihazların ortak (play_history senkronlanıyor).
 */
export default function Stats() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const [range, setRange] = useState<7 | 30 | 365>(30);
  const [data, setData] = useState<RangeStats | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setData(null);
      void statsFor(range)
        .then((d) => alive && setData(d))
        .catch((e) => console.error("[istatistik] okunamadı:", e));
      return () => {
        alive = false;
      };
    }, [range])
  );

  // Geçmişi güne göre grupla (başlık satırı + kayıtlar).
  const days: { label: string; rows: RangeStats["recent"] }[] = [];
  for (const r of data?.recent ?? []) {
    const label = date(r.at, lang);
    const last = days[days.length - 1];
    if (last?.label === label) last.rows.push(r);
    else days.push({ label, rows: [r] });
  }

  return (
    <View className="bg-bg flex-1">
      <TopBar
        title={t("stats.title")}
        right={<Button small kind="ghost" icon="calendar" label={t("wrapped.open")} onPress={() => router.push("/wrapped")} />}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <View className="px-5">
          <Text className="text-muted text-[13px]">{t("stats.subtitle")}</Text>
          <View className="mt-4">
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: 7, label: t("stats.days", { n: 7 }) },
                { value: 30, label: t("stats.days", { n: 30 }) },
                { value: 365, label: t("stats.year") },
              ]}
            />
          </View>
        </View>

        {!data ? (
          <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
        ) : !data.plays ? (
          <EmptyState icon="chart" text={t("stats.empty")} />
        ) : (
          <>
            <View className="px-5 pt-5">
              <Card>
                <View className="p-4">
                  <Text className="text-text text-[15px] leading-[22px]">
                    {t("stats.summary", { hours: hours(data.totalMs, lang), plays: count(data.plays, lang), artists: data.newArtists })}
                  </Text>
                  <View className="mt-4 flex-row">
                    <Stat value={`${hours(data.totalMs, lang)}`} label={`${t("stats.hoursShort")} ${t("stats.listened")}`} accent />
                    <Stat value={count(data.plays, lang)} label={t("stats.plays")} />
                  </View>
                  <View className="mt-4 flex-row">
                    <Stat value={count(data.artists, lang)} label={t("stats.artists")} />
                    <Stat value={count(data.newArtists, lang)} label={t("stats.newArtists")} />
                  </View>
                </View>
              </Card>
            </View>

            <Section title={t("stats.byHour")}>
              <View className="px-5">
                <HourBars values={data.byHour} height={72} />
              </View>
            </Section>

            <TopList title={t("stats.topArtists")} rows={data.topArtists} onPress={(r) => router.push({ pathname: "/artist/[name]", params: { name: r.name } })} />
            <TopList title={t("stats.topTracks")} rows={data.topTracks} />

            <Section title={t("stats.history")}>
              {days.map((d) => (
                <View key={d.label} className="px-5 pb-2">
                  <Text className="text-faint pb-1 pt-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
                    {d.label}
                  </Text>
                  {d.rows.map((r) => (
                    <View key={`${r.id}-${r.at}`} className="flex-row items-center py-1.5">
                      <Text className="text-faint w-12 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                        {clock(r.at)}
                      </Text>
                      <Text className="text-text flex-1 text-[13px]" numberOfLines={1}>
                        {r.title}
                        <Text className="text-muted">{`  ·  ${r.artist}`}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </Section>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function TopList({ title, rows, onPress }: { title: string; rows: TopRow[]; onPress?: (r: TopRow) => void }) {
    const lang = useLang();
    const max = Math.max(1, ...rows.map((r) => r.ms));
    return (
      <Section title={title}>
        {rows.map((r, i) => (
          <Pressable key={`${r.name}-${i}`} disabled={!onPress} onPress={() => onPress?.(r)} className="px-5 py-2">
            <View className="flex-row items-baseline">
              <Text className="text-faint w-6 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                {i + 1}
              </Text>
              <Text className="text-text flex-1 text-[14px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                {r.name}
                {r.artist ? <Text className="text-muted text-[12px]">{`  ·  ${r.artist}`}</Text> : null}
              </Text>
              <Text className="text-muted ml-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                {`${r.plays}× · ${duration(r.ms, lang)}`}
              </Text>
            </View>
            <View className="mt-1.5 pl-6">
              <Meter ratio={r.ms / max} tone={i === 0 ? "accent" : "muted"} height={3} />
            </View>
          </Pressable>
        ))}
      </Section>
    );
}
