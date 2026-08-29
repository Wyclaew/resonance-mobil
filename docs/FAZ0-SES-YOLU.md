# Faz 0 — Ses yolu spike'ı (ölçüm raporu)

Tarih: **2026-08-29**. Ölçüm makinesi: bu Mac, ev IP'si (TR).
Test parçası: `rtL5oMyBHPs` (MGMT — Little Dark Age, 5:10, itag 140 = 4.79 MB).
Betikler: `spike/node-extract/` (hepsi tekrar çalıştırılabilir).

> `docs/MOBILE.md` §2 "ana yol A: telefon `youtubei.js` ile stream URL'i çıkarır"
> diyordu. **Bu yol bugün olduğu gibi çalışmıyor.** Aşağısı nedenini ölçümle anlatır.

## 1. Ölçülenler

### 1.1 youtubei.js tek başına — adres HİÇ gelmiyor
`youtubei.js@18.0.0`, 12 istemci denendi (`WEB`, `WEB_EMBEDDED`, `ANDROID`,
`ANDROID_VR`, `IOS`, `VISIONOS`, `TV_EMBEDDED`, `TV_SIMPLY`, `YTMUSIC`,
`YTMUSIC_ANDROID`, `WEB_CREATOR`, `YTKIDS`):

- `playabilityStatus: OK`, 24 adaptive format geliyor (süre/boyut/bitrate dolu),
- ama formatların **hiçbirinde `url` YOK ve `signatureCipher` de YOK**,
- yerine `streamingData.serverAbrStreamingUrl` + `videoPlaybackUstreamerConfig` var
  → YouTube bu isteklere artık **yalnız SABR** (sunucu-güdümlü akış) veriyor.

`f.decipher()` → `No valid URL to decipher` (deşifre edilecek bir şey yok, adres yok).

### 1.2 Ham InnerTube `android_vr` (yt-dlp'nin taklidi) — adres var, 1 MB duvarı var
`visitorData` ile ham `/youtubei/v1/player` isteği (yt-dlp'nin `android_vr`
bağlamının birebir kopyası) **gerçek adres döndürüyor**. Ama:

| istek | sonuç |
| --- | --- |
| `Range: bytes=0-524287` | **206** ✅ |
| `Range: bytes=524288-1048575` | **206** ✅ |
| `Range: bytes=1048576-…` | **403** ❌ |
| `&range=` sorgu parametresiyle aynısı | aynı duvar |
| tam dosya (Range yok) | **403** ❌ |

**Duvar tam 1 MB'ta.** `CLAUDE.md` v1.8.0 notundaki "ilk 1 MB'dan sonrası 403"
ölçümü hâlâ geçerli — PO Token olmadan bu istemciler kullanılamaz.
⚠️ `yt-dlp`'nin kendi çözdüğü `android_vr` adresi de **aynı duvara** çarpıyor,
yani duvar adresi kimin çözdüğüyle ilgili değil.

### 1.3 Bugün ÇALIŞAN tek yol: `web_embedded`
```
yt-dlp --extractor-args "youtube:player_client=web_embedded" -f bestaudio[ext=m4a] -g
```
→ adres kısıtsız: `0-512K` **206**, `3 MB` civarı **206**, tam indirme çalışıyor.
Diğer tüm istemciler (`web`, `mweb`, `tv`, `tv_simply`, `ios`, `android`,
`web_safari`) bugün **hiç çözemedi**; `android_vr` çözüyor ama 1 MB'ta ölüyor.
**Masaüstü Resonance bu yüzden hâlâ sorunsuz** — sırasında `web_embedded` ilk.

⚠️ Not: yt-dlp'nin **varsayılan** ayarla indirmesi bu makinede `403` verdi
(varsayılan istemci `android_vr` seçiliyor). Yani masaüstünde `web_embedded`
zorlaması olmasaydı indirme bugün kırıktı.

### 1.4 `web_embedded`'i saf `fetch` ile taklit etmek — kolay değil
yt-dlp'nin gerçek isteği (`--print-traffic` ile alındı) şunları taşıyor:
- embed sayfasından **taze** `INNERTUBE_CLIENT_VERSION` (`2.20260828.01.00` —
  youtubei.js'in gömdüğü `1.20260206.01.00` DEĞİL), taze `visitorData`,
- `playbackContext.contentPlaybackContext.signatureTimestamp` (player.js'ten, `20684`),
- **`encryptedHostFlags`** ve **`thirdParty.embeddedPlayerContext.embeddedPlayerEncryptedContext`**
  (embed sayfasından çıkan şifreli bloblar),
- `deviceExperimentId`, `rolloutToken`, `clickTrackingParams`, `remoteHost`…

Bu alanların bir kısmını taşıyan iki deneme yaptım:
`Video player configuration error` / `This video is unavailable` aldım.
Eksik alanların hangisi olduğu bulunabilir — ama bu, **yt-dlp'nin sürekli
güncellediği protokolü elle takip etmek** demek (risk #1'in ta kendisi).

### 1.5 PO Token + SABR yolu — üretiliyor ama akış 403
`bgutils-js@4.0.3` + `jsdom` ile **PO token üretimi ÇALIŞTI** (~2 sn, ttl 12 saat).
Ancak:
- PO token'lı `WEB` isteği de **yine SABR-only** döndü (adres yok),
- `googlevideo@4.1.1` `SabrStream` ile ses akışı denendi → **`403 Forbidden`**
  (muhtemelen `serverAbrStreamingUrl`'deki `n` parametresi player.js ile
  dönüştürülmediği için; bu da JS motoru gerektiriyor).

### 1.6 Hermes duvarı (mobil tarafın ayrı sorunu)
`youtubei.js/dist/src/platform/jsruntime/default.js`:
> "To decipher URLs, you must provide your own JavaScript evaluator."

Yani RN'de youtubei.js deşifre yapamaz; **kendi JS yorumlayıcını vermen şart**
(Hermes'te `eval`/`new Function` yok). Pratik seçenekler: gizli **WebView**,
ya da native (Kotlin/Rhino) bir yorumlayıcı. Bu, MOBILE.md'nin öngördüğü riskti
— ama artık ikincil sorun: **JS motoru olsa bile adres gelmiyor** (§1.1).

## 2. Sonuç (dürüst)

**MOBILE.md §2.2'deki "ana yol A" (telefonda youtubei.js) bugün ölü.**
Üç ayrı duvar üst üste: (a) SABR-only yanıtlar, (b) PO Token / 1 MB kotası,
(c) Hermes'te JS yorumlayıcı yokluğu. Bunların hepsi aşılabilir ama aşan taraf
**sürekli bakım isteyen bir protokol takibi** olur; telefonda bakım = yeni build.

Ayakta kalan yollar:

| yol | durum | maliyet |
| --- | --- | --- |
| **C — PC köprüsü** (masaüstü küçük HTTP sunucu, telefon ondan çeker) | ✅ bugün ölçülmüş şekilde çalışıyor (`web_embedded`) | Masaüstüne ~200 satır Rust; telefonda sıfır kırılganlık |
| **B — NewPipeExtractor** (Kotlin native modül) | ❓ denenmedi; NewPipe da aynı duvarlarla boğuşuyor | Kotlin köprüsü + bakım riski telefonda |
| **A′ — WebView'lı çıkarım** (gizli WebView = gerçek tarayıcı motoru) | ❓ denenmedi; §1.5'teki SABR sorunu WebView'da da var | Yüksek karmaşıklık, yüksek bakım |

**KARAR (kullanıcı): B — NewPipeExtractor.** Aşağıdaki §3 bunu ölçtü.

<details><summary>Karar öncesi öneri (C — PC köprüsü) ve gerekçesi</summary>

**Öneri: C ana yol, B/A′ sonraya deney.** Gerekçe:
1. Masaüstü zaten çalışıyor ve `update_ytdlp` ile kendini onarıyor →
   YouTube değişince **tek yerde** düzeliyor, telefona yeni build gerekmiyor.
2. Mobil zaten **offline-first** olacak (§MOBILE.md 1): şarkılar telefonda
   önbellekte; PC yalnız *indirme anında* gerekli.
3. Senkron zaten canlı → telefon, PC'deki Keşfet kuyruğunu biliyor; kuyruğu
   Wi-Fi'dayken önden indirmek doğal davranış.
4. Tailscale ile PC evde açıkken dışarıdan da erişilebilir.

**Dürüst eksisi:** PC kapalıyken telefonda **yeni** şarkı indirilemez
(önbellektekiler sorunsuz çalar). Azaltma: agresif ön-indirme + "yalnız Wi-Fi"
kotası + kuyruğun tamamını önden ısıtma.

</details>

## 3. Yol B ölçümü — NewPipeExtractor ÇALIŞIYOR ✅

Betik: `spike/newpipe/` (Gradle + Java 21; `gradle run -Pargs=<videoId>`).
Kütüphane: **NewPipeExtractor v0.26.5** (JitPack, 2026-08 sürümü).

```
başlık: MGMT - Little Dark Age (Official Video) | süre: 310s | çözüm: 2.63s
ses akışı sayısı: 5
  itag=139 M4A        48kbps   url=var
  itag=140 M4A       128kbps   url=var
  itag=249 WEBMA_OPUS 50kbps   url=var
  itag=250 WEBMA_OPUS 70kbps   url=var
  itag=251 WEBMA_OPUS 160kbps  url=var
sağlık 0-512K: 206      3MB civarı: 206      ← KISITSIZ (android_vr 1 MB'ta ölüyordu)
```

Çıkarımlar (mobil kodu bunlara göre yazıldı):
1. **Çözüm ~2.6 sn** — masaüstündeki yt-dlp ile (2.34 sn) aynı mertebe.
2. **itag 251 = Opus 160k** → mobil, masaüstünden **daha iyi ses** çalar
   (ExoPlayer opus'u sorunsuz açar; masaüstünde symphonia açamadığı için 128k m4a).
3. ⛔ **TEK SEFERDE TAM İNDİRME ÇALIŞMIYOR**: 5.03 MB'lık dosyada 4.78 MB'ta
   `Connection reset` (googlevideo tek uzun bağlantıyı kesiyor). `Range` istekleri
   sorunsuz → `src/lib/downloads.ts` **parçalı + devam edebilen** indirici olarak
   yazıldı. Bu bir optimizasyon değil, çalışma şartı.
4. Kırılganlık riski (MOBILE.md risk #1) duruyor: YouTube değişince
   NewPipeExtractor sürümü yükseltilip **yeni build** gerekir. Azaltma: sürüm tek
   satırda (`modules/resonance-extractor/android/build.gradle`), ve indirilmiş
   parçalar çıkarımdan bağımsız çalar.

## 4. CİHAZDA doğrulama (2026-08-29, Pixel 10 Pro XL emülatörü, Android 37)

Faz 0'ın asıl kabul ölçütü buydu (MOBILE.md §8): *"stream URL çıkar → çal →
uygulamayı arka plana al, çalmaya devam ediyor mu?"*

| adım | sonuç |
| --- | --- |
| 8 migration cihazda uygulandı (v1→v8) | ✅ `[db] migration v8 … uygulandı` |
| Arama (NewPipe → YT Music şarkılar) | ✅ 25 sonuç, süre + sanatçı + kapak dolu |
| Paylaşılan `isLikelySong` filtresi mobilde çalıştı | ✅ (masaüstüyle aynı kod) |
| Adres çözümü + çalma | ✅ `[audio] çalıyor: Little Dark Age (akış)` |
| MediaSession + bildirim + foreground service | ✅ `state=PLAYING(3)`, medya bildirimi var |
| **Arka planda çalmaya devam** (HOME'a basıldı) | ✅ 54. saniyede hâlâ `PLAYING(3)` |

### Yol boyunca çıkan iki gerçek engel (ikisi de çözüldü)
1. **`react-native-track-player@4.1.2` RN 0.86'da DERLENMİYOR** —
   `Arguments.fromBundle` artık null kabul etmiyor (2 Kotlin hatası).
2. Yamalanınca derleniyor ama **Yeni Mimari'de (New Architecture) ÇALIŞMIYOR**:
   `TurboModule system assumes returnType == void iff the method is synchronous`
   — v4'ün `@ReactMethod fun x(...) = scope.launch {…}` yazımı `Job` döndürüyor,
   interop katmanı modülün tamamını reddediyor.
   **Çözüm:** `react-native-track-player@nightly` (**5.0.0-alpha0**) — gerçek
   TurboModule (`codegenConfig` var). Alpha olduğu için sürüm SABİTLENDİ;
   yükseltmeden önce bu bölümü oku. API farkı: `compactCapabilities` →
   `notificationCapabilities`.
