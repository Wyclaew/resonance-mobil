import { useSegments } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hapticTap } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { mmss } from "../lib/fmt";
import {
  estimatedPosition,
  refreshRemotePlayback,
  sendRemote,
  startRemoteWatch,
  useRemotePlayback,
  type RemoteAction,
} from "../lib/remoteControl";
import { useOverlay } from "../store/useOverlay";
import { usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import { BarMark } from "./BarMark";
import { Icon } from "./Icon";
import { MINI_PLAYER_HEIGHT, TAB_BAR_HEIGHT } from "./MiniPlayer";
import { Sheet } from "./Sheet";
import { Artwork, IconButton } from "./ui";

const REMOTE_BAR_HEIGHT = 44;
const HIDDEN_ON = new Set(["player", "ambient", "onboarding", "queue"]);
const SEEK_STEP_MS = 15_000;

/**
 * "Mac'te çalıyor" çubuğu — Spotify Connect'teki "… üzerinde dinleniyor" bandı.
 * Başka cihazda çalan (ya da yakın zamanda duraklatılan) varsa mini oynatıcının
 * hemen üstünde ince çubuk; dokununca o cihazı kumanda eden sayfa açılır.
 */
export function RemoteDeviceBar() {
  const c = useColors();
  const t = useT();
  const insets = useSafeAreaInsets();
  const segments = useSegments() as string[];
  const device = useRemotePlayback((s) => s.device);
  const hasLocal = usePlayerStore((s) => !!s.current);
  const sheetOpen = useOverlay((s) => s.sheets > 0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void startRemoteWatch();
    // Oturum sonradan açılırsa izleme ilk öne gelişte başlar (startRemoteWatch tekrar güvenli).
    const sub = AppState.addEventListener("change", (s) => s === "active" && void startRemoteWatch().then(refreshRemotePlayback));
    return () => sub.remove();
  }, []);

  // Cihaz kaybolursa açık sayfa kapanmış sayılsın (yeniden görününce kendiliğinden açılmasın).
  useEffect(() => {
    if (!device) setOpen(false);
  }, [device]);

  if (!device) return null;
  const hidden = (sheetOpen && !open) || HIDDEN_ON.has(segments[0] ?? "");
  const inTabs = segments[0] === "(tabs)";
  const bottom = (inTabs ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom) + 6 + (hasLocal ? MINI_PLAYER_HEIGHT : 0);

  return (
    <>
      {hidden ? null : (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(160)}
          style={{ position: "absolute", left: 8, right: 8, bottom, height: REMOTE_BAR_HEIGHT - 4 }}
        >
          <Pressable
            onPress={() => setOpen(true)}
            className="bg-accent/15 border-accent/40 h-full flex-row items-center rounded-xl border pl-3 pr-1"
            accessibilityLabel={t("m.remote.open", { device: device.deviceName })}
          >
            <BarMark size={12} alive={device.playing} />
            <Text className="text-accent ml-2 flex-1 text-[12px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={1}>
              {`${t(device.playing ? "m.remote.playingOn" : "m.remote.pausedOn", { device: device.deviceName })} · ${device.title}`}
            </Text>
            <IconButton
              name={device.playing ? "pause" : "play"}
              label={device.playing ? t("player.pause") : t("player.play")}
              size={18}
              filled
              color={c.accent}
              onPress={() => void command("toggle", undefined, t)}
            />
          </Pressable>
        </Animated.View>
      )}
      <RemoteSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

async function command(action: RemoteAction, value: number | undefined, t: ReturnType<typeof useT>): Promise<void> {
  hapticTap();
  if (!(await sendRemote(action, value))) useToastStore.getState().show(t("m.remote.failed"), "error");
}

function RemoteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const c = useColors();
  const t = useT();
  const device = useRemotePlayback((s) => s.device);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    void refreshRemotePlayback();
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  if (!device) return null;
  const pos = estimatedPosition(device, now);
  const ratio = device.durationMs ? pos / device.durationMs : 0;

  return (
    <Sheet visible={open} onClose={onClose} title={t(device.playing ? "m.remote.playingOn" : "m.remote.pausedOn", { device: device.deviceName })}>
      <View className="flex-row items-center px-5 pb-4">
        <Artwork uri={device.thumbnail} size={64} radius={10} />
        <View className="ml-4 flex-1">
          <Text className="text-text text-[16px]" style={{ fontFamily: "Inter_600SemiBold" }} numberOfLines={2}>
            {device.title}
          </Text>
          <Text className="text-muted mt-0.5 text-[13px]" numberOfLines={1}>
            {device.artist}
          </Text>
        </View>
      </View>
      <View className="px-5">
        <View className="bg-surface-3 h-1 overflow-hidden rounded-full">
          <View style={{ width: `${Math.min(100, ratio * 100)}%`, height: 4, backgroundColor: c.accent }} />
        </View>
        <View className="mt-1.5 flex-row justify-between">
          <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {mmss(pos / 1000)}
          </Text>
          <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {mmss(device.durationMs / 1000)}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center justify-evenly px-3 pb-2 pt-3">
        <IconButton name="down" label={t("mini.dislike")} onPress={() => void command("vote", -1, t)} />
        <IconButton name="skipBack" label={t("player.previous")} size={26} filled onPress={() => void command("prev", undefined, t)} />
        <Pressable
          onPress={() => void command("toggle", undefined, t)}
          accessibilityLabel={device.playing ? t("player.pause") : t("player.play")}
          className="bg-accent h-16 w-16 items-center justify-center rounded-full active:opacity-85"
        >
          <View style={{ marginLeft: device.playing ? 0 : 3 }}>
            <Icon name={device.playing ? "pause" : "play"} size={28} filled color={c.onAccent} />
          </View>
        </Pressable>
        <IconButton name="skipForward" label={t("player.next")} size={26} filled onPress={() => void command("next", undefined, t)} />
        <IconButton name="up" label={t("mini.like")} onPress={() => void command("vote", 1, t)} />
      </View>
      <View className="flex-row justify-center gap-6 pb-4">
        <Pressable onPress={() => void command("seek", Math.max(0, pos - SEEK_STEP_MS), t)} hitSlop={8}>
          <Text className="text-muted text-[13px]">{t("m.remote.back15")}</Text>
        </Pressable>
        <Pressable onPress={() => void command("seek", pos + SEEK_STEP_MS, t)} hitSlop={8}>
          <Text className="text-muted text-[13px]">{t("m.remote.fwd15")}</Text>
        </Pressable>
      </View>
      <Text className="text-faint px-5 pb-3 text-center text-[11px]">{t("m.remote.hint", { device: device.deviceName })}</Text>
    </Sheet>
  );
}
