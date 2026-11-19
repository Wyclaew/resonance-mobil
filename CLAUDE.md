# Resonance Mobil — Proje Kılavuzu

> ⚠️ **ÖNCE OKU: `docs/MASAUSTU-NOTLARI.md`** — masaüstü oturumunun mobil için bıraktığı
> notlar (en yeni: v1.9.7 — sync-core yanlış "aynı ✅" diyor, migration v10, filtreli Keşfet).
> Masaüstü deposu artık **`~/Desktop/ben/Resonance`**.

Masaüstü **Resonance**'ın (Mac/Windows, Tauri) Android sürümü. Aynı SQLite şeması,
aynı öneri motoru, aynı bulut senkronu — **farklı olan tek şey ses yolu**.
Kullanıcı: Eren. **İletişim dili: Türkçe.** Kişisel kullanım, mağazaya çıkmayacak.

> Masaüstü deposu: `~/Desktop/ben/Resonance` (v1.9.7+). Oradaki **`CLAUDE.md`** mimarinin
> ve tuzakların ana kaynağı; **`docs/MOBILE.md`** bu projenin planı; **`docs/SYNC.md`**
> senkron protokolü. Mobil'e özgü ölçümler: **`docs/FAZ0-SES-YOLU.md`**.

**Durum (v1.0.6):** Masaüstünün sistemleri taşındı (oynatıcı çekirdeği, Keşfet, listeler,
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
  ekranı bu yüzden var). İmza 1.0.6'dan beri KENDİ anahtarı (aşağıda "İmza").
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

`scripts/sync-core.py` — kopyaları tazeler (32 dosya izleniyor; kaynak bulunamazsa ÇIKIŞ 1 — eskiden
yanlışlıkla "aynı ✅" diyordu). ⚠️ SIRA: önce `gen-migrations.py`, sonra `sync-core.py`.
`scripts/gen-migrations.py` — masaüstünün `lib.rs` migration'larını TS'e çevirir
(**şema tek kaynaktan**; v1–v10, senkron buna dayanır).
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
yoksa Expo şablonunun hata ayıklama anahtarı. ⭐ **2026-11-18'den beri KENDİ anahtarı:**
`~/.resonance-keys/resonance-release.jks` (alias `resonance`, sertifika SHA-256
`c8fbe188…bdf15a`, şifre yalnız `~/.gradle/gradle.properties`'te). Kullanıcının telefonu
kaldırılıp bu anahtarla kuruldu. ⛔ Anahtar KAYBOLURSA güncelleme kurulamaz (yine kaldır-kur)
→ yedeklenmeli. v1.0.4 ve öncesi (hata ayıklama anahtarı) kuranlar 1.0.6'ya uygulama içinden
GEÇEMEZ, bir kez kaldırıp kurmaları gerekir.
**Gradle belleği:** `plugins/withGradleMemory.js` (4 GB / Metaspace 1.5 GB) — 2 GB'ta sürüm
derlemesi `OutOfMemoryError: Metaspace` ile düştü; prebuild elle yazılanı siliyordu.

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
  ⚠️ 1.0.4'e kadar APK'lar Expo'nun herkese açık HATA AYIKLAMA anahtarıyla imzalıydı;
  1.0.6 kendi anahtarıyla (kullanıcı kararı 2026-11-18). Eski kurulumlar 1.0.6'yı
  uygulama içinden KURAMAZ (paket yükleyici "çakışma" der) → kaldır-kur; yayın notunda yazılı.
- ⚠️ **Play Protect** sideload'da "App scan recommended" diyor (her kurulum/güncellemede);
  kullanıcı kapatabiliyor, kurulumu engellemiyor.
- ℹ️ **Ayarlardaki uzun açıklamalar ⓘ arkasında** (`Section info=` / `InfoNote`).
- ⛔⛔ **"Müzik kendi kendine duruyor" (kullanıcı, Xiaomi, 2026-10) — ÖLÇÜLEN KÖK NEDEN:
  uyanık kilidi YOKTU.** track-player `androidWakeMode` varsayılanı 0 (yok); üstelik kütüphane
  değeri `getInt` ile okuyor, RN köprüsü sayıları `Double` paketlediği için JS'ten verilse de
  HEP 0 çıkıyordu → ekran kapanınca CPU/Wi-Fi uyuyup akış kesiliyordu. `patches/` (patch-package,
  `postinstall`) `getDouble` yapar; `setupPlayer({ androidWakeMode: 2 })`. Doğrulama:
  `dumpsys power` → `ExoPlayer:WakeLockManager`, `dumpsys wifi` → `ExoPlayer:WifiLockManager`.
  Aynı turda bulunan diğer durma yolları:
  - Oynatma hatasında taze adresle yeniden bağlanma da hata verirse `catch` çalmayı KALICI
    durduruyordu (ağ kopunca) → artık `next("error")`.
  - `startAt` art arda 3 hatada DURUYORDU → artık bekleyip sürer; ağ sorununda önce
    önbellekteki/indirilmiş sıradaki parçaya geçer (`nextReadyOffline`). ÖLÇÜLDÜ: çalarken ağ
    kesildi → "ağ sorunu — hazır parçaya geçiliyor" → çalma sürdü.
  - Radyo beslemesi ağ yüzünden başarısız olunca kuyruk sonunda duruyordu → hazır parça / bağlantıyı bekle.
  - `appKilledPlaybackBehavior` "kaydırınca dur" idi → `ContinuePlayback` (ölçüldü: son
    uygulamalardan kaldırıldı, servis ön planda kaldı, bildirimden "sonraki" çalıştı).
  - `audio/keepAlive.ts`: 20 sn tamponlama / 30 sn donmuş konum → taze adresle yeniden bağlan,
    ikincisinde sıradakine geç (bu yol emülatörde TETİKLENEMEDİ — ağ kesilince ExoPlayer hata verdi).
  - Pil kısıtlaması muafiyeti (Ayarlar → Oynatma, ilk çalışta bir kez öneri) — doğrulandı.
  - `Network.getNetworkStateAsync()` açılış zincirinde beklenmiyor (45 sn sürebiliyor).
- ⭐ **Listeye özel öneri** (`lib/playlistRadio.ts`, kullanıcı isteği): akıllı karışıkta öneri
  tohumları ÇALAN LİSTEDEN (oyla ağırlıklı, sanatçı başına bir), genel zevk karışmaz. Sonuç
  yoksa genel motora düşer (kuyruk boşalmasın). Ayar `mobile.playlistRadio` (varsayılan açık).
  Paylaşılan `recommender.ts`'e DOKUNULMADI (kopya + masaüstü aynı anda çalışıyordu) — masaüstüne
  taşınması önerildi (`docs/MASAUSTU-NOTLARI.md`). Ölçüldü: Favorite Songs → 4 tohum, 100 aday.
- ⚠️ **Emülatör başkalarıyla ortak olabilir**: başka oturum `-no-window -no-audio` ile açık
  bırakmıştı, saati geri kaymış ve DNS ölüydü (UnknownHost); üstte başka uygulama
  (`com.pocket.calc`) vardı. Önce `adb shell ping www.youtube.com`; gerekirse `adb emu kill` + yeniden aç.
- ⚠️ `uiautomator dump` hareketli `BarMark` varken "could not get idle state" verir → ekran
  görüntüsü + koordinatla ilerle. Ortak `/sdcard/ui.xml` yerine kendi dosya adını kullan.
- ℹ️ **Güncelleme penceresi** artık ekranın ORTASINDA (`UpdateDialog`), "Güncellemeden devam et"
  yalnız o açılış için; eski sürümdeyken HER AÇILIŞTA gelir ("bu sürümü atla" kaldırıldı).
- ⭐ **LİSTE PROFİLİ** (`lib/playlistProfile.ts` + `components/PlaylistStyleSheet.tsx`, kullanıcı
  isteği 2026-10-18): listeye filtre (Keşfet kimlikleri) + serbest tarz ("phonk"; paylaşılan
  filtre listesinde yok, YT Music'te o adla liste aranır) atanır → önerili karışıkta tohumlar o
  tarzın havuzundan + listede o tarzda görülen kendi sanatçılarından; tarzlı listede genel öneriye
  DÜŞÜLMEZ. `isolate` (varsayılan AÇIK): liste dinlemesi `context = "filter"` ile yazılır →
  genel zevke yalnız %20 (paylaşılan motor kuralı), oturum modu da kaymaz. Liste kendi
  sanatçı puanlarını öğrenir (≥%70 dinlenen +1, <%25'te geçilen −1, ±5 sınır). Cihaza özel
  (localStorage), SENKRONLANMAZ. Ölçüldü: Favorite Songs + "phonk" → KSLV, Phonk Time, ZXKAI…
  tohumları, sıraya phonk önerileri; dinleme `play_history.context = filter`.
- ⛔ **Listede ortadayken arama → ekran bozuluyordu**: arama kutusu listenin BAŞLIĞINDAYDI;
  ekran dışındaki kutu odaklanıp liste kısalınca kaydırma konumu aşağıda kalıyordu. Kutu artık
  üst çubuğun altında sabit, sorgu değişince liste başa döner (doğrulandı).
- ⛔ **"Çalınamadı" deyip duruyordu**: oynatma hatası işleyicisi yalnız `state === Error` iken
  kurtarıyordu; hata sonrası durum başka kalınca hiçbir şey yapılmıyordu. Çalan sağlam çalıyorsa
  hata önden hazırlanan sıradakine aittir → `dropPrepared` + taze adresle yeniden hazırla.
- ⛔ `whenOnline` tek geri çağrı tutuyordu (ikinci bekleyen birincisini siliyordu) → liste.
- ⚠️ Derin bağlantı / bildirime dokunma kök görünümü yeniden kurabiliyor ("Running main" iki
  kez) → `runStartupTasks` artık tek seferlik (dinleyiciler/denetimler çiftlenmesin).
- ⚠️ **Emülatörü başka oturum kullanıyor olabilir** (`com.pocket.calc.dev` testi sırasında
  dokunuşlar karıştı) — `dumpsys activity activities | grep topResumedActivity` ile bak; başkası
  öndeyse ekranla etkileşme.
- ⭐ **v1.0.5 (2026-11, kullanıcı istekleri + Spotify'dan fikirler):** liste adına dokununca yerinde
  düzenleme (menüdeki "yeniden adlandır" kalktı) · liste sıralama çipleri + "indirilenler" · liste sonunda
  "bu listeye önerilenler" (`PlaylistSuggestions`, liste radyosuyla aynı kaynak, `recordRecommended` YAZMAZ) ·
  çalan öneride "listeye ekle" · sırayı temizle / yeniden karıştır · "30 gün önerme" (`lib/snooze.ts`,
  `songCore` anahtarlı, cihaza özel; `excludeCores` yoluyla tüm önerilere uygulanır) · zaten listedeyse
  "zaten var" bildirimi · bildirimler ÜSTTE, kaydırarak kapanır (çarpı yok) · açılış animasyonu
  (`LaunchIntro`) · arama: önce kütüphane (yerel SQL, her tuşta) + 10 dk sorgu
  önbelleği + ilk sonucun adresini ısıtma (`lib/fastSearch.ts`), bekleme 450 → 300 ms.
- ⭐ **Kilit ekranında 👍 👎 ⬇** — `patches/` track-player'a media3 özel düğmeleri ekler (LIKE/DISLIKE/BOOKMARK →
  `remote-like/-dislike/-bookmark`). JS'te bu yetenekler yok: `player.ts` yerel sıra numaralarını (12/13/14)
  verir. media3'te indirme ikonu YOK → `res/drawable/rntp_download.xml` yamayla eklendi. Android 13+ medya
  kontrolü önceki/sonraki yanında en çok İKİ özel düğme gösterebilir (üretici arayüzüne bağlı).
- ⭐ **Masaüstünü telefondan kumanda** (`lib/remoteControl.ts`, `RemoteDeviceBar`): `now_playing` DOĞRUDAN
  Supabase'ten + Realtime (yerel senkron kopyası geride kalıyor), komut `remote_commands` INSERT; masaüstü
  v1.9.6+ dinleyicisi uygular. Konum tahmini (`updated_at`'ten beri geçen süre); 3 dk yazılmayan "çalıyor"
  satırı kapanmış sayılır.
- ⭐ **v1.0.5 ikinci yarı (araştırma ajanı + Spotify APK incelemesi):** kilit ekranında 👍👎⬇ sonrası kısa
  titreşim · liste profili: öneri sıklığı (`everyN`), "bu listede önerme" (`blockedCores`, `recommendFor`
  sonunda süzülür), "listeyi çevrimdışı tut" (`keepOffline` + `resonance.offlineLists` dizini, Wi-Fi işinde
  eksikler iner) · ana sayfada "Bu saatin şarkıları" (`lib/hourly.ts`) · sözler diske (`Paths.document/lyrics`,
  yalnız bulunanlar) · başlangıç tamponu 2.5 → 1.5 sn (Spotify) · satıra dokununca adres ısıtma (`onPressIn`,
  Wi-Fi) · duraklat/devamda 180 ms ses geçişi (`pauseWithFade`/`playWithFade`) · önbellek budamada ≥1 GB boş
  alan tabanı · `resumeState` gövdesi yalnız değişince, konum `resonance.resumePos`'ta · `presence.publish`
  kısıtı köprü çağrısından ÖNCE · ilerleme kancaları arka planda 60 sn (`useLiveProgress`) · kumanda
  yoklaması yalnız öndeyken · `PRAGMA synchronous=NORMAL` · açılış adımları paralel · bekçi takılma sayacı
  10 dk'da sıfırlanır · kuyruk sonu motorla ayrışınca sürer · ses odağı olayı loglanır · sıradaki önce
  eklenir sonra eskisi çıkar.
- ⭐ **Açılış (ikinci hali):** yerel açılış ekranı LOGOSUZ (`assets/splash-blank.png`, şeffaf) ve JS'in
  ilk çiziminde kapanır; `LaunchIntro` hazırlık BEKLENMEDEN başlar (çubuklar sıfırdan büyür, hazır olana
  dek dalgalanır, "RESONANCE" harf harf, çıkış). Çubuklar baştan KULLANICININ VURGU RENGİNDE
  (kullanıcı tercihi; altın → vurgu geçişini beğenmedi) → ayarlar yüklenene kadar (`themeReady`)
  yalnız zemin görünür. Kök düzen: `booted` olunca
  `App` çizilir, kaplama her durumda üstte. Ölçüldü (0.25 sn aralıklı ekran görüntüsü, Xiaomi).
- ⚠️ **`TrackRow` memo'su işlemiyordu** (her çizimde yeni `onPress`/`sheet` kapanışı). Artık
  `onPressTrack(track)` ve `sheet` işlev olarak verilebilir; liste ve arama ekranları `useCallback` +
  ref ile SABİT geri çağrı verir. Yeni liste ekranı yazarken bu kalıbı kullan.
- ⚠️ **Xiaomi'de "geçiş animasyonu ölçeği = 0"** (kullanıcının telefonu) RN/Reanimated'a "hareketi azalt"
  olarak gelir: `withTiming`/`withDelay`/`withSequence` ANINDA biter. Açılış animasyonu bu yüzden hiç
  görünmüyordu → `ReduceMotion.Never` (her üçünde ayrı ayrı). Ölçüldü: 0.3 sn aralıklı ekran görüntüleri.
- ℹ️ **Spotify 9.2 incelemesi** (jadx/apktool; REA CLI Node ≥24.22.1 istiyor, kurulu 24.15): müzik
  ExoPlayer'da DEĞİL, yerel `liborbit` çekirdeğinde; içerik 512 KB'lık Range okumalarıyla iniyor. Bizde
  ExoPlayer akışı tek açık uçlu istek → YouTube yavaşlatırsa (~31 KB/s ölçülmüştü) takılma nedeni olabilir.
  ÖLÇÜLMEDİ; sıradaki iş: çalarken `buffered - position` izlenip gerekirse parçalı veri kaynağı yaması.
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
