# Resonance Mobil — Proje Kılavuzu

Masaüstü **Resonance**'ın (Mac/Windows, Tauri) Android sürümü. Aynı SQLite şeması,
aynı öneri motoru, aynı bulut senkronu — **farklı olan tek şey ses yolu**.
Kullanıcı: Eren. **İletişim dili: Türkçe.** Kişisel kullanım, mağazaya çıkmayacak.

> Masaüstü deposu: `~/Desktop/Resonance` (v1.8.8). Oradaki **`CLAUDE.md`** mimarinin
> ve tuzakların ana kaynağı; **`docs/MOBILE.md`** bu projenin planı; **`docs/SYNC.md`**
> senkron protokolü. Mobil'e özgü ölçümler: **`docs/FAZ0-SES-YOLU.md`**.

**Durum (v1.0.0):** Masaüstünün sistemleri taşındı (oynatıcı çekirdeği, Keşfet, listeler,
ayarlar, veri/yedek, istatistik/zevk/özet, açık tema + vurgu rengi, TR/EN). Sürüm APK'sı
R8 ile küçültülmüş, yalnız arm64 (~46 MB). Neyin cihazda doğrulandığı aşağıda ayrı yazılı.

## ⛔ Kritik kurallar
- Türkçe konuş; kod içi yorumlar da Türkçe (masaüstü stiliyle aynı).
- Gerçekçi ol: test edilmemiş şeye "çalışıyor" deme. Bu projede her iddia ölçümle geldi.
- `mobile/src/` içindeki **kopyalanan dosyaları DÜZENLEME** (başlarında uyarı var).
  Masaüstünde düzelt → `python3 scripts/sync-core.py`. Sapma kontrolü: `--check`.
- `mobile/.env` git'e girmez (Supabase anahtarları). Şema `mobile/.env.example`.
- YouTube ToS: kişisel kullanım, repo **private** kalmalı.
- Commit'lerde Claude ortak yazar satırı YOK (kullanıcı isteği).
- ⚠️ **Emülatördeki veri GERÇEK kütüphane** (senkronlu). Test oyu/çalması masaüstüne
  gider; `play_history`'nin tombstone'u yok, silinemez. Test ederken bunu bil.

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
- Adres ömrü ~6 saat (`expire=` parametresi) → `src/audio/urlCache.ts` o değerden
  20 dk önce eskitir. Isıtma (`prewarmUrls`) sonucu SAKLAR — eskiden atıyordu.

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

→ `recommender.ts`, `sync/engine.ts`, `playlists.ts`, `history.ts`, `backup.ts`,
`usePlaylistStore.ts`… **tek satır değişmeden** çalışır. Takma ad iki yerde tanımlı:
`metro.config.js` + `tsconfig.json`.

`scripts/sync-core.py` — kopyaları tazeler (30 dosya izleniyor).
`scripts/gen-migrations.py` — masaüstünün `lib.rs` migration'larını TS'e çevirir
(**şema tek kaynaktan**; v1–v8, 17 tablo, senkron buna dayanır).
`scripts/gen-icons.py` — uygulama/uyarlanabilir/tek renk ikon + açılış işareti,
masaüstünün `src-tauri/app-icon.svg` geometrisinden (Pillow; SVG aracı yok).

## Build / çalıştırma
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd mobile
npx tsc --noEmit                       # tip kontrolü (çeviri anahtarları da denetlenir)
npx expo prebuild --platform android   # android/ üretir (git'te yok)
cd android && ./gradlew app:installDebug -PreactNativeArchitectures=arm64-v8a   # emülatör
cd android && ./gradlew app:assembleRelease -PreactNativeArchitectures=arm64-v8a # APK
```
Sürüm APK'sı: `mobile/android/app/build/outputs/apk/release/app-release.apk`.
⚠️ Emülatör **arm64** (Apple Silicon) — yalnız x86_64 derlemek `INSTALL_FAILED_NO_MATCHING_ABIS`.
Emülatör: `$ANDROID_HOME/emulator/emulator -avd Pixel_7` (1080×2400).
Log: `adb logcat -s ReactNativeJS:V ResonanceExtractor:V`.
⚠️ Expo Go YETMEZ (native modül var) — dev client / gerçek build şart.
Dev client'ı sunucuya bağlamak:
`adb shell am start -a android.intent.action.VIEW -d "resonance://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`
(önce `adb reverse tcp:8081 tcp:8081`). Derin bağlantı: `resonance://settings/appearance`.

**İmza:** `plugins/withReleaseSigning.js`. `~/.gradle/gradle.properties` içinde
`RESONANCE_UPLOAD_STORE_FILE/…PASSWORD/…KEY_ALIAS/…KEY_PASSWORD` varsa o anahtar,
yoksa Expo şablonunun hata ayıklama anahtarı (şu anki APK böyle imzalı). ⚠️ Anahtar
değişirse telefona üzerine kurulamaz → önce kaldırmak gerekir (veri senkrondan döner).

**R8:** `app.json` → `expo-build-properties.extraProguardRules`. NewPipe + Rhino sınıfları
`-keep` — küçültülürse çıkarım SESSİZCE kırılır. Sürüm derlemesinde arama + akış doğrulandı.

⚠️ **`react-native-track-player` sürümü SABİT: `@nightly` (5.0.0-alpha0).**
Kararlı 4.1.2 RN 0.86'da hem derlenmiyor hem de Yeni Mimari'de TurboModule
interop'una takılıyor. Gerekçe ve hata metinleri: `docs/FAZ0-SES-YOLU.md` §4.

## Mimari
- `mobile/app/` — expo-router. **Sekmeler: Ana sayfa · Keşfet · Ara · Kütüphane.**
  "Şu an" sekme değil: `MiniPlayer` her ekranda altta (kök `_layout.tsx`), `player`
  tam ekran açılır. Yığın: `player`, `queue`, `ambient`, `onboarding`, `downloads`,
  `import`, `local`, `account`, `stats`, `taste`, `wrapped`, `settings/index`,
  `settings/[section]` (playback·recs·storage·appearance·data·diagnostics·about),
  `playlist/[id]`, `artist/[name]`, `smart/[id]`. Kök `ErrorBoundary` beyaz ekranı önler.
- `mobile/src/audio/`
  - `player.ts` — **ses motoru**: `startItem`, `prepareUpcoming` (track-player kuyruğunda
    hep [çalan, sıradaki] → **boşluksuz geçiş**), `skipToPrepared`, `adoptActive`,
    kaynak seçimi (yerel → önbellek → çözüm → silinmişse alternatif), zaman aşımı, eşitleme.
  - `autoAdvance.ts` — track-player olayları: doğal geçiş, kuyruk sonu, hata kurtarma
    (önce taze adresle aynı yerden, sonra atla). **Erken bitiş denetimi burada.**
  - `urlCache.ts` — çözülmüş adres önbelleği (expire'a göre), eşzamanlı istek paylaşımı.
  - `service.ts` — bildirim/kilit ekranı/kulaklık → store eylemleri (hata yutar).
  - `presence.ts` — `resumeState` (kaldığın yerden) + `now_playing`/`device_queue` yayını.
  - `sleepTimer.ts` — süre (kademeli kısma) + "şarkı bitince dur".
- `mobile/src/store/usePlayerStore.ts` — **kuyruk kararları** (masaüstüyle aynı mantık):
  tekrar (kapalı/tümü/tek), karışık (kapalı/karışık/akıllı), radyo beslemesi, akıllı
  karışıkta öneri serpiştirme, `moreLikeThis`, reroll, sıra düzenleme, `recordOutgoing`
  (yanlış tuş filtresi + oturum modu + atlama cezası), art arda 3 hatada durma, restore.
- `mobile/src/store/` (mobil) — `usePlayback` (tek track-player durum aboneliği),
  `useDownloadStore` (tek sıra, toplu, kaldır, ✓ kümesi), `useCovers` (liste mozaikleri).
- `mobile/src/lib/` (mobil) — `i18n.mobile.ts` (`m.` anahtarları + masaüstü sözlüğü),
  `fmt.ts` (TÜM sayı gösterimi), `startup.ts` (açılış sonrası işler), `dbBackup.ts`,
  `insights.ts`, `diagnose.ts`, `searchHistory.ts`, `mobileSettings.ts`, `downloads.ts`,
  `relink.ts`, `localAudio.ts`, `spotify.ts`, `thumbs.ts`, `repairTracks.ts`, `webShims.ts`,
  `tauriShim.ts`, `haptics.ts`.
- `mobile/src/components/` — `ui.tsx` (Button, Chip, Row, Segmented, Toggle, Artwork,
  Mosaic, Card, Stat, TopBar…), `Icon.tsx` (lucide, TEK TEK yoldan içe aktarım),
  `Sheet.tsx`, `TrackRow`, `TrackSheet`, `KarmaControl`, `Seekbar`, `MiniPlayer`, `Charts`.
- `mobile/modules/resonance-extractor/` — Kotlin: `resolve`, `resolveMany`, `radio`,
  `search`, `playlist`, `scanLocal` (MediaStore), `loudness` (YouTube audioConfig).
  **Sadece ham veri döndürür**; filtre/skorlama paylaşılan TS'te kalır.
- `mobile/src/theme.ts` — açık/koyu palet (masaüstü token'ları) + vurgu rengi →
  NativeWind **CSS değişkenleri** (`themeVars`, kök görünümde). Satır içi renk: `useColors()`.
  Yazı: **Archivo** (başlık), **Inter** (gövde), **JetBrains Mono** (veri). İmza: logonun
  7 çubuğu (`BarMark`, yalnız çalarken hareket eder), sol raydaki çubuk = karma.
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
- ⛔ **AYARLARIN BİR KISMI SENKRONLANIYOR** (`SYNCED_SETTING_KEYS`: tema, dil, vurgu,
  `screensaverSeconds`, öneri, depolama, oynatma). Mobilde bu anahtarlara yazmak
  MASAÜSTÜNÜ değiştirir — varsayılan yazma, test için değiştirme. Telefona özgü
  ayarlar `mobile.*` anahtarlarında (`wifiOnly`, `dataSaver`, `ambientSeconds`).
- ⛔ **Karma ondalıklı** (decay'li skor): ham yazılınca oy sonrası "1.4123123" görünüyordu.
  Arayüzde sayı YALNIZ `fmt.ts` üzerinden (`karmaLabel` = masaüstü `displayKarma`).
- ⛔ **Bildirimdeki "sonraki/önceki" çalışmıyordu**: `TrackPlayer.skipToNext()`'e gidiyordu,
  kuyrukta tek parça vardı ve hata yutuluyordu. Artık `service.ts` store eylemlerini çağırır
  (ölçüldü: `cmd media_session dispatch next` → sıradaki parça).
- ⛔ **"Sonraki"ye basınca dinleme hiç kaydedilmiyordu** (yalnız doğal bitiş) → öneri
  motoru atlamalardan öğrenmiyordu. `recordOutgoing` masaüstündeki gibi her çıkışta.
- ⚠️ **Erken bitiş ≠ şarkı bitti** (masaüstünün en pahalı dersi): doğal geçişte konum
  süreye 6 sn'den uzaksa aynı parça kaldığı yerden bağlanır (parça başına en çok 3 kez).
  Konum için olaydaki `lastPosition` VE son ilerleme olayının büyüğü alınır.
- ⚠️ **Otomatik yedek "database table is locked"** veriyordu (`wal_checkpoint(TRUNCATE)`
  açılış sorgularıyla çakışıyor). `VACUUM INTO` açık bağlantıda tutarlı kopya yazar.
- ⚠️ `pruneCache(0)` her geçici dosyayı siliyordu; 0 = SINIRSIZ. `last_played` yalnız
  indirmede yazılıyordu → LRU yanlıştı; artık çalınınca tazelenir.
- ⚠️ İndirmeden önce `ensureTrack` ŞART (`cache.track_id` FK) — masaüstü gotcha #13.
- ⚠️ **Kapaklar bulanıktı**: YT Music boyutu adres sonuna kodluyor (`=w60-h60`), video
  küçük resmi `mqdefault`. `thumbs.ts` büyütüyor; `maxresdefault` KULLANMA (çoğu videoda 404).
- ⚠️ Android `Alert` EN FAZLA 3 düğme gösterir → seçim listeleri `Sheet` ile.
- ⚠️ "Devam et?" diye kendiliğinden açılan bant kullanıcıyı rahatsız etti → kaldırıldı.
  Çapraz cihaz devam AÇIK SEÇİM: `DevicePicker` / ana sayfa kartı (DURAKLATILMIŞ kurar).
- ⚠️ **Yerel parçalar**: `id = local:<uri>`, `sourceId` = content:// adresi (masaüstü kuralı).
  Masaüstünün yerel dosyası telefonda YOK → YouTube eşdeğeri çalınır ama `source_id`
  YENİDEN BAĞLANMAZ (masaüstündeki parçayı bozardı). Yerel parça indirilmez/önden indirilmez.
- ⚠️ **Ses eşitleme** YouTube'un kendi ölçümüyle (`trackAbsoluteLoudnessLkfs`, hedef −14).
  track-player sesi 1'i aşamaz → yalnız kısma. Uyku zamanlayıcı `currentGain()`'e döner.
- ⚠️ `userInterfaceStyle` "automatic" olmalı ("dark" iken `useColorScheme` hep koyu döner,
  "Sistem" teması çalışmaz); pencere zemini `expo-system-ui` ile temaya eşitlenir.
- ⚠️ lucide ana girişi 3600+ ikonu dışa aktarır, Metro ağaç sallamaz → `Icon.tsx` yol yol alır.
- ⛔ **Medya bildirimine dokunmak "Unmatched Route" açıyordu** (kullanıcı bildirdi):
  track-player uygulamayı `resonance://notification.click` ile açıyor. `app/+native-intent.tsx`
  bunu `/player`'a (soğuk açılışta `/`) çevirir. Yeni dış adres gelirse oraya ekle.
- ⚠️ `Network.getNetworkStateAsync()` emülatörde 45 sn sürebildi (erişilebilirlik yoklaması)
  → teşhis ve rapor bunu 2-3 sn zaman aşımıyla çağırır.
- ⚠️ lrclib ara ara 5xx veriyor (ölçüldü: 520) — uygulamanın değil sunucunun hatası;
  söz isteği bir kez yeniden dener ve sonucu oturumda saklar.
- ℹ️ **Hata raporu** (`lib/bugReport.ts`): tam otomatik e-posta YOK (posta servisi + gizli
  anahtar gerekir, APK'dan okunur). Rapor alıcı/konu/gövde dolu posta uygulamasında
  açılır; hata bildirimlerinde "Bildir", Sorun giderme'de ve hata ekranında düğme.
  Son 80 `console.error/warn` + yakalanmayan hatalar `lib/errorLog.ts` halka tamponunda.
- ℹ️ `outbox` GEREKMEDİ: motor `last_pushed` su terazisiyle öldürülmeye dayanıklı.

## Özellikler
**Cihazda doğrulandı** (Pixel_7 emülatör; sürüm APK'sında olanlar ★):
arama yazarken ★ · YouTube akışı (R8 sonrası) ★ · boşluksuz geçiş (238/238 sn) ★ ·
uygulama içi ve medya tuşuyla "sonraki" ★ · Keşfet başlatma ★ · oy: "+1", bekleme
süresi, geri al ★ · koyu/açık tema anında ★ · otomatik + elle yedek (`VACUUM INTO`) ★ ·
ana sayfa/Keşfet/oynatıcı/ayar ekranları ★ · kapat-aç sonrası Keşfet sırası geri geliyor ★ ·
medya bildirimine dokununca oynatıcı ★ · rapor düğmesi posta uygulamasını açıyor ★ (dolu
taslak emülatörde görülemedi: Gmail'de hesap yok) · önceki turlardan: indirme (Wi-Fi, LRU),
senkron, telefondaki müzik, ses eşitleme, Spotify içe aktarma, özet görsel paylaşımı.

**Yazıldı, tip denetimli, cihazda henüz uçtan uca denenmedi:** tekrar/karışık kipleri,
akıllı karışık öneri serpiştirme, "böyle devam et", sıra düzenleme, uyku "şarkı bitince",
liste yeniden adlandır/sırala/toplu indir/paylaş, sözden arama,
JSON dışa/içe aktarma, yedekten geri yükleme, bağlantı testi, İngilizce arayüz,
açılış rehberi, hesap akışları (kayıt, şifre sıfırlama, ilk senkron yönü).

## Bilerek yapılmayanlar
- Şarkı geçişinde çapraz sönme (track-player desteklemiyor), ses düzeyi hatırlama
  (sistem sesi), mini pencere, komut paleti, kısayollar, otomatik başlatma, yt-dlp
  güncelleme, tarayıcı çerezi (hepsi masaüstüne özgü).
- Spotify API anahtarlı yol (anahtarlar senkronlanmıyor; anahtarsız yol yeterli).
- Uygulama içi güncelleme denetimi (repo private; APK elle kurulur).
