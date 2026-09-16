# Resonance Mobil — Proje Kılavuzu

Masaüstü **Resonance**'ın (Mac/Windows, Tauri) Android sürümü. Aynı SQLite şeması,
aynı öneri motoru, aynı bulut senkronu — **farklı olan tek şey ses yolu**.
Kullanıcı: Eren. **İletişim dili: Türkçe.** Kişisel kullanım, mağazaya çıkmayacak.

> Masaüstü deposu: `~/Desktop/Resonance` (v1.8.8). Oradaki **`CLAUDE.md`** mimarinin
> ve tuzakların ana kaynağı; **`docs/MOBILE.md`** bu projenin planı; **`docs/SYNC.md`**
> senkron protokolü. Mobil'e özgü ölçümler: **`docs/FAZ0-SES-YOLU.md`**.

**Durum (v1.0.3):** Masaüstünün sistemleri taşındı (oynatıcı çekirdeği, Keşfet, listeler,
ayarlar, veri/yedek, istatistik/zevk/özet, açık tema + vurgu rengi, TR/EN). Sürüm APK'sı
R8 ile küçültülmüş, yalnız arm64 (~46 MB). Neyin cihazda doğrulandığı aşağıda ayrı yazılı.

## ⛔ Kritik kurallar
- Türkçe konuş; kod içi yorumlar da Türkçe (masaüstü stiliyle aynı).
- Gerçekçi ol: test edilmemiş şeye "çalışıyor" deme. Bu projede her iddia ölçümle geldi.
- `mobile/src/` içindeki **kopyalanan dosyaları DÜZENLEME** (başlarında uyarı var).
  Masaüstünde düzelt → `python3 scripts/sync-core.py`. Sapma kontrolü: `--check`.
- `mobile/.env` git'e girmez (Supabase anahtarları). Şema `mobile/.env.example`.
- ⚠️ **Depo 2026-09-16'dan beri HERKESE AÇIK** (kullanıcı kararı: üniversite grubuyla
  paylaşacak). Sonuçları: YouTube ToS riski artar (kişisel kullanım savunması zayıflar),
  APK'daki Supabase projesi ortaktır (RLS veriyi ayırır, kota ayırmaz → "kendi projen"
  ekranı bu yüzden var) ve imza anahtarı hâlâ Expo'nun hata ayıklama anahtarı (aşağıda).
- Commit'lerde Claude ortak yazar satırı YOK (kullanıcı isteği).
- ⚠️ **Emülatörde senkron oturumu KAPALI** (2026-09-09'dan beri): oradaki kütüphane
  gerçeğin eski kopyası, testler buluta gitmiyor. Oturum açılırsa eski kural geri gelir:
  test oyu/çalması masaüstüne gider, `play_history`'nin tombstone'u yok, silinemez.

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
  `relink.ts` (doğrulanmış alternatif + yanlış bağlantı denetimi), `versionMatch.ts` (aynı şarkı
  mı? — saf), `discoverySession.ts` (kenardaki keşif), `netError.ts`,
  `localAudio.ts`, `spotify.ts`, `thumbs.ts`, `repairTracks.ts`, `webShims.ts`,
  `tauriShim.ts`, `haptics.ts`.
- `mobile/src/components/` — `ui.tsx` (Button, Chip, Row, Segmented, Toggle, Artwork,
  Mosaic, Card, Stat, TopBar…), `Icon.tsx` (lucide, TEK TEK yoldan içe aktarım),
  `Sheet.tsx` (Modal değil → `Portal.tsx`), `TrackRow`, `TrackSheet`, `VersionSheet` (sürüm seç),
  `KarmaControl`, `Seekbar`, `MiniPlayer`, `Charts`.
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
- ⛔ **İndirme silinmiş/bölgede kapalı videoda hep başarısızdı** (kullanıcı raporu: "Lost on You",
  "Wicked Game" → NewPipe `UNPLAYABLE: This video is not available`). Çalma yolu alternatif
  yüklemeye bağlanıyordu, indirme bağlanmıyordu. `downloads.ts` artık: kullanılamaz → `findAlternative`;
  403 → sıradaki format, sonra TAZE adresle bir tur daha; parça başına 30 sn zaman aşımı;
  ağ hatası → iş BEKLER, bağlantı gelince kaldığı bayttan sürer. Dosya adında itag var
  (kalite değişince başka formatın yarım dosyasına devam edilip bozulmasın).
- ℹ️ Ölçüm (`spike/newpipe/DlProbe.java`): tek istekte tam indirme ~31 KB/s'ye yavaşlatılıyor
  (2,8 MB = 90 sn), 1 MB'lık aralık istekleri ~4 MB/s. Parçalı indirme bu yüzden de şart.
- ⛔ **Yer tutucular günlerce isimsiz/kapaksız kaldı**: onarım açılış başına 8 parça deniyordu
  ve çözülemeyenler her turda sorgunun başına geldiği için aynı 8'de takılıyordu. Artık tur
  bitene kadar sürer (≤240), başarısızlar oturumda atlanır, oEmbed yedeği var (bölge kısıtı
  yok), senkron sonrası ve Wi-Fi'a geçince yeniden koşar; çalınan yer tutucu anında dolar.
- ⛔ **Çevrimdışıyken üç parça art arda "çalınamadı" diye atlanıp çalma duruyordu** (rapor:
  `UnknownHostException`). Ağ hatası parçanın suçu değil: sırada indirilmiş parça varsa ona
  geçilir, yoksa bağlantı gelince (ya da 20 sn'de bir) aynı parça aynı yerden denenir.
- ⛔ **Alt sayfanın son satırları görünmüyor/dokunulmuyordu** (v1.0.0–1.0.1; önceki
  "navigationBarTranslucent + mini oynatıcıyı gizle" düzeltmesi YALNIZ belirtiyi örtmüştü).
  ÖLÇÜLDÜ, iki neden üst üste: (1) RN `Modal` penceresinin kökü açılıştan hemen sonra
  838 → 914 dp yeniden boyutlanıyor (bayraklı da bayraksız da); (2) sayfadaki
  `entering={SlideInDown}` dizilim animasyonu çerçeveyi açılıştaki boyutta donduruyor —
  sayfa sonradan büyüyünce (dinleme karnesi geç yüklenir) JS'e göre y=222 iken ekranda
  y=403'te kalıyordu. Artık: `Sheet` Modal DEĞİL, kök düzende `Portal`; kayma yalnız
  transform (`useSharedValue`); sınır dp (`"88%"` kaydırmayı bozuyordu); geri tuşu
  `BackHandler`. ⚠️ Büyüyebilen görünüme `entering` layout animasyonu VERME.
- ⛔ **"Keşfet'i kapatıp açınca hatırlamıyor"** → gerçek neden (kullanıcı netleştirdi):
  kapatınca DEĞİL, Keşfet dışından (liste) şarkı açınca gidiyordu — tek kuyruk var, üzerine
  yazılıyordu. `lib/discoverySession.ts`: kuyruk Keşfet'ten başka şeye geçerken parti kenara
  konur (localStorage, senkronlanmaz); Keşfet sekmesi + ana sayfa "Keşfe devam et" (kaldığı
  şarkı ve saniye). Yeni keşif başlatınca silinir. Listeden şarkı açmak artık çıkış olarak
  kaydedilir (`leaveCurrent` → `recordOutgoing("jump")`). `presence.ts` önlemleri de duruyor.
- ⛔ **Alternatif kaynak YANLIŞ şarkıya bağlıyordu** (rapor: telefonda "Midnight City" → M83
  "Outro"; senkronla masaüstüne de geçti). Eşleşme yalnız süreydi (masaüstü `find_alternative`
  da öyle — orada da düzeltilmeli). `lib/versionMatch.ts`: başlık çekirdeği + sanatçı + sürüm
  işareti (remix/slowed/live/cover…) + puan eşiği; `relink.ts` adayı BAĞLAMADAN ÖNCE çözer,
  YT Music + video aramasını birlikte yapar. `auditRelinks()` (açılışta Wi-Fi'da) yeniden
  bağlanmış parçaların (`id ≠ youtube:source_id`) başlığını oEmbed'le denetleyip yanlışları onarır.
  Mac'te test: eşleşme mantığı gerçek arama sonuçlarıyla Node'da koşturuldu (Midnight City
  adaylarının 11'i elendi, resmi video seçildi).
- ⛔ **LOGIN_REQUIRED "Please sign in"** (spike `AltProbe`/`ClientProbe`): bazı YT Music şarkı
  kayıtları (M83) oturumsuz HİÇBİR istemcide (android-reel/ios/visionos/gömülü) çalınmıyor;
  aşılamaz. Aynı şarkının resmi/söz videosu çalınıyor → alternatif. Doğrulanmış sürüm yoksa
  indirme `NoPlayableVersionError` → "Sürüm seç" (`VersionSheet`, elle; seçilen önce denenir).
  Geçici hatada (403/5xx/bot) indirme 1 dk ve 5 dk sonra kendiliğinden yeniden dener.
- ⚠️ **Emülatörde SENKRON OTURUMU YOK** (2026-09-09'dan beri; 2026-09-16'da yine
  "Giriş yapılmadı"). Yani emülatördeki kütüphane GERÇEK kütüphanenin eski bir kopyası,
  testler buluta gitmiyor — ama senkron düzeltmeleri de emülatörde DOĞRULANAMIYOR
  (sayılar, oy akışı). Doğrulama gerekiyorsa kullanıcıdan emülatörde giriş yapmasını iste.
- ⚠️ **Emülatör `-no-snapshot-save` ile açılıp kapanırsa eski `default_boot` görüntüsüne döner**
  (o anki APK 1.0.1'di, DB de eski): "Metro'ya hiç istek yok, yeni düğme yok" görülürse önce
  `dumpsys package com.resonance.mobile | grep versionName`. Uzun süredir açık eski Metro
  dosya değişikliğini kaçırabilir → `expo start --clear` ile yeniden başlat.
- ⛔ **Çekirdek tazelemesi ŞEMAYI DA İSTER**: masaüstü 1.9.6'daki `playlists.folder`
  (migration v9) mobil şemada yoktu → `playlists.ts` `p.folder` seçiyor, TÜM listeler
  "no such column" ile yüklenmiyordu. `sync-core.py`'den sonra `gen-migrations.py` de koş,
  sonra uygulamayı AÇ ve logu oku (tip denetimi bunu yakalamaz).
- ⛔ **`updated_at` yazmayan yol buluta ÇIKMAZ**: `repairTracks` onarılan yer tutucunun
  adını damgasız yazıyordu (yer tutucu 0 ile açılır, push `updated_at > last_pushed`
  seçer) → adlar bu cihazda kalıyordu. Sunucudaki `keep_newer_row` tetikleyicisi de
  damgayı artırmayan yazmayı sessizce reddediyor. Mobil'e özgü her yazma yolunu buna
  göre gözden geçir (`cache` senkronlanmaz, `settings`/`relink`/`ensureTrack` damga yazar).
- ⚠️ **Klavye alt sayfayı kapatıyordu** ("yeni liste adını yazarken kutuyu göremiyorum"):
  Android 15+ kenardan kenara düzende pencere `adjustResize` ile KÜÇÜLMÜYOR. `Sheet`
  artık `Keyboard` olaylarını dinleyip alt boşluğu ve yüksekliği kendisi ayarlıyor.
  ⚠️ Emülatörde `hw.keyboard=yes` iken ekran klavyesi HİÇ çizilmez (ölçüm yapamazsın):
  `~/.android/avd/Pixel_7.avd/config.ini` → `hw.keyboard=no` (bu oturumda kapatıldı).
- ℹ️ **Uygulama içi güncelleme** (`lib/updater.ts` + `components/UpdateSheet.tsx`):
  kaynak GitHub Releases (`Wyclaew/resonance-mobil`), etiket `vX.Y.Z` + `.apk` eki.
  Açılıştan 9 sn sonra bir kez bakar, "bu sürümü atla" `mobile.updateSkip` ayarında.
  Kurulum: `REQUEST_INSTALL_PACKAGES` + FileProvider içerik adresi → paket yükleyici;
  olmazsa yayın sayfası tarayıcıda. Uçtan uca doğrulandı (1.0.0 → 1.0.3 kurulumu).
  ⚠️ APK Expo'nun HATA AYIKLAMA anahtarıyla imzalı: depo herkese açık olduğu için bu
  anahtar herkeste var → aynı imzayla APK üreten biri "güncelleme" diye kurdurabilir.
  Kendi anahtarına geçmek kurulu uygulamaların üzerine yazmayı bozar (önce kaldırmak
  gerekir) — kullanıcıya sorulacak bir karar.
- ⚠️ **Play Protect** sideload'da "App scan recommended" diyor (her kurulum/güncellemede);
  kullanıcı kapatabiliyor, kurulumu engellemiyor.
- ℹ️ **Ayarlardaki uzun açıklamalar ⓘ arkasında** (`Section info=` / `InfoNote`).
- ℹ️ `outbox` GEREKMEDİ: motor `last_pushed` su terazisiyle öldürülmeye dayanıklı.

## Özellikler
**Cihazda doğrulandı** (Pixel_7 emülatör; sürüm APK'sında olanlar ★):
arama yazarken ★ · YouTube akışı (R8 sonrası) ★ · boşluksuz geçiş (238/238 sn) ★ ·
uygulama içi ve medya tuşuyla "sonraki" ★ · Keşfet başlatma ★ · oy: "+1", bekleme
süresi, geri al ★ · koyu/açık tema anında ★ · otomatik + elle yedek (`VACUUM INTO`) ★ ·
ana sayfa/Keşfet/oynatıcı/ayar ekranları ★ · kapat-aç sonrası Keşfet sırası geri geliyor ★ ·
medya bildirimine dokununca oynatıcı ★ · rapor düğmesi posta uygulamasını açıyor ★ (dolu
taslak emülatörde görülemedi: Gmail'de hesap yok) · silinmiş videonun indirmesi alternatif
yüklemeyle ★ · geri yükleme logu ★ · mini oynatıcıda kaydırma (geliştirme sürümü) ·
v1.0.3'te ★: uygulama içi güncelleme (GitHub yayınından indirme + kurulum, sürüm 1.0.3
kuruldu) · ayarlarda ⓘ açıklamaları · klavye açıkken "yeni liste" kutusu görünür ·
senkron sağlığı paneli ve "kendi Supabase projen" kartı çiziliyor (senkron SAYILARI
doğrulanmadı: emülatörde oturum yok) · v1.0.2 geliştirme sürümünde: yanlış bağlantı denetimi ("Outro" → resmi video, oturum isteyen
aday atlandı) · oturum isteyen kaydın indirmesi doğrulanmış sürümle (3,7 MB) · "Sürüm seç"
listesi, başarısız adayda neden ("oturum istiyor"), başarılı seçimde yeniden bağlama ·
Keşfet'i kenara koyma → Keşfet sekmesi/ana sayfa kartı → kapat-aç sonrası duruyor → "Keşfe
devam et" kaldığı şarkıdan · uzun alt sayfa sonuna kadar görünür/kaydırılır, geri tuşu
kapatır · önceki turlardan: indirme (Wi-Fi, LRU),
senkron, telefondaki müzik, ses eşitleme, Spotify içe aktarma, özet görsel paylaşımı.

**Yazıldı, tip denetimli, cihazda henüz uçtan uca denenmedi:** tekrar/karışık kipleri,
akıllı karışık öneri serpiştirme, "böyle devam et", sıra düzenleme, uyku "şarkı bitince",
liste yeniden adlandır/sırala/toplu indir/paylaş, sözden arama, çevrimdışı atlama/bekleme,
indirmenin ağ gelince sürmesi, yer tutucu onarımının oEmbed yedeği, indirmede "Sürüm seç"
düğmesi/bildirimi (hiç doğrulanmış sürüm bulunamayan durum), indirmenin otomatik yeniden
denemesi, başka cihazdan kuyruk devralırken Keşfet'i kenara koyma,
JSON dışa/içe aktarma, yedekten geri yükleme, bağlantı testi, İngilizce arayüz,
açılış rehberi, hesap akışları (kayıt, şifre sıfırlama, ilk senkron yönü).

## Bilerek yapılmayanlar
- Şarkı geçişinde çapraz sönme (track-player desteklemiyor), ses düzeyi hatırlama
  (sistem sesi), mini pencere, komut paleti, kısayollar, otomatik başlatma, yt-dlp
  güncelleme, tarayıcı çerezi (hepsi masaüstüne özgü).
- Spotify API anahtarlı yol (anahtarlar senkronlanmıyor; anahtarsız yol yeterli).
- Uygulama içi güncelleme denetimi (repo private; APK elle kurulur).
