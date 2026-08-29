# Resonance Mobil

Masaüstü [Resonance](https://github.com/Wyclaew)'ın Android sürümü — karma tabanlı
kişisel müzik oynatıcı. Aynı SQLite şeması, aynı öneri motoru, aynı bulut senkronu.

- **Kabuk:** React Native + Expo (prebuild / dev client)
- **Ses:** `react-native-track-player` (ExoPlayer) — arka plan + kilit ekranı
- **Çıkarım:** NewPipeExtractor (native Kotlin modül) — `docs/FAZ0-SES-YOLU.md`
- **Veri:** `expo-sqlite`, masaüstüyle **birebir aynı şema** (migration v1–v8)
- **Senkron:** Supabase (masaüstüyle ortak proje, RLS + Realtime)

## Kurulum
```bash
cd mobile
npm install --legacy-peer-deps
cp .env.example .env      # Supabase URL + anon key
npx expo prebuild --platform android
npx expo run:android
```
Ayrıntı, kurallar ve ölçümler: [CLAUDE.md](CLAUDE.md).

## Durum
Faz 0 (ses yolu doğrulama) bitti; Faz 2 (mobil iskelet) sürüyor.
Kişisel kullanım için — mağazaya çıkmayacak.
