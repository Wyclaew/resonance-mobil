import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useSleepTimer } from "../audio/sleepTimer";
import { useT } from "../lib/i18n.mobile";
import { Sheet, SheetAction } from "./Sheet";

const MINUTES = [15, 30, 45, 60, 90];

/**
 * Uyku zamanlayıcı seçimi (masaüstü `SleepTimerButton`).
 * ⚠️ Eskiden Android `Alert` kullanılıyordu: en fazla 3 düğme gösteriyor,
 * "şarkı bitince dur" seçeneği sığmıyordu. Alt sayfada sınır yok.
 */
export function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { endsAt, afterTrack, setMinutes, setAfterTrack } = useSleepTimer();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open || !endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [open, endsAt]);
  const left = endsAt ? Math.max(1, Math.ceil((endsAt - now) / 60_000)) : 0;
  const pick = (fn: () => void) => () => {
    fn();
    onClose();
  };
  return (
    <Sheet visible={open} onClose={onClose} title={t("sleep.title")}>
      {endsAt || afterTrack ? (
        <View className="px-5 pb-2">
          <Text className="text-accent text-[13px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
            {endsAt ? t("sleep.remaining", { n: left }) : t("sleep.afterTrack")}
          </Text>
        </View>
      ) : null}
      {MINUTES.map((m) => (
        <SheetAction key={m} icon="timer" label={t("sleep.minutes", { n: m })} onPress={pick(() => setMinutes(m))} />
      ))}
      <SheetAction icon="music" label={t("sleep.afterTrack")} active={afterTrack} onPress={pick(() => setAfterTrack(true))} />
      {endsAt || afterTrack ? (
        <SheetAction
          icon="x"
          label={t("m.sleep.off")}
          danger
          onPress={pick(() => (afterTrack ? setAfterTrack(false) : setMinutes(null)))}
        />
      ) : null}
    </Sheet>
  );
}
