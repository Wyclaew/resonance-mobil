import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Share, Text, View } from "react-native";
import { captureRef } from "react-native-view-shot";

import { BarMark } from "../src/components/BarMark";
import { useBottomSpace } from "../src/components/MiniPlayer";
import { Button, EmptyState, Segmented, TopBar } from "../src/components/ui";
import { getDb } from "../src/lib/db";
import { count, pct } from "../src/lib/fmt";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { useToastStore } from "../src/store/useToastStore";
import { useColors } from "../src/theme";

interface Row {
  name: string;
  artist?: string;
  plays: number;
  ms: number;
}

interface Data {
  totalMs: number;
  plays: number;
  artists: number;
  newArtists: number;
  topArtists: Row[];
  topTracks: Row[];
  peakHour: number;
  recommended: number;
  recAccepted: number;
  genres: number;
  streak: number;
}

/**
 * Yıllık özet — masaüstü `WrappedView` ile AYNI hesaplar (seri, farklı tarz,
 * önerilerin %40 kuralıyla "tuttu" sayılması). Tümü senkronlanan tablolardan
 * türer → telefonda ve PC'de aynı sonuç. Kart görsel olarak paylaşılır.
 */
export default function Wrapped() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const now = new Date();
  const thisYear = now.getFullYear();
  const [year, setYear] = useState<number | "12m">(thisYear);
  const [d, setData] = useState<Data | null>(null);
  const [sharing, setSharing] = useState(false);
  const card = useRef<View>(null);

  const range = useMemo(
    () =>
      year === "12m"
        ? { from: Date.now() - 365 * 24 * 3600 * 1000, to: Date.now() }
        : { from: new Date(year, 0, 1).getTime(), to: new Date(year + 1, 0, 1).getTime() },
    [year]
  );

  const load = useCallback(async () => {
    setData(null);
    const db = await getDb();
    const { from, to } = range;
    const [tot, topArtists, topTracks, fresh, hours, rec, accepted, genres, days] = await Promise.all([
      db.select<{ ms: number; c: number; a: number }[]>(
        `SELECT COALESCE(SUM(h.ms_played),0) AS ms, COUNT(*) AS c, COUNT(DISTINCT t.artist) AS a
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1 AND h.played_at < $2`,
        [from, to]
      ),
      db.select<Row[]>(
        `SELECT t.artist AS name, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1 AND h.played_at < $2 AND t.artist <> ''
          GROUP BY t.artist ORDER BY ms DESC LIMIT 5`,
        [from, to]
      ),
      db.select<Row[]>(
        `SELECT t.title AS name, t.artist AS artist, COUNT(*) AS plays, SUM(h.ms_played) AS ms
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE h.played_at >= $1 AND h.played_at < $2
          GROUP BY t.id ORDER BY plays DESC, ms DESC LIMIT 5`,
        [from, to]
      ),
      db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM (
           SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
            WHERE h.played_at >= $1 AND h.played_at < $2 AND t.artist <> '' GROUP BY t.artist
           EXCEPT
           SELECT t.artist FROM play_history h JOIN tracks t ON t.id = h.track_id
            WHERE h.played_at < $1 AND t.artist <> '' GROUP BY t.artist)`,
        [from, to]
      ),
      db.select<{ hour: number; ms: number }[]>(
        `SELECT hour, SUM(ms_played) AS ms FROM play_history
          WHERE played_at >= $1 AND played_at < $2 GROUP BY hour ORDER BY ms DESC LIMIT 1`,
        [from, to]
      ),
      db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM recommendation_history WHERE recommended_at >= $1 AND recommended_at < $2`,
        [from, to]
      ),
      // "Tuttu" = öneriden SONRA en az %40'ı dinlendi (masaüstüyle aynı eşik).
      db.select<{ c: number }[]>(
        `SELECT COUNT(*) AS c FROM recommendation_history r
           JOIN tracks t ON t.id = r.track_id
          WHERE r.recommended_at >= $1 AND r.recommended_at < $2
            AND t.duration_ms > 0
            AND (SELECT MAX(h.ms_played) FROM play_history h
                  WHERE h.track_id = r.track_id AND h.played_at >= r.recommended_at) * 1.0
                / t.duration_ms >= 0.4`,
        [from, to]
      ),
      db.select<{ c: number }[]>(
        `SELECT COUNT(DISTINCT g.tag) AS c
           FROM artist_tags g
           JOIN tracks t ON lower(t.artist) = g.artist
           JOIN play_history h ON h.track_id = t.id
          WHERE h.played_at >= $1 AND h.played_at < $2`,
        [from, to]
      ),
      db.select<{ d: number }[]>(
        `SELECT DISTINCT CAST(played_at / 86400000 AS INTEGER) AS d
           FROM play_history WHERE played_at >= $1 AND played_at < $2 ORDER BY d ASC`,
        [from, to]
      ),
    ]);
    let streak = 0;
    let best = 0;
    let prev: number | null = null;
    for (const row of days) {
      streak = prev !== null && row.d === prev + 1 ? streak + 1 : 1;
      if (streak > best) best = streak;
      prev = row.d;
    }
    setData({
      totalMs: tot[0]?.ms ?? 0,
      plays: tot[0]?.c ?? 0,
      artists: tot[0]?.a ?? 0,
      newArtists: fresh[0]?.c ?? 0,
      topArtists,
      topTracks,
      peakHour: hours[0]?.hour ?? 0,
      recommended: rec[0]?.c ?? 0,
      recAccepted: accepted[0]?.c ?? 0,
      genres: genres[0]?.c ?? 0,
      streak: best,
    });
  }, [range]);

  useEffect(() => {
    void load().catch((e) => {
      console.error("[özet] hesaplanamadı:", e);
      setData({
        totalMs: 0, plays: 0, artists: 0, newArtists: 0, topArtists: [], topTracks: [],
        peakHour: 0, recommended: 0, recAccepted: 0, genres: 0, streak: 0,
      });
    });
  }, [load]);

  const label = year === "12m" ? t("wrapped.last12m") : String(year);
  const minutes = d ? Math.round(d.totalMs / 60_000) : 0;

  function summaryText(): string {
    if (!d) return "";
    return [
      `Resonance ${label}`,
      t("wrapped.copyMinutes", { minutes: count(minutes, lang), plays: count(d.plays, lang) }),
      t("wrapped.copyArtists", { artists: d.artists, newArtists: d.newArtists }),
      d.topArtists.length ? t("wrapped.copyTop", { list: d.topArtists.map((a) => a.name).join(", ") }) : "",
      t("wrapped.copyRec", { count: d.recommended, accepted: d.recAccepted }),
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function shareImage() {
    if (!card.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(card, { format: "png", quality: 1, result: "tmpfile" });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "image/png", dialogTitle: `Resonance ${label}` });
      } else {
        await Share.share({ message: summaryText() });
      }
    } catch (e) {
      console.warn("[özet] görsel paylaşılamadı, metne düşülüyor:", e);
      await Share.share({ message: summaryText() });
    } finally {
      setSharing(false);
    }
  }

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("wrapped.open")} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <View className="px-5">
          <Segmented
            value={year}
            onChange={setYear}
            options={[
              { value: thisYear, label: String(thisYear) },
              { value: thisYear - 1, label: String(thisYear - 1) },
              { value: "12m", label: t("wrapped.last12m") },
            ]}
          />
        </View>

        {!d ? (
          <View className="items-center pt-12">
            <ActivityIndicator color={c.accent} />
            <Text className="text-muted mt-3 text-[12px]">{t("wrapped.loading")}</Text>
          </View>
        ) : !d.plays ? (
          <EmptyState icon="calendar" text={t("wrapped.empty", { label })} />
        ) : (
          <>
            {/* Paylaşılan görsel YALNIZ bu kart — kendi başına okunur olmalı. */}
            <View ref={card} collapsable={false} className="bg-bg mx-4 mt-5 overflow-hidden rounded-3xl">
              <View className="bg-surface border-border rounded-3xl border p-6">
                <View className="flex-row items-center">
                  <BarMark size={16} />
                  <Text className="text-accent ml-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.6 }}>
                    {`RESONANCE · ${label.toLocaleUpperCase(lang)}`}
                  </Text>
                </View>

                <Text className="text-text mt-5 text-[56px] leading-[58px]" style={{ fontFamily: "Archivo_800ExtraBold" }} adjustsFontSizeToFit numberOfLines={1}>
                  {count(minutes, lang)}
                </Text>
                <Text className="text-muted text-[14px]">{t("wrapped.minutes")}</Text>
                <Text className="text-text mt-4 text-[15px] leading-[22px]">
                  {d.newArtists === d.artists
                    ? t("wrapped.headlineFirst", { plays: count(d.plays, lang), artists: d.artists })
                    : t("wrapped.headline", { plays: count(d.plays, lang), artists: d.artists, newArtists: d.newArtists })}
                </Text>

                <View className="mt-6 flex-row">
                  <Tile value={`${String(d.peakHour).padStart(2, "0")}:00`} label={t("wrapped.peakHour")} />
                  <Tile value={t("wrapped.days", { n: d.streak })} label={t("wrapped.streak")} />
                </View>
                <View className="mt-3 flex-row">
                  <Tile value={String(d.newArtists)} label={t("wrapped.newArtists")} />
                  <Tile value={String(d.genres)} label={t("wrapped.newGenres")} />
                </View>

                <TopBlock title={t("wrapped.topArtists")} rows={d.topArtists.map((a) => [a.name, t("wrapped.minShort", { n: Math.round(a.ms / 60_000) })])} />
                <TopBlock title={t("wrapped.topTracks")} rows={d.topTracks.map((s) => [s.name, `${s.plays}×`])} />

                {d.recommended > 0 ? (
                  <View className="bg-surface-2 mt-6 rounded-2xl p-4">
                    <Text className="text-accent text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}>
                      {t("wrapped.resonanceCard").toLocaleUpperCase(lang)}
                    </Text>
                    <Text className="text-text mt-2 text-[14px] leading-5">
                      {t("wrapped.resonanceBody", {
                        count: d.recommended,
                        accepted: d.recAccepted,
                        pct: Math.round((d.recAccepted / Math.max(1, d.recommended)) * 100),
                      })}
                    </Text>
                    <Text className="text-faint mt-1 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                      {pct(d.recAccepted / Math.max(1, d.recommended), lang)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View className="flex-row gap-2 px-5 pt-5">
              <Button kind="primary" icon="share" label={t("m.wrapped.shareImage")} busy={sharing} onPress={shareImage} className="flex-1" />
              <Button
                kind="secondary"
                icon="copy"
                label={t("wrapped.copy")}
                onPress={async () => {
                  try {
                    await Clipboard.setStringAsync(summaryText());
                    useToastStore.getState().show(t("wrapped.copied"), "success");
                  } catch {
                    useToastStore.getState().show(t("wrapped.copyFailed"), "error");
                  }
                }}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  const lang = useLang();
  return (
    <View className="flex-1">
      <Text className="text-text text-[22px]" style={{ fontFamily: "Archivo_700Bold" }} numberOfLines={1}>
        {value}
      </Text>
      <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }} numberOfLines={1}>
        {label.toLocaleUpperCase(lang)}
      </Text>
    </View>
  );
}

function TopBlock({ title, rows }: { title: string; rows: [string, string][] }) {
  const lang = useLang();
  if (!rows.length) return null;
  return (
    <View className="mt-6">
      <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}>
        {title.toLocaleUpperCase(lang)}
      </Text>
      {rows.map(([name, value], i) => (
        <View key={`${name}-${i}`} className="mt-2 flex-row items-baseline">
          <Text className="text-accent w-6 text-[13px]" style={{ fontFamily: "Archivo_700Bold" }}>
            {i + 1}
          </Text>
          <Text className="text-text flex-1 text-[15px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-muted ml-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}
