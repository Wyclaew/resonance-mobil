/**
 * Kapak görseli kalitesi.
 *
 * SORUN (kullanıcı bildirdi): kapaklar bulanık geliyordu. İki kaynak da küçük
 * boyut veriyor — YouTube Music kapakları boyutu ADRESİN SONUNA kodluyor
 * (`=w60-h60-l90-rj`), klasik video küçük resimleri ise `mqdefault` (320×180).
 * Adresi büyütmek bedava: aynı sunucu daha büyük hâlini üretiyor.
 *
 * ⚠️ `maxresdefault` HER videoda YOK (404 → kırık görsel); `hqdefault` her
 * zaman var. Bu yüzden tavan hqdefault'ta tutuluyor.
 */
export function bestThumb(url: string | undefined | null, size = 544): string | undefined {
  if (!url) return undefined;

  // Google/YT Music kapağı: "…=w60-h60-l90-rj" → istenen boyut.
  const sized = url.match(/^(https?:\/\/[^=]+)=[\w-]+$/);
  if (sized && /googleusercontent|ggpht/.test(url)) {
    return `${sized[1]}=w${size}-h${size}-l95-rj`;
  }

  // Klasik video küçük resmi: /vi/<id>/mqdefault.jpg → hqdefault.jpg
  const vi = url.match(/^(https?:\/\/i\.ytimg\.com\/vi\/[\w-]+\/)[a-z]+default(\.jpg.*)?$/);
  if (vi) return `${vi[1]}hqdefault${vi[2] ?? ".jpg"}`;

  return url;
}
