import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Share, Text, View } from "react-native";

import { Eyebrow } from "../src/components/TrackRow";
import { getDb } from "../src/lib/db";
import { COLORS } from "../src/theme";

interface Top {
  name: string;
  plays: number;
  ms: number;
}

interface Data {
  ms: number;
  plays: number;
  tracks: number;
  artists: Top[];
  songs: Top[];
  newArtists: number;
  recommended: number;
  keptFromRecs: number;
  peakHour: number;
}

const EMPTY: Data = {
  ms: 0,
  plays: 0,
  tracks: 0,
  artists: [],
  songs: [],
  newArtists: 0,
  recommended: 0,
  keptFromRecs: 0,
  peakHour: 0,
};

const hours = (ms: number) => Math.round(ms / 3_600_000);

/**
 * Yıllık özet — masaüstündeki Wrapped'ın mobil karşılığı.
 * Tümü `play_history` + `recommendation_history` üzerinden türer; iki cihazın
 * toplamıdır (senkron sayesinde telefonda ve PC'de aynı sonucu verir).
 */
export default function Wrapped() {
  const now = new Date();
  const [range, setRange] = useState<"year" | "12m">("year");
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    void (async () => {
      setData(null);
      const from =
        range === "year"
          ? new Date(now.getFullYear(), 0, 1).getTime()
          : Date.now() - 365 * 86_400_000;
      const db = await getDb();
      const [tot] = await db.select<{ ms: number; c: number; tracks: number }[]>(
        `SELECT COALESCE(SUM(ms_played),0) AS ms, COUNT(*) AS c,
                COUNT(DISTINCT track_id) AS tracks
           FROM play_history WHERE played_at >= $1`,
        [from]
      );
      const artists = await db.select<Top[]>(
        `SELECT t.artist AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1 AND t.artist <> ''
          GROUP BY t.artist ORDER BY ms DESC LIMIT 5`,
        [from]
      );
      const songs = await db.select<Top[]>(
        `SELECT t.title AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1
          GROUP BY h.track_id ORDER BY plays DESC LIMIT 5`,
        [from]
      );
      const [fresh] = await db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM (
           SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
            WHERE h.played_at >= $1 AND t.artist <> ''
            GROUP BY t.artist
           EXCEPT
           SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
            WHERE h.played_at < $1 AND t.artist <> '' GROUP BY t.artist)`,
        [from]
      );
      const [recs] = await db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM recommendation_history WHERE recommended_at >= $1`,
        [from]
      );
      // Önerilenlerden GERÇEKTEN dinlenenler: öneri motorunun isabeti.
      const [kept] = await db.select<{ c: number }[]>(
        `SELECT COUNT(DISTINCT r.track_id) AS c FROM recommendation_history r
          WHERE r.recommended_at >= $1
            AND EXISTS (SELECT 1 FROM play_history h
                         WHERE h.track_id = r.track_id AND h.ms_played > 60000)`,
        [from]
      );
      const [peak] = await db.select<{ hour: number }[]>(
        `SELECT hour FROM play_history WHERE played_at >= $1
          GROUP BY hour ORDER BY SUM(ms_played) DESC LIMIT 1`,
        [from]
      );
      setData({
        ms: tot?.ms ?? 0,
        plays: tot?.c ?? 0,
        tracks: tot?.tracks ?? 0,
        artists,
        songs,
        newArtists: fresh?.c ?? 0,
        recommended: recs?.c ?? 0,
        keptFromRecs: kept?.c ?? 0,
        peakHour: peak?.hour ?? 0,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const d = data ?? EMPTY;
  const label = range === "year" ? `${now.getFullYear()}` : "son 12 ay";

  return (
    <ScrollView className="flex-1 bg-bg px-5 pt-14" contentContainerStyle={{ paddingBottom: 40 }}>
      <View className="flex-row items-center justify-between">
        <Eyebrow>{`Özet · ${label}`}</Eyebrow>
        <View className="flex-row gap-2">
          <Toggle label={`${now.getFullYear()}`} on={range === "year"} onPress={() => setRange("year")} />
          <Toggle label="12 ay" on={range === "12m"} onPress={() => setRange("12m")} />
        </View>
      </View>

      {!data ? (
        <ActivityIndicator color={COLORS.accent} className="mt-10" />
      ) : (
        <>
          <Text className="text-text mt-4 text-[44px] leading-[48px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
            {hours(d.ms)} saat
          </Text>
          <Text className="text-muted mt-1 text-sm">
            {d.plays} çalma · {d.tracks} farklı parça · en çok {String(d.peakHour).padStart(2, "0")}:00
            civarı
          </Text>

          <Line label="Yeni tanıştığın sanatçı" value={String(d.newArtists)} />
          <Line label="Resonance'ın önerdiği" value={String(d.recommended)} />
          <Line
            label="Önerilerden dinlediğin"
            value={
              d.recommended
                ? `${d.keptFromRecs} · %${Math.round((d.keptFromRecs / d.recommended) * 100)}`
                : "—"
            }
          />

          <Block title="Sanatçılar" rows={d.artists.map((a) => [a.name, `${hours(a.ms)} sa`])} />
          <Block title="Parçalar" rows={d.songs.map((s) => [s.name, `${s.plays}×`])} />

          <Pressable
            onPress={() =>
              void Share.share({
                message:
                  `Resonance ${label}: ${hours(d.ms)} saat müzik, ${d.tracks} parça, ` +
                  `${d.newArtists} yeni sanatçı.\n` +
                  `En çok: ${d.artists.map((a) => a.name).slice(0, 3).join(", ")}`,
              })
            }
            className="mt-8 h-11 items-center justify-center rounded bg-accent"
          >
            <Text className="text-bg text-[13px]" style={{ fontFamily: "Archivo_700Bold" }}>
              Özeti paylaş
            </Text>
          </Pressable>
        </>
      )}

      <Pressable onPress={() => router.back()} className="mt-6 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-7 justify-center rounded-full border px-3 ${on ? "border-accent-dim" : "border-border"}`}
    >
      <Text
        className={on ? "text-accent text-[10px]" : "text-muted text-[10px]"}
        style={{ fontFamily: "JetBrainsMono_400Regular" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="mt-3 flex-row items-baseline justify-between border-b border-border pb-2">
      <Text className="text-muted flex-1 pr-3 text-[13px]">{label}</Text>
      <Text className="text-text text-[15px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
        {value}
      </Text>
    </View>
  );
}

function Block({ title, rows }: { title: string; rows: [string, string][] }) {
  if (!rows.length) return null;
  return (
    <View className="mt-8">
      <Eyebrow>{title}</Eyebrow>
      {rows.map(([name, value], i) => (
        <View key={`${name}-${i}`} className="mt-2 flex-row items-center border-b border-border pb-2">
          <Text className="text-faint w-6 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {String(i + 1).padStart(2, "0")}
          </Text>
          <Text className="text-text flex-1 text-[14px]" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
