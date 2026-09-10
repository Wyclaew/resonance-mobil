import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { Eyebrow } from "../src/components/TrackRow";
import { getDb } from "../src/lib/db";
import { COLORS } from "../src/theme";

interface TopRow {
  name: string;
  plays: number;
  ms: number;
}

interface Stats {
  totalMs: number;
  plays: number;
  artists: TopRow[];
  tracks: TopRow[];
  hours: { hour: number; ms: number }[];
  freshArtists: number;
}

const hoursText = (ms: number) => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} sa ${m} dk` : `${m} dk`;
};

/**
 * Dinleme analizi — masaüstündeki StatsView'ın sorgularının aynısı.
 * Tamamen `play_history` üzerinden türer; senkronla iki cihazın toplamı gelir.
 */
export default function StatsScreen() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const [tot] = await db.select<{ ms: number; c: number }[]>(
        `SELECT COALESCE(SUM(ms_played),0) AS ms, COUNT(*) AS c FROM play_history`
      );
      const artists = await db.select<TopRow[]>(
        `SELECT t.artist AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE t.artist <> '' GROUP BY t.artist ORDER BY ms DESC LIMIT 8`
      );
      const tracks = await db.select<TopRow[]>(
        `SELECT t.title AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          GROUP BY h.track_id ORDER BY plays DESC LIMIT 8`
      );
      const hours = await db.select<{ hour: number; ms: number }[]>(
        `SELECT hour, SUM(ms_played) AS ms FROM play_history GROUP BY hour ORDER BY hour`
      );
      const [fresh] = await db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM (
           SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
            WHERE h.played_at > $1 AND t.artist <> '' GROUP BY t.artist)`,
        [Date.now() - 30 * 86_400_000]
      );
      setStats({
        totalMs: tot?.ms ?? 0,
        plays: tot?.c ?? 0,
        artists,
        tracks,
        hours,
        freshArtists: fresh?.c ?? 0,
      });
    })();
  }, []);

  if (!stats) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const peak = Math.max(1, ...stats.hours.map((h) => h.ms));
  const busiest = stats.hours.reduce((a, b) => (b.ms > (a?.ms ?? 0) ? b : a), stats.hours[0]);

  return (
    <ScrollView className="flex-1 bg-bg px-5 pt-14" contentContainerStyle={{ paddingBottom: 40 }}>
      <Eyebrow>Dinleme analizi</Eyebrow>
      <Text className="text-text mt-2 text-[30px] leading-9" style={{ fontFamily: "Archivo_800ExtraBold" }}>
        {hoursText(stats.totalMs)}
      </Text>
      <Text className="text-muted mt-1 text-sm">
        {stats.plays} çalma · son 30 günde {stats.freshArtists} sanatçı
      </Text>

      <Section title="Saatlere göre" />
      {/* 24 çubuk: günün hangi saatinde dinlediğin tek bakışta. */}
      <View className="mt-3 h-24 flex-row items-end gap-[3px]">
        {Array.from({ length: 24 }).map((_, hour) => {
          const ms = stats.hours.find((h) => h.hour === hour)?.ms ?? 0;
          const height = Math.max(2, (ms / peak) * 92);
          return (
            <View
              key={hour}
              style={{
                flex: 1,
                height,
                borderRadius: 2,
                backgroundColor: hour === busiest?.hour ? COLORS.accent : COLORS.surface3,
              }}
            />
          );
        })}
      </View>
      <View className="mt-1 flex-row justify-between">
        {["00", "06", "12", "18", "23"].map((label) => (
          <Text
            key={label}
            className="text-faint text-[10px]"
            style={{ fontFamily: "JetBrainsMono_400Regular" }}
          >
            {label}
          </Text>
        ))}
      </View>

      <Section title="En çok dinlenen sanatçılar" />
      {stats.artists.map((row, i) => (
        <Row key={row.name} rank={i + 1} name={row.name} value={hoursText(row.ms)} />
      ))}

      <Section title="En çok çalınan parçalar" />
      {stats.tracks.map((row, i) => (
        <Row key={`${row.name}-${i}`} rank={i + 1} name={row.name} value={`${row.plays}×`} />
      ))}

      <Pressable onPress={() => router.back()} className="mt-8 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <View className="mt-8">
      <Eyebrow>{title}</Eyebrow>
    </View>
  );
}

/** Sıra numarası burada gerçek bilgi: liste zaten büyükten küçüğe sıralı. */
function Row({ rank, name, value }: { rank: number; name: string; value: string }) {
  return (
    <View className="mt-2 flex-row items-center border-b border-border pb-2">
      <Text
        className="text-faint w-6 text-[11px]"
        style={{ fontFamily: "JetBrainsMono_400Regular" }}
      >
        {String(rank).padStart(2, "0")}
      </Text>
      <Text className="text-text flex-1 text-[14px]" numberOfLines={1}>
        {name}
      </Text>
      <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
        {value}
      </Text>
    </View>
  );
}
