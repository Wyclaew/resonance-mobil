import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { Icon } from "../src/components/Icon";
import { useBottomSpace } from "../src/components/MiniPlayer";
import { Artwork, Button, Card, Divider, Eyebrow, Row, Segmented, TopBar } from "../src/components/ui";
import { backupDb } from "../src/lib/dbBackup";
import { getDeviceId } from "../src/lib/device";
import { ago } from "../src/lib/fmt";
import { useLang, useT } from "../src/lib/i18n.mobile";
import {
  completePasswordReset,
  getSupabase,
  resetPassword,
  resetSupabase,
  signIn,
  signOut,
  signUp,
} from "../src/lib/sync/client";
import { isSyncConfigured, setOwnProject, syncUrl, usingOwnProject } from "../src/lib/sync/config";
import {
  SCHEMA_OUTDATED,
  firstSyncPullReplace,
  firstSyncPushAll,
  getSyncState,
  hasSyncedBefore,
  startSync,
  stopSync,
  repairSync,
  subscribeSync,
  syncHealth,
  type TableHealth,
  syncNow,
  type SyncState,
} from "../src/lib/sync/engine";
import { usePlaylistStore } from "../src/store/usePlaylistStore";
import { useSettingsStore } from "../src/store/useSettingsStore";
import { useToastStore } from "../src/store/useToastStore";
import { useColors } from "../src/theme";

/**
 * Hesap & senkron — masaüstü `AccountView` + `SyncSettings` + profil menüsü:
 * giriş/kayıt (ayrı sekmeler), şifre sıfırlama, ilk senkron yönü, durum,
 * şimdi senkronla, cihaz kimliği, profil fotoğrafı.
 */
export default function Account() {
  const c = useColors();
  const t = useT();
  const lang = useLang();
  const bottom = useBottomSpace(false);
  const avatar = useSettingsStore((s) => s.avatarDataUrl);
  const [sync, setSync] = useState<SyncState>(getSyncState());
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [needsFirst, setNeedsFirst] = useState(false);
  const [authMode, setAuthMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetLink, setResetLink] = useState("");
  const [newPass, setNewPass] = useState("");

  useEffect(() => subscribeSync(setSync), []);
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    const apply = async (mail: string | null) => {
      if (!alive) return;
      setUserEmail(mail);
      if (mail) setNeedsFirst(!(await hasSyncedBefore()));
    };
    void sb.auth.getSession().then(({ data }) => apply(data.session?.user.email ?? null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => void apply(session?.user.email ?? null));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg === "invalid-reset-link" ? t("sync.resetLinkBad") : msg);
    } finally {
      setBusy(false);
    }
  }

  const doAuth = () =>
    guard(async () => {
      if (authMode === "in") await signIn(email.trim(), password);
      else {
        await signUp(email.trim(), password);
        setNotice(t("sync.signUpDone"));
      }
      setPassword("");
      setPassword2("");
    });

  const doFirstSync = (mode: "push" | "pull") =>
    guard(async () => {
      // Her iki modda da ÖNCE yedek: pull yıkıcıdır, push'ta da zararı yok.
      await backupDb().catch(() => {});
      if (mode === "push") await firstSyncPushAll();
      else await firstSyncPullReplace();
      setNeedsFirst(false);
      await startSync();
      await usePlaylistStore.getState().refresh();
      useToastStore.getState().show(t("sync.firstDone"), "success");
    });

  async function pickAvatar() {
    const res = await DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    // Masaüstüyle aynı sınır: ayar satırında data URI olarak duruyor.
    if ((asset.size ?? 0) > 512 * 1024) {
      useToastStore.getState().show(t("profile.avatarTooBig"), "error");
      return;
    }
    const b64 = await new File(asset.uri).base64();
    await useSettingsStore.getState().update("avatarDataUrl", `data:${asset.mimeType ?? "image/jpeg"};base64,${b64}`);
  }

  const statusLabel =
    sync.status === "syncing"
      ? t("sync.statusSyncing")
      : sync.status === "error"
        ? t("sync.statusError")
        : sync.status === "off"
          ? t("sync.statusOff")
          : t("sync.statusIdle");

  return (
    <View className="bg-bg flex-1">
      <TopBar title={t("profile.account")} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottom }}>
        {/* Profil */}
        <View className="flex-row items-center px-5 pb-5 pt-2">
          <Pressable onPress={pickAvatar} onLongPress={() => void useSettingsStore.getState().update("avatarDataUrl", "")}>
            <Artwork uri={avatar || undefined} size={64} radius={32} />
            <View className="bg-accent absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full">
              <Icon name="pencil" size={12} color={c.onAccent} />
            </View>
          </Pressable>
          <View className="ml-4 flex-1">
            <Text className="text-text text-[18px]" style={{ fontFamily: "Archivo_700Bold" }} numberOfLines={1}>
              {userEmail ?? t("profile.local")}
            </Text>
            <Text className="text-muted mt-0.5 text-[12px]">
              {!isSyncConfigured() ? t("profile.syncOff") : userEmail ? statusLabel : t("profile.notSignedIn")}
            </Text>
          </View>
        </View>

        {!isSyncConfigured() ? (
          <View className="px-5">
            <Card>
              <View className="p-4">
                <View className="flex-row items-center">
                  <Icon name="cloudOff" size={18} color={c.muted} />
                  <Text className="text-text ml-2 text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                    {t("sync.notConfigured")}
                  </Text>
                </View>
                <Text className="text-muted mt-2 text-[12px] leading-[18px]">{t("m.account.notConfigured")}</Text>
              </View>
            </Card>
          </View>
        ) : !userEmail ? (
          <View className="px-5">
            <Eyebrow>{t("sync.signInTitle")}</Eyebrow>
            <Text className="text-muted mt-2 text-[13px] leading-5">{t("sync.signInBody")}</Text>
            <View className="mt-4">
              <Segmented
                value={authMode}
                onChange={(m) => {
                  setAuthMode(m);
                  setErr(null);
                  setNotice(null);
                }}
                options={[
                  { value: "in", label: t("sync.signIn") },
                  { value: "up", label: t("sync.signUp") },
                ]}
              />
            </View>
            <Field value={email} onChange={setEmail} placeholder={t("sync.email")} keyboard="email-address" />
            <Field value={password} onChange={setPassword} placeholder={t("sync.password")} secure />
            {authMode === "up" ? (
              <Field value={password2} onChange={setPassword2} placeholder={t("sync.passwordAgain")} secure />
            ) : null}
            {authMode === "up" && password && password.length < 6 ? (
              <Text className="text-down mt-2 text-[12px]">{t("sync.passwordTooShort")}</Text>
            ) : authMode === "up" && password2 && password !== password2 ? (
              <Text className="text-down mt-2 text-[12px]">{t("sync.passwordMismatch")}</Text>
            ) : null}
            <Button
              kind="primary"
              label={authMode === "in" ? t("sync.signIn") : t("sync.signUp")}
              busy={busy}
              disabled={!email.trim() || password.length < 6 || (authMode === "up" && password !== password2)}
              onPress={doAuth}
              className="mt-4"
            />
            {authMode === "up" ? <Text className="text-faint mt-3 text-[12px] leading-[17px]">{t("sync.signUpNote")}</Text> : null}
            {authMode === "in" ? (
              <View className="mt-3 flex-row gap-4">
                <Text onPress={() => void guard(async () => {
                  await resetPassword(email.trim());
                  setNotice(t("sync.resetSent"));
                })} className="text-muted text-[12px] underline">
                  {t("sync.forgot")}
                </Text>
                <Text onPress={() => setResetOpen((v) => !v)} className="text-muted text-[12px] underline">
                  {t("sync.resetApply")}
                </Text>
              </View>
            ) : null}
            {resetOpen ? (
              <View className="mt-3">
                <Text className="text-faint text-[12px] leading-[17px]">{t("sync.resetPasteHelp")}</Text>
                <Field value={resetLink} onChange={setResetLink} placeholder="https://…#access_token=…" />
                <Field value={newPass} onChange={setNewPass} placeholder={t("sync.newPassword")} secure />
                <Button
                  kind="secondary"
                  label={t("sync.resetApply")}
                  busy={busy}
                  disabled={!resetLink.trim() || newPass.length < 6}
                  className="mt-3"
                  onPress={() =>
                    void guard(async () => {
                      await completePasswordReset(resetLink.trim(), newPass);
                      setResetOpen(false);
                      setResetLink("");
                      setNewPass("");
                      setNotice(t("sync.resetDone"));
                    })
                  }
                />
              </View>
            ) : null}
          </View>
        ) : needsFirst ? (
          <View className="px-5">
            <Eyebrow accent>{t("sync.firstTitle")}</Eyebrow>
            <Text className="text-muted mt-2 text-[13px] leading-5">{t("sync.firstBody")}</Text>
            <Card className="mt-4" onPress={() => void doFirstSync("push")}>
              <View className="p-4">
                <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                  {t("sync.firstPush")}
                </Text>
                <Text className="text-muted mt-1 text-[12px] leading-[17px]">{t("sync.firstPushDesc")}</Text>
              </View>
            </Card>
            <Card
              className="mt-3"
              onPress={() =>
                Alert.alert(t("sync.firstPull"), t("sync.firstPullConfirm"), [
                  { text: t("common.cancel"), style: "cancel" },
                  { text: t("sync.firstPullConfirmYes"), style: "destructive", onPress: () => void doFirstSync("pull") },
                ])
              }
            >
              <View className="p-4">
                <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                  {t("sync.firstPull")}
                </Text>
                <Text className="text-muted mt-1 text-[12px] leading-[17px]">{t("sync.firstPullDesc")}</Text>
              </View>
            </Card>
            {busy ? <Text className="text-muted mt-3 text-[12px]">{t("sync.working")}</Text> : null}
          </View>
        ) : (
          <View>
            <View className="px-5">
              <Card>
                <View className="flex-row items-center p-4">
                  <Icon name={sync.status === "error" ? "warning" : "cloud"} size={20} color={sync.status === "error" ? c.down : c.accent} />
                  <View className="ml-3 flex-1">
                    <Text className="text-text text-[15px]" style={{ fontFamily: "Inter_600SemiBold" }}>
                      {statusLabel}
                    </Text>
                    <Text className="text-muted text-[12px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
                      {`${t("sync.lastSync")} ${sync.lastSyncAt ? ago(sync.lastSyncAt, lang) : "—"} · ↑${sync.pushed} ↓${sync.pulled}`}
                    </Text>
                  </View>
                  <Button small kind="secondary" icon="refresh" label={t("sync.syncNow")} busy={sync.status === "syncing"} onPress={() => void syncNow("full")} />
                </View>
                {sync.lastError ? (
                  <Text className="text-down px-4 pb-4 text-[12px] leading-[17px]">
                    {sync.lastError.startsWith(SCHEMA_OUTDATED)
                      ? t("sync.schemaOutdated") + sync.lastError.slice(SCHEMA_OUTDATED.length)
                      : sync.lastError}
                  </Text>
                ) : null}
              </Card>
              <Text className="text-faint mt-3 text-[12px] leading-[17px]">{t("sync.whatSyncs")}</Text>
            </View>
            <SyncHealthCard />
            <View className="mt-5">
              <Row
                icon="x"
                title={t("sync.signOut")}
                danger
                onPress={() =>
                  void guard(async () => {
                    stopSync();
                    await signOut();
                    setUserEmail(null);
                  })
                }
              />
            </View>
          </View>
        )}

        {/* Kendi Supabase projen: giriş yapılmış da olsa yapılmamış da olsa görünür. */}
        <OwnProjectCard onChanged={() => setUserEmail(null)} />

        {err ? <Text className="text-down mt-4 px-5 text-[13px]">{err}</Text> : null}
        {notice ? <Text className="text-accent mt-4 px-5 text-[13px]">{notice}</Text> : null}

        <View className="mt-8">
          <Divider inset={0} />
          <Row icon="phone" title={t("account.thisDevice")} sub={t("account.deviceDesc")} />
          <Text selectable className="text-faint -mt-2 px-5 pb-4 pl-[60px] text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
            {getDeviceId()}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * ⭐ SENKRON SAĞLIĞI (masaüstü v1.9.5): tablo başına buradaki ve buluttaki satır
 * sayısı. Masaüstünde sayfalama hatası yüzünden 241 → 163 düşen liste, böyle bir
 * panel olmadığı için haftalarca fark edilmemişti. "Onar" iki yönde tam tur atar.
 */
/**
 * ⭐ KENDİ SUPABASE PROJEN (masaüstü v1.9.6). Depo herkese açık ve APK'daki
 * varsayılan proje kuran HERKESİ aynı projeye düşürür — veri güvende (RLS her
 * satırı kullanıcıya kilitler) ama kota ve e-posta limiti ortak. Kendi projesini
 * veren kendi kotasında çalışır.
 */
function OwnProjectCard({ onChanged }: { onChanged: () => void }) {
  const t = useT();
  const c0 = useColors();
  const show = useToastStore((s) => s.show);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const own = usingOwnProject();

  async function save(reset: boolean) {
    setOwnProject(reset ? "" : url, reset ? "" : key);
    // Jeton eski projeye ait: önce çık, sonra istemciyi düşür.
    try {
      stopSync();
      await signOut();
    } catch {
      /* zaten çıkmış olabilir */
    }
    resetSupabase();
    setOpen(false);
    setUrl("");
    setKey("");
    onChanged();
    show(reset ? t("sync.ownCleared") : t("sync.ownSaved"), "success");
  }

  return (
    <View className="mt-6 px-5">
      <View className="mb-2 flex-row items-center">
        <Eyebrow>{t("sync.ownTitle")}</Eyebrow>
        <Text className="text-faint ml-2 text-[11px]" style={{ fontFamily: "JetBrainsMono_400Regular" }}>
          {own ? t("sync.ownYours") : t("sync.ownDefault")}
        </Text>
      </View>
      <Card>
        <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center p-4">
          <Icon name="database" size={18} color={c0.muted} />
          <Text className="text-text ml-3 flex-1 text-[14px]" numberOfLines={1}>
            {own ? syncUrl() : t("sync.ownDefault")}
          </Text>
          <Icon name={open ? "chevronUp" : "chevronDown"} size={18} color={c0.faint} />
        </Pressable>
        {open ? (
          <View className="px-4 pb-4">
            <Text className="text-muted text-[12px] leading-[17px]">{t("sync.ownBody")}</Text>
            <Text className="text-faint mt-2 text-[11px] leading-[16px]">{t("sync.ownSteps")}</Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://xxxx.supabase.co"
              placeholderTextColor={c0.faint}
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-bg border-border text-text mt-3 h-11 rounded-xl border px-3 text-[13px]"
            />
            <TextInput
              value={key}
              onChangeText={setKey}
              placeholder={t("sync.ownKeyPlaceholder")}
              placeholderTextColor={c0.faint}
              autoCapitalize="none"
              autoCorrect={false}
              className="bg-bg border-border text-text mt-2 h-11 rounded-xl border px-3 text-[13px]"
            />
            <View className="mt-3 flex-row gap-2">
              <Button
                small
                kind="primary"
                label={t("sync.ownSave")}
                disabled={!url.trim() || !key.trim()}
                onPress={() => void save(false)}
              />
              {own ? <Button small kind="ghost" label={t("sync.ownReset")} onPress={() => void save(true)} /> : null}
            </View>
          </View>
        ) : null}
      </Card>
    </View>
  );
}

function SyncHealthCard() {
  const t = useT();
  const c = useColors();
  const [rows, setRows] = useState<TableHealth[] | null>(null);
  const [busy, setBusy] = useState<"count" | "repair" | null>(null);

  const count = useCallback(async () => {
    setBusy("count");
    try {
      setRows(await syncHealth());
    } catch (e) {
      console.warn("[sync] sağlık sayılamadı:", e);
    } finally {
      setBusy(null);
    }
  }, []);

  const diff = rows?.filter((r) => r.cloud !== null && r.cloud !== r.local).length ?? 0;
  return (
    <View className="mt-6 px-5">
      <View className="mb-2 flex-row items-center justify-between">
        <Eyebrow>{t("sync.healthTitle")}</Eyebrow>
        <Pressable onPress={() => void count()} hitSlop={10}>
          <Text className="text-accent text-[12px]" style={{ fontFamily: "Inter_500Medium" }}>
            {t("sync.healthRefresh")}
          </Text>
        </Pressable>
      </View>
      <Card>
        <View className="p-4">
          <Text className="text-muted text-[12px] leading-[17px]">{t("sync.healthBody")}</Text>
          {busy === "count" && !rows ? (
            <Text className="text-faint mt-3 text-[12px]">{t("sync.working")}</Text>
          ) : null}
          {rows?.length ? (
            <>
              <View className="mt-3 flex-row">
                <Text className="text-faint flex-1 text-[11px]">{t("sync.healthTable")}</Text>
                <Text className="text-faint w-16 text-right text-[11px]">{t("sync.healthLocal")}</Text>
                <Text className="text-faint w-16 text-right text-[11px]">{t("sync.healthCloud")}</Text>
              </View>
              {rows.map((r) => {
                const bad = r.cloud !== null && r.cloud !== r.local;
                return (
                  <View key={r.table} className="mt-1.5 flex-row">
                    <Text className="flex-1 text-[12px]" style={{ color: bad ? c.down : c.muted }} numberOfLines={1}>
                      {r.table}
                    </Text>
                    <Text
                      className="w-16 text-right text-[12px]"
                      style={{ color: bad ? c.down : c.text, fontFamily: "JetBrainsMono_400Regular" }}
                    >
                      {r.local}
                    </Text>
                    <Text
                      className="w-16 text-right text-[12px]"
                      style={{ color: bad ? c.down : c.text, fontFamily: "JetBrainsMono_400Regular" }}
                    >
                      {r.cloud ?? "—"}
                    </Text>
                  </View>
                );
              })}
              <Text className="mt-3 text-[12px]" style={{ color: diff ? c.down : c.accent }}>
                {diff ? t("sync.healthDiff", { n: diff }) : t("sync.healthOk")}
              </Text>
            </>
          ) : null}
          <View className="mt-3 flex-row items-center">
            <Button
              small
              kind={diff ? "primary" : "secondary"}
              icon="refresh"
              label={t("sync.healthRepair")}
              busy={busy === "repair"}
              onPress={() =>
                void (async () => {
                  setBusy("repair");
                  try {
                    await repairSync();
                    await usePlaylistStore.getState().refresh();
                    setRows(await syncHealth());
                  } catch (e) {
                    console.warn("[sync] onarım başarısız:", e);
                  } finally {
                    setBusy(null);
                  }
                })()
              }
            />
            <Text className="text-faint ml-3 flex-1 text-[11px] leading-[15px]">{t("sync.healthRepairHint")}</Text>
          </View>
        </View>
      </Card>
    </View>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  secure,
  keyboard,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboard?: "email-address";
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.faint}
      secureTextEntry={secure}
      keyboardType={keyboard}
      autoCapitalize="none"
      autoCorrect={false}
      className="bg-surface-2 text-text mt-3 h-12 rounded-2xl px-4 text-[15px]"
      style={{ fontFamily: "Inter_400Regular" }}
    />
  );
}
