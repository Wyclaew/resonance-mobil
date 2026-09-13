// Sürüm (release) imzası — `android/` prebuild ile her seferinde yeniden
// üretildiği için imza ayarı elle değil, bu eklentiyle yazılır.
//
// Anahtar deposu REPODA DURMAZ. Kullanıcı düzeyindeki ~/.gradle/gradle.properties
// içinde şu dört değer varsa sürüm APK'sı o anahtarla imzalanır:
//   RESONANCE_UPLOAD_STORE_FILE=/mutlak/yol/resonance-release.jks
//   RESONANCE_UPLOAD_STORE_PASSWORD=…
//   RESONANCE_UPLOAD_KEY_ALIAS=resonance
//   RESONANCE_UPLOAD_KEY_PASSWORD=…
// Yoksa Expo şablonunun hata ayıklama anahtarına düşülür (kişisel kullanım
// için yeterli; ⚠️ sonradan anahtar değişirse telefona üzerine kurulamaz,
// önce kaldırmak gerekir).
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "RESONANCE_UPLOAD_STORE_FILE";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let gradle = cfg.modResults.contents;
    if (gradle.includes(MARK)) return cfg;
    gradle = gradle.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        release {
            if (project.hasProperty('${MARK}')) {
                storeFile file(${MARK})
                storePassword RESONANCE_UPLOAD_STORE_PASSWORD
                keyAlias RESONANCE_UPLOAD_KEY_ALIAS
                keyPassword RESONANCE_UPLOAD_KEY_PASSWORD
            }
        }
`
    );
    gradle = gradle.replace(
      /(release \{\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig project.hasProperty('${MARK}') ? signingConfigs.release : signingConfigs.debug`
    );
    cfg.modResults.contents = gradle;
    return cfg;
  });
};
