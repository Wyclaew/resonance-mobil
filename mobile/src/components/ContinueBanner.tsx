import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { latestRemoteQueue, type RemoteQueue } from "../lib/deviceQueue";
import { otherDevicePlayback, type DevicePlayback } from "../lib/nowPlaying";
import { onRemoteApplied } from "../lib/sync/engine";
import { usePlayerStore } from "../store/usePlayerStore";

/**
 * ⭐ "PC'de bırak, telefonda devam et" (MOBILE.md §5.1).
 *
 * Şema ve protokol masaüstünde HAZIR: `now_playing` tek parçayı, `device_queue`
 * Keşfet partisinin tamamını (parçalar + index + filtreler + tohumlar) taşır.
 * Mobil açılışta kuyruğu **DURAKLATILMIŞ** kurar — telefon cepteyken kendi
 * kendine çalmaya başlamamalı.
 */
export function ContinueBanner() {
  const [remote, setRemote] = useState<DevicePlayback | null>(null);
  const [queue, setQueue] = useState<RemoteQueue | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const current = usePlayerStore((s) => s.current);

  const check = useCallback(async () => {
    try {
      const [playback, remoteQueue] = await Promise.all([
        otherDevicePlayback(),
        latestRemoteQueue(),
      ]);
      setRemote(playback);
      setQueue(remoteQueue);
    } catch (e) {
      console.warn("[devam] uzak durum okunamadı:", e);
    }
  }, []);

  useEffect(() => {
    void check();
    // Senkron bir tur çekince tazele (yeni satırlar gelmiş olabilir).
    const off = onRemoteApplied(() => void check());
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void check();
    });
    return () => {
      off();
      sub.remove();
    };
  }, [check]);

  // Zaten o parçayı çalıyorsak ya da kullanıcı kapattıysa gösterme.
  const target = remote ?? null;
  if (!target) return null;
  const key = `${target.deviceId}:${target.trackId}:${target.updatedAt}`;
  if (dismissed === key) return null;
  if (current?.id === target.trackId) return null;

  const minutes = Math.round((Date.now() - target.updatedAt) / 60000);
  const when = minutes < 1 ? "az önce" : minutes < 60 ? `${minutes} dk önce` : `${Math.round(minutes / 60)} sa önce`;

  return (
    <View className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3">
      <Text className="text-faint text-xs">
        {target.deviceName} · {when}
      </Text>
      <Text className="text-text mt-1 text-sm" numberOfLines={1}>
        {target.title}
      </Text>
      <Text className="text-muted text-xs" numberOfLines={1}>
        {target.artist}
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Pressable
          onPress={async () => {
            setDismissed(key);
            const store = usePlayerStore.getState();
            if (queue && queue.queue.length) {
              await store.adoptRemoteQueue(queue);
              return;
            }
            // Kuyruk yoksa tek parçayı kurtar (now_playing yalnız onu taşır).
            await store.playNow({
              id: target.trackId,
              source: "youtube",
              sourceId: target.sourceId,
              title: target.title,
              artist: target.artist,
              durationMs: target.durationMs,
              thumbnail: target.thumbnail,
            });
          }}
          className="flex-1 items-center rounded-lg bg-accent py-2"
        >
          <Text className="text-bg text-sm font-semibold">
            {queue?.queue.length ? `Devam et (${queue.queue.length} parça)` : "Devam et"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setDismissed(key)}
          className="items-center justify-center rounded-lg bg-surface-3 px-4"
        >
          <Text className="text-muted text-sm">Kapat</Text>
        </Pressable>
      </View>
    </View>
  );
}
