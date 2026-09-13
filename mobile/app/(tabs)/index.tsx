import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BarMark } from "../../src/components/BarMark";
import { adoptRemote, useRemoteQueues } from "../../src/components/DevicePicker";
import { Icon } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { Artwork, Button, Card, EmptyState, Eyebrow, IconButton, Mosaic, Section } from "../../src/components/ui";
import { useCovers } from "../../src/store/useCovers";
import { getDb } from "../../src/lib/db";
import { ago, clock } from "../../src/lib/fmt";
import { getRecentTracks, weekDiscoveries } from "../../src/lib/history";
import { dayNameOf } from "../../src/lib/i18n";
import { useLang, useT } from "../../src/lib/i18n.mobile";
import { getPlaylistTracks } from "../../src/lib/playlists";
import { SMART_LISTS } from "../../src/lib/smartLists";
import { buildTasteProfile, predictedStyles } from "../../src/lib/taste";
import { DISCOVERY_ID, usePlayerStore } from "../../src/store/usePlayerStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";
import { useColors } from "../../src/theme";
import type { Playlist, Track } from "../../src/types";

/**
 * Ana sayfa — masaüstü `HomeView`: gün ve saate göre kaldığın yerden devam.
 * Keşif kartı, saat profilinin tahmini, başka cihazda yarım kalan sıra,
 * haftanın keşifleri, son çalınanlar ve listeler.
 */
export default function Home() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace(true);
  const playlists = usePlaylistStore((s) => s.playlists);
  const covers = useCovers((s) => s.covers);
  const discovering = usePlayerStore((s) => s.discovering);
  const inDiscovery = usePlayerStore((s) => s.radioActive && s.radioPlaylistId === DISCOVERY_ID);
  const avatar = useSettingsStore((s) => s.avatarDataUrl);
  const { rows: remote } = useRemoteQueues();
  const [recent, setRecent] = useState<Track[]>([]);
  const [fresh, setFresh] = useState<Track[]>([]);
  const [predicted, setPredicted] = useState<string[]>([]);
  const [startingList, setStartingList] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());

  const load = useCallback(async () => {
    try {
      setNow(new Date());
      const [r] = await Promise.all([getRecentTracks(12), buildTasteProfile()]);
      setRecent(r);
      setPredicted(predictedStyles(3));
      setFresh(await weekDiscoveries(10));
    } catch (e) {
      console.warn("[ana sayfa] yüklenemedi:", e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      // Başlıktaki saat/selam dakikada bir tazelensin (ekran açık kalınca eskiyordu).
      const id = setInterval(() => setNow(new Date()), 60_000);
      return () => clearInterval(id);
    }, [load])
  );

  // İlk açılış rehberi yalnız GERÇEKTEN yeni kurulumda: dinleme geçmişi olan
  // (senkronla gelmiş) kullanıcıya gösterilmez, bayrak sessizce kapanır.
  useEffect(() => {
    const s = useSettingsStore.getState();
    if (s.onboardingDone) return;
    void (async () => {
      const db = await getDb();
      const rows = await db.select<{ n: number }[]>(
        `SELECT (SELECT COUNT(*) FROM play_history) + (SELECT COUNT(*) FROM playlists WHERE deleted = 0) AS n`
      );
      if ((rows[0]?.n ?? 0) > 0) void s.update("onboardingDone", true);
      else router.push("/onboarding");
    })();
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 6 ? t("home.goodNight") : hour < 12 ? t("home.goodMorning") : hour < 18 ? t("home.goodDay") : t("home.goodEvening");
  const hasContent = recent.length > 0 || playlists.length > 0;

  async function smartShuffle(p: Playlist) {
    setStartingList(p.id);
    try {
      const tracks = await getPlaylistTracks(p.id);
      if (tracks.length) await usePlayerStore.getState().startSmartShuffle(tracks, p.id);
    } finally {
      setStartingList(null);
    }
  }

  async function startInStyle(artist: string) {
    router.push("/discover");
    await usePlayerStore.getState().startDiscovery({ force: true, lockedSeedArtist: artist });
  }

  return (
    <ScrollView className="bg-bg flex-1" contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: bottom }}>
      <View className="flex-row items-center px-5 pb-1">
        <View className="flex-1">
          <Eyebrow>{`${clock(now.getTime())} · ${dayNameOf(lang, now.getDay())}`}</Eyebrow>
          <Text className="text-text mt-1 text-[30px] leading-[34px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
            {greeting}
          </Text>
        </View>
        <IconButton name="chart" label={t("profile.stats")} onPress={() => router.push("/stats")} color={c.muted} />
        <IconButton name="settings" label={t("nav.settings")} onPress={() => router.push("/settings")} color={c.muted} />
        <Pressable onPress={() => router.push("/account")} accessibilityLabel={t("profile.account")} className="ml-1">
          <Artwork uri={avatar || undefined} size={34} radius={17} />
        </Pressable>
      </View>

      {/* Keşif — uygulamanın kalbi; en üstte ve tek büyük eylem. */}
      <View className="px-5 pt-4">
        <Card>
          <View className="flex-row items-center px-5 pb-5 pt-5">
            <View className="flex-1 pr-3">
              <View className="flex-row items-center">
                <BarMark size={14} alive={inDiscovery} />
                <Text className="text-accent ml-2 text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}>
                  {t("home.discoveryTitle").toLocaleUpperCase(lang)}
                </Text>
              </View>
              <Text className="text-text mt-2 text-[19px] leading-6" style={{ fontFamily: "Archivo_700Bold" }}>
                {inDiscovery ? t("m.home.discoveryOn") : t("discover.empty")}
              </Text>
              <Text className="text-muted mt-1 text-[12px] leading-[17px]">{t("home.discoveryDesc")}</Text>
            </View>
          </View>
          <View className="flex-row gap-2 px-5 pb-5">
            <Button
              kind="primary"
              icon={inDiscovery ? "play" : "compass"}
              label={inDiscovery ? t("m.home.backToDiscovery") : t("discover.start")}
              busy={discovering}
              onPress={() => {
                if (inDiscovery) router.push("/player");
                else void usePlayerStore.getState().startDiscovery();
              }}
            />
            <Button kind="ghost" label={t("discover.filters")} icon="sliders" onPress={() => router.push("/discover")} />
          </View>
        </Card>
      </View>

      {remote[0] ? (
        <View className="px-5 pt-3">
          <Card onPress={() => adoptRemote(remote[0], t)}>
            <View className="flex-row items-center p-3.5">
              <Artwork uri={remote[0].queue[remote[0].queueIndex]?.thumbnail} size={48} radius={8} />
              <View className="ml-3 flex-1">
                <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }} numberOfLines={1}>
                  {`${t("home.otherDevice", { device: remote[0].deviceName }).toLocaleUpperCase(lang)} · ${ago(remote[0].updatedAt, lang)}`}
                </Text>
                <Text className="text-text mt-0.5 text-[14px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
                  {remote[0].queue[remote[0].queueIndex]?.title ?? "—"}
                </Text>
                <Text className="text-muted text-[12px]" numberOfLines={1}>
                  {remote[0].queue[remote[0].queueIndex]?.artist ?? ""}
                </Text>
              </View>
              <View className="bg-surface-3 ml-2 h-10 flex-row items-center rounded-full px-3.5">
                <Icon name="devices" size={15} color={c.accent} />
                <Text className="text-text ml-1.5 text-[12px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                  {t("home.otherDeviceResume")}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      ) : null}

      {predicted.length ? (
        <Section title={t("home.forNow")}>
          <Text className="text-muted -mt-1 mb-3 px-5 text-[13px] leading-5">
            {t("home.forNowBody", { styles: predicted.join(" · ") })}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            {predicted.map((a) => (
              <Pressable
                key={a}
                onPress={() => void startInStyle(a)}
                className="bg-surface-2 h-10 flex-row items-center rounded-full px-4 active:opacity-70"
              >
                <Icon name="radio" size={14} color={c.accent} />
                <Text className="text-text ml-2 text-[13px]" style={{ fontFamily: "Inter_500Medium" }}>
                  {t("home.startStyle", { artist: a })}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </Section>
      ) : null}

      {fresh.length ? (
        <Section title={t("home.weekDiscoveries")}>
          <Shelf tracks={fresh} />
        </Section>
      ) : null}

      {recent.length ? (
        <Section title={t("home.recent")}>
          <Shelf tracks={recent} />
        </Section>
      ) : null}

      {playlists.length ? (
        <Section title={t("home.yourPlaylists")} action={t("m.common.seeAll")} onAction={() => router.push("/library")}>
          {playlists.slice(0, 6).map((p) => (
            <Pressable
              key={p.id}
              onPress={() => router.push({ pathname: "/playlist/[id]", params: { id: p.id } })}
              android_ripple={{ color: c.surface2 }}
              className="flex-row items-center px-5 py-2.5"
            >
              <Mosaic uris={covers[p.id]} size={48} radius={10} />
              <View className="ml-3 flex-1">
                <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                  {t("playlist.trackCount", { count: p.trackCount ?? 0 })}
                </Text>
              </View>
              <Button
                small
                kind="secondary"
                icon="sparkles"
                label={t("m.home.smartShuffle")}
                busy={startingList === p.id}
                onPress={() => void smartShuffle(p)}
              />
            </Pressable>
          ))}
        </Section>
      ) : null}

      <Section title={t("smart.header")}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
          {SMART_LISTS.map((l) => (
            <Pressable
              key={l.id}
              onPress={() => router.push({ pathname: "/smart/[id]", params: { id: l.id } })}
              className="bg-surface border-border w-40 rounded-2xl border p-3.5 active:opacity-80"
            >
              <Icon name="wand" size={18} color={c.accent} />
              <Text className="text-text mt-3 text-[14px] leading-[18px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>
                {t(l.labelKey)}
              </Text>
              <Text className="text-muted mt-1 text-[11px] leading-[15px]" numberOfLines={2}>
                {t(l.descKey)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </Section>

      {!hasContent ? (
        <EmptyState text={t("home.emptyState")} action={t("home.startSearching")} onAction={() => router.push("/search")} />
      ) : null}
    </ScrollView>
  );
}

/** Yatay kapak rafı — dokununca raftaki parçalar sıra olarak çalar. */
function Shelf({ tracks }: { tracks: Track[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
      {tracks.map((tr) => (
        <Pressable
          key={tr.id}
          onPress={() => void usePlayerStore.getState().playNow(tr, tracks)}
          className="w-[132px] active:opacity-80"
        >
          <Artwork uri={tr.thumbnail} size={132} radius={10} />
          <Text className="text-text mt-2 text-[13px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
            {tr.title}
          </Text>
          <Text className="text-muted text-[11px]" numberOfLines={1}>
            {tr.artist}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
