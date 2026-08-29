package com.resonance.extractor

import okhttp3.OkHttpClient
import okhttp3.Request as OkRequest
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import java.util.concurrent.TimeUnit

/**
 * NewPipeExtractor'ın ağ katmanı. OkHttp kullanır (RN zaten paketliyor).
 *
 * ⚠️ Zaman aşımı ŞART: masaüstü dersi (CLAUDE.md v1.8.8 / MOBILE.md §5.2-3) —
 * zaman aşımsız çağrı, ağ takıldığında durumu kalıcı "yükleniyor"a düşürüyor
 * ve oynat tuşu tamamen ölüyordu.
 */
object NewPipeDownloader : Downloader() {
    private const val USER_AGENT =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .callTimeout(45, TimeUnit.SECONDS)
        .followRedirects(true)
        .build()

    override fun execute(request: Request): Response {
        val builder = OkRequest.Builder().url(request.url())
        for ((key, values) in request.headers()) {
            builder.removeHeader(key)
            for (value in values) builder.addHeader(key, value)
        }
        if (request.headers()["User-Agent"] == null) builder.header("User-Agent", USER_AGENT)

        val body = request.dataToSend()?.toRequestBody()
        builder.method(request.httpMethod(), body)

        client.newCall(builder.build()).execute().use { res ->
            val text = res.body?.string() ?: ""
            return Response(res.code, res.message, res.headers.toMultimap(), text, res.request.url.toString())
        }
    }
}
