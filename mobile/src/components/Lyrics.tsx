import { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { fetchLyrics, type LrcLine } from "../lib/lyrics";
import type { Track } from "../types";

/**
 * Şarkı sözleri (lrclib.net). Zaman kodlu söz varsa çalan satır vurgulanır.
 *
 * ⚠️ Masaüstü dersi (v1.8.8): konum saniyede birkaç kez geliyor; satır
 * vurgusu için bu yeterli, ama HARF dolgusu yapılacaksa yerel saatle
 * ara değer gerekir. Burada satır düzeyinde kalıyoruz — telefonda okunaklı
 * olan da bu.
 */
export function Lyrics({ track, positionMs }: { track: Track; positionMs: number }) {
  const [synced, setSynced] = useState<LrcLine[] | null>(null);
  const [plain, setPlain] = useState<string | null>(null);
  const [state, setState] = useState<"yükleniyor" | "hazır" | "yok">("yükleniyor");
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    setState("yükleniyor");
    setSynced(null);
    setPlain(null);
    void fetchLyrics(track.artist, track.title, track.durationMs)
      .then((res) => {
        if (!alive) return;
        setSynced(res.synced);
        setPlain(res.plain);
        setState(res.synced || res.plain ? "hazır" : "yok");
      })
      .catch(() => alive && setState("yok"));
    return () => {
      alive = false;
    };
  }, [track.id, track.artist, track.title, track.durationMs]);

  const activeIndex = synced
    ? synced.reduce((acc, line, i) => (line.timeMs <= positionMs ? i : acc), -1)
    : -1;

  useEffect(() => {
    if (activeIndex < 0) return;
    // Etkin satırı üstten üçte bire çek — okuyan göz orada duruyor.
    scroller.current?.scrollTo({ y: Math.max(0, activeIndex * 30 - 90), animated: true });
  }, [activeIndex]);

  if (state === "yükleniyor") {
    return <Note>sözler aranıyor…</Note>;
  }
  if (state === "yok") {
    return <Note>bu şarkı için söz bulunamadı</Note>;
  }

  return (
    <ScrollView
      ref={scroller}
      className="mt-2 max-h-64"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
    >
      {synced ? (
        synced.map((line, i) => (
          <Text
            key={`${line.timeMs}-${i}`}
            className={`py-1 text-[15px] leading-[22px] ${
              i === activeIndex ? "text-accent" : "text-faint"
            }`}
            style={{ fontFamily: i === activeIndex ? "Inter_600SemiBold" : "Inter_400Regular" }}
          >
            {line.text || "·"}
          </Text>
        ))
      ) : (
        <Text className="text-muted text-[15px] leading-[22px]">{plain}</Text>
      )}
      <View className="h-6" />
    </ScrollView>
  );
}

function Note({ children }: { children: string }) {
  return (
    <Text className="text-faint mt-3 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
      {children}
    </Text>
  );
}
