import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { getDeviceId } from "../lib/device";
import { listRemoteQueues, type RemoteQueue } from "../lib/deviceQueue";
import { ago } from "../lib/fmt";
import { useLang, useT } from "../lib/i18n.mobile";
import { onRemoteApplied } from "../lib/sync/engine";
import { DISCOVERY_ID, usePlayerStore } from "../store/usePlayerStore";
import { useToastStore } from "../store/useToastStore";
import { useColors } from "../theme";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Artwork, Chip } from "./ui";

/** Başka cihazların senkronlanmış kuyrukları (bu cihaz hariç, boş olmayanlar). */
export function useRemoteQueues(): { rows: RemoteQueue[]; reload: () => Promise<void> } {
  const [rows, setRows] = useState<RemoteQueue[]>([]);
  const reload = useCallback(async () => {
    try {
      const me = getDeviceId();
      const all = await listRemoteQueues();
      setRows(all.filter((r) => r.deviceId !== me && r.queue.length > 0));
    } catch (e) {
      console.warn("[cihazlar] okunamadı:", e);
    }
  }, []);
  useEffect(() => {
    void reload();
    const off = onRemoteApplied(() => void reload());
    const sub = AppState.addEventListener("change", (s) => s === "active" && void reload());
    return () => {
      off();
      sub.remove();
    };
  }, [reload]);
  return { rows, reload };
}

export function adoptRemote(row: RemoteQueue, t: ReturnType<typeof useT>): void {
  usePlayerStore.getState().adoptRemoteQueue(row);
  useToastStore.getState().show(t("sync.resumedFrom", { device: row.deviceName }), "success");
}

/**
 * ⭐ Çapraz cihaz devam — masaüstündeki `DeviceQueuePicker` gibi AÇIK SEÇİM.
 * ⚠️ Kendiliğinden açılan "devam et?" bandı kullanıcıyı rahatsız etti ve
 * kaldırıldı: seçici yalnız başka cihazın kuyruğu VARSA görünür, kuyruk
 * DURAKLATILMIŞ kurulur (telefon cebinde kendiliğinden çalmasın).
 */
export function DevicePicker() {
  const t = useT();
  const { rows, reload } = useRemoteQueues();
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <>
      <Chip
        icon="devices"
        label={`${t("device.pick")} · ${rows.length}`}
        onPress={() => {
          void reload();
          setOpen(true);
        }}
      />
      <DeviceSheet rows={rows} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DeviceSheet({ rows, open, onClose }: { rows: RemoteQueue[]; open: boolean; onClose: () => void }) {
  const t = useT();
  const lang = useLang();
  const c = useColors();
  return (
    <Sheet visible={open} onClose={onClose} title={t("device.pickTitle")} scroll>
      <Text className="text-muted -mt-1 px-5 pb-3 text-[12px]">{t("device.pickHint")}</Text>
      {rows.map((row) => {
        const now = row.queue[Math.min(row.queueIndex, row.queue.length - 1)];
        return (
          <Pressable
            key={row.deviceId}
            onPress={() => {
              onClose();
              adoptRemote(row, t);
            }}
            android_ripple={{ color: c.surface3 }}
            className="flex-row items-center px-5 py-3"
          >
            <Artwork uri={now?.thumbnail} size={48} radius={8} />
            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                <Icon name={row.mode === "discovery" ? "compass" : "devices"} size={12} color={c.accent} />
                <Text
                  className="text-accent ml-1.5 text-[10px]"
                  style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }}
                  numberOfLines={1}
                >
                  {`${row.deviceName.toLocaleUpperCase(lang)} · ${ago(row.updatedAt, lang)}`}
                </Text>
              </View>
              <Text className="text-text mt-0.5 text-[14px]" style={{ fontFamily: "Inter_500Medium" }} numberOfLines={1}>
                {now?.title ?? "—"}
              </Text>
              <Text className="text-muted text-[12px]" numberOfLines={1}>
                {t("device.queueInfo", {
                  count: row.queue.length,
                  title: row.mode === "discovery" || row.playlistId === DISCOVERY_ID ? t("nav.discover") : (now?.artist ?? ""),
                })}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </Sheet>
  );
}
