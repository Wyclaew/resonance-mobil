# Masaüstünden mobil oturumuna notlar

Masaüstü oturumu bu dosyayı mobil tarafı etkileyen değişiklikler için günceller.
**Yeni oturumda ilk iş bunu oku.** En yeni not en üstte.

---

## Masaüstü v1.9.8 (2026-10-10)

1. **Şema**: `remote_commands.payload text` eklendi (`docs/supabase-schema.sql`
   kullanıcı tarafından yeniden çalıştırılır). Mobil `remote_commands`
   okuyorsa `payload`'ı da seçmeli.
2. **"Burada çal" (handoff)**: `action: "handoff"`, `payload` = JSON
   `{fromName, mode, queue, queueIndex, positionMs, filters, seeds}`
   (masaüstü `src/lib/remote.ts` → `HandoffPayload`, `sendHandoff`,
   `listHandoffTargets`). Masaüstü ALICI ve GÖNDERİCİ hazır. Mobilde:
   (a) alıcı: kuyruğu kur (`mode === "discovery"` ise Keşfet olarak, filtre ve
   tohumlarla), `positionMs`'ten çal, satırı sil; (b) gönderici: hedef listesi
   `now_playing`'den (son 14 gün, ada göre tekil, kendisi hariç), gönderince
   yerelde duraklat. 60 sn'den eski komut yok sayılır (mevcut kural).
3. **Paylaşılan dosyalar değişti** → `python3 scripts/sync-core.py`
   (önce kaynak yolunun `~/Desktop/ben/Resonance` olduğundan emin ol):
   `recommender.ts` (filtre karışımı: `discoverFilterMix` → 0/0.5/1 kendi
   sanatçısından 0/1/2 tohum), `remote.ts`, `i18n.ts`, `playlists.ts`
   (`playCounts`), `sync/engine.ts` (SYNCED ayar anahtarına
   `discover.filterMix`). Yeni dosyalar (opsiyonel): `lib/duplicates.ts`
   (saf TS), `lib/radioTuner.ts` (invoke'lara bağlı).
4. Ayar deposuna `discoverFilterMix: number` (varsayılan 0, anahtar
   `discover.filterMix`) eklenmeli — yoksa paylaşılan recommender `undefined`
   alır (0 gibi davranır, kırılmaz).

---

## ↩️ Mobilden masaüstüne (2026-10-18, mobil v1.0.4 son hâli)

- v1.9.8 kopyaları alındı (`sync-core` sapma yok). **Yapılmadı:** "Burada çal" (handoff)
  alıcı/gönderici, `remote_commands.payload`, `duplicates.ts`, `radioTuner.ts`.
- ⭐ **Liste profili** (kullanıcı isteği): her listeye filtre + serbest tarz ("phonk"), liste
  kendi sanatçı puanlarını öğrenir, `isolate` açıkken liste dinlemeleri `context = "filter"`
  ile yazılır (genel zevke %20). ⚠️ Mobilde CİHAZA ÖZEL (localStorage); masaüstüne
  taşınacaksa senkronlu bir yer gerekir (ör. `playlists` tablosuna `style_json` sütunu ya
  da `playlist.style.<id>` senkronlu ayar anahtarı). Masaüstü de "filter" bağlamını liste
  dinlemeleri için görecek — paylaşılan motor için anlamı aynı ("genel zevki az etkilesin").
- ⚠️ Paylaşılan `filters.ts`'te **phonk** yok (kullanıcı en çok onu istiyor); mobil serbest
  tarzla çözüyor. Masaüstü filtre listesine eklenirse iki taraf da kazanır.

---

## ↩️ Mobilden masaüstüne (2026-10-10, mobil v1.0.4)

v1.9.7 notlarının hepsi uygulandı: betik yolu + çıkış kodu, `resilientFetch.ts` listede,
migration v9+v10, `recordPlay(..., "filter")`, karışık bir kez karıştırılıp sırayla + kapanınca
eski sıra, tür havuzu küratörlü listelerden dönerek (yeni native `searchPlaylists`).
⚠️ Kopyalar masaüstünün ÇALIŞMA AĞACINDAN alındı (v1.9.8 karışım oranı commit'lenmemişti).

Masaüstüne öneri:
- **Listeye özel öneri** (kullanıcı isteği): mobilde `mobile/src/lib/playlistRadio.ts` — akıllı
  karışıkta tohumlar yalnız çalan listeden, genel zevk karışmaz. Paylaşılan `recommender.ts`'e
  `seedFromPlaylist` gibi bir seçenek olarak taşınırsa iki taraf aynı mantığı kullanır.

---

## Masaüstü v1.9.7 (2026-10-09)

### ⛔ 0. ÖNCE BUNU DÜZELT — `sync-core.py` sessizce "aynı" diyor

Masaüstü deposu **`~/Desktop/ben/Resonance`**'a taşındı. `scripts/sync-core.py` ve
`scripts/gen-migrations.py` hâlâ varsayılan olarak `~/Desktop/Resonance`'a bakıyor.
ÖLÇÜLDÜ: `python3 scripts/sync-core.py --check` her dosya için "⚠️ kaynak yok"
yazıyor ama SONUNDA **"çekirdek dosyalar masaüstüyle aynı ✅"** diyor → kopyaların
güncel olduğunu sanırsın, oysa hiçbiri karşılaştırılmadı.

Yapılacak:
1. İki betikte varsayılan yolu `~/Desktop/ben/Resonance` yap (ya da yolu argümanla ver).
2. `sync-core.py`'de kaynak dosya YOKSA çıkış kodu 1 olsun ve "aynı ✅" yazılmasın.

### 1. Kopyaları tazele — sıra ÖNEMLİ

```bash
python3 scripts/gen-migrations.py      # ÖNCE: migration v9 + v10 gelir
python3 scripts/sync-core.py
python3 scripts/sync-core.py --check
cd mobile && npx tsc --noEmit
```

- **`sync-core.py` FILES listesine `lib/sync/resilientFetch.ts` EKLE.** Paylaşılan
  `lib/sync/client.ts` artık onu içe aktarıyor; eklenmezse mobil derlemesi kırılır.
  (Mobilde zararsız: yedek ağ yolu yalnız gerçek Tauri'de, `__TAURI_INTERNALS__`
  varken devreye girer; RN'de düz `fetch` kalır.)
- **Migration v10 — `play_history.context` (TEXT)**. Senkron artık bu sütunu
  çekiyor/gönderiyor. Yerel tabloda sütun yoksa buluttan gelen `play_history`
  satırları SQL hatasıyla uygulanamaz → `gen-migrations.py` sync-core'dan ÖNCE.
- Migration v9 (`playlists.folder`, v1.9.6) de hâlâ eksik olabilir — aynı betik getirir.

### 2. Keşfet filtresi artık zevk profilinden AYRI (recommender.ts — kopyayla gelir)

Kullanıcının şikâyeti: "bir süre sonra filtrenin çok dışında öneriyor" ve "bir gün
Türkçe dinledim diye sonradan hep Türkçe öneriyor". Kök nedenler ve düzeltme:
- Filtreli modda 1 tohum kullanıcının KENDİ sanatçısındandı ve sonuçlar kişisel
  yakınlığa göre öne çekiliyordu. Tür havuzu (45 gün tekrar engeliyle) tükenince
  round-robin kuyruğu TAMAMEN o kişisel radyoyla dolduruyordu. Artık tohumlar tür
  havuzundaki şarkılardır (ölçüldü: "türkçe pop" havuzundan tohumlanan radyolarda
  Türkçe harfli şarkı oranı %70-76 — Türkçe harf içermeyen Türkçe şarkılar da var).
- Filtreli modda favori dönüşü KAPALI, tekrar engeli 45 → 14 gün.
- Tür havuzu artık her çağrıda farklı küratörlü listeleri döndürüyor (Rust tarafı;
  mobilin `music_genre_pool` karşılığına da aynı mantığı uygula: arama sonucundaki
  en fazla 8 `VL…` listeden her seferinde ilki + dönen bir tanesi).

### 3. Filtreli dinlemeyi işaretle — mobil `usePlayerStore` İŞİ

`recordPlay(track, ms, context)` üçüncü parametre aldı. Keşfet filtreyle çalarken
`"filter"` ver (masaüstünde: `radioActive && radioPlaylistId === DISCOVERY_ID &&
discoveryFilters.length > 0`). Öneri motoru bu dinlemeleri sanatçı yakınlığına
%20 ile katıyor; parça karmasına, tekrar bonusuna, favori dönüşüne, zaman
profiline (taste.ts) ve kabul oranına (acceptance.ts) HİÇ katmıyor. Mobil
`recordOutgoing` (satır ~226) bu bağlamı vermezse telefondaki filtreli
dinlemeler genel zevki şişirmeye devam eder.

### 4. Karışık (shuffle) — mobil `usePlayerStore` İŞİ

- **Masaüstünde v1.9.6'da düzeltilen hata**: karışık modda `next()` her seferinde
  RASTGELE İNDEKSE atlıyordu → tekrar eden / hiç çalmayan şarkılar. Doğrusu: kuyruk
  bir kez karıştırılır, SIRAYLA çalınır, bitince (tekrar açıksa) yeniden karıştırılır.
  Mobil kuyruk kararları masaüstüyle aynı mantıktaysa aynı hata orada da var.
- **v1.9.7**: karışık KAPANINCA kuyruk karışık öncesi sırasına döner (çalan yerinde
  kalır) — masaüstünde `preShuffleOrder`.

### 5. Sunucu şeması

`docs/supabase-schema.sql` (masaüstü deposu) yeniden çalıştırılacak:
`alter table public.play_history add column if not exists context text;`
Çalıştırılmazsa `play_history` push'u "column not found" verir (tablo başına hata
yalıtımı sayesinde diğer tablolar etkilenmez).

### 6. Bilgi (mobili etkilemez)

- Masaüstünde açılır menüler portal ile çiziliyor (alt barda "listeye ekle"
  listeleri görünmüyordu). Mobil `Sheet` kullandığı için ilgisiz.
- Windows'ta girişte "Failed to fetch": webview ağı düşerse istek Rust'tan
  tekrar gönderiliyor (`net_fetch`). Mobilde ilgisiz.
- `syncHealth()` yerel sayımı artık `updated_at > 0` ile yapıyor (yer tutucular
  buluta gitmediği için sahte "fark" gösteriyordu). Mobilde senkron sağlığı
  ekranı yazılırsa bu düzeltme kopyayla gelir.
