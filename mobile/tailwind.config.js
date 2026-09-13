/** Resonance mobil — renkler CSS değişkeni: değerleri `src/theme.ts`
 *  (`themeVars`) kök görünümde yazar. Böylece açık/koyu tema ve vurgu rengi
 *  uygulama yeniden başlamadan değişir. Bileşenlerde hardcoded renk YOK. */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        "surface-2": c("surface-2"),
        "surface-3": c("surface-3"),
        border: c("border"),
        "border-strong": c("border-strong"),
        text: c("text"),
        muted: c("muted"),
        faint: c("faint"),
        accent: c("accent"),
        "accent-dim": c("accent-dim"),
        "on-accent": c("on-accent"),
        up: c("up"),
        "up-dim": c("up-dim"),
        down: c("down"),
        "down-dim": c("down-dim"),
      },
      borderRadius: { DEFAULT: "8px" },
      // Tipografi rolleri: masaüstü Inter + JetBrains Mono kullanıyor (marka
      // devamlılığı). Mobil bunlara ARCHIVO'yu ekliyor: Inter bir arayüz
      // yazı tipi, 30 punto başlıkta "ayarlar ekranı" gibi duruyor; Archivo'nun
      // geniş gövdesi ve düz sonlanmaları telefonda afiş boyutunu taşıyor.
      fontFamily: {
        display: ["Archivo_700Bold"],
        "display-black": ["Archivo_800ExtraBold"],
        sans: ["Inter_400Regular"],
        medium: ["Inter_500Medium"],
        semibold: ["Inter_600SemiBold"],
        // Sayı ve etiketler (karma, süre, gerekçe) veri → tek genişlik.
        mono: ["JetBrainsMono_400Regular"],
        "mono-medium": ["JetBrainsMono_500Medium"],
      },
    },
  },
  plugins: [],
};
