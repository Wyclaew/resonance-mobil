import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";

import { cooldownRemaining } from "../lib/karma";
import { karmaLabel } from "../lib/fmt";
import { hapticSuccess, hapticWarn } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { getTrackKarma } from "../lib/playlists";
import { KARMA_EVENT, voteCurrent, type KarmaEventDetail } from "../lib/vote";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import type { QueueItem } from "../types";
import { Icon } from "./Icon";

/**
 * Oy + karma TEK KÜME: ok, sayı, ok (masaüstü `KarmaControl`).
 *
 * ⚠️ İKİ BUG'DI:
 *  - Sayı ham decay'li skordu → oy verince "+1" yerine "1.4123123" yazıyordu.
 *    Artık `karmaLabel` (masaüstündeki `displayKarma` = yuvarlama).
 *  - Parça değişince sayı 0'a sıfırlanıp ancak oy verilince doluyordu; önceden
 *    oylanmış parça "0" görünüyordu. Artık açılışta DB'den okunur.
 * Bildirimden verilen oy da `KARMA_EVENT` ile buraya yansır.
 */
export function KarmaControl({ item }: { item: QueueItem }) {
  const c = useColors();
  const t = useT();
  const [karma, setKarma] = useState(0);
  const [lastVoteAt, setLastVoteAt] = useState<number | undefined>();
  const [now, setNow] = useState(Date.now());
  const pulse = useSharedValue(1);
  const votable = !!item.playlistId;

  useEffect(() => {
    let alive = true;
    setKarma(0);
    setLastVoteAt(undefined);
    if (votable) {
      void getTrackKarma(item.playlistId!, item.id)
        .then((k) => {
          if (!alive) return;
          setKarma(k.karma);
          setLastVoteAt(k.lastVoteAt);
        })
        .catch(() => {});
    }
    const onKarma = (e: Event) => {
      const d = (e as CustomEvent<KarmaEventDetail>).detail;
      if (d?.trackId !== item.id) return;
      setKarma(d.karma);
      setLastVoteAt(d.lastVoteAt);
    };
    window.addEventListener(KARMA_EVENT, onKarma);
    return () => {
      alive = false;
      window.removeEventListener(KARMA_EVENT, onKarma);
    };
  }, [item.id, item.playlistId, votable]);

  const remaining = cooldownRemaining(lastVoteAt, now);
  const onCooldown = remaining > 0;
  useEffect(() => {
    if (!onCooldown) return;
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, [onCooldown]);

  const numberStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  async function vote(dir: 1 | -1) {
    if (!votable) {
      useToastStore.getState().show(t("m.karma.notVotable"), "info");
      return;
    }
    if (onCooldown) {
      hapticWarn();
      useToastStore.getState().show(t("karma.cooldown", { mins: Math.ceil(remaining / 60_000) }), "info");
      return;
    }
    const res = await voteCurrent(dir, (k) => {
      setKarma(k.karma);
      setLastVoteAt(k.lastVoteAt);
      setNow(Date.now());
    });
    if (res.ok) {
      hapticSuccess();
      pulse.value = withSequence(withTiming(1.25, { duration: 110 }), withTiming(1, { duration: 160 }));
    }
  }

  const rounded = Math.round(karma);
  const tone = !votable ? c.faint : rounded > 0 ? c.up : rounded < 0 ? c.down : c.muted;
  const arrowColor = (dir: 1 | -1) => (!votable || onCooldown ? c.faint : dir > 0 ? c.up : c.down);

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => vote(1)}
        hitSlop={10}
        accessibilityLabel={t("mini.like")}
        className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon name="up" size={28} color={arrowColor(1)} strokeWidth={1.6} />
      </Pressable>
      <Animated.View style={[{ minWidth: 44, alignItems: "center" }, numberStyle]}>
        <Text style={{ color: tone, fontFamily: "JetBrainsMono_500Medium", fontSize: 16 }}>
          {votable ? karmaLabel(karma) : "—"}
        </Text>
        {onCooldown ? (
          <Text className="text-faint text-[9px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {t("m.karma.minutes", { n: Math.ceil(remaining / 60_000) })}
          </Text>
        ) : null}
      </Animated.View>
      <Pressable
        onPress={() => vote(-1)}
        hitSlop={10}
        accessibilityLabel={t("mini.dislike")}
        className="h-12 w-12 items-center justify-center rounded-full active:opacity-60"
      >
        <Icon name="down" size={28} color={arrowColor(-1)} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}
