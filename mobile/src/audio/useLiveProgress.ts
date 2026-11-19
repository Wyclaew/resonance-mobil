import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useProgress } from "react-native-track-player";

/** Uygulama arka plandayken yoklama aralığı: ekran kapalı uzun çalmada köprü boşuna uyanmasın. */
const BACKGROUND_INTERVAL_MS = 60_000;

/**
 * `useProgress`'in arka planda yavaşlayan hali (optimizasyon, 2026-11). Mini oynatıcı,
 * ilerleme çubuğu ve sözler ekran kapalıyken de 300-1000 ms'de bir konum soruyordu.
 * Aralık değişince kanca kendini yeniden kurar → öne gelince hemen tazelenir.
 */
export function useLiveProgress(intervalMs: number) {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return useProgress(active ? intervalMs : BACKGROUND_INTERVAL_MS);
}
