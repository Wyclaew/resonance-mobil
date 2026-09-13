package com.resonance.extractor

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.localization.ContentCountry
import org.schabi.newpipe.extractor.localization.Localization
import org.schabi.newpipe.extractor.stream.AudioStream
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.InfoItem

/**
 * Resonance'ın ses kaynağı — masaüstündeki `ytdlp.rs`'in mobil karşılığı.
 *
 * NEDEN NATIVE: yt-dlp Android'e gömülemez; saf-JS çıkarım (youtubei.js) 2026'da
 * SABR + PO Token duvarına çarpıyor (ölçüm: docs/FAZ0-SES-YOLU.md). NewPipeExtractor
 * bugün çalışan tek gömülebilir yol — Faz 0'da doğrulandı (5 ses akışı, kısıtsız Range).
 *
 * Bu modül YALNIZCA ham veri döndürür. Şarkı/podcast filtresi (`isLikelySong`),
 * `songCore` elemesi ve öneri skorlaması paylaşılan TS çekirdeğinde kalır —
 * masaüstüyle AYNI mantık çalışsın diye (MOBILE.md §4.1).
 */
class ResonanceExtractorModule : Module() {

    private fun ensureInit() {
        if (NewPipe.getDownloader() == null) {
            NewPipe.init(NewPipeDownloader, Localization("tr", "TR"), ContentCountry("TR"))
        }
    }

    private fun watchUrl(videoId: String) = "https://www.youtube.com/watch?v=$videoId"

    /** ⭐ YouTube Music radyosu — öneri kaynağı. Metin araması DEĞİL (CLAUDE.md). */
    private fun radioUrl(videoId: String) =
        "https://www.youtube.com/watch?v=$videoId&list=RDAMVM$videoId"

    private fun videoIdOf(url: String?): String? {
        if (url.isNullOrBlank()) return null
        Regex("[?&]v=([A-Za-z0-9_-]{11})").find(url)?.let { return it.groupValues[1] }
        Regex("youtu\\.be/([A-Za-z0-9_-]{11})").find(url)?.let { return it.groupValues[1] }
        return null
    }

    private fun thumbOf(item: InfoItem): String? =
        runCatching { item.thumbnails.maxByOrNull { it.height }?.url }.getOrNull()

    private fun itemToTrack(item: StreamInfoItem): Map<String, Any?>? {
        val id = videoIdOf(item.url) ?: return null
        return mapOf(
            "id" to "youtube:$id",
            "source" to "youtube",
            "sourceId" to id,
            "title" to (item.name ?: ""),
            "artist" to (item.uploaderName ?: ""),
            "durationMs" to (item.duration.coerceAtLeast(0) * 1000L),
            "thumbnail" to thumbOf(item)
        )
    }

    private fun streamToMap(s: AudioStream): Map<String, Any?> {
        val itag = runCatching { s.itagItem?.id ?: -1 }.getOrDefault(-1)
        val contentLength = runCatching { s.itagItem?.contentLength ?: 0L }.getOrDefault(0L)
        return mapOf(
            "itag" to itag,
            "url" to s.content,
            "format" to (runCatching { s.format?.name }.getOrNull() ?: ""),
            "mimeType" to (runCatching { s.format?.mimeType }.getOrNull() ?: ""),
            "bitrate" to s.averageBitrate,
            "contentLength" to contentLength,
            // DASH/HLS parçalı akışlar bizim indiricimize uygun değil; TS tarafı eler.
            "isProgressive" to (runCatching { s.deliveryMethod?.name == "PROGRESSIVE_HTTP" }.getOrDefault(true))
        )
    }

    /** Tek videonun ses akışları + meta verisi. */
    private fun resolveOne(videoId: String): Map<String, Any?> {
        ensureInit()
        val extractor = ServiceList.YouTube.getStreamExtractor(watchUrl(videoId))
        extractor.fetchPage()
        val streams = extractor.audioStreams
            .filter { !it.content.isNullOrBlank() }
            .sortedByDescending { it.averageBitrate }
            .map { streamToMap(it) }
        return mapOf(
            "id" to "youtube:$videoId",
            "sourceId" to videoId,
            "title" to (extractor.name ?: ""),
            "artist" to (runCatching { extractor.uploaderName }.getOrNull() ?: ""),
            "durationMs" to (extractor.length.coerceAtLeast(0) * 1000L),
            "thumbnail" to runCatching { extractor.thumbnails.maxByOrNull { it.height }?.url }.getOrNull(),
            "streams" to streams
        )
    }

    override fun definition() = ModuleDefinition {
        Name("ResonanceExtractor")

        /** Bir videonun çalınabilir ses adresleri. */
        AsyncFunction("resolve") { videoId: String ->
            resolveOne(videoId)
        }

        /**
         * ⭐ Toplu adres çözümü (masaüstündeki `prewarm_urls` karşılığı).
         * ÖLÇÜM (CLAUDE.md v1.8.0): hazır olma süresinin %70'i adres çözümü.
         * Mobilde bu iş pil açısından ucuz, indirme pahalı → ısıtma agresif olabilir.
         */
        AsyncFunction("resolveMany") { videoIds: List<String>, concurrency: Int ->
            runBlocking(Dispatchers.IO) {
                val limit = concurrency.coerceIn(1, 6)
                videoIds.chunked(limit).flatMap { chunk ->
                    chunk.map { id ->
                        async {
                            runCatching { resolveOne(id) }
                                .getOrElse { mapOf("sourceId" to id, "error" to (it.message ?: "bilinmeyen hata")) }
                        }
                    }.awaitAll()
                }
            }
        }

        /**
         * ⭐ Öneri kaynağı: YouTube Music radyosu (RDAMVM). Seed = VİDEO ID.
         * Metin araması DEĞİL — arama röportaj/tepki videosu döndürüyordu (CLAUDE.md).
         */
        AsyncFunction("radio") { videoId: String, limit: Int ->
            ensureInit()
            val extractor = ServiceList.YouTube.getPlaylistExtractor(radioUrl(videoId))
            extractor.fetchPage()
            extractor.initialPage.items
                .filterIsInstance<StreamInfoItem>()
                .mapNotNull { itemToTrack(it) }
                .take(limit.coerceIn(1, 100))
        }

        /**
         * Arama. `musicOnly` = YouTube Music "şarkılar" sekmesi: süre ve sanatçı
         * DOLU gelir (yt-dlp'nin flat-playlist çıktısında gelmiyordu — CLAUDE.md).
         */
        AsyncFunction("search") { query: String, limit: Int, musicOnly: Boolean ->
            ensureInit()
            val filters = if (musicOnly) listOf("music_songs") else listOf("videos")
            val extractor = ServiceList.YouTube.getSearchExtractor(query, filters, "")
            extractor.fetchPage()
            extractor.initialPage.items
                .filterIsInstance<StreamInfoItem>()
                .mapNotNull { itemToTrack(it) }
                .take(limit.coerceIn(1, 50))
        }

        /**
         * Telefondaki müzik dosyaları (MediaStore). İzin JS tarafında istenir
         * (READ_MEDIA_AUDIO); izin yoksa MediaStore boş liste döner, çökmez.
         */
        AsyncFunction("scanLocal") { limit: Int ->
            val context = appContext.reactContext ?: throw IllegalStateException("bağlam yok")
            LocalAudio.scan(context, limit.coerceIn(1, 5000))
        }

        /** Bir YouTube/YT Music listesinin parçaları (içe aktarma + tür havuzu). */
        AsyncFunction("playlist") { playlistUrl: String, limit: Int ->
            ensureInit()
            val extractor = ServiceList.YouTube.getPlaylistExtractor(playlistUrl)
            extractor.fetchPage()
            val items = extractor.initialPage.items.filterIsInstance<StreamInfoItem>().toMutableList()
            var nextPage = extractor.initialPage.nextPage
            while (items.size < limit && nextPage != null) {
                val page = extractor.getPage(nextPage)
                items += page.items.filterIsInstance<StreamInfoItem>()
                nextPage = page.nextPage
            }
            mapOf(
                "name" to (extractor.name ?: ""),
                "tracks" to items.mapNotNull { itemToTrack(it) }.take(limit)
            )
        }
    }
}
