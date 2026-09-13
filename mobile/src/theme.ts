import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { vars } from "nativewind";

import { useSettingsStore, type Theme } from "./store/useSettingsStore";

/**
 * Görsel dil — masaüstündeki `src/index.css` token'larıyla AYNI renkler
 * (koyu = @theme, açık = :root[data-theme="light"]).
 *
 * Renkler iki yoldan okunur:
 *  - Tailwind sınıfları (`bg-bg`, `text-accent`) → CSS değişkeni; kök
 *    `_layout.tsx` `themeVars()` ile değişkenleri yazar. Tema/vurgu değişince
 *    tüm ağaç yeniden boyanır, uygulama yeniden başlamaz.
 *  - Satır içi stiller (ikon, SVG, navigasyon) → `useColors()`.
 */
export interface Palette {
  bg: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentDim: string;
  /** Vurgu renginin üstündeki yazı (düğme etiketi). */
  onAccent: string;
  up: string;
  upDim: string;
  down: string;
  downDim: string;
  /** Kapak perdesi ve modal arka planı için. */
  scrim: string;
  isLight: boolean;
}

const DARK: Omit<Palette, "accent" | "accentDim" | "onAccent"> = {
  bg: "#0c0c0d",
  surface: "#141416",
  surface2: "#1c1c1f",
  surface3: "#252529",
  border: "#2a2a2e",
  borderStrong: "#38383d",
  text: "#e9e7e1",
  muted: "#8d8d93",
  faint: "#5e5e64",
  up: "#5fb87f",
  upDim: "#3f7e57",
  down: "#d4634e",
  downDim: "#9a4537",
  scrim: "#0c0c0d",
  isLight: false,
};

const LIGHT: Omit<Palette, "accent" | "accentDim" | "onAccent"> = {
  bg: "#faf9f7",
  surface: "#ffffff",
  surface2: "#f1efec",
  surface3: "#e6e3de",
  border: "#e2dfd9",
  borderStrong: "#cdc8c0",
  text: "#1c1b19",
  muted: "#6b6862",
  faint: "#97938c",
  up: "#2f7d4f",
  upDim: "#245e3c",
  down: "#b8422c",
  downDim: "#8c3221",
  scrim: "#faf9f7",
  isLight: true,
};

/** Ayarlar → Görünüm'deki vurgu renkleri (masaüstüyle aynı liste). */
export const ACCENTS = [
  { v: "#e0a33c", key: "settings.amber" },
  { v: "#5fb87f", key: "settings.green" },
  { v: "#3fb0a8", key: "settings.teal" },
  { v: "#4f9bd9", key: "settings.blue" },
  { v: "#6f7de0", key: "settings.indigo" },
  { v: "#b07ad9", key: "settings.purple" },
  { v: "#e0667f", key: "settings.pink" },
  { v: "#d4634e", key: "settings.red" },
  { v: "#d98a4f", key: "settings.orange" },
] as const;

/** Hex rengi verilen oranla koyulaştırır (masaüstü App.tsx ile aynı). */
export function darken(hex: string, factor: number): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    Math.max(0, Math.min(255, Math.round(c * factor)))
  );
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** `#rrggbb` + saydamlık → `rgba()` (satır içi stiller için). */
export function alpha(hex: string, a: number): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function rgbTriplet(hex: string): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return "0 0 0";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Göreli parlaklık — vurgu üstündeki yazının koyu mu açık mı olacağı. */
function luminance(hex: string): number {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function buildPalette(isLight: boolean, accentColor: string): Palette {
  const base = isLight ? LIGHT : DARK;
  // ⚠️ Kehribar beyaz zeminde ~1.9:1 kontrast veriyordu → açık temada
  // vurgu koyulaştırılır (masaüstündeki `darken(accent, 0.62)` kararı).
  const accent = isLight ? darken(accentColor, 0.62) : accentColor;
  const accentDim = darken(accent, isLight ? 0.78 : 0.82);
  const onAccent = luminance(accent) > 0.32 ? "#0c0c0d" : "#faf9f7";
  return { ...base, accent, accentDim, onAccent };
}

export function resolveIsLight(theme: Theme, system: string | null | undefined): boolean {
  return theme === "light" || (theme === "system" && system === "light");
}

/** React dışı (bildirim rengi, servis) — anlık ayardan hesaplar. */
export function getPalette(system?: string | null): Palette {
  const s = useSettingsStore.getState();
  return buildPalette(resolveIsLight(s.theme, system ?? "dark"), s.accentColor);
}

export function useColors(): Palette {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const system = useColorScheme();
  return useMemo(
    () => buildPalette(resolveIsLight(theme, system), accentColor),
    [theme, accentColor, system]
  );
}

/** NativeWind CSS değişkenleri — tailwind.config.js'teki adlarla birebir. */
export function themeVars(p: Palette) {
  return vars({
    "--c-bg": rgbTriplet(p.bg),
    "--c-surface": rgbTriplet(p.surface),
    "--c-surface-2": rgbTriplet(p.surface2),
    "--c-surface-3": rgbTriplet(p.surface3),
    "--c-border": rgbTriplet(p.border),
    "--c-border-strong": rgbTriplet(p.borderStrong),
    "--c-text": rgbTriplet(p.text),
    "--c-muted": rgbTriplet(p.muted),
    "--c-faint": rgbTriplet(p.faint),
    "--c-accent": rgbTriplet(p.accent),
    "--c-accent-dim": rgbTriplet(p.accentDim),
    "--c-on-accent": rgbTriplet(p.onAccent),
    "--c-up": rgbTriplet(p.up),
    "--c-up-dim": rgbTriplet(p.upDim),
    "--c-down": rgbTriplet(p.down),
    "--c-down-dim": rgbTriplet(p.downDim),
  });
}

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
