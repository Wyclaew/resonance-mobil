/**
 * Görsel dil — masaüstündeki `src/index.css` @theme token'larıyla AYNI renkler.
 * Tailwind sınıflarının ulaşamadığı yerler (navigasyon seçenekleri, canvas,
 * animasyon) buradan okur; tek kaynak olsun diye renk elle yazılmaz.
 */
export const COLORS = {
  bg: "#0c0c0d",
  surface: "#141416",
  surface2: "#1c1c1f",
  surface3: "#252529",
  border: "#2a2a2e",
  borderStrong: "#38383d",
  text: "#e9e7e1",
  muted: "#8d8d93",
  faint: "#5e5e64",
  accent: "#e0a33c",
  accentDim: "#b9842f",
  up: "#5fb87f",
  upDim: "#3f7e57",
  down: "#d4634e",
  downDim: "#9a4537",
} as const;

export const FONTS = {
  display: "Archivo_700Bold",
  displayBlack: "Archivo_800ExtraBold",
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemi: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
} as const;

/** Logodaki 7 çubuğun oranları (app-icon.svg) — arayüzün her yerinde tekrar eder. */
export const BAR_RATIOS = [0.33, 0.57, 0.8, 1, 0.8, 0.57, 0.33] as const;
