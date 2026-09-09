import { View } from "react-native";

import { COLORS } from "../theme";

/**
 * Satırın sol kenarındaki TEK çubuk — logonun dilini listeye taşır.
 * Yüksekliği ve rengi karmayı anlatır: yukarı oylanan uzar ve kehribar olur,
 * aşağı oylanan kısalır ve kile döner. Liste boyunca çubuklar, zevkinin
 * ekolayzırı gibi okunur.
 */
export function KarmaBar({ karma, height = 40 }: { karma: number; height?: number }) {
  const magnitude = Math.min(1, Math.abs(karma) / 6);
  const fill = karma === 0 ? 0.28 : 0.34 + magnitude * 0.66;
  const color = karma > 0 ? COLORS.accent : karma < 0 ? COLORS.downDim : COLORS.border;

  return (
    <View style={{ width: 3, height, justifyContent: "center" }}>
      <View style={{ width: 3, height: height * fill, borderRadius: 2, backgroundColor: color }} />
    </View>
  );
}
