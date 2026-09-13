import { translate, type Lang, type TrKey } from "./i18n";
import { useSettingsStore } from "../store/useSettingsStore";

/**
 * Mobil arayüz metinleri. Masaüstü sözlüğü (`i18n.ts`, kopya — DÜZENLENMEZ)
 * olduğu gibi kullanılır; yalnız mobile özgü metinler burada `m.` önekiyle
 * durur. `useT()` ikisini tek anahtar uzayında birleştirir.
 *
 * Tip güvenliği masaüstüyle aynı: `en` sözlüğü `Record<MKey, string>` →
 * eksik İngilizce anahtar DERLEME HATASI.
 */
const mtr = {
  // Sekmeler / genel
  "m.tab.home": "Ana sayfa",
  "m.tab.discover": "Keşfet",
  "m.tab.search": "Ara",
  "m.tab.library": "Kütüphane",
  "m.boot.failed": "Açılamadı",
  "m.common.create": "Oluştur",
  "m.common.done": "Bitti",
  "m.common.save": "Kaydet",
  "m.common.seeAll": "Tümü",
  "m.common.shareFailed": "Paylaşılamadı",

  // Ana sayfa
  "m.home.discoveryOn": "Keşif çalıyor",
  "m.home.backToDiscovery": "Keşfe dön",
  "m.home.smartShuffle": "Akıllı",

  // Oynatıcı
  "m.player.playing": "Çalıyor",
  "m.player.fromList": "Listeden",
  "m.player.downloaded": "İndirildi",
  "m.player.sleep": "Uyku",
  "m.player.ambient": "Ambiyans",
  "m.player.discoveryControls": "Keşif",
  "m.player.artistPrefs": "{artist} için öneri tercihi",
  "m.sleep.afterTrackShort": "Şarkı sonu",
  "m.sleep.off": "Zamanlayıcıyı kapat",
  "m.karma.notVotable": "Oy yalnız liste ya da Keşfet'ten çalarken verilir (arama sonucunu önce bir listeye ekle)",
  "m.karma.minutes": "{n} dk",
  "m.ambient.tapToExit": "Çıkmak için dokun",

  // Sıra / parça sayfası
  "m.queue.addedNext": "Sıradaki olarak eklendi",
  "m.queue.addedEnd": "Sıranın sonuna eklendi",
  "m.queue.showPast": "Çalınanları göster ({n})",
  "m.queue.hidePast": "Çalınanları gizle",
  "m.sheet.playNext": "Sıradaki olarak çal",
  "m.sheet.addToQueue": "Sıranın sonuna ekle",
  "m.sheet.goToArtist": "Sanatçı: {artist}",
  "m.sheet.removeDownload": "İndirileni kaldır",
  "m.sheet.shareCode": "Paylaşım kodu gönder",
  "m.sheet.shareCodeHint": "Resonance'ta İçe Aktar'a yapıştırılınca parça gelir",
  "m.addTo.count": "{count} şarkı",

  // Keşfet
  "m.discover.live": "Keşif çalıyor",
  "m.discover.lock": "Tarzı kilitle",

  // Sanatçı
  "m.artist.moreDone": "{artist} daha çok önerilecek",
  "m.artist.lessDone": "{artist} daha az önerilecek",
  "m.artist.prefReset": "{artist} için tercih sıfırlandı",
  "m.artist.unblocked": "{artist} engeli kaldırıldı",
  "m.artist.blocked": "Engelli",
  "m.artist.discoverStyle": "Bu tarzda keşfet",

  // Kütüphane / indirme / telefondaki müzik
  "m.library.lists": "liste",
  "m.library.onDevice": "Telefondaki müzikler",
  "m.dl.local": "Yerel dosya — indirmeye gerek yok",
  "m.dl.waitingWifi": "Wi-Fi bekleniyor",
  "m.dl.wifiOnly": "İndirme yalnız Wi-Fi'da (Ayarlar → Oynatma)",
  "m.downloads.active": "{n} iniyor",
  "m.downloads.tempEmpty": "Geçici önbellek boş.",
  "m.playlist.downloadMissing": "{n} şarkı henüz çevrimdışı değil",
  "m.playlist.downloadQueued": "{n} şarkı indirme sırasına eklendi",
  "m.playlist.reorder": "Sırayı düzenle",
  "m.playlist.reorderHint": "Oklarla yer değiştir",
  "m.local.files": "{n} dosya",
  "m.local.filter": "Dosyalarda ara",
  "m.local.none":
    "Müzik dosyası bulunamadı ya da izin verilmedi. İzin penceresi çıkmazsa Android Ayarlar → Uygulamalar → Resonance → İzinler'den \"Müzik ve ses\"i aç.",
  "m.local.rescan": "Yeniden tara",
  "m.local.toList": "Listeye aktar",
  "m.local.unknownArtist": "bilinmeyen sanatçı",

  // Arama / içe aktarma
  "m.search.lyricsPlaceholder": "Aklında kalan bir söz satırı…",
  "m.import.paste": "Yapıştır",
  "m.import.missed": "{n} şarkı YouTube'da eşleşmedi.",
  "m.import.maybePartial":
    "YouTube giriş yapılmadan bir listenin en fazla ~100 şarkısını veriyor; liste daha uzunsa bir kısmı gelmemiş olabilir.",
  "m.import.spotifyLimit": "Anahtarsız yol bir Spotify listesinden en fazla ~100 şarkı okur.",

  // Hesap
  "m.account.notConfigured":
    "Bulut senkronu için mobile/.env içine masaüstüyle AYNI Supabase projesinin adresi ve anon anahtarı yazılıp uygulama yeniden derlenmeli. O zamana kadar her şey bu cihazda çalışır.",

  // Ayarlar
  "m.settings.you": "Sen",
  "m.settings.syncedNote":
    "Tema, dil, vurgu rengi, öneri, depolama ve oynatma ayarları senkronla diğer cihazlarınla ORTAKTIR — burada değiştirirsen masaüstünde de değişir. Wi-Fi, veri tasarrufu ve ambiyans yalnız bu telefonda kalır.",
  "m.settings.accountSub": "Giriş, senkron durumu, profil fotoğrafı",
  "m.settings.playback": "Oynatma",
  "m.settings.playbackSub": "Ses eşitleme, kuyruk sonu, kalite, veri",
  "m.settings.recsSub": "Kaynaklar, karma yarı ömrü, engellenenler",
  "m.settings.storage": "Depolama",
  "m.settings.storageSub": "Önbellek sınırı, otomatik indirme, temizlik",
  "m.settings.appearance": "Görünüm",
  "m.settings.appearanceSub": "Tema, dil, vurgu rengi, ambiyans",
  "m.settings.data": "Veri & yedek",
  "m.settings.dataSub": "Dışa/içe aktar, otomatik yedekler",
  "m.settings.troubleshoot": "Sorun giderme",
  "m.settings.troubleshootSub": "Bağlantı testi, son sorunlar",
  "m.settings.about": "Hakkında",
  "m.settings.normalizeSub":
    "Şarkılar arası seviye farkını YouTube'un kendi ölçümüyle düzeltir (−14 LUFS). Yalnız yüksek şarkıları kısar.",
  "m.settings.prefetchSub": "Sıradaki parçanın adresi önden çözülür, Wi-Fi'da dosyası da iner → geçiş anlık olur.",
  "m.settings.queueEndRecommend": "Öneriyle",
  "m.settings.qualitySub": "İndirme ve akış kalitesi. Yüksek ≈ 160 kbps Opus (masaüstünden iyi), düşük ≈ 50 kbps.",
  "m.settings.qualityHigh": "Yüksek",
  "m.settings.qualityMedium": "Orta",
  "m.settings.qualityLow": "Düşük",
  "m.settings.dataSaver": "Mobil veride tasarruf",
  "m.settings.dataSaverSub": "Hücresel bağlantıda akış en düşük kalitede çalar (~3 kat az veri). Wi-Fi'da etkisi yok.",
  "m.settings.wifiOnly": "Yalnız Wi-Fi'da indir",
  "m.settings.wifiOnlySub": "Kalıcı indirmeler mobil veride beklemeye alınır. Önden indirme her zaman yalnız Wi-Fi'da.",
  "m.settings.recEveryN": "Öneri sıklığı",
  "m.settings.recEveryNSub": "Akıllı karışıkta kaç şarkıda bir öneri serpiştirilsin.",
  "m.settings.usage": "Kullanım",
  "m.settings.ambientSub":
    "Oynatıcı açıkken bu kadar süre dokunulmazsa ambiyans ekranı açılır ve ekran açık kalır. Telefonda varsayılan kapalı.",
  "m.settings.dataIntro":
    "Listelerin, parçaların ve oyların bir JSON dosyasına yedeklenir — masaüstüyle aynı biçim, iki uygulama arasında taşınabilir. İçe aktarma mevcut veriyle birleştirir, silmez.",
  "m.settings.autoBackupsSub":
    "Veri varsa en fazla 12 saatte bir otomatik veritabanı yedeği alınır (son 12 tutulur). Geri yüklemeden önce mevcut durum da yedeklenir.",
  "m.settings.backupDone": "Yedek alındı",
  "m.settings.restoreBody": "{date} tarihli yedek geri yüklenecek. Mevcut durumun önce ayrıca yedeklenir.",
  "m.settings.restoreDone": "Yedek geri yüklendi",
  "m.settings.diagnoseSub":
    "Şarkılar açılmıyorsa çalıştır: ağ, YouTube çıkarımı, adres kısıtı, arama, radyo, söz ve senkron ayrı ayrı denenir. Rapor kopyalanabilir.",

  // Hata raporu
  "m.report.action": "Bildir",
  "m.report.send": "Hata raporunu e-postayla gönder",
  "m.report.sendSub":
    "Test sonucu, son hatalar, cihaz ve çalma durumu doldurulmuş olarak posta uygulamasında açılır — Gönder'e basman yeterli. Oturum anahtarı ve liste içeriği eklenmez.",
  "m.report.subject": "Resonance hata raporu",
  "m.report.noMail": "Posta uygulaması açılamadı — rapor paylaşım sayfasıyla açıldı",

  // Hakkında / özet / rehber
  "m.about.tagline":
    "Hafif, karma tabanlı kişisel müzik oynatıcı. Masaüstündeki Resonance ile aynı kütüphane, aynı öneri motoru, aynı bulut senkronu.",
  "m.about.builtWith": "Expo · React Native · NewPipeExtractor · ExoPlayer ile yapıldı.",
  "m.wrapped.shareImage": "Görsel olarak paylaş",
  "m.onb.tasteBody":
    "Ayarlar → Zevk profili: hangi sanatçıyı ne kadar sevdiğini, hangi saatte ne dinlediğini görürsün — yanlışsa \"daha az öner\" deyip düzeltirsin.",
} as const;

export type MKey = keyof typeof mtr;

const men: Record<MKey, string> = {
  "m.tab.home": "Home",
  "m.tab.discover": "Discover",
  "m.tab.search": "Search",
  "m.tab.library": "Library",
  "m.boot.failed": "Couldn't start",
  "m.common.create": "Create",
  "m.common.done": "Done",
  "m.common.save": "Save",
  "m.common.seeAll": "See all",
  "m.common.shareFailed": "Couldn't share",

  "m.home.discoveryOn": "Discovery is playing",
  "m.home.backToDiscovery": "Back to discovery",
  "m.home.smartShuffle": "Smart",

  "m.player.playing": "Playing",
  "m.player.fromList": "From playlist",
  "m.player.downloaded": "Downloaded",
  "m.player.sleep": "Sleep",
  "m.player.ambient": "Ambient",
  "m.player.discoveryControls": "Discovery",
  "m.player.artistPrefs": "Recommendations for {artist}",
  "m.sleep.afterTrackShort": "End of track",
  "m.sleep.off": "Turn off timer",
  "m.karma.notVotable": "Votes count when playing from a playlist or Discover (add a search result to a playlist first)",
  "m.karma.minutes": "{n} min",
  "m.ambient.tapToExit": "Tap to exit",

  "m.queue.addedNext": "Playing next",
  "m.queue.addedEnd": "Added to the end of the queue",
  "m.queue.showPast": "Show played ({n})",
  "m.queue.hidePast": "Hide played",
  "m.sheet.playNext": "Play next",
  "m.sheet.addToQueue": "Add to queue",
  "m.sheet.goToArtist": "Artist: {artist}",
  "m.sheet.removeDownload": "Remove download",
  "m.sheet.shareCode": "Send share code",
  "m.sheet.shareCodeHint": "Paste it into Resonance → Import to get the track",
  "m.addTo.count": "{count} songs",

  "m.discover.live": "Discovery is playing",
  "m.discover.lock": "Lock this style",

  "m.artist.moreDone": "{artist} will be recommended more",
  "m.artist.lessDone": "{artist} will be recommended less",
  "m.artist.prefReset": "Preference for {artist} reset",
  "m.artist.unblocked": "{artist} unblocked",
  "m.artist.blocked": "Blocked",
  "m.artist.discoverStyle": "Discover this style",

  "m.library.lists": "playlists",
  "m.library.onDevice": "Music on this phone",
  "m.dl.local": "Local file — no need to download",
  "m.dl.waitingWifi": "Waiting for Wi-Fi",
  "m.dl.wifiOnly": "Downloads are Wi-Fi only (Settings → Playback)",
  "m.downloads.active": "{n} downloading",
  "m.downloads.tempEmpty": "Temporary cache is empty.",
  "m.playlist.downloadMissing": "{n} songs are not offline yet",
  "m.playlist.downloadQueued": "{n} songs added to the download queue",
  "m.playlist.reorder": "Reorder",
  "m.playlist.reorderHint": "Move songs with the arrows",
  "m.local.files": "{n} files",
  "m.local.filter": "Search files",
  "m.local.none":
    "No music files found, or permission was denied. If no prompt appears, enable \"Music and audio\" in Android Settings → Apps → Resonance → Permissions.",
  "m.local.rescan": "Scan again",
  "m.local.toList": "Save as playlist",
  "m.local.unknownArtist": "unknown artist",

  "m.search.lyricsPlaceholder": "A lyric line you remember…",
  "m.import.paste": "Paste",
  "m.import.missed": "{n} songs had no YouTube match.",
  "m.import.maybePartial":
    "Without signing in, YouTube returns at most ~100 songs from a playlist; if it's longer, some may be missing.",
  "m.import.spotifyLimit": "The keyless path reads at most ~100 songs from a Spotify playlist.",

  "m.account.notConfigured":
    "Cloud sync needs the SAME Supabase project URL and anon key as the desktop app in mobile/.env, then a rebuild. Until then everything works on this device.",

  "m.settings.you": "You",
  "m.settings.syncedNote":
    "Theme, language, accent color, recommendation, storage and playback settings are SHARED with your other devices through sync — changing them here changes them on desktop too. Wi-Fi, data saver and ambient stay on this phone.",
  "m.settings.accountSub": "Sign-in, sync status, profile photo",
  "m.settings.playback": "Playback",
  "m.settings.playbackSub": "Loudness, queue end, quality, data",
  "m.settings.recsSub": "Sources, karma half-life, blocked artists",
  "m.settings.storage": "Storage",
  "m.settings.storageSub": "Cache limit, auto download, cleanup",
  "m.settings.appearance": "Appearance",
  "m.settings.appearanceSub": "Theme, language, accent color, ambient",
  "m.settings.data": "Data & backup",
  "m.settings.dataSub": "Export/import, automatic backups",
  "m.settings.troubleshoot": "Troubleshooting",
  "m.settings.troubleshootSub": "Connection test, recent problems",
  "m.settings.about": "About",
  "m.settings.normalizeSub":
    "Evens out loudness between songs using YouTube's own measurement (−14 LUFS). Only turns loud songs down.",
  "m.settings.prefetchSub": "The next song's address is resolved ahead (its file too on Wi-Fi) → instant transitions.",
  "m.settings.queueEndRecommend": "Recommend",
  "m.settings.qualitySub": "Download and stream quality. High ≈ 160 kbps Opus (better than desktop), low ≈ 50 kbps.",
  "m.settings.qualityHigh": "High",
  "m.settings.qualityMedium": "Medium",
  "m.settings.qualityLow": "Low",
  "m.settings.dataSaver": "Mobile data saver",
  "m.settings.dataSaverSub": "On cellular, streams play at the lowest quality (~3× less data). No effect on Wi-Fi.",
  "m.settings.wifiOnly": "Download on Wi-Fi only",
  "m.settings.wifiOnlySub": "Permanent downloads wait while on mobile data. Pre-downloading is always Wi-Fi only.",
  "m.settings.recEveryN": "Recommendation frequency",
  "m.settings.recEveryNSub": "In smart shuffle, how often a recommendation is mixed in.",
  "m.settings.usage": "Usage",
  "m.settings.ambientSub":
    "If the player is open and untouched this long, the ambient screen opens and keeps the screen on. Off by default on phones.",
  "m.settings.dataIntro":
    "Your playlists, tracks and votes are saved to a JSON file — same format as desktop, portable between both apps. Importing merges with existing data, never deletes.",
  "m.settings.autoBackupsSub":
    "When there is data, a database backup is taken at most every 12 hours (last 12 kept). The current state is backed up before any restore.",
  "m.settings.backupDone": "Backup saved",
  "m.settings.restoreBody": "The backup from {date} will be restored. Your current state is backed up first.",
  "m.settings.restoreDone": "Backup restored",
  "m.settings.diagnoseSub":
    "Run this if songs won't play: network, YouTube extraction, URL restrictions, search, radio, lyrics and sync are tested separately. The report can be copied.",

  "m.report.action": "Report",
  "m.report.send": "Email the error report",
  "m.report.sendSub":
    "Opens your mail app pre-filled with the test result, recent errors, device and playback state — just tap Send. No session tokens or playlist contents are included.",
  "m.report.subject": "Resonance error report",
  "m.report.noMail": "Couldn't open a mail app — the report opened in the share sheet",

  "m.about.tagline":
    "A lightweight, karma-based personal music player. Same library, same recommendation engine and same cloud sync as Resonance on desktop.",
  "m.about.builtWith": "Built with Expo · React Native · NewPipeExtractor · ExoPlayer.",
  "m.wrapped.shareImage": "Share as image",
  "m.onb.tasteBody":
    "Settings → Taste profile shows how much you like each artist and what you play at which hour — if it's wrong, tap \"recommend less\" to correct it.",
};

export type Key = TrKey | MKey;
export type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m));
}

export function translateAny(lang: Lang, key: Key, params?: Params): string {
  if (key.startsWith("m.")) {
    const dict: Record<string, string> = lang === "en" ? men : mtr;
    return interpolate(dict[key] ?? (mtr as Record<string, string>)[key] ?? key, params);
  }
  return translate(lang, key as TrKey, params);
}

/** React DIŞI kullanım (store, servis, toast). Dili anlık okur. */
export function t(key: Key, params?: Params): string {
  return translateAny(useSettingsStore.getState().language, key, params);
}

/** Bileşenler için: dil değişince yeniden render olur. */
export function useT() {
  const lang = useSettingsStore((s) => s.language);
  return (key: Key, params?: Params) => translateAny(lang, key, params);
}

export function useLang(): Lang {
  return useSettingsStore((s) => s.language);
}
