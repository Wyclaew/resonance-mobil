import { useCallback, useEffect, useState } from "react";
import { AppState, Modal, Pressable, ScrollView, Text, View } from "react-native";

import { listRemoteQueues, type RemoteQueue } from "../lib/deviceQueue";
import { onRemoteApplied } from "../lib/sync/engine";
import { getDeviceId } from "../lib/device";
import { usePlayerStore } from "../store/usePlayerStore";
import { COLORS } from "../theme";

/**
 * "Şu cihazdaki kuyruğu getir" — cihazlar arası devam, AÇIK SEÇİMLE.
 *
 * ⚠️ Önce otomatik bir "devam et?" bandı vardı; her açılışta kendini
 * hatırlatıyordu ve kullanıcıyı rahatsız etti. Masaüstündeki
 * `DeviceQueuePicker` deseni doğru olan: karar kullanıcıda, düğme yalnız
 * BAŞKA cihazın kuyruğu varsa görünür, kuyruk DURAKLATILMIŞ kurulur.
 */
export function DevicePicker() {
  const [rows, setRows] = useState<RemoteQueue[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await listRemoteQueues();
      const me = getDeviceId();
      setRows(all.filter((r) => r.deviceId !== me && r.queue.length > 0));
    } catch (e) {
      console.warn("[cihazlar] okunamadı:", e);
    }
  }, []);

  useEffect(() => {
    void load();
    const off = onRemoteApplied(() => void load());
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [load]);

  if (!rows.length) return null;

  return (
    <>
      <Pressable
        onPress={() => {
          void load();
          setOpen(true);
        }}
        className="h-8 justify-center rounded-full border border-border px-3"
      >
        <Text className="text-muted text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          Cihazlar · {rows.length}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1 justify-end bg-black/60" onPress={() => setOpen(false)}>
          <Pressable className="rounded-t-lg border-t border-border bg-surface px-5 pb-10 pt-5">
            <Text className="text-text text-base" style={{ fontFamily: "Archivo_700Bold" }}>
              Başka cihazdaki kuyruk
            </Text>
            <Text className="text-muted mt-1 text-xs">
              Seçtiğin kuyruk buraya duraklatılmış olarak kurulur.
            </Text>

            <ScrollView className="mt-4 max-h-80">
              {rows.map((row) => {
                const now = row.queue[Math.min(row.queueIndex, row.queue.length - 1)];
                return (
                  <Pressable
                    key={row.deviceId}
                    onPress={async () => {
                      setOpen(false);
                      await usePlayerStore.getState().adoptRemoteQueue(row);
                    }}
                    className="mb-2 rounded border border-border px-4 py-3"
                    android_ripple={{ color: COLORS.surface2 }}
                  >
                    <Text
                      className="text-faint text-[10px]"
                      style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.2 }}
                    >
                      {`${row.deviceName.toUpperCase()} · ${ago(row.updatedAt)} · ${row.queue.length} PARÇA`}
                    </Text>
                    <Text className="text-text mt-1 text-[14px]" numberOfLines={1}>
                      {now?.title ?? "—"}
                    </Text>
                    <Text className="text-muted text-xs" numberOfLines={1}>
                      {now?.artist ?? ""}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function ago(ms: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}
