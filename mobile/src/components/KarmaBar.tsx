import { View } from "react-native";

import { useColors } from "../theme";

/**
 * Listelerin sol rayındaki tek çubuk = karma.
 * Yüksekliği ve rengi karmayı anlatır: yukarı oylanan uzar ve vurgu rengini
 * alır, aşağı oylanan kısalır ve kızarır. Sayı okumadan liste taranabilir.
 */
export function KarmaBar({ karma, height = 40 }: { karma: number; height?: number }) {
  const c = useColors();
  const rounded = Math.round(karma);
  const magnitude = Math.min(1, Math.abs(karma) / 6);
  const fill = rounded === 0 ? 0.28 : 0.34 + magnitude * 0.66;
  const color = rounded > 0 ? c.accent : rounded < 0 ? c.downDim : c.border;
  return (
    <View style={{ width: 3, height, justifyContent: "center" }}>
      <View style={{ width: 3, height: height * fill, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}
