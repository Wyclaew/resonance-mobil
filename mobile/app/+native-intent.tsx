/**
 * Dışarıdan gelen adresleri yönlendirici rotalarına çevirir.
 *
 * ⚠️ BUG'DI: medya bildirimine dokununca track-player uygulamayı
 * `resonance://notification.click` ile açıyor; böyle bir rota olmadığı için
 * expo-router "Unmatched Route" ekranı gösteriyordu (kullanıcı bildirdi).
 * Uygulama açıksa bildirim tam ekran oynatıcıyı açar; soğuk açılışta ana sayfa
 * (o anda çalan bir şey olmadığı için boş oynatıcı göstermenin anlamı yok).
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (/notification\.click/i.test(path)) return initial ? "/" : "/player";
    return path;
  } catch {
    return "/";
  }
}
