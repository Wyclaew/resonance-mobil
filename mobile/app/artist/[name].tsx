import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Text, View } from "react-native";

import { ArtistActions } from "../../src/components/ArtistActions";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { TrackRow } from "../../src/components/TrackRow";
import { Button, Card, EmptyState, Eyebrow, Stat, TopBar } from "../../src/components/ui";
import { acceptanceRate, buildAcceptance } from "../../src/lib/acceptance";
import { getDb } from "../../src/lib/db";
import { date, duration, pct } from "../../src/lib/fmt";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { loadArtistPrefs } from "../../src/lib/prefs";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import type { Track } from "../../src/types";

type Row = Track & { plays: number; ms: number; last: number };

/**
 * Sanatçı sayfası — masaüstü `ArtistView`: bilinen parçalar + dinleme sayıları,
 * seninle geçmişi, öneri kabul oranı, tercih düğmeleri, sanatçı radyosu.
 */
export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({ plays: 0, ms: 0, first: 0, last: 0 });
  const [rate, setRate] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!name) return;
    try {
      await Promise.all([loadArtistPrefs(true), buildAcceptance()]);
      const db = await getDb();
      // ⚠️ Dinleme sayısı LEFT JOIN ile: hiç dinlenmemiş liste parçaları da görünsün.
      const list = await db.select<(Row & { thumbnail: string | null })[]>(
        `SELECT t.id, t.source, t.source_id AS sourceId, t.title, t.artist,
                t.duration_ms AS durationMs, t.thumbnail,
                COUNT(h.id) AS plays,
                COALESCE(SUM(h.ms_played), 0) AS ms,
                COALESCE(MAX(h.played_at), 0) AS last
           FROM tracks t
           LEFT JOIN play_history h ON h.track_id = t.id
          WHERE lower(t.artist) = lower($1)
          GROUP BY t.id
          ORDER BY plays DESC, last DESC
          LIMIT 100`,
        [name]
      );
      setRows(list.map((r) => ({ ...r, thumbnail: r.thumbnail ?? undefined })));
      const tot = await db.select<{ plays: number; ms: number; first: number; last: number }[]>(
        `SELECT COUNT(*) AS plays, COALESCE(SUM(h.ms_played),0) AS ms,
                COALESCE(MIN(h.played_at),0) AS first, COALESCE(MAX(h.played_at),0) AS last
           FROM play_history h JOIN tracks t ON t.id = h.track_id
          WHERE lower(t.artist) = lower($1)`,
        [name]
      );
      if (tot[0]) setTotals(tot[0]);
      setRate(acceptanceRate(name));
    } catch (e) {
      console.error("[sanatçı] yüklenemedi:", e);
    } finally {
      setLoaded(true);
    }
  }, [name]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // "Radyosunu başlat": bu sanatçının parçalarından akıllı karışık (masaüstüyle aynı kimlik).
  async function startRadio() {
    if (!rows.length || starting || !name) return;
    setStarting(true);
    try {
      await usePlayerStore.getState().startSmartShuffle(rows, `artist:${name}`);
    } finally {
      setStarting(false);
    }
  }

  const header = (
    <View className="pb-2">
      <View className="px-5">
        <Eyebrow>{t("artist.subtitle", { count: rows.length })}</Eyebrow>
        <Text className="text-text mt-1 text-[32px] leading-[36px]" style={{ fontFamily: "Archivo_800ExtraBold" }} numberOfLines={3}>
          {name}
        </Text>
        <View className="mt-4 flex-row gap-2">
          <Button kind="primary" icon="radio" label={t("artist.startRadio")} busy={starting} disabled={!rows.length} onPress={startRadio} className="flex-1" />
          <Button
            kind="secondary"
            icon="compass"
            label={t("m.artist.discoverStyle")}
            onPress={() => void usePlayerStore.getState().startDiscovery({ force: true, lockedSeedArtist: name })}
          />
        </View>
      </View>

      <View className="mt-5">
        <ArtistActions artist={name ?? ""} />
      </View>

      <View className="px-5 pt-5">
        <Card>
          <View className="px-4 pb-4 pt-3.5">
            <Eyebrow>{t("artist.yourHistory")}</Eyebrow>
            {totals.plays ? (
              <>
                <View className="mt-3 flex-row">
                  <Stat value={String(totals.plays)} label={t("stats.plays")} />
                  <Stat value={duration(totals.ms, lang)} label={t("stats.listened")} />
                  {rate !== null ? <Stat value={pct(rate, lang)} label={t("taste.acceptRate")} accent /> : null}
                </View>
                <Text className="text-muted mt-3 text-[12px] leading-[17px]">
                  {t("artist.historyBody", {
                    plays: totals.plays,
                    total: duration(totals.ms, lang),
                    first: date(totals.first, lang),
                  })}
                </Text>
                {rate !== null ? (
                  <Text className="text-muted mt-1 text-[12px]">{t("artist.acceptance", { pct: Math.round(rate * 100) })}</Text>
                ) : null}
              </>
            ) : (
              <Text className="text-muted mt-2 text-[13px]">{t("artist.noHistory")}</Text>
            )}
          </View>
        </Card>
      </View>

      <View className="px-5 pt-6">
        <Eyebrow>{t("artist.tracks")}</Eyebrow>
      </View>
    </View>
  );

  return (
    <View className="bg-bg flex-1">
      <TopBar title={name} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: bottom, paddingHorizontal: 4 }}
        renderItem={({ item }) => (
          <TrackRow
            track={item}
            meta={item.plays ? `${item.plays}×` : undefined}
            onPress={() => void usePlayerStore.getState().playNow(item, rows)}
          />
        )}
        ListEmptyComponent={loaded ? <EmptyState text={t("artist.noTracks")} /> : null}
      />
    </View>
  );
}
