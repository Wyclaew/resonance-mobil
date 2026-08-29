import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { backupDb } from "../src/lib/backup";
import { getSupabase, getUserId, signIn, signOut, signUp } from "../src/lib/sync/client";
import { isSyncConfigured } from "../src/lib/sync/config";
import {
  firstSyncPullReplace,
  getSyncState,
  startSync,
  stopSync,
  subscribeSync,
  syncNow,
  type SyncState,
} from "../src/lib/sync/engine";

/**
 * Hesap & senkron — masaüstündeki AccountView'ın mobil karşılığı.
 *
 * Protokol MASAÜSTÜNDE CANLI (v1.3.0'dan beri): şema, RLS, Realtime ve LWW
 * kuralları hazır. Mobilin işi yalnız istemci tarafı (MOBILE.md §8 Faz 3) —
 * bu ekran motoru başlatır, durumunu gösterir ve ilk kurulum yolunu sunar.
 */
export default function Account() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => subscribeSync(setState), []);
  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
      setUserEmail(data.session?.user.email ?? null);
    })();
  }, []);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`${label}: ${message}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSignIn(mode: "in" | "up") {
    await run(mode === "in" ? "Giriş" : "Kayıt", async () => {
      // signIn/signUp hata durumunda FIRLATIR (client.ts), dönen değer User.
      const user = mode === "in" ? await signIn(email, password) : await signUp(email, password);
      setUserEmail(user?.email ?? null);
      if (await getUserId()) await startSync();
    });
  }

  function onPullReplace() {
    // ⚠️ YIKICI: yereli bulutun kopyasıyla değiştirir. Önce yedek (MOBILE.md §8).
    Alert.alert(
      "Buluttan al",
      "Bu cihazdaki listeler, oylar ve geçmiş SİLİNİP bulut kopyasıyla değiştirilecek. " +
        "Önce otomatik yedek alınır. Devam edilsin mi?",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Devam",
          style: "destructive",
          onPress: () =>
            void run("Buluttan al", async () => {
              const path = await backupDb();
              console.log("[sync] yedek alındı:", path);
              await firstSyncPullReplace();
            }),
        },
      ]
    );
  }

  if (!isSyncConfigured()) {
    return (
      <View className="flex-1 bg-bg px-6 pt-16">
        <Text className="text-text text-2xl font-semibold">Hesap</Text>
        <Text className="text-muted mt-4 text-sm">
          Senkron yapılandırılmamış. `mobile/.env` içine masaüstüyle AYNI Supabase projesinin
          URL'ini ve anon anahtarını yaz, sonra uygulamayı yeniden başlat.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-bg px-6 pt-16" keyboardShouldPersistTaps="handled">
      <Text className="text-text text-2xl font-semibold">Hesap & senkron</Text>

      {userEmail ? (
        <>
          <Text className="text-muted mt-2 text-sm">{userEmail}</Text>

          <View className="mt-6 rounded-lg bg-surface p-4">
            <Row label="Durum" value={statusText(state)} />
            <Row
              label="Son senkron"
              value={state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : "—"}
            />
            <Row label="Gönderilen" value={String(state.pushed)} />
            <Row label="Alınan" value={String(state.pulled)} />
            {state.lastError ? <Text className="text-down mt-2 text-xs">{state.lastError}</Text> : null}
          </View>

          <Button label="Şimdi senkronla" onPress={() => run("Senkron", () => syncNow("full"))} busy={busy} />
          {/* MOBILE.md §9 risk #3: ilk denemede SALT-OKUNUR pull ile başla —
              yerelden buluta hiçbir şey yazmaz, veri kaybı riski sıfırdır. */}
          <Button
            label="Yalnız buluttan çek (güvenli test)"
            tone="ghost"
            busy={busy}
            onPress={() => run("Pull", () => syncNow("pull"))}
          />
          <Button label="Buluttan al (ilk kurulum)" onPress={onPullReplace} busy={busy} tone="warn" />
          <Button
            label="Çıkış yap"
            tone="danger"
            busy={busy}
            onPress={() =>
              run("Çıkış", async () => {
                stopSync();
                await signOut();
                setUserEmail(null);
              })
            }
          />
        </>
      ) : (
        <>
          <Text className="text-muted mt-2 text-sm">
            Masaüstüyle aynı hesapla giriş yap; listeler, oylar ve dinleme geçmişi buluttan gelir.
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="e-posta"
            placeholderTextColor="#5e5e64"
            autoCapitalize="none"
            keyboardType="email-address"
            className="mt-6 rounded-lg border border-border bg-surface px-4 py-3 text-text"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="parola"
            placeholderTextColor="#5e5e64"
            secureTextEntry
            className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-text"
          />
          <Button label="Giriş yap" onPress={() => onSignIn("in")} busy={busy} />
          <Button label="Yeni hesap oluştur" onPress={() => onSignIn("up")} busy={busy} tone="ghost" />
        </>
      )}

      {error ? <Text className="text-down mt-4 text-sm">{error}</Text> : null}

      <Pressable onPress={() => router.back()} className="mt-8 items-center py-3">
        <Text className="text-faint text-sm">Kapat</Text>
      </Pressable>
    </ScrollView>
  );
}

function statusText(s: SyncState): string {
  return { idle: "hazır", syncing: "senkronlanıyor…", error: "hata", off: "kapalı" }[s.status];
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className="text-muted text-sm">{label}</Text>
      <Text className="text-text text-sm">{value}</Text>
    </View>
  );
}

function Button({
  label,
  onPress,
  busy,
  tone = "accent",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: "accent" | "ghost" | "warn" | "danger";
}) {
  const bg = { accent: "bg-accent", ghost: "bg-surface-2", warn: "bg-surface-3", danger: "bg-down-dim" }[tone];
  const fg = tone === "accent" ? "text-bg" : "text-text";
  return (
    <Pressable
      disabled={busy}
      onPress={onPress}
      className={`mt-3 items-center rounded-lg ${bg} py-3 ${busy ? "opacity-50" : ""}`}
    >
      {busy ? <ActivityIndicator color="#0c0c0d" /> : <Text className={`${fg} text-sm font-semibold`}>{label}</Text>}
    </Pressable>
  );
}
