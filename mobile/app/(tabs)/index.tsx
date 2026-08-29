import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import TrackPlayer, { useProgress, usePlaybackState, State } from "react-native-track-player";

import { togglePlay } from "../../src/audio/player";
import { voteCurrent } from "../../src/lib/vote";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlayerStore } from "../../src/store/usePlayerStore";

function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function NowPlaying() {
  const { current, loading, error } = usePlayerStore();
  const progress = useProgress(250);
  const playback = usePlaybackState();
  const playing = playback.state === State.Playing;
  const [karma, setKarma] = useState(0);
  const [barWidth, setBarWidth] = useState(0);
  // ⚠️ Hook'lar erken dönüşün ÜSTÜNDE kalmalı — parça yokken de çağrılır.
  const job = useDownloadStore((st) => (current ? st.jobs[current.id] : undefined));
  const downloadStatus =
    job?.status === "iniyor" ? `%${Math.round(job.progress * 100)}` : (job?.status ?? "");

  // Parça değişince karma göstergesi sıfırlanır; gerçek değer ilk oyda gelir.
  useEffect(() => setKarma(0), [current?.id]);

  if (!current) {
    return (
      <View className="flex-1 items-center justify-center bg-bg px-8">
        <Text className="text-muted text-center text-sm">
          Henüz bir şey çalmıyor. “Ara” sekmesinden bir şarkı seç.
        </Text>
      </View>
    );
  }

  const ratio = progress.duration > 0 ? progress.position / progress.duration : 0;
  // Bu parça bir listeden çalıyorsa oy verilebilir (oylar liste bazlı — masaüstüyle aynı).
  const votable = !!current.playlistId;

  return (
    <View className="flex-1 bg-bg px-6 pt-16">
      <View className="aspect-square w-full overflow-hidden rounded-lg bg-surface-2">
        {current.thumbnail ? (
          <Image source={{ uri: current.thumbnail }} style={{ flex: 1 }} contentFit="cover" />
        ) : null}
      </View>

      <Text className="text-text mt-6 text-xl font-semibold" numberOfLines={2}>
        {current.title}
      </Text>
      <Text className="text-muted mt-1 text-base" numberOfLines={1}>
        {current.artist}
      </Text>

      {/* Dokunulan yere atlar. Şerit ince olduğu için dokunma alanı dolgu ile
          büyütülür (parmak 1 piksellik çizgiyi tutturamaz). */}
      <Pressable
        className="mt-6 py-3"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (!barWidth || progress.duration <= 0) return;
          const target = (e.nativeEvent.locationX / barWidth) * progress.duration;
          void TrackPlayer.seekTo(Math.max(0, Math.min(progress.duration, target)));
        }}
      >
        <View className="h-1 w-full rounded bg-surface-3">
          <View className="h-1 rounded bg-accent" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </View>
      </Pressable>
      <View className="mt-2 flex-row justify-between">
        <Text className="text-faint text-xs">{mmss(progress.position)}</Text>
        <Text className="text-faint text-xs">{mmss(progress.duration)}</Text>
      </View>

      {error ? <Text className="text-down mt-4 text-sm">{error}</Text> : null}

      {/* ⭐ Oy TEK YOLDAN geçer (`lib/vote.ts`) — masaüstü v1.8.7 dersi: iki ayrı
          oy yolu olunca biri `ensureTrack`'i unutuyor ve oy SESSİZCE
          öğrenmeye katılmıyordu (gotcha #13). */}
      <View className="mt-6 flex-row items-center justify-center gap-4">
        <VoteButton dir={1} disabled={!votable} onKarma={setKarma} />
        <Text className="text-muted w-14 text-center text-sm">{votable ? karma : "—"}</Text>
        <VoteButton dir={-1} disabled={!votable} onKarma={setKarma} />
      </View>

      <View className="mt-4 flex-row items-center justify-center">
        {/* Çevrimdışı çalma + veri tasarrufu: indirilen parça bir daha akış
            istemez (mobilde en değerli özellik — MOBILE.md §1). */}
        <Pressable
          onPress={() => useDownloadStore.getState().enqueue(current)}
          className="rounded-lg bg-surface-2 px-4 py-2"
        >
          <Text className="text-muted text-xs">
            {downloadStatus ? `⬇ ${downloadStatus}` : "⬇ İndir"}
          </Text>
        </Pressable>
      </View>

      <View className="mt-4 flex-row items-center justify-center gap-6">
        <Pressable
          onPress={() => usePlayerStore.getState().previous()}
          className="h-12 w-12 items-center justify-center rounded-full bg-surface-2"
        >
          <Text className="text-text text-lg">⏮</Text>
        </Pressable>
        <Pressable
          onPress={togglePlay}
          className="h-16 w-16 items-center justify-center rounded-full bg-accent"
        >
          <Text className="text-lg text-bg">{loading ? "…" : playing ? "⏸" : "▶"}</Text>
        </Pressable>
        <Pressable
          onPress={() => usePlayerStore.getState().next()}
          className="h-12 w-12 items-center justify-center rounded-full bg-surface-2"
        >
          <Text className="text-text text-lg">⏭</Text>
        </Pressable>
      </View>
    </View>
  );
}


function VoteButton({
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
      onPress={async () => {
        const res = await voteCurrent(dir, (k) => onKarma(k.karma));
        if (!res.ok) return; // cooldown/uygun değil — toast'ı vote.ts gösterir
      }}
      className={`h-11 w-11 items-center justify-center rounded-full ${
        dir > 0 ? "bg-up-dim" : "bg-down-dim"
      } ${disabled ? "opacity-30" : ""}`}
    >
      <Text className="text-text text-base">{dir > 0 ? "▲" : "▼"}</Text>
    </Pressable>
  );
}
