// Tarayıcı API'si taklitleri — masaüstünden BİREBİR kopyalanan dosyalar
// (`sync/engine.ts`, `sync/client.ts`) webview'de çalışmak üzere yazıldı.
// Kopyaları bozmamak için eksik API'leri RN karşılıklarıyla dolduruyoruz.
// Bkz. CLAUDE.md "Kod paylaşımı".
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Localization from "expo-localization";
import { AppState } from "react-native";
import "react-native-url-polyfill/auto";

const PREFIX = "ls:";
const memory = new Map<string, string>();

/**
 * `localStorage` — Supabase istemcisi oturumu buraya yazıyor (`sync/client.ts`).
 * Senkron API şart, RN'de senkron depo yok → bellek + AsyncStorage'a yaz-geç.
 * Açılışta `hydrateLocalStorage()` çağrılmalı, yoksa oturum kaybolur.
 */
const localStorageShim: Storage = {
  get length() {
    return memory.size;
  },
  key: (i: number) => Array.from(memory.keys())[i] ?? null,
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, String(v));
    void AsyncStorage.setItem(PREFIX + k, String(v));
  },
  removeItem: (k: string) => {
    memory.delete(k);
    void AsyncStorage.removeItem(PREFIX + k);
  },
  clear: () => {
    const keys = Array.from(memory.keys());
    memory.clear();
    void AsyncStorage.multiRemove(keys.map((k) => PREFIX + k));
  },
};

export async function hydrateLocalStorage(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
  for (const [k, v] of await AsyncStorage.multiGet(keys)) {
    if (v !== null) memory.set(k.slice(PREFIX.length), v);
  }
}

/**
 * `window.addEventListener("focus")` — senkron motoru öne dönüşte tam tur
 * atıyor (`docs/SYNC.md`: "foreground'a dönüş" tetikleyicisi). RN karşılığı
 * `AppState` "active". Mobilde bu tetikleyici DAHA kritik: OS uygulamayı
 * öldürebilir, geri geldiğinde durum bayat olur.
 */
type Listener = (event: unknown) => void;
const listeners = new Map<string, Set<Listener>>();

function emit(type: string, event: unknown): void {
  for (const fn of listeners.get(type) ?? []) {
    try {
      fn(event);
    } catch (e) {
      console.error(`[shim] "${type}" dinleyicisi hata verdi:`, e);
    }
  }
}

export function installWebShims(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.localStorage) g.localStorage = localStorageShim;
  if (!g.window) g.window = g;

  // `navigator.language` RN'de yok; kopyalanan `i18n.ts` arayüz dilini bununla
  // seçiyor (`detectLang`) ve dokunulmadığında HER ZAMAN "en" düşüyordu.
  const nav = (g.navigator ?? {}) as { language?: string };
  if (!nav.language) {
    nav.language = Localization.getLocales()[0]?.languageTag ?? "tr-TR";
    g.navigator = nav;
  }

  // `crypto.randomUUID` Hermes'te yok; kopyalanan `playlists.ts` liste kimliğini
  // bununla üretiyor (kimlik senkronda paylaşıldığı için gerçekten benzersiz olmalı).
  const cryptoObj = (g.crypto ?? {}) as { randomUUID?: () => string };
  if (typeof cryptoObj.randomUUID !== "function") {
    cryptoObj.randomUUID = () => Crypto.randomUUID();
    g.crypto = cryptoObj;
  }

  // `CustomEvent` bazı RN sürümlerinde yok — `vote.ts` karma olayını bununla
  // yayınlıyor (iki oy yolu tek noktadan senkron kalsın diye).
  if (typeof g.CustomEvent !== "function") {
    g.CustomEvent = class CustomEventShim<T> {
      readonly type: string;
      readonly detail: T | null;
      constructor(type: string, init?: { detail?: T }) {
        this.type = type;
        this.detail = init?.detail ?? null;
      }
    };
  }

  const win = g.window as Record<string, unknown>;
  if (typeof win.addEventListener !== "function") {
    win.addEventListener = (type: string, fn: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    };
    win.removeEventListener = (type: string, fn: Listener) => {
      listeners.get(type)?.delete(fn);
    };
    win.dispatchEvent = (event: { type: string }) => {
      emit(event.type, event);
      return true;
    };
    // Öne dönüş = senkron tetikleyicisi (docs/SYNC.md).
    AppState.addEventListener("change", (state) => {
      if (state === "active") emit("focus", { type: "focus" });
    });
  }
}
