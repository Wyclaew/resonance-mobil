// Gradle bellek ayarı — `android/gradle.properties` prebuild ile yeniden üretildiği
// için elle yazılan değer her prebuild'de 2 GB / 512 MB'a dönüyordu. Sürüm derlemesi
// (R8 + NewPipe/Rhino) bu sınırda "OutOfMemoryError: Metaspace" ile düştü (2026-11).
const { withGradleProperties } = require("expo/config-plugins");

const JVM_ARGS = "-Xmx4g -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError";

module.exports = function withGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((p) => !(p.type === "property" && p.key === "org.gradle.jvmargs"));
    props.push({ type: "property", key: "org.gradle.jvmargs", value: JVM_ARGS });
    cfg.modResults = props;
    return cfg;
  });
};
