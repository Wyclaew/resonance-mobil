import { Text, View } from "react-native";

import { useColors } from "../theme";

/**
 * Küçük grafikler — kütüphane yok, düz View. 24 çubuk için SVG gereksiz;
 * View hem tema renklerini hem erişilebilirliği bedavaya getiriyor.
 */

/** Saate göre dağılım (24 çubuk). En yoğun saat vurgu renginde. */
export function HourBars({ values, height = 56 }: { values: number[]; height?: number }) {
  const c = useColors();
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  return (
    <View>
      <View style={{ height }} className="flex-row items-end">
        {values.map((v, h) => (
          <View key={h} className="flex-1 items-center" style={{ height }}>
            <View style={{ flex: 1 }} />
            <View
              style={{
                width: "62%",
                minHeight: 2,
                height: Math.max(2, (v / max) * height),
                borderRadius: 2,
                backgroundColor: v > 0 && h === peak ? c.accent : v > 0 ? c.borderStrong : c.surface3,
              }}
            />
          </View>
        ))}
      </View>
      <View className="mt-1.5 flex-row justify-between">
        {["00", "06", "12", "18", "23"].map((l) => (
          <Text key={l} className="text-faint text-[9px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Haftalık oran çubukları (0..1), eskiden yeniye. */
export function RatioBars({
  values,
  height = 64,
  labels,
}: {
  values: (number | null)[];
  height?: number;
  labels?: string[];
}) {
  const c = useColors();
  return (
    <View>
      <View style={{ height }} className="flex-row items-end gap-1">
        {values.map((v, i) => (
          <View key={i} className="flex-1" style={{ height, justifyContent: "flex-end" }}>
            <View
              style={{
                height: v === null ? 2 : Math.max(3, v * height),
                borderRadius: 3,
                backgroundColor: v === null ? c.surface3 : i === values.length - 1 ? c.accent : c.borderStrong,
              }}
            />
          </View>
        ))}
      </View>
      {labels ? (
        <View className="mt-1.5 flex-row justify-between">
          {labels.map((l, i) => (
            <Text key={i} className="text-faint text-[9px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
              {l}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Yatay oran çubuğu (sanatçı yakınlığı, kabul oranı). */
export function Meter({ ratio, tone = "accent", height = 4 }: { ratio: number; tone?: "accent" | "muted" | "down"; height?: number }) {
  const c = useColors();
  const color = tone === "accent" ? c.accent : tone === "down" ? c.down : c.borderStrong;
  return (
    <View style={{ height, borderRadius: height, backgroundColor: c.surface3, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}
