const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// ⭐ Masaüstünden BİREBİR kopyalanan dosyalar `@tauri-apps/api/core`'dan
// `invoke` alıyor. Mobilde o modül yok → kendi köprümüze yönlendiriyoruz
// (src/lib/tauriShim.ts). Böylece kopyalar tek satır değişmeden çalışır.
// Bkz. scripts/sync-core.py, CLAUDE.md "Kod paylaşımı".
const ALIASES = {
  "@tauri-apps/api/core": path.resolve(__dirname, "src/lib/tauriShim.ts"),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const alias = ALIASES[moduleName];
  if (alias) return { type: "sourceFile", filePath: alias };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
