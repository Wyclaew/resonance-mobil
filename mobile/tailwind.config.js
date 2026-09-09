/** Resonance mobil — renkler masaüstündeki `src/index.css` @theme token'larının
 *  BİREBİR kopyası (MOBILE.md §3: "aynı görsel dil"). Bileşenlerde hardcoded
 *  renk YOK; hepsi bu semantik adları kullanır. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "#0c0c0d",
        surface: "#141416",
        "surface-2": "#1c1c1f",
        "surface-3": "#252529",
        border: "#2a2a2e",
        "border-strong": "#38383d",
        text: "#e9e7e1",
        muted: "#8d8d93",
        faint: "#5e5e64",
        accent: "#e0a33c",
        "accent-dim": "#b9842f",
        up: "#5fb87f",
        "up-dim": "#3f7e57",
        down: "#d4634e",
        "down-dim": "#9a4537",
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
