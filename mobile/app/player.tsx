import { Image } from "expo-image";
import { router, useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useProgress } from "react-native-track-player";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSleepTimer } from "../src/audio/sleepTimer";
import { ArtistActions } from "../src/components/ArtistActions";
import { BarMark } from "../src/components/BarMark";
import { DevicePicker } from "../src/components/DevicePicker";
import { Icon } from "../src/components/Icon";
import { KarmaControl } from "../src/components/KarmaControl";
import { Lyrics } from "../src/components/Lyrics";
import { Seekbar } from "../src/components/Seekbar";
import { SleepSheet } from "../src/components/SleepSheet";
import { TrackRow } from "../src/components/TrackRow";
import { useTrackSheet } from "../src/components/TrackSheet";
import { Artwork, Chip, EmptyState, Eyebrow, IconButton } from "../src/components/ui";
import { hapticTap } from "../src/lib/haptics";
import { useLang, useT } from "../src/lib/i18n.mobile";
import { reasonText } from "../src/lib/recommender";
import { bestThumb } from "../src/lib/thumbs";
import { useDownloadStore } from "../src/store/useDownloadStore";
import { usePlayback } from "../src/store/usePlayback";
import { DISCOVERY_ID, usePlayerStore } from "../src/store/usePlayerStore";
import { usePlaylistStore } from "../src/store/usePlaylistStore";
import { useMobileSettings } from "../src/lib/mobileSettings";
import { alpha, useColors } from "../src/theme";

/**
 * Tam ekran oynatıcı — masaüstündeki alt çubuk + sıra paneli + sözler.
 * Mini oynatıcıdan açılır, aşağı ok kapatır.
 */
export default function Player() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const current = usePlayerStore((s) => s.current);
  const queue = usePlayerStore((s) => s.queue);
  const index = usePlayerStore((s) => s.index);
  const loading = usePlayerStore((s) => s.loading);
  const error = usePlayerStore((s) => s.error);
  const shuffleMode = usePlayerStore((s) => s.shuffleMode);
  const repeat = usePlayerStore((s) => s.repeat);
  const radioPlaylistId = usePlayerStore((s) => s.radioPlaylistId);
  const discovering = usePlayerStore((s) => s.discovering);
  const locked = usePlayerStore((s) => s.lockedSeedArtist);
  const playing = usePlayback((s) => s.playing);
  const buffering = usePlayback((s) => s.buffering);
  const sleep = useSleepTimer();
  const [showLyrics, setShowLyrics] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const downloaded = useDownloadStore((s) => (current ? s.downloaded.has(current.id) : false));
  const job = useDownloadStore((s) => (current ? s.jobs[current.id] : undefined));
  const playlistName = usePlaylistStore((s) => s.playlists.find((p) => p.id === current?.playlistId)?.name);
  const touched = useIdleAmbient();

  if (!current) {
    return (
      <View className="bg-bg flex-1" style={{ paddingTop: insets.top }}>
        <View className="h-14 flex-row items-center px-2">
          <IconButton name="chevronDown" label={t("common.close")} onPress={() => router.back()} />
        </View>
        <EmptyState text={t("player.searchAndPlay")} action={t("m.tab.search")} onAction={() => router.replace("/search")} />
      </View>
    );
  }

  const art = Math.min(width - 48, 420);
  const inDiscovery = radioPlaylistId === DISCOVERY_ID;
  const context = inDiscovery
    ? t("nav.discover")
    : current.playlistId?.startsWith("artist:")
      ? current.playlistId.slice(7)
      : playlistName
        ? playlistName
        : current.isRecommendation
          ? t("rec.badge")
          : t("m.tab.search");
  const upNext = queue.slice(index + 1, index + 4);
  const busy = loading || buffering;
  const dlLabel = downloaded
    ? t("m.player.downloaded")
    : job?.status === "running"
      ? `${Math.round(job.progress * 100)}%`
      : t("player.download");
  const sleepLabel = sleep.endsAt
    ? t("sleep.remaining", { n: Math.max(1, Math.ceil((sleep.endsAt - Date.now()) / 60_000)) })
    : sleep.afterTrack
      ? t("m.sleep.afterTrackShort")
      : t("m.player.sleep");

  return (
    <View className="bg-bg flex-1" onTouchStart={touched}>
      {/* Arka plan: kapağın bulanık, koyulaştırılmış hali — ekrana derinlik ve
          şarkıya özgü renk verir, yazıyı bozmaz. */}
      <Image
        source={{ uri: bestThumb(current.thumbnail, 160) }}
        style={{ position: "absolute", width: "100%", height: "75%", opacity: c.isLight ? 0.4 : 0.75 }}
        blurRadius={40}
        contentFit="cover"
        transition={400}
      />
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: alpha(c.bg, c.isLight ? 0.7 : 0.55) }}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="h-14 flex-row items-center px-2">
          <IconButton name="chevronDown" label={t("common.close")} onPress={() => router.back()} size={26} />
          <View className="flex-1 items-center px-2">
            <Eyebrow>{current.playlistId && !inDiscovery ? t("m.player.fromList") : t("m.player.playing")}</Eyebrow>
            <Text className="text-text text-[13px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
              {context}
            </Text>
          </View>
          <IconButton name="more" label={t("trackDetail.open")} onPress={() => useTrackSheet.getState().open(current, { queueUid: undefined })} />
        </View>

        <View className="items-center px-6 pt-4">
          {showLyrics ? (
            <View style={{ width: art, height: art }} className="bg-surface/60 rounded-2xl px-5 py-4">
              <LyricsLive />
            </View>
          ) : (
            <Pressable onPress={() => setShowLyrics(true)} onLongPress={() => router.push("/ambient")}>
              <Artwork uri={current.thumbnail} size={art} radius={16} style={{ elevation: 14 }} />
            </Pressable>
          )}
        </View>

        <View className="px-6 pt-7">
          <View className="flex-row items-start">
            <View className="flex-1 pr-2">
              {current.isRecommendation ? (
                <View className="mb-1.5 flex-row items-center">
                  <BarMark size={11} alive={playing} />
                  <Text
                    className="text-accent ml-2 flex-1 text-[10px]"
                    style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 0.4 }}
                    numberOfLines={1}
                  >
                    {current.isProbe ? t("discover.probe") : reasonText(current.recReason, lang)}
                  </Text>
                </View>
              ) : null}
              <Text className="text-text text-[24px] leading-[29px]" style={{ fontFamily: "Archivo_800ExtraBold" }} numberOfLines={2}>
                {current.title}
              </Text>
              <Pressable
                onPress={() => router.push({ pathname: "/artist/[name]", params: { name: current.artist } })}
                hitSlop={6}
              >
                <Text className="text-muted mt-1 text-[15px]" numberOfLines={1}>
                  {current.artist}
                </Text>
              </Pressable>
            </View>
            <KarmaControl item={current} />
          </View>

          <View className="mt-5">
            <Seekbar />
          </View>

          {error ? (
            <Text className="text-down mt-2 text-[12px]" numberOfLines={2}>
              {error}
            </Text>
          ) : null}

          <View className="mt-3 flex-row items-center justify-between">
            <IconButton
              name={shuffleMode === "smart" ? "sparkles" : "shuffle"}
              label={shuffleMode === "off" ? t("player.shuffleOff") : shuffleMode === "shuffle" ? t("player.shuffleOn") : t("player.shuffleSmart")}
              active={shuffleMode !== "off"}
              color={shuffleMode === "off" ? c.faint : c.accent}
              onPress={() => usePlayerStore.getState().cycleShuffle()}
            />
            <IconButton name="skipBack" label={t("player.previous")} size={30} filled onPress={() => void usePlayerStore.getState().previous()} />
            <Pressable
              onPress={() => {
                hapticTap();
                void usePlayerStore.getState().toggle();
              }}
              accessibilityLabel={playing ? t("player.pause") : t("player.play")}
              className="bg-accent h-[74px] w-[74px] items-center justify-center rounded-full active:opacity-85"
              style={{ elevation: 10 }}
            >
              {busy ? (
                <BarMark size={24} alive color={c.onAccent} />
              ) : (
                <View style={{ marginLeft: playing ? 0 : 3 }}>
                  <Icon name={playing ? "pause" : "play"} size={32} filled color={c.onAccent} />
                </View>
              )}
            </Pressable>
            <IconButton name="skipForward" label={t("player.next")} size={30} filled onPress={() => void usePlayerStore.getState().next("next")} />
            <IconButton
              name={repeat === "one" ? "repeatOne" : "repeat"}
              label={repeat === "off" ? t("player.repeatOff") : repeat === "all" ? t("player.repeatAll") : t("player.repeatOne")}
              color={repeat === "off" ? c.faint : c.accent}
              onPress={() => usePlayerStore.getState().cycleRepeat()}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 24, paddingTop: 22 }}
        >
          <Chip icon="lyrics" label={t("player.lyrics")} active={showLyrics} onPress={() => setShowLyrics((v) => !v)} />
          <Chip icon="listMusic" label={`${t("player.queue")} · ${Math.max(0, queue.length - index - 1)}`} onPress={() => router.push("/queue")} />
          <Chip icon="timer" label={sleepLabel} active={!!sleep.endsAt || sleep.afterTrack} onPress={() => setSleepOpen(true)} />
          {current.source !== "local" ? (
            <Chip
              icon={downloaded ? "checkCircle" : "download"}
              label={dlLabel}
              active={downloaded}
              onPress={() =>
                downloaded
                  ? useTrackSheet.getState().open(current)
                  : void useDownloadStore.getState().enqueue(current)
              }
            />
          ) : null}
          <Chip icon="maximize" label={t("m.player.ambient")} onPress={() => router.push("/ambient")} />
          <DevicePicker />
        </ScrollView>

        {inDiscovery ? (
          <View className="mt-6 px-6">
            <Eyebrow>{locked ? t("discover.lockedOn", { artist: locked }) : t("m.player.discoveryControls")}</Eyebrow>
            <View className="mt-2.5 flex-row flex-wrap gap-2">
              <Chip
                icon="radio"
                label={t("discover.moreLike")}
                onPress={() => void usePlayerStore.getState().moreLikeThis(current)}
              />
              <Chip icon="refresh" label={discovering ? t("discover.preparing") : t("queue.reroll")} onPress={() => void usePlayerStore.getState().rerollDiscovery()} />
              {locked ? (
                <Chip icon="lockOpen" label={t("discover.unlock")} onPress={() => usePlayerStore.getState().setLockedSeedArtist(null)} />
              ) : null}
            </View>
          </View>
        ) : null}

        <View className="mt-6">
          <View className="mb-2.5 px-6">
            <Eyebrow>{t("m.player.artistPrefs", { artist: current.artist })}</Eyebrow>
          </View>
          <ArtistActions artist={current.artist} />
        </View>

        {upNext.length ? (
          <View className="mt-8 px-4">
            <Pressable onPress={() => router.push("/queue")} className="mb-1 flex-row items-center justify-between px-2">
              <Eyebrow>{t("discover.upNext")}</Eyebrow>
              <Text className="text-accent text-[12px]" style={{ fontFamily: "Inter_500Medium" }}>
                {t("m.common.seeAll")}
              </Text>
            </Pressable>
            {upNext.map((item, i) => (
              <TrackRow
                key={item.uid}
                track={item}
                note={item.recReason ? reasonText(item.recReason, lang) : undefined}
                sheet={{ queueUid: item.uid }}
                onPress={() => void usePlayerStore.getState().jumpTo(index + 1 + i)}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
      <SleepSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />
    </View>
  );
}

/**
 * Masaüstü "ambiyans ekranı": X sn etkileşim olmazsa çalan şarkı tam ekran.
 * Mobilde YALNIZ oynatıcı açıkken ve çalarken (Ayarlar → Görünüm; 0 = kapalı).
 */
function useIdleAmbient(): () => void {
  const seconds = useMobileSettings((s) => s.ambientSeconds);
  const playing = usePlayback((s) => s.playing);
  const focused = useIsFocused();
  const [touchedAt, setTouchedAt] = useState(Date.now());
  useEffect(() => {
    if (!seconds || !playing || !focused) return;
    const id = setTimeout(() => router.push("/ambient"), seconds * 1000);
    return () => clearTimeout(id);
  }, [seconds, playing, focused, touchedAt]);
  return () => setTouchedAt(Date.now());
}

/** Sözler kendi ilerleme aboneliğiyle — oynatıcının tamamı saniyede 4 kez çizilmesin. */
function LyricsLive() {
  const current = usePlayerStore((s) => s.current);
  const { position } = useProgress(300);
  if (!current) return null;
  return <Lyrics track={current} positionMs={position * 1000} large />;
}
