# Resonance Mobil — Proje Kılavuzu

Masaüstü **Resonance**'ın (Mac/Windows, Tauri) Android sürümü. Aynı SQLite şeması,
aynı öneri motoru, aynı bulut senkronu — **farklı olan tek şey ses yolu**.
Kullanıcı: Eren. **İletişim dili: Türkçe.** Kişisel kullanım, mağazaya çıkmayacak.

> Masaüstü deposu: `~/Desktop/Resonance` (v1.8.8). Oradaki **`CLAUDE.md`** mimarinin
> ve tuzakların ana kaynağı; **`docs/MOBILE.md`** bu projenin planı; **`docs/SYNC.md`**
> senkron protokolü. Mobil'e özgü ölçümler: **`docs/FAZ0-SES-YOLU.md`**.

**Durum:** Masaüstünün özellikleri taşındı, gerçek kütüphaneyle senkron çalışıyor
(1 liste / 241 parça, ~2200 çalma geçmişi). Cihazda doğrulananlar aşağıda
"Özellikler"de; her maddenin ölçümü commit mesajlarında.

## ⛔ Kritik kurallar
- Türkçe konuş; kod içi yorumlar da Türkçe (masaüstü stiliyle aynı).
- Gerçekçi ol: test edilmemiş şeye "çalışıyor" deme. Bu projede her iddia ölçümle geldi.
- `mobile/src/` içindeki **kopyalanan dosyaları DÜZENLEME** (başlarında uyarı var).
  Masaüstünde düzelt → `python3 scripts/sync-core.py`. Sapma kontrolü: `--check`.
- `mobile/.env` git'e girmez (Supabase anahtarları). Şema `mobile/.env.example`.
- YouTube ToS: kişisel kullanım, repo **private** kalmalı.

## Ses yolu (projenin en riskli kararı — ÖLÇÜLDÜ)
**NewPipeExtractor (native Kotlin)** — `mobile/modules/resonance-extractor/`.
- yt-dlp Android'e gömülemez; saf-JS çıkarım (`youtubei.js`) 2026'da **SABR-only
  yanıt + PO Token 1 MB duvarı + Hermes'te JS yorumlayıcı yokluğu** üçlüsüne çarpıyor.
  Ayrıntılı ölçüm ve tekrar çalıştırılabilir betikler: `docs/FAZ0-SES-YOLU.md`, `spike/`.
- NewPipeExtractor v0.26.5 bugün çalışıyor: çözüm ~2.6 sn, 5 ses akışı, **kısıtsız Range**.
- ⭐ **itag 251 (Opus ~160k)** mobilde tercih edilir — masaüstündeki 128k m4a'dan İYİ.
  Masaüstünün ADTS zorunluluğu (rodio m4a'da panikliyor) **burada YOK**, ExoPlayer çalar.
- ⛔ **TEK SEFERDE TAM İNDİRME ÇALIŞMAZ** (ölçüldü: 5.03 MB'lık dosya 4.78 MB'ta
  "connection reset"). Parçalı `Range` indirme bir optimizasyon değil, **şart**
  (`src/lib/downloads.ts`).
- Adres ömrü kısa (~6 saat) → kuyruğa önceden adres gömme; çalarken çöz ya da
  `resolveMany` ile ısıt (ölçüm: hazır olmanın %70'i adres çözümü).

## Kod paylaşımı — "aynı yol, farklı uygulama" numarası
Mobil ayrı bir depo, ama masaüstünün saf TS'i **birebir kopyalanır** (sapma görünsün diye).
Numara: mobil, masaüstüyle **AYNI modül yollarını** kendi uygulamalarıyla sağlar:

| yol | masaüstü | mobil |
| --- | --- | --- |
| `./db` | tauri-plugin-sql | `expo-sqlite` (aynı `select`/`execute` yüzeyi) |
| `./device` | `localStorage` | AsyncStorage + boot'ta ön yükleme |
| `@tauri-apps/api/core` | Rust `invoke` | `src/lib/tauriShim.ts` → NewPipe modülü |
| `../store/useSettingsStore` | zustand | aynı dosya (kopya) |

Ayrıca `src/lib/webShims.ts` (açılışta ilk çalışan) kopyaların beklediği tarayıcı
API'lerini doldurur: `localStorage` (Supabase oturumu → AsyncStorage),
`window` olay hedefi + `CustomEvent` (oy karma olayı), `window` "focus" →
`AppState` (senkron tetikleyicisi), `crypto.randomUUID` (Hermes'te yok; liste
kimlikleri), `navigator.language` (yoksa arayüz dili HEP "en" düşüyordu).

→ `recommender.ts`, `sync/engine.ts`, `playlists.ts`, `history.ts`… **tek satır
değişmeden** çalışır. Takma ad iki yerde tanımlı: `metro.config.js` + `tsconfig.json`.

`scripts/sync-core.py` — kopyaları tazeler (28 dosya izleniyor).
`scripts/gen-migrations.py` — masaüstünün `lib.rs` migration'larını TS'e çevirir
(**şema tek kaynaktan**; v1–v8, 17 tablo, senkron buna dayanır).

## Build / çalıştırma
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd mobile
npx tsc --noEmit                       # tip kontrolü
npx expo prebuild --platform android   # android/ üretir (git'te yok)
npx expo run:android                   # emülatöre/telefona kurar
```
Emülatör: `$ANDROID_HOME/emulator/emulator -avd Pixel_7` (1080×2400).
Log: `adb logcat -s ReactNativeJS:V ResonanceExtractor:V`.
⚠️ Expo Go YETMEZ (native modül var) — dev client / gerçek build şart.
Dev client'ı sunucuya bağlamak:
`adb shell am start -a android.intent.action.VIEW -d "resonance://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`
(önce `adb reverse tcp:8081 tcp:8081`).

⚠️ **`react-native-track-player` sürümü SABİT: `@nightly` (5.0.0-alpha0).**
Kararlı 4.1.2 RN 0.86'da hem derlenmiyor hem de Yeni Mimari'de TurboModule
interop'una takılıyor. Gerekçe ve hata metinleri: `docs/FAZ0-SES-YOLU.md` §4.
Sürümü yükseltmeden önce orayı oku.

## Mimari
- `mobile/app/` — expo-router. Sekmeler: Şu An · Keşfet · Ara · Kütüphane · İndirilenler.
  Yığın: `settings`, `account`, `stats`, `taste`, `wrapped`, `queue`, `import`, `local`,
  `ambient`, `playlist/[id]`, `artist/[name]`, `smart/[id]`. Derin bağlantı:
  `adb shell am start -a android.intent.action.VIEW -d "resonance://wrapped"`.
- `mobile/src/audio/` — `player.ts` (kaynak seçimi, zaman aşımı, **ses eşitleme**),
  `service.ts` (arka plan/kilit ekranı, bildirimden oy; **hataları yutar, servis ölmez**),
  `autoAdvance.ts`, `presence.ts` (now_playing/device_queue yayını), `sleepTimer.ts`.
- `mobile/src/lib/` (mobile özel) — `downloads.ts`, `relink.ts`, `localAudio.ts`,
  `spotify.ts`, `thumbs.ts`, `repairTracks.ts`, `backup.ts`, `webShims.ts`, `tauriShim.ts`.
- `mobile/modules/resonance-extractor/` — Kotlin: `resolve`, `resolveMany`, `radio`,
  `search`, `playlist`, `scanLocal` (MediaStore), `loudness` (YouTube audioConfig).
  **Sadece ham veri döndürür**; filtre/skorlama paylaşılan TS'te kalır.
- `mobile/src/theme.ts` + `tailwind.config.js` — renkler masaüstü token'larının aynısı.
  Yazı: **Archivo** (başlık), **Inter** (gövde, masaüstüyle ortak), **JetBrains Mono**
  (veri). İmza: logonun 7 çubuğu (`BarMark`, yalnız çalarken hareket eder) ve listelerde
  sol raydaki tek çubuk = karma (`KarmaBar`); karma yoksa o ray öneri gerekçesini taşır.
- `mobile/src/db/migrations.ts` — ÜRETİLİR, elle düzenleme.

## Ölçülerek bulunan tuzaklar (tekrar yaşama)
- ⛔ **Supabase oturumu kalıcı değildi**: supabase-js "tarayıcı mıyım"ı `document` ile
  anlıyor; RN'de yok → oturum bellekte, her yeniden başlatmada senkron SESSİZCE duruyordu.
  Masaüstü `sync/client.ts` artık `storage`'ı açıkça veriyor. Kontrol: AsyncStorage'da
  `ls:sb-…-auth-token` anahtarı olmalı.
- ⛔ **Senkron 54 `playlist_tracks` satırını FK hatasıyla düşürüyordu** ve su terazisi
  ilerlemiyordu: üyelikler bulutta olmayan parçalara işaret ediyor. `db.ts`'teki tetikleyici
  yer tutucu `tracks` satırı açar (`updated_at=0` → gerçeği gelince ezer),
  `repairTracks.ts` Wi-Fi'da doldurur. Motor artık başarısız satırın kimliğini logluyor.
- ⚠️ İndirmeden önce `ensureTrack` ŞART (`cache.track_id` FK) — masaüstü gotcha #13.
- ⚠️ Kuyruk ilerletme `PlaybackQueueEnded`'e körü körüne bağlı değil (`autoAdvance.ts`):
  konum süreye yakın değilse kaynak koptu sayılır, kaldığı yerden bağlanır.
- ⚠️ **Kapaklar bulanıktı**: YT Music boyutu adres sonuna kodluyor (`=w60-h60`), video
  küçük resmi `mqdefault`. `thumbs.ts` büyütüyor; `maxresdefault` KULLANMA (çoğu videoda 404).
- ⚠️ Android `Alert` EN FAZLA 3 düğme gösterir; 4.'sü sessizce düşer.
- ⚠️ "Devam et?" diye kendiliğinden açılan bant kullanıcıyı rahatsız etti → kaldırıldı.
  Çapraz cihaz devam masaüstündeki gibi AÇIK SEÇİM: `DevicePicker` (yalnız başka cihazın
  kuyruğu varsa görünür, DURAKLATILMIŞ kurar).
- ⚠️ **Yerel parçalar**: `id = local:<uri>`, `sourceId` = content:// adresi (masaüstü kuralı).
  Masaüstünün yerel dosyası telefonda YOK → YouTube eşdeğeri çalınır ama `source_id`
  YENİDEN BAĞLANMAZ (masaüstündeki parçayı bozardı). Yerel parça indirilmez/önden indirilmez.
- ⚠️ **Ses eşitleme** YouTube'un kendi ölçümüyle (`trackAbsoluteLoudnessLkfs`, hedef −14 —
  masaüstünün ffmpeg değeriyle aynı). track-player sesi 1'i aşamaz → yalnız kısma
  (`peakDb: -1` bildirilir, `loudness.ts` yükseltmeyi kapatır). Uyku zamanlayıcı 1'e değil
  `currentGain()`'e döner. Soğuk açılışta ilk çağrı zaman aşımına düşebiliyor → Kotlin bir
  kez yeniden dener.
- ℹ️ `outbox` GEREKMEDİ: motor `last_pushed` su terazisiyle öldürülmeye dayanıklı.

## Özellikler (cihazda doğrulandı)
Arama (yazarken, 450 ms) · çalma + arka plan + bildirimden oy · Keşfet (filtreler, başka
tarz, tarz kilidi, sonsuz kuyruk) · oy/karma · karma karışık · listeler (ekle/sil, akıllı
listeler) · sanatçı sayfası · parça sayfası (uzun basış) · sıra · şarkı sözleri · indirme
(tek sıra, yalnız Wi-Fi, LRU) + sıradakini Wi-Fi'da önden indirme · senkron (+ Cihazlar) ·
istatistik · zevk profili · yıllık özet (görsel paylaşım) · içe aktarma (YouTube/YT Music,
Spotify anahtarsız ~100 şarkı, RSNC1 kodu) · telefondaki müzikler · ambiyans · uyku
zamanlayıcı · alternatif kaynak (silinen video) · ses eşitleme.

## Bilerek yapılmayanlar
- Açılış turu (tek, uygulamayı bilen kullanıcı). Mini oynatıcı (mobilde karşılığı bildirim).
- Spotify API anahtarlı yol (anahtarlar senkronlanmıyor; anahtarsız yol yeterli).
