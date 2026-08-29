# Resonance Mobil — Proje Kılavuzu

Masaüstü **Resonance**'ın (Mac/Windows, Tauri) Android sürümü. Aynı SQLite şeması,
aynı öneri motoru, aynı bulut senkronu — **farklı olan tek şey ses yolu**.
Kullanıcı: Eren. **İletişim dili: Türkçe.** Kişisel kullanım, mağazaya çıkmayacak.

> Masaüstü deposu: `~/Desktop/Resonance` (v1.8.8). Oradaki **`CLAUDE.md`** mimarinin
> ve tuzakların ana kaynağı; **`docs/MOBILE.md`** bu projenin planı; **`docs/SYNC.md`**
> senkron protokolü. Mobil'e özgü ölçümler: **`docs/FAZ0-SES-YOLU.md`**.

**Durum:** Faz 0 ✅ bitti (cihazda arama → çalma → arka planda devam DOĞRULANDI),
Faz 2 (mobil iskelet) devam ediyor.

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

`scripts/sync-core.py` — kopyaları tazeler (24 dosya izleniyor).
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
Emülatör: `$ANDROID_HOME/emulator/emulator -avd Pixel_10_Pro_XL`.
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
- `mobile/app/` — expo-router ekranları (Şu An · Ara · Kütüphane · İndirilenler).
- `mobile/src/audio/` — `player.ts` (kaynak seçimi + zaman aşımı) ve `service.ts`
  (arka plan/kilit ekranı; **hataları yutar, servis ölmez** — masaüstü dersi).
- `mobile/src/lib/downloads.ts` — parçalı + devam edebilen indirici, adres sağlık
  testi, LRU budama.
- `mobile/modules/resonance-extractor/` — Kotlin: `resolve`, `resolveMany`, `radio`,
  `search`, `playlist`. **Sadece ham veri döndürür**; `isLikelySong`/`songCore`/
  skorlama paylaşılan TS'te kalır (masaüstüyle aynı sonuç).
- `mobile/src/db/migrations.ts` — ÜRETİLİR, elle düzenleme.

## Sırada (MOBILE.md fazları)
- **Faz 2 (devam):** oy verme (tek modülden — masaüstü v1.8.7 dersi), playlist
  ekranı, indirme kuyruğu + "yalnız Wi-Fi" ayarı, offline çalma testi.
- **Faz 3 (istemci hazır, GİRİŞ BEKLİYOR):** Hesap ekranı (`app/account.tsx`),
  açılışta `startSync()`, `backupDb()` ile otomatik yedek. Cihazda doğrulanan:
  Supabase'e ulaşım + hata yolu (yanlış parolayla "Invalid login credentials").
  **Gerçek tur için kullanıcının kendi hesabıyla giriş yapması gerek.**
  İlk tur önerisi: "Yalnız buluttan çek" (salt-okunur) → sonra "Buluttan al".
  ℹ️ **`outbox` GEREKMEDİ**: motor su terazisi (`last_pushed`) kullanıyor —
  OS uygulamayı push'tan önce öldürse bile satırlar `updated_at > last_pushed`
  kaldığı için bir sonraki turda gider. (MOBILE.md §6 "gerekebilir" diyordu.)
- **Faz 4 (çekirdek hazır):** Keşfet sekmesi, `startDiscovery` / `rerollDiscovery`,
  kuyruk sonuna yaklaşınca tazeleme, `TARGET_QUEUE_AHEAD` **10** (masaüstünde 20 —
  mobilde her öneri bir radyo isteği = pil + veri). Kalan: tür/ruh hali filtreleri,
  tarz kilidi, "yalnız Wi-Fi'da önden indir".
  ⚠️ Kuyruğu ilerletme `Event.PlaybackQueueEnded`'e **KÖRÜ KÖRÜNE BAĞLI DEĞİL**
  (`src/audio/autoAdvance.ts`): konum beklenen süreye yakın değilse "kaynak koptu"
  sayılır ve parça kaldığı saniyeden yeniden bağlanır — masaüstünün 35-45. saniyede
  sessizce atlama bug'ının mobil karşılığı (CLAUDE.md v1.8.5, MOBILE.md §5.2-1).
- **Faz 5:** kilit ekranı görseli, ses seviyesi eşitleme, ambiyans.
