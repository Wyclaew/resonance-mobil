import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Share, Text, View } from "react-native";
import { create } from "zustand";

import { date, duration } from "../lib/fmt";
import { getTrackStats, type TrackStats } from "../lib/history";
import { useLang, useT } from "../lib/i18n.mobile";
import { encodePlaylist } from "../lib/share";
import { useDownloadStore } from "../store/useDownloadStore";
import { usePlayerStore } from "../store/usePlayerStore";
import { usePlaylistStore } from "../store/usePlaylistStore";
import { useToastStore } from "../store/useToastStore";
import type { Track } from "../types";
import { useAddToPlaylist } from "./AddToPlaylistSheet";
import { HourBars } from "./Charts";
import { Sheet, SheetAction } from "./Sheet";
import { Artwork, Stat } from "./ui";

/** Sayfanın hangi eylemleri göstereceği — satırın durduğu yere göre. */
export interface TrackSheetContext {
  /** Gerçek bir listedeyse "listeden çıkar". */
  playlistId?: string;
  onRemoved?: () => void;
  /** Sıradaysa "sıradan çıkar". */
  queueUid?: string;
  /** Liste satırından oy (masaüstünde her satırda KarmaControl vardı). */
  onVote?: (dir: 1 | -1) => void;
}

interface SheetState {
  track: Track | null;
  ctx: TrackSheetContext;
  open: (track: Track, ctx?: TrackSheetContext) => void;
  close: () => void;
}

export const useTrackSheet = create<SheetState>((set) => ({
  track: null,
  ctx: {},
  open: (track, ctx = {}) => set({ track, ctx }),
  close: () => set({ track: null, ctx: {} }),
}));

/**
 * Parça sayfası — satıra UZUN BASINCA ya da ⋮'ye dokununca açılır.
 * Masaüstündeki `TrackDetail` (dinleme karnesi) + sağ tık menüsünün karşılığı.
 */
export function TrackSheet() {
  const { track, ctx, close } = useTrackSheet();
  const t = useT();
  const lang = useLang();
  const [stats, setStats] = useState<TrackStats | null>(null);
  const downloaded = useDownloadStore((s) => (track ? s.downloaded.has(track.id) : false));
  const isCurrent = usePlayerStore((s) => !!track && s.current?.id === track.id);

  useEffect(() => {
    setStats(null);
    if (!track) return;
    let alive = true;
    void getTrackStats(track.id, track.durationMs)
      .then((s) => alive && setStats(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [track]);

  if (!track) return null;
  const run = (fn: () => void | Promise<void>) => () => {
    close();
    void fn();
  };
  const realPlaylist = ctx.playlistId && !ctx.playlistId.startsWith("__") && !ctx.playlistId.includes(":");

  return (
    <Sheet visible onClose={close} scroll>
      <View className="flex-row items-center px-5 pb-3 pt-1">
        <Artwork uri={track.thumbnail} size={60} radius={8} />
        <View className="ml-3.5 flex-1">
          <Text className="text-text text-[16px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>
            {track.title}
          </Text>
          <Text className="text-muted mt-0.5 text-[13px]" numberOfLines={1}>
            {track.artist}
          </Text>
        </View>
      </View>

      {stats && stats.plays > 0 ? (
        <View className="border-border mx-5 mb-2 rounded-2xl border px-4 py-3.5">
          <View className="flex-row">
            <Stat value={String(stats.plays)} label={t("trackDetail.plays")} />
            <Stat value={String(stats.completed)} label={t("trackDetail.completed")} />
            <Stat value={String(stats.skipped)} label={t("trackDetail.skipped")} />
          </View>
          <Text className="text-muted mt-3 text-[12px] leading-[17px]">
            {t("trackDetail.summary", {
              total: duration(stats.totalMs, lang),
              first: stats.firstAt ? date(stats.firstAt, lang) : "—",
              last: stats.lastAt ? date(stats.lastAt, lang) : "—",
            })}
          </Text>
          <View className="mt-3">
            <HourBars values={stats.byHour} height={36} />
          </View>
        </View>
      ) : stats ? (
        <Text className="text-faint px-5 pb-2 text-[12px]">{t("trackDetail.never")}</Text>
      ) : null}

      {ctx.onVote ? (
        <View className="flex-row px-3 pb-1">
          <View className="flex-1">
            <SheetAction icon="up" label={t("mini.like")} onPress={run(() => ctx.onVote!(1))} />
          </View>
          <View className="flex-1">
            <SheetAction icon="down" label={t("mini.dislike")} onPress={run(() => ctx.onVote!(-1))} />
          </View>
        </View>
      ) : null}
      {!isCurrent ? (
        <>
          <SheetAction
            icon="listOrdered"
            label={t("m.sheet.playNext")}
            onPress={run(() => usePlayerStore.getState().enqueue(track, "next"))}
          />
          <SheetAction
            icon="listPlus"
            label={t("m.sheet.addToQueue")}
            onPress={run(() => usePlayerStore.getState().enqueue(track, "end"))}
          />
        </>
      ) : null}
      <SheetAction icon="plus" label={t("addTo.title")} onPress={run(() => useAddToPlaylist.getState().open(track))} />
      <SheetAction
        icon="user"
        label={t("m.sheet.goToArtist", { artist: track.artist })}
        onPress={run(() => router.push({ pathname: "/artist/[name]", params: { name: track.artist } }))}
      />
      {track.source !== "local" ? (
        downloaded ? (
          <SheetAction
            icon="checkCircle"
            label={t("m.sheet.removeDownload")}
            active
            onPress={run(() => useDownloadStore.getState().remove(track.id))}
          />
        ) : (
          <SheetAction icon="download" label={t("player.download")} onPress={run(() => useDownloadStore.getState().enqueue(track))} />
        )
      ) : null}
      {ctx.queueUid ? (
        <SheetAction
          icon="minus"
          label={t("queue.remove")}
          onPress={run(() => usePlayerStore.getState().removeFromQueue(ctx.queueUid!))}
        />
      ) : null}
      {realPlaylist ? (
        <SheetAction
          icon="trash"
          label={t("playlist.removeFromList")}
          danger
          onPress={run(async () => {
            await usePlaylistStore.getState().removeTrack(ctx.playlistId!, track.id);
            ctx.onRemoved?.();
          })}
        />
      ) : null}
      <SheetAction
        icon="share"
        label={t("m.sheet.shareCode")}
        sub={t("m.sheet.shareCodeHint")}
        onPress={run(async () => {
          // RSNC1 kodu — masaüstü de aynı kodu okur (`share.ts`).
          try {
            await Share.share({ message: encodePlaylist(track.title, [track]) });
          } catch {
            useToastStore.getState().show(t("m.common.shareFailed"), "error");
          }
        })}
      />
    </Sheet>
  );
}
