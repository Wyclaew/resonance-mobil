// Tarayıcı API'si taklitleri — masaüstünden BİREBİR kopyalanan dosyalar
// (`sync/engine.ts`, `sync/client.ts`) webview'de çalışmak üzere yazıldı.
// Kopyaları bozmamak için eksik API'leri RN karşılıklarıyla dolduruyoruz.
// Bkz. CLAUDE.md "Kod paylaşımı".
import AsyncStorage from "@react-native-async-storage/async-storage";
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
type Listener = () => void;
const focusListeners = new Set<Listener>();

export function installWebShims(): void {
  const g = globalThis as Record<string, unknown>;
  if (!g.localStorage) g.localStorage = localStorageShim;
  if (!g.window) g.window = g;

  const win = g.window as { addEventListener?: unknown; removeEventListener?: unknown };
  if (typeof win.addEventListener !== "function") {
    win.addEventListener = (type: string, fn: Listener) => {
      if (type === "focus") focusListeners.add(fn);
    };
    win.removeEventListener = (type: string, fn: Listener) => {
      if (type === "focus") focusListeners.delete(fn);
    };
    AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      focusListeners.forEach((fn) => {
        try {
          fn();
        } catch (e) {
          console.error("[shim] focus dinleyicisi hata verdi:", e);
        }
      });
    });
  }
}
