import { create } from "zustand";

/**
 * Açık alt sayfa sayısı. Mini oynatıcı sayfa açıkken gizlenir.
 *
 * ⚠️ BUG'DI (emülatörde görüldü): alt sayfanın son satırları ("İndir",
 * "Listeden çıkar") mini oynatıcının ARKASINDA kalıyordu; kullanıcı en alttaki
 * eyleme dokunamıyordu.
 */
interface OverlayState {
  sheets: number;
  open: () => void;
  close: () => void;
}

export const useOverlay = create<OverlayState>((set) => ({
  sheets: 0,
  open: () => set((s) => ({ sheets: s.sheets + 1 })),
  close: () => set((s) => ({ sheets: Math.max(0, s.sheets - 1) })),
}));
