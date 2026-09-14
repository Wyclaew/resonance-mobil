import { Fragment, useEffect, useId, type ReactNode } from "react";
import { create } from "zustand";

/**
 * Kök düzeye taşıma — alt sayfalar (`Sheet`) RN `Modal` yerine bununla ana
 * pencerede, her şeyin üstünde çizilir.
 *
 * ⛔ NEDEN MODAL DEĞİL (ölçüldü, Android 16 emülatör, RN 0.86): Modal ayrı bir
 * pencere açıyor; kenardan kenara zorunlu düzende kökü önce 838 dp (çubuklar
 * hariç), hemen ardından 914 dp (tam ekran) diziliyor ve çizim bazen eski boyutta
 * kalıyor → sayfanın son ~190 px'i görünmüyor, dokunulmuyor, kaydırılmıyordu
 * ("Listeden çıkar", "Başka sürüm seç"). `statusBarTranslucent` /
 * `navigationBarTranslucent` bayraklarıyla da, onlarsız da yeniden üretildi.
 * Ana pencerede böyle bir yarış yok (sekme çubuğu, mini oynatıcı doğru duruyor).
 */
interface PortalState {
  nodes: [string, ReactNode][];
  mount: (key: string, node: ReactNode) => void;
  unmount: (key: string) => void;
}

const usePortal = create<PortalState>((set) => ({
  nodes: [],
  mount: (key, node) =>
    set((s) => {
      const at = s.nodes.findIndex(([k]) => k === key);
      if (at < 0) return { nodes: [...s.nodes, [key, node]] };
      const nodes = [...s.nodes];
      nodes[at] = [key, node];
      return { nodes };
    }),
  unmount: (key) => set((s) => ({ nodes: s.nodes.filter(([k]) => k !== key) })),
}));

/** İçeriği `PortalHost`'un olduğu yerde çizer; bulunduğu yerde hiçbir şey çizmez. */
export function Portal({ children }: { children: ReactNode }) {
  const key = useId();
  // Her çizimde içerik tazelenir (üst bileşenin durumu değişince sayfa da güncellensin).
  useEffect(() => {
    usePortal.getState().mount(key, children);
  });
  useEffect(() => () => usePortal.getState().unmount(key), [key]);
  return null;
}

/** Kök düzende bir kez, ekranların ve mini oynatıcının ÜSTÜNE yerleştirilir. */
export function PortalHost() {
  const nodes = usePortal((s) => s.nodes);
  return (
    <>
      {nodes.map(([key, node]) => (
        <Fragment key={key}>{node}</Fragment>
      ))}
    </>
  );
}
