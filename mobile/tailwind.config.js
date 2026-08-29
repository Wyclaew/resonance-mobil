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
    },
  },
  plugins: [],
};
