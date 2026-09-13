import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { Icon } from "../../src/components/Icon";
import { useBottomSpace } from "../../src/components/MiniPlayer";
import { CatDrawing, Confetti, HeartDrawing } from "../../src/components/SecretCat";
import { Button, Divider, EmptyState, Eyebrow, Row, Section, Segmented, Toggle, TopBar } from "../../src/components/ui";
import { blockedArtists, loadBlockedArtists, unblockArtist } from "../../src/lib/blocked";
import { exportJson, importJsonFile, listBackups, backupDb, restoreBackup, type BackupInfo } from "../../src/lib/dbBackup";
import { sendReport } from "../../src/lib/bugReport";
import { diagnosticsReport, runDiagnostics, type DiagStep } from "../../src/lib/diagnose";
import { cacheUsage, clearTempCache, type CacheUsage } from "../../src/lib/downloads";
import { ago, bytes, date } from "../../src/lib/fmt";
import { hapticSuccess } from "../../src/lib/haptics";
import type { Lang } from "../../src/lib/i18n";
import { useLang, useT, type Key } from "../../src/lib/i18n.mobile";
import { setAmbientSeconds, setDataSaver, setWifiOnly, useMobileSettings } from "../../src/lib/mobileSettings";
import { useDownloadStore } from "../../src/store/useDownloadStore";
import { usePlayerStore } from "../../src/store/usePlayerStore";
import { usePlaylistStore } from "../../src/store/usePlaylistStore";
import { useSettingsStore, type Theme } from "../../src/store/useSettingsStore";
import { useToastStore } from "../../src/store/useToastStore";
import { ACCENTS, useColors } from "../../src/theme";

type SectionId = "playback" | "recs" | "storage" | "appearance" | "data" | "diagnostics" | "about";

const TITLES: Record<SectionId, Key> = {
  playback: "m.settings.playback",
  recs: "settings.recTitle",
  storage: "m.settings.storage",
  appearance: "m.settings.appearance",
  data: "m.settings.data",
  diagnostics: "m.settings.troubleshoot",
  about: "m.settings.about",
};

export default function SettingsSection() {
  const { section } = useLocalSearchParams<{ section: SectionId }>();
  const t = useT();
  const bottom = useBottomSpace(false);
  const id = (section in TITLES ? section : "playback") as SectionId;
  return (
    <View className="bg-bg flex-1">
      <TopBar title={t(TITLES[id])} />
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled">
        {id === "playback" ? <Playback /> : null}
        {id === "recs" ? <Recs /> : null}
        {id === "storage" ? <Storage /> : null}
        {id === "appearance" ? <Appearance /> : null}
        {id === "data" ? <Data /> : null}
        {id === "diagnostics" ? <Diagnostics /> : null}
        {id === "about" ? <About /> : null}
      </ScrollView>
    </View>
  );
}

/** Başlık + açıklama + altında seçim (segment) — mobilde açılır liste yerine. */
function Choice<T extends string | number>({
  title,
  sub,
  value,
  options,
  onChange,
}: {
  title: string;
  sub?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View className="px-5 py-3">
      <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_500Medium" }}>
        {title}
      </Text>
      {sub ? <Text className="text-muted mt-0.5 text-[12px] leading-[17px]">{sub}</Text> : null}
      <View className="mt-2.5">
        <Segmented value={value} onChange={onChange} options={options} />
      </View>
    </View>
  );
}

/** "30 sn" / "5 dk" — birimler dile göre. */
function secs(n: number, lang: Lang): string {
  if (n >= 60 && n % 60 === 0 && n > 60) return lang === "tr" ? `${n / 60} dk` : `${n / 60} min`;
  return lang === "tr" ? `${n} sn` : `${n} s`;
}

function Playback() {
  const t = useT();
  const lang = useLang();
  const s = useSettingsStore();
  const mobile = useMobileSettings();
  return (
    <>
      <Section title={t("m.settings.playback")} className="mt-2">
        <Row title={t("settings.normalize")} sub={t("m.settings.normalizeSub")} right={<Toggle value={s.normalizeVolume} onChange={(v) => void s.update("normalizeVolume", v)} />} />
        <Row title={t("settings.prefetch")} sub={t("m.settings.prefetchSub")} right={<Toggle value={s.prefetchEnabled} onChange={(v) => void s.update("prefetchEnabled", v)} />} />
        <Choice
          title={t("settings.queueEnd")}
          sub={t("settings.queueEndDesc")}
          value={s.queueEndBehavior}
          onChange={(v) => void s.update("queueEndBehavior", v)}
          options={[
            { value: "recommend", label: t("m.settings.queueEndRecommend") },
            { value: "repeat", label: t("settings.queueEndRepeat") },
            { value: "stop", label: t("settings.queueEndStop") },
          ]}
        />
        <Choice
          title={t("settings.sleepFade")}
          sub={t("settings.sleepFadeDesc")}
          value={s.sleepFadeSeconds}
          onChange={(v) => void s.update("sleepFadeSeconds", v)}
          options={[
            { value: 0, label: t("settings.off") },
            { value: 10, label: secs(10, lang) },
            { value: 20, label: secs(20, lang) },
            { value: 60, label: secs(60, lang) },
          ]}
        />
      </Section>
      <Section title={t("settings.audioQuality")}>
        <Choice
          title={t("settings.audioQuality")}
          sub={t("m.settings.qualitySub")}
          value={s.audioQuality}
          onChange={(v) => void s.update("audioQuality", v)}
          options={[
            { value: "high", label: t("m.settings.qualityHigh") },
            { value: "medium", label: t("m.settings.qualityMedium") },
            { value: "low", label: t("m.settings.qualityLow") },
          ]}
        />
        <Row title={t("m.settings.dataSaver")} sub={t("m.settings.dataSaverSub")} right={<Toggle value={mobile.dataSaver} onChange={(v) => void setDataSaver(v)} />} />
        <Row title={t("m.settings.wifiOnly")} sub={t("m.settings.wifiOnlySub")} right={<Toggle value={mobile.wifiOnly} onChange={(v) => void setWifiOnly(v)} />} />
      </Section>
    </>
  );
}

function Recs() {
  const t = useT();
  const s = useSettingsStore();
  const [blocked, setBlocked] = useState<string[]>([]);
  const reload = useCallback(async () => {
    await loadBlockedArtists(true);
    setBlocked(blockedArtists());
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <>
      <Text className="text-muted px-5 pt-2 text-[13px] leading-5">{t("settings.recIntro")}</Text>
      <Section title={t("settings.recTitle")}>
        <Row title={t("settings.recTitle")} sub={t("settings.recDesc")} right={<Toggle value={s.recEnabled} onChange={(v) => void s.update("recEnabled", v)} />} />
        <Choice
          title={t("m.settings.recEveryN")}
          sub={t("m.settings.recEveryNSub")}
          value={s.recEveryN}
          onChange={(v) => void s.update("recEveryN", v)}
          options={[2, 3, 5, 8].map((n) => ({ value: n, label: `1/${n}` }))}
        />
      </Section>
      <Section title={t("settings.recSourcesHeader")}>
        <Row title={t("settings.recYouTube")} sub={t("settings.recYouTubeDesc")} right={<Toggle value={s.recYouTube} onChange={(v) => void s.update("recYouTube", v)} />} />
        <Row title={t("settings.recLibrary")} sub={t("settings.recLibraryDesc")} right={<Toggle value={s.recLibrary} onChange={(v) => void s.update("recLibrary", v)} />} />
        {!s.recYouTube && !s.recLibrary ? <Text className="text-down px-5 pb-2 text-[12px]">{t("settings.recNoSource")}</Text> : null}
      </Section>
      <Section title={t("settings.karmaHeader")}>
        <Choice
          title={t("settings.karmaHalfLife")}
          sub={t("settings.karmaHalfLifeDesc")}
          value={s.karmaHalfLifeDays}
          onChange={(v) => void s.update("karmaHalfLifeDays", v)}
          options={[7, 14, 30, 90, 365].map((d) => ({ value: d, label: `${d} ${t("settings.days")}` }))}
        />
      </Section>
      <Section title={t("settings.blockedHeader")}>
        <Text className="text-muted -mt-1 px-5 pb-2 text-[12px]">{t("settings.blockedDesc")}</Text>
        {blocked.length ? (
          blocked.map((a) => (
            <Row
              key={a}
              icon="ban"
              title={a}
              right={
                <Button
                  small
                  kind="ghost"
                  label={t("settings.unblock")}
                  onPress={async () => {
                    await unblockArtist(a);
                    await reload();
                  }}
                />
              }
            />
          ))
        ) : (
          <Text className="text-faint px-5 py-2 text-[12px]">—</Text>
        )}
      </Section>
    </>
  );
}

function Storage() {
  const t = useT();
  const lang = useLang();
  const s = useSettingsStore();
  const [usage, setUsage] = useState<CacheUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => setUsage(await cacheUsage()), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <>
      <Section title={t("m.settings.storage")} className="mt-2">
        <Choice
          title={t("settings.cacheLimit")}
          sub={t("settings.cacheLimitDesc")}
          value={s.cacheLimitGb}
          onChange={(v) => void s.update("cacheLimitGb", v)}
          options={[1, 2, 5, 10, 0].map((g) => ({ value: g, label: g === 0 ? t("settings.cacheLimitOff") : `${g} GB` }))}
        />
        <Choice
          title={t("settings.autoDownload")}
          sub={t("settings.autoDownloadDesc")}
          value={s.autoDownloadTop}
          onChange={(v) => void s.update("autoDownloadTop", v)}
          options={[0, 20, 50, 100].map((n) => ({ value: n, label: n === 0 ? t("settings.off") : String(n) }))}
        />
      </Section>
      <Section title={t("m.settings.usage")}>
        <Row
          icon="download"
          title={t("settings.downloadsKept")}
          sub={t("settings.downloadsKeptDesc")}
          value={usage ? `${bytes(usage.keptBytes, lang)} · ${usage.keptCount}` : "…"}
          onPress={() => router.push("/downloads")}
        />
        <Row icon="hardDrive" title={t("settings.tempCache")} sub={t("settings.tempCacheDesc")} value={usage ? `${bytes(usage.tempBytes, lang)} · ${usage.tempCount}` : "…"} />
        <View className="px-5 pt-2">
          <Button
            kind="secondary"
            icon="trash"
            label={t("settings.clearCache")}
            busy={busy}
            disabled={!usage?.tempCount}
            onPress={async () => {
              setBusy(true);
              try {
                const freed = await clearTempCache();
                useToastStore.getState().show(`${t("settings.clearCache")} · ${bytes(freed, lang)}`, "success");
                await reload();
                await useDownloadStore.getState().refresh();
              } finally {
                setBusy(false);
              }
            }}
          />
        </View>
      </Section>
    </>
  );
}

function Appearance() {
  const t = useT();
  const lang = useLang();
  const c = useColors();
  const s = useSettingsStore();
  const mobile = useMobileSettings();
  return (
    <>
      <Section title={t("m.settings.appearance")} className="mt-2">
        <Choice<Theme>
          title={t("settings.theme")}
          value={s.theme}
          onChange={(v) => void s.update("theme", v)}
          options={[
            { value: "system", label: t("settings.themeSystem") },
            { value: "dark", label: t("settings.themeDark") },
            { value: "light", label: t("settings.themeLight") },
          ]}
        />
        <Choice<Lang>
          title={t("settings.language")}
          value={s.language}
          onChange={(v) => void s.update("language", v)}
          options={[
            { value: "tr", label: "Türkçe" },
            { value: "en", label: "English" },
          ]}
        />
      </Section>
      <Section title={t("settings.accentColor")}>
        <Text className="text-muted -mt-1 px-5 text-[12px]">{t("settings.accentColorDesc")}</Text>
        <View className="flex-row flex-wrap gap-3 px-5 pt-3">
          {ACCENTS.map((a) => {
            const on = s.accentColor.toLowerCase() === a.v;
            return (
              <Pressable
                key={a.v}
                accessibilityLabel={t(a.key as Key)}
                onPress={() => void s.update("accentColor", a.v)}
                className="h-11 w-11 items-center justify-center rounded-full"
                style={{ backgroundColor: a.v, borderWidth: on ? 3 : 0, borderColor: c.text }}
              >
                {on ? <Icon name="check" size={18} color="#0c0c0d" strokeWidth={2.6} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Section>
      <Section title={t("settings.screensaver")}>
        <Choice
          title={t("settings.screensaver")}
          sub={t("m.settings.ambientSub")}
          value={mobile.ambientSeconds}
          onChange={(v) => void setAmbientSeconds(v)}
          options={[
            { value: 0, label: t("settings.off") },
            { value: 30, label: secs(30, lang) },
            { value: 90, label: secs(90, lang) },
            { value: 300, label: secs(300, lang) },
          ]}
        />
      </Section>
    </>
  );
}

function Data() {
  const t = useT();
  const lang = useLang();
  const [backups, setBackups] = useState<BackupInfo[]>(() => listBackups());
  const [busy, setBusy] = useState<string | null>(null);
  const show = useToastStore((s) => s.show);

  async function guard(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      show(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Text className="text-muted px-5 pt-2 text-[13px] leading-5">{t("m.settings.dataIntro")}</Text>
      <View className="flex-row gap-2 px-5 pt-4">
        <Button kind="primary" icon="upload" label={t("data.exportBackup")} busy={busy === "export"} onPress={() => void guard("export", exportJson)} className="flex-1" />
        <Button
          kind="secondary"
          icon="fileUp"
          label={t("data.importBtn")}
          busy={busy === "import"}
          className="flex-1"
          onPress={() =>
            void guard("import", async () => {
              const res = await importJsonFile();
              if (!res) return;
              await usePlaylistStore.getState().refresh();
              hapticSuccess();
              show(t("data.imported", { playlists: res.playlists, tracks: res.tracks, votes: res.votes }), "success");
            })
          }
        />
      </View>

      <Section title={t("data.autoBackups")} action={t("data.backupNow")} onAction={() => void guard("backup", async () => {
        await backupDb();
        setBackups(listBackups());
        show(t("m.settings.backupDone"), "success");
      })}>
        <Text className="text-muted -mt-1 px-5 pb-2 text-[12px] leading-[17px]">{t("m.settings.autoBackupsSub")}</Text>
        {backups.length ? (
          backups.map((b) => (
            <Row
              key={b.name}
              icon="archiveRestore"
              title={b.at ? `${date(b.at, lang)} · ${new Date(b.at).toTimeString().slice(0, 5)}` : b.name}
              sub={`${bytes(b.size, lang)} · ${b.at ? ago(b.at, lang) : ""}`}
              onPress={() =>
                Alert.alert(t("data.restoreTitle"), t("m.settings.restoreBody", { date: b.at ? date(b.at, lang) : b.name }), [
                  { text: t("common.cancel"), style: "cancel" },
                  {
                    text: t("data.restore"),
                    style: "destructive",
                    onPress: () =>
                      void guard("restore", async () => {
                        await restoreBackup(b.name);
                        // Geri yüklenen veriyle ekranları yeniden kur.
                        await Promise.all([usePlaylistStore.getState().refresh(), useDownloadStore.getState().refresh()]);
                        await useSettingsStore.getState().load();
                        usePlayerStore.getState().restore();
                        setBackups(listBackups());
                        show(t("m.settings.restoreDone"), "success");
                      }),
                  },
                ])
              }
            />
          ))
        ) : (
          <Text className="text-faint px-5 py-2 text-[12px]">{t("data.noBackups")}</Text>
        )}
      </Section>
    </>
  );
}

function Diagnostics() {
  const t = useT();
  const c = useColors();
  const problems = useToastStore((s) => s.problems);
  const clearProblems = useToastStore((s) => s.clearProblems);
  const [steps, setSteps] = useState<DiagStep[]>([]);
  const [running, setRunning] = useState(false);
  const lang = useLang();
  return (
    <>
      <Section title={t("settings.diagnose")} className="mt-2">
        <Text className="text-muted -mt-1 px-5 text-[12px] leading-[17px]">{t("m.settings.diagnoseSub")}</Text>
        <View className="flex-row gap-2 px-5 pt-3">
          <Button
            kind="primary"
            icon="gauge"
            label={running ? t("settings.diagnoseRunning") : t("settings.diagnoseRun")}
            busy={running}
            onPress={async () => {
              setRunning(true);
              setSteps([]);
              try {
                await runDiagnostics((s) => setSteps((prev) => [...prev, s]));
              } finally {
                setRunning(false);
              }
            }}
          />
          {steps.length && !running ? (
            <Button
              kind="secondary"
              icon="copy"
              label={t("settings.diagnoseCopy")}
              onPress={async () => {
                await Clipboard.setStringAsync(diagnosticsReport(steps));
                useToastStore.getState().show(t("playlist.copied"), "success");
              }}
            />
          ) : null}
        </View>
        <View className="px-5 pt-3">
          <Button
            kind={steps.some((s) => !s.ok) ? "primary" : "secondary"}
            icon="fileUp"
            label={t("m.report.send")}
            disabled={running}
            onPress={() => void sendReport({ steps })}
          />
          <Text className="text-faint mt-2 text-[11px] leading-4">{t("m.report.sendSub")}</Text>
        </View>
        {steps.map((s) => (
          <View key={s.label} className="flex-row items-start px-5 pt-3">
            <Icon name={s.ok ? "checkCircle" : "warning"} size={16} color={s.ok ? c.up : c.down} />
            <View className="ml-3 flex-1">
              <Text className="text-text text-[13px]" style={{ fontFamily: "JetBrainsMono_500Medium" }}>
                {`${s.label} · ${s.ms} ms`}
              </Text>
              <Text className="text-muted text-[12px]" numberOfLines={3}>
                {s.detail}
              </Text>
            </View>
          </View>
        ))}
      </Section>
      <Section title={t("settings.problems")} action={problems.length ? t("settings.problemsClear") : undefined} onAction={clearProblems}>
        <Text className="text-muted -mt-1 px-5 pb-2 text-[12px] leading-[17px]">{t("settings.problemsDesc")}</Text>
        {problems.length ? (
          problems.map((p) => (
            <View key={p.message} className="px-5 py-2">
              <Text className="text-text text-[13px]" numberOfLines={3}>
                {p.count > 1 ? `×${p.count}  ${p.message}` : p.message}
              </Text>
              <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                {ago(p.at, lang)}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState icon="checkCircle" text={t("settings.problemsNone")} />
        )}
      </Section>
    </>
  );
}

/** İmza easter egg'i (masaüstüyle aynı): adı 7 kez dokun → gizli kedi + kalp. */
const CAT_TAPS = 7;

function About() {
  const t = useT();
  const [taps, setTaps] = useState(0);
  const [party, setParty] = useState(false);
  const version = Constants.expoConfig?.version ?? "—";
  return (
    <View className="px-5 pt-4">
      <Eyebrow>{t("settings.version")}</Eyebrow>
      <Text className="text-text mt-1 text-[28px]" style={{ fontFamily: "Archivo_800ExtraBold" }}>
        {`Resonance ${version}`}
      </Text>
      <Text className="text-muted mt-3 text-[13px] leading-5">{t("m.about.tagline")}</Text>
      <Text className="text-faint mt-3 text-[12px] leading-[18px]">{t("about.disclaimer")}</Text>
      <Text className="text-faint mt-3 text-[12px]">{t("m.about.builtWith")}</Text>
      <Divider inset={0} />
      <View className="mt-6 flex-row items-center">
        <Text className="text-faint text-[11px]" style={{ fontFamily: "JetBrainsMono_500Medium", letterSpacing: 1.4 }}>
          {t("about.madeBy").toLocaleUpperCase()}
        </Text>
        <Pressable
          onPress={() => {
            const n = taps + 1;
            setTaps(n);
            // 7'de açılır; sonraki her dokunuş konfetiyi tekrar patlatır.
            if (n >= CAT_TAPS) {
              hapticSuccess();
              setParty(true);
            }
          }}
          hitSlop={10}
          className="ml-2"
        >
          <Text className="text-text text-[15px]" style={{ fontFamily: "Archivo_700Bold" }}>
            Wyclaew
          </Text>
        </Pressable>
      </View>
      {taps >= CAT_TAPS ? (
        <View className="mt-10 flex-row items-end justify-end">
          <HeartDrawing />
          <CatDrawing />
        </View>
      ) : null}
      {party ? <Confetti onDone={() => setParty(false)} /> : null}
    </View>
  );
}
