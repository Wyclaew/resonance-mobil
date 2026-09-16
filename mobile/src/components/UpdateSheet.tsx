import { Text, View } from "react-native";

import { bytes as fmtBytes } from "../lib/fmt";
import { useLang, useT } from "../lib/i18n.mobile";
import { currentVersion } from "../lib/updater";
import { useUpdate } from "../store/useUpdate";
import { useColors } from "../theme";
import { Sheet } from "./Sheet";
import { Button } from "./ui";

/**
 * "Yeni sürüm var — indirilsin mi?" (kullanıcı isteği: masaüstündeki gibi).
 * Kaynak GitHub Releases; indirme bitince Android'in kurulum ekranı açılır.
 */
export function UpdateSheet() {
  const { info, phase, progress, error, close, skip, start } = useUpdate();
  const t = useT();
  const lang = useLang();
  const c = useColors();
  if (!info) return null;
  const busy = phase === "downloading";

  return (
    <Sheet visible onClose={busy ? () => {} : close} title={t("m.update.title")} scroll>
      <View className="px-5 pb-4">
        <Text className="text-text text-[14px]" style={{ fontFamily: "Inter_500Medium" }}>
          {t("m.update.body", { version: info.version, current: currentVersion() })}
        </Text>
        {info.bytes > 0 ? (
          <Text className="text-muted mt-1 text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {t("m.update.size", { size: fmtBytes(info.bytes, lang) })}
          </Text>
        ) : null}

        {info.notes ? (
          <View className="bg-surface-2 mt-3 rounded-2xl p-3.5">
            <Text className="text-faint text-[10px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1 }}>
              {t("m.update.notes").toLocaleUpperCase(lang)}
            </Text>
            <Text className="text-muted mt-1.5 text-[12px] leading-[17px]">{info.notes}</Text>
          </View>
        ) : null}

        {busy || phase === "ready" ? (
          <View className="mt-4">
            <View className="h-1.5 w-full rounded-full" style={{ backgroundColor: c.surface3 }}>
              <View
                style={{ width: `${Math.round(progress * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }}
              />
            </View>
            <Text className="text-muted mt-2 text-[12px]">
              {phase === "ready" ? t("m.update.install") : `${t("m.update.downloading")} %${Math.round(progress * 100)}`}
            </Text>
          </View>
        ) : null}

        {error ? <Text className="text-down mt-3 text-[12px]">{`${t("m.update.failed")}: ${error}`}</Text> : null}

        <Text className="text-faint mt-3 text-[11px] leading-[15px]">{t("m.update.installHint")}</Text>

        <View className="mt-4 flex-row gap-2">
          <Button
            kind="primary"
            icon="download"
            label={phase === "failed" ? t("error.retry") : t("m.update.download")}
            busy={busy}
            onPress={() => void start()}
            className="flex-1"
          />
          {!busy ? <Button kind="ghost" label={t("m.update.later")} onPress={close} /> : null}
        </View>
        {!busy ? (
          <Button kind="ghost" small label={t("m.update.skip")} onPress={skip} className="mt-2 self-start" />
        ) : null}
      </View>
    </Sheet>
  );
}
