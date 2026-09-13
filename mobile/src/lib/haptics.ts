import * as Haptics from "expo-haptics";

/**
 * Dokunsal geri bildirim — yalnız ANLAMLI anlarda (oy, seçim, uzun basış).
 * Her dokunuşta titreşim gürültüdür; oy verince hissetmek ise ekrana
 * bakmadan "oy gitti mi?" sorusunu cevaplar.
 */
export const hapticSelect = () => void Haptics.selectionAsync().catch(() => {});
export const hapticTap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const hapticSuccess = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const hapticWarn = () =>
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
