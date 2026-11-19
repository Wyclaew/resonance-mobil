import { AppState } from "react-native";
import { create } from "zustand";

import { getDeviceId } from "./device";
import { getSupabase, getUserId } from "./sync/client";

/**
 * ⭐ BAŞKA CİHAZI KUMANDA ET — kullanıcı isteği (2026-11): "bilgisayarda çalarken
 * telefonda görünsün, bilgisayardaki oynatıcıyı telefondan kontrol edeyim (Spotify
 * Connect gibi)". Ses o cihazda çalmaya devam eder; burada yalnız DURUM ve KOMUT.
 *
 * - Durum: masaüstünün yayınladığı `now_playing` satırı, senkronu beklemeden
 *   doğrudan Supabase'ten + Realtime (yerel kopya 8 sn+ geride kalabiliyor).
 * - Komut: `remote_commands` satırı; masaüstü `src/lib/remote.ts` dinler, uygular
 *   ve siler (v1.9.6+). Eylemler: play/pause/toggle/next/prev/seek(ms)/vote(±1).
 *
 * ⚠️ Masaüstü `now_playing`'i en sık 15 sn'de bir yazar → konum tahminidir
 * (`updated_at`'ten beri geçen süre eklenir), duraklat/devam ise anında yansır.
 */
export interface RemotePlayback {
  deviceId: string;
  deviceName: string;
  trackId: string;
  title: string;
  artist: string;
  thumbnail?: string;
  durationMs: number;
  positionMs: number;
  playing: boolean;
  updatedAt: number;
}

export type RemoteAction = "play" | "pause" | "toggle" | "next" | "prev" | "seek" | "vote";

/** Çalıyor görünen satır bu kadar süre yazılmadıysa uygulama kapanmış sayılır. */
const PLAYING_STALE_MS = 3 * 60 * 1000;
/** Duraklatılmış cihaz bu süre gösterilmeye devam eder (geri açabilmek için). */
const PAUSED_VISIBLE_MS = 30 * 60 * 1000;
const POLL_MS = 20_000;
/**
 * Komuttan sonra masaüstünün yeni satırı senkron gecikmesiyle (8 sn+) gelir; bu
 * sürede gelen ESKİ satır iyimser durumu geri çevirmesin (düğme titremesin).
 */
const OPTIMISTIC_HOLD_MS = 30_000;

interface NowPlayingRow {
  device_id: string;
  device_name: string | null;
  track_id: string | null;
  title: string | null;
  artist: string | null;
  thumbnail: string | null;
  duration_ms: number | null;
  position_ms: number | null;
  playing: number | null;
  updated_at: number | null;
  deleted: number | null;
}

interface RemoteState {
  device: RemotePlayback | null;
}

export const useRemotePlayback = create<RemoteState>(() => ({ device: null }));

function toPlayback(r: NowPlayingRow): RemotePlayback {
  return {
    deviceId: r.device_id,
    deviceName: r.device_name || "Device",
    trackId: r.track_id ?? "",
    title: r.title ?? "",
    artist: r.artist ?? "",
    thumbnail: r.thumbnail ?? undefined,
    durationMs: Number(r.duration_ms ?? 0),
    positionMs: Number(r.position_ms ?? 0),
    playing: r.playing === 1,
    updatedAt: Number(r.updated_at ?? 0),
  };
}

function isVisible(p: RemotePlayback, now = Date.now()): boolean {
  if (!p.title) return false;
  const age = now - p.updatedAt;
  return p.playing ? age < PLAYING_STALE_MS : age < PAUSED_VISIBLE_MS;
}

/** Tahmini konum: çalıyorsa son yazımdan beri geçen süre eklenir. */
export function estimatedPosition(p: RemotePlayback, now = Date.now()): number {
  const pos = p.playing ? p.positionMs + (now - p.updatedAt) : p.positionMs;
  return Math.max(0, p.durationMs ? Math.min(p.durationMs, pos) : pos);
}

export async function refreshRemotePlayback(): Promise<void> {
  const sb = getSupabase();
  const userId = await getUserId();
  if (!sb || !userId) return useRemotePlayback.setState({ device: null });
  const { data, error } = await sb
    .from("now_playing")
    .select("device_id, device_name, track_id, title, artist, thumbnail, duration_ms, position_ms, playing, updated_at, deleted")
    .eq("user_id", userId)
    .eq("deleted", 0)
    .neq("device_id", getDeviceId())
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) {
    console.warn("[kumanda] now_playing okunamadı:", error.message);
    return;
  }
  const rows = ((data ?? []) as NowPlayingRow[]).map(toPlayback).filter((p) => isVisible(p));
  // Çalan cihaz öncelikli; yoksa en son duraklatılan.
  const pick = rows.find((p) => p.playing) ?? rows[0] ?? null;
  const prev = useRemotePlayback.getState().device;
  const keepOptimistic =
    !!prev && !!pick && prev.deviceId === pick.deviceId && prev.updatedAt > pick.updatedAt && Date.now() - prev.updatedAt < OPTIMISTIC_HOLD_MS;
  useRemotePlayback.setState({ device: keepOptimistic ? prev : pick });
}

let starting: Promise<void> | null = null;

/**
 * Uygulama açıkken: Realtime + seyrek yoklama (Realtime düşerse de güncel kalsın).
 * Eşzamanlı çağrılar tek başlatmayı paylaşır; oturum yoksa sonra yeniden denenir.
 */
export function startRemoteWatch(): Promise<void> {
  starting ??= startWatch().catch((e) => {
    console.warn("[kumanda] izleme başlatılamadı:", e);
    starting = null;
  });
  return starting;
}

async function startWatch(): Promise<void> {
  const sb = getSupabase();
  const userId = await getUserId();
  if (!sb || !userId) {
    starting = null;
    return;
  }
  await refreshRemotePlayback();
  sb.channel("resonance-now-playing")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "now_playing", filter: `user_id=eq.${userId}` },
      () => void refreshRemotePlayback()
    )
    .subscribe();
  // Yalnız uygulama öndeyken yokla: ekran kapalı saatlerce çalmada boşa istek olmasın
  // (Realtime zaten güncel tutuyor; öne gelince RemoteDeviceBar bir kez tazeler).
  setInterval(() => {
    if (AppState.currentState === "active") void refreshRemotePlayback();
  }, POLL_MS);
}

/** Komutu hedef cihaza gönderir; durum iyimser güncellenir (gerçeği Realtime getirir). */
export async function sendRemote(action: RemoteAction, value?: number): Promise<boolean> {
  const device = useRemotePlayback.getState().device;
  const sb = getSupabase();
  const userId = await getUserId();
  if (!device || !sb || !userId) return false;
  const { error } = await sb.from("remote_commands").insert({
    user_id: userId,
    id: globalThis.crypto.randomUUID(),
    target_device: device.deviceId,
    action,
    value: value ?? null,
    payload: null,
    created_at: Date.now(),
  });
  if (error) {
    console.warn("[kumanda] komut gönderilemedi:", error.message);
    return false;
  }
  const now = Date.now();
  if (action === "toggle" || action === "play" || action === "pause") {
    const playing = action === "toggle" ? !device.playing : action === "play";
    useRemotePlayback.setState({
      device: { ...device, playing, positionMs: estimatedPosition(device, now), updatedAt: now },
    });
  } else if (action === "seek" && typeof value === "number") {
    useRemotePlayback.setState({ device: { ...device, positionMs: value, updatedAt: now } });
  }
  return true;
}
