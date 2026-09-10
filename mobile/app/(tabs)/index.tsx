import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import TrackPlayer, { State, usePlaybackState, useProgress } from "react-native-track-player";

import { togglePlay } from "../../src/audio/player";
import { useSleepTimer } from "../../src/audio/sleepTimer";
import { ArtistActions } from "../../src/components/ArtistActions";
import { BarMark } from "../../src/components/BarMark";
import { DevicePicker } from "../../src/components/DevicePicker";
import { Lyrics } from "../../src/components/Lyrics";
import { Eyebrow, TrackRow } from "../../src/components/TrackRow";
import { reasonText } from "../../src/lib/recommender";
import { voteCurrent } from "../../src/lib/vote";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { useSettingsStore } from "../../src/store/useSettingsStore";
import { bestThumb } from "../../src/lib/thumbs";
import { COLORS } from "../../src/theme";

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function NowPlaying() {
  const { current, queue, index, loading, error } = usePlayerStore();
  const progress = useProgress(250);
  const playback = usePlaybackState();
  const playing = playback.state === State.Playing;
  const { width } = useWindowDimensions();
  const [karma, setKarma] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  const [showLyrics, setShowLyrics] = useState(false);
  const job = useDownloadStore((st) => (current ? st.jobs[current.id] : undefined));
  const lang = useSettingsStore((st) => st.language);
  const sleepEndsAt = useSleepTimer((st) => st.endsAt);
  const sleepLeft = sleepEndsAt ? Math.max(1, Math.round((sleepEndsAt - Date.now()) / 60000)) : 0;
  const downloadStatus =
    job?.status === "iniyor" ? `%${Math.round(job.progress * 100)}` : (job?.status ?? "");

  useEffect(() => setKarma(0), [current?.id]);

  if (!current) {
    return (
      <View className="flex-1 bg-bg px-5 pt-6">
        <View className="flex-row justify-end">
          <DevicePicker />
        </View>
        <View className="flex-1 items-center justify-center">
          <BarMark size={34} color={COLORS.surface3} />
          <Text className="text-muted mt-5 text-center text-sm">
            Sessiz. Ara'dan bir şarkı seç ya da Keşfet'i başlat.
          </Text>
        </View>
      </View>
    );
  }

  const ratio = progress.duration > 0 ? progress.position / progress.duration : 0;
  const votable = !!current.playlistId;
  const art = Math.round(width * 0.86);
  // Boş alanı havayla değil bilgiyle doldur: sırada ne var, neden var.
  const upNext = queue.slice(index + 1, index + 4);

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerStyle={{ paddingBottom: 28 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Kapak tam kenara dayanır: uygulamadaki tek zengin görsel bu, kart
          içine hapsedilince ekran forma benziyor. Altındaki perde yazıyı
          taşıyabilsin diye kademeli koyulaşır. */}
      <View style={{ height: art }}>
        <Image
          source={{ uri: bestThumb(current.thumbnail, 720) }}
          style={{ width: "100%", height: "100%", backgroundColor: COLORS.surface2 }}
          contentFit="cover"
          transition={220}
        />
        <Scrim height={Math.round(art * 0.62)} />
      </View>

      <View className="-mt-16 px-5">
        <View className="flex-row items-end gap-3">
          <BarMark size={22} alive={playing} />
          <Text
            className="text-muted text-[10px]"
            style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}
          >
            {current.isRecommendation ? "KEŞFET" : votable ? "LİSTEDEN" : "ARAMA"}
          </Text>
        </View>

        <Text
          className="text-text mt-2 text-[26px] leading-[30px]"
          style={{ fontFamily: "Archivo_800ExtraBold" }}
          numberOfLines={2}
        >
          {current.title}
        </Text>
        <Text className="text-muted mt-1 text-sm" numberOfLines={1}>
          {current.artist}
        </Text>

        <Pressable
          className="mt-5 py-3"
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onPress={(e) => {
            if (!barWidth || progress.duration <= 0) return;
            const target = (e.nativeEvent.locationX / barWidth) * progress.duration;
            void TrackPlayer.seekTo(Math.max(0, Math.min(progress.duration, target)));
          }}
        >
          <View className="h-[2px] w-full bg-surface-3">
            <View
              className="h-[2px] bg-accent"
              style={{ width: `${Math.min(100, ratio * 100)}%` }}
            />
          </View>
        </Pressable>
        <View className="-mt-1 flex-row justify-between">
          <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {mmss(progress.position)}
          </Text>
          <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {mmss(progress.duration)}
          </Text>
        </View>

        {error ? (
          <Text className="text-down mt-3 text-xs" numberOfLines={2}>
            {error}
          </Text>
        ) : null}

        <View className="mt-6 flex-row items-center justify-center gap-8">
          <Glyph label="◀◀" onPress={() => usePlayerStore.getState().previous()} />
          <Pressable
            onPress={togglePlay}
            className="h-[68px] w-[68px] items-center justify-center rounded-full bg-accent"
            android_ripple={{ color: COLORS.accentDim, borderless: true }}
          >
            <Text className="text-bg text-2xl" style={{ marginTop: playing ? 0 : -1 }}>
              {loading ? "…" : playing ? "❚❚" : "▶"}
            </Text>
          </Pressable>
          <Glyph label="▶▶" onPress={() => usePlayerStore.getState().next()} />
        </View>

        {/* Oy ve karma TEK KÜME: ok, sayı, ok — sayı hangi yöne ait olduğunu
            ancak yanındaysa anlatır. */}
        <View className="mt-5 flex-row items-center justify-center gap-5">
          <Vote dir={1} disabled={!votable} onKarma={setKarma} />
          <Text
            className={votable ? "text-muted text-[13px]" : "text-faint text-[13px]"}
            style={{ fontFamily: "JetBrainsMono_500Medium" }}
          >
            {votable ? (karma > 0 ? `+${karma}` : karma) : "—"}
          </Text>
          <Vote dir={-1} disabled={!votable} onKarma={setKarma} />
        </View>

        <ArtistActions artist={current.artist}>
          <Chip
            label={downloadStatus ? `İndir · ${downloadStatus}` : "İndir"}
            active={job?.status === "bitti"}
            onPress={() => useDownloadStore.getState().enqueue(current)}
          />
          <Chip
            label={sleepEndsAt ? `Uyku · ${sleepLeft} dk` : "Uyku"}
            active={!!sleepEndsAt}
            onPress={askSleep}
          />
          <Chip label="Sözler" active={showLyrics} onPress={() => setShowLyrics((v) => !v)} />
          <Chip label={`Sıra · ${queue.length}`} onPress={() => router.push("/queue")} />
          <DevicePicker />
        </ArtistActions>

        {showLyrics ? <Lyrics track={current} positionMs={progress.position * 1000} /> : null}

        {upNext.length ? (
          <View className="mt-8">
            <Pressable onPress={() => router.push("/queue")}>
              <Eyebrow>{`Sıradaki · tümü (${queue.length})`}</Eyebrow>
            </Pressable>
            <View className="mt-1">
              {upNext.map((item) => (
                <TrackRow
                  key={item.uid}
                  title={item.title}
                  artist={item.artist}
                  thumbnail={item.thumbnail}
                  note={item.recReason ? reasonText(item.recReason, lang) : undefined}
                  onPress={() => usePlayerStore.getState().playNow(item, queue, item.playlistId)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

/** Kapağın altını kademeli karartır (gradyan için native paket eklemeye değmez). */
function Scrim({ height }: { height: number }) {
  const steps = 10;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}>
      {Array.from({ length: steps }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: COLORS.bg,
            opacity: Math.pow((i + 1) / steps, 1.35),
          }}
        />
      ))}
    </View>
  );
}

function Glyph({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={16}>
      <Text className="text-muted text-base">{label}</Text>
    </Pressable>
  );
}

function Vote({
  dir,
  disabled,
  onKarma,
}: {
  dir: 1 | -1;
  disabled: boolean;
  onKarma: (k: number) => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      hitSlop={12}
      onPress={() => void voteCurrent(dir, (k) => onKarma(k.karma))}
      className={disabled ? "opacity-25" : ""}
    >
      <Text style={{ color: dir > 0 ? COLORS.up : COLORS.down, fontSize: 22 }}>
        {dir > 0 ? "▲" : "▼"}
      </Text>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-8 justify-center rounded-full border px-3 ${
        active ? "border-accent-dim bg-surface-2" : "border-border bg-transparent"
      }`}
    >
      <Text
        className={active ? "text-accent text-[11px]" : "text-muted text-[11px]"}
        style={{ fontFamily: "JetBrainsMono_400Regular" }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Uyku zamanlayıcı seçimi. ⚠️ Android'de Alert EN FAZLA 3 düğme gösterir
 * (4.'sü sessizce düşer) → "kapat" yalnız zamanlayıcı açıkken görünür.
 */
function askSleep() {
  const { setMinutes, endsAt } = useSleepTimer.getState();
  const buttons = endsAt
    ? [
        { text: "Kapat", style: "destructive" as const, onPress: () => setMinutes(null) },
        { text: "30 dk", onPress: () => setMinutes(30) },
        { text: "60 dk", onPress: () => setMinutes(60) },
      ]
    : [
        { text: "15 dk", onPress: () => setMinutes(15) },
        { text: "30 dk", onPress: () => setMinutes(30) },
        { text: "60 dk", onPress: () => setMinutes(60) },
      ];
  Alert.alert("Uyku zamanlayıcı", endsAt ? "Zamanlayıcı açık." : "Ne kadar sonra dursun?", buttons);
}
