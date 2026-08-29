import { Pressable, Text, View } from "react-native";

import { useToastStore } from "../store/useToastStore";

/**
 * Toast katmanı — masaüstündeki Toast bileşeninin mobil karşılığı.
 * Store MASAÜSTÜNDEN kopyalandı; yalnız görünüm platforma özel.
 *
 * "Geri al" eylemi burada ŞART: oy verince `vote.ts` geri alma eylemli toast
 * gösteriyor; düğme olmazsa yanlış oy geri alınamaz.
 */
export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (!toasts.length) return null;

  return (
    <View className="absolute bottom-24 left-4 right-4 gap-2" pointerEvents="box-none">
      {toasts.map((toast) => (
        <View
          key={toast.id}
          className={`flex-row items-center justify-between rounded-lg border px-4 py-3 ${
            toast.kind === "error" ? "border-down bg-surface-2" : "border-border bg-surface-2"
          }`}
        >
          <Text className="text-text flex-1 pr-3 text-sm">{toast.message}</Text>
          {toast.action ? (
            <Pressable
              onPress={() => {
                void toast.action?.fn();
                dismiss(toast.id);
              }}
              hitSlop={8}
            >
              <Text className="text-accent text-sm font-semibold">{toast.action.label}</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => dismiss(toast.id)} hitSlop={8}>
              <Text className="text-faint text-sm">✕</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
