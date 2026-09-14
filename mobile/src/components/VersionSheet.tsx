import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

import { resolveCached } from "../audio/urlCache";
import { currentSourceId } from "../lib/downloads";
import { mmss } from "../lib/fmt";
import { hapticSuccess } from "../lib/haptics";
import { useT } from "../lib/i18n.mobile";
import { isNetworkError } from "../lib/netError";
import { applyRelink, searchVersions, shortReason, unavailableKind, type VersionOption } from "../lib/relink";
import { searchQueryFor } from "../lib/versionMatch";
import { useDownloadStore } from "../store/useDownloadStore";
import { useToastStore } from "../store/useToastStore";
import { useVersionPicker } from "../store/useVersionPicker";
import { useColors } from "../theme";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
import { Artwork } from "./ui";

/**
 * "Sürüm seç" — kullanıcı isteği (2026-09-14): "uygulamanın içinde şarkıyı kesin
 * indirebilen bir sistem olsun". Otomatik arama (`relink.ts`) çoğu zaman bulur;
 * bulamazsa ya da parça yanlış yüklemeye bağlıysa aynı şarkının yüklemeleri
 * listelenir. Seçilen önce ÇÖZÜLÜP denenir; çalıyorsa parçaya bağlanır
 * (senkronla diğer cihazlara geçer) ve gerekiyorsa indirilir.
 */
export function VersionSheet() {
  const { track, download, close } = useVersionPicker();
  const t = useT();
  const c = useColors();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<VersionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const reqId = useRef(0);

  async function run(q: string) {
    if (!track) return;
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const list = await searchVersions(track, q);
      if (id === reqId.current) setOptions(list);
    } catch (e) {
      if (id !== reqId.current) return;
      setOptions([]);
      setError(`${t("m.version.searchFailed")}: ${shortReason(e)}`);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!track) return;
    const q = searchQueryFor(track);
    setQuery(q);
    setOptions([]);
    setFailed({});
    setBusyId(null);
    setCurrent(track.sourceId);
    // Bellekteki nesne eski olabilir (başka cihaz yeniden bağlamış) → DB'den oku.
    void currentSourceId(track.id)
      .then((id) => id && setCurrent(id))
      .catch(() => {});
    void run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  async function pick(opt: VersionOption) {
    if (!track || busyId) return;
    const id = opt.track.sourceId;
    const linked = { ...track, sourceId: current ?? track.sourceId };
    const dl = useDownloadStore.getState();
    const willDownload = download || dl.downloaded.has(track.id) || !!dl.jobs[track.id];
    setBusyId(id);
    try {
      if (id === linked.sourceId) {
        // Zaten bu sürüme bağlı: yalnız indirme isteniyorsa yeniden dene.
        if (download) await dl.enqueue(linked, { permanent: true });
        close();
        return;
      }
      const info = await resolveCached(id);
      if (!info.streams?.length) throw new Error(t("m.version.failed"));
      await applyRelink(linked, id);
      await dl.replaceVersion(linked, id, download);
      console.log(`[sürüm] ${track.title} → ${id} "${opt.track.title}" (elle seçildi)`);
      hapticSuccess();
      useToastStore.getState().show(willDownload ? t("m.version.doneDownload") : t("m.version.done"), "success");
      close();
    } catch (e) {
      const kind = unavailableKind(e);
      const why = kind ? t(`m.dl.why.${kind}` as const) : isNetworkError(e) ? t("m.dl.waitingNetwork") : shortReason(e);
      setFailed((f) => ({ ...f, [id]: why }));
    } finally {
      setBusyId(null);
    }
  }

  if (!track) return null;
  return (
    <Sheet visible onClose={close} scroll title={t("m.version.title")}>
      <View className="px-5">
        <Text className="text-muted text-[13px]" numberOfLines={2}>
          {`${track.artist} — ${track.title}${track.durationMs > 0 ? ` · ${mmss(track.durationMs / 1000)}` : ""}`}
        </Text>
        <View className="bg-surface-2 mt-3 h-11 flex-row items-center rounded-2xl px-3.5">
          <Icon name="search" size={17} color={c.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void run(query)}
            returnKeyType="search"
            autoCorrect={false}
            placeholder={t("search.placeholder")}
            placeholderTextColor={c.faint}
            className="text-text ml-2.5 h-11 flex-1 text-[14px]"
            style={{ fontFamily: "Inter_400Regular" }}
          />
          {loading ? <ActivityIndicator size="small" color={c.accent} /> : null}
        </View>
        <Text className="text-faint mt-2 text-[11px] leading-4">{t("m.version.hint")}</Text>
      </View>

      {error ? <Text className="text-down px-5 pt-3 text-[12px]">{error}</Text> : null}
      {!loading && !error && !options.length ? (
        <Text className="text-muted px-5 pt-4 text-[13px]">{t("m.version.empty")}</Text>
      ) : null}

      <View className="mt-2">
        {options.map((o) => {
          const id = o.track.sourceId;
          const why = failed[id];
          const isCurrent = id === current;
          return (
            <Pressable
              key={id}
              onPress={() => void pick(o)}
              disabled={!!busyId}
              android_ripple={{ color: c.surface3 }}
              className="flex-row items-center px-5 py-2.5"
              style={{ opacity: why ? 0.55 : 1 }}
            >
              <Artwork uri={o.track.thumbnail} size={46} radius={6} />
              <View className="ml-3 flex-1">
                <Text className="text-text text-[14px] leading-[18px]" numberOfLines={2}>
                  {o.track.title}
                </Text>
                <Text className="text-muted mt-0.5 text-[12px]" numberOfLines={1}>
                  {`${o.track.artist} · ${o.track.durationMs > 0 ? mmss(o.track.durationMs / 1000) : "–"}${o.fromMusic ? " · YT Music" : ""}`}
                </Text>
                {why || isCurrent || o.score !== null ? (
                  <Text
                    className={why ? "text-down mt-0.5 text-[11px]" : "text-accent mt-0.5 text-[11px]"}
                    style={{ fontFamily: "JetBrainsMono_500Medium" }}
                    numberOfLines={1}
                  >
                    {why
                      ? `✗ ${t("m.version.failed")} — ${why}`
                      : [isCurrent ? t("m.version.current") : null, o.score !== null ? t("m.version.match") : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </Text>
                ) : null}
              </View>
              {busyId === id ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : isCurrent ? (
                <Icon name="checkCircle" size={18} color={c.accent} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
