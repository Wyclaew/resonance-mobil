package com.resonance.extractor

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Parça ses yüksekliği — YouTube'un KENDİ ölçümü.
 *
 * ÖLÇÜLDÜ (spike/node-extract/loudness_probe.mjs): player yanıtının
 * `playerConfig.audioConfig` alanı `trackAbsoluteLoudnessLkfs` (ör. −9.22) ve
 * `loudnessTargetLkfs: −14` taşıyor — masaüstünün ffmpeg ile ölçüp hedeflediği
 * değerin aynısı. Akışa dokunmadan ~200 ms, PO Token duvarına takılmıyor
 * (yalnız meta veri).
 *
 * NewPipeExtractor bu alanı dışarı vermediği için ayrı, küçük bir çağrı.
 */
object Loudness {
    private const val UA =
        "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip"
    private val JSON = "application/json".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .callTimeout(15, TimeUnit.SECONDS)
        .build()

    @Volatile private var visitorData: String? = null

    /** Oturum kimliği: yoksa player isteği LOGIN_REQUIRED dönüyor (ölçüldü). */
    private fun visitor(): String {
        visitorData?.let { return it }
        val body = JSONObject().put(
            "context", JSONObject().put(
                "client", JSONObject()
                    .put("clientName", "WEB")
                    .put("clientVersion", "2.20260828.01.00")
                    .put("hl", "en").put("gl", "US")
            )
        ).toString()
        val req = Request.Builder()
            .url("https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false")
            .post(body.toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val json = JSONObject(res.body?.string() ?: "{}")
            val value = json.optJSONObject("responseContext")?.optString("visitorData").orEmpty()
            if (value.isBlank()) throw IllegalStateException("visitorData alınamadı")
            visitorData = value
            return value
        }
    }

    /**
     * Bir kez yeniden dener: ÖLÇÜLDÜ — açılışta senkron + keşif + ön indirme
     * aynı anda ağa çıkarken ilk çağrı `InterruptedIOException: timeout` ile
     * düştü, aynı video Mac'ten 536 ms'de yanıt verdi. Geçici bir tıkanma.
     */
    fun measure(videoId: String): Map<String, Any?> =
        try {
            measureOnce(videoId)
        } catch (e: java.io.InterruptedIOException) {
            measureOnce(videoId)
        }

    private fun measureOnce(videoId: String): Map<String, Any?> {
        val vd = visitor()
        val body = JSONObject()
            .put(
                "context", JSONObject().put(
                    "client", JSONObject()
                        .put("clientName", "ANDROID_VR").put("clientVersion", "1.65.10")
                        .put("deviceMake", "Oculus").put("deviceModel", "Quest 3")
                        .put("androidSdkVersion", 32).put("userAgent", UA)
                        .put("osName", "Android").put("osVersion", "12L")
                        .put("hl", "en").put("gl", "US").put("visitorData", vd)
                )
            )
            .put("videoId", videoId)
            .put("contentCheckOk", true)
            .put("racyCheckOk", true)
            .toString()
        val req = Request.Builder()
            .url("https://www.youtube.com/youtubei/v1/player?prettyPrint=false")
            .header("user-agent", UA)
            .header("x-youtube-client-name", "28")
            .header("x-youtube-client-version", "1.65.10")
            .header("x-goog-visitor-id", vd)
            .post(body.toRequestBody(JSON))
            .build()
        client.newCall(req).execute().use { res ->
            val json = JSONObject(res.body?.string() ?: "{}")
            val audio = json.optJSONObject("playerConfig")?.optJSONObject("audioConfig")
                ?: throw IllegalStateException("ses yüksekliği bilgisi yok")
            if (!audio.has("trackAbsoluteLoudnessLkfs")) {
                throw IllegalStateException("ses yüksekliği bilgisi yok")
            }
            return mapOf(
                "lufs" to audio.getDouble("trackAbsoluteLoudnessLkfs"),
                "targetLufs" to audio.optDouble("loudnessTargetLkfs", -14.0)
            )
        }
    }
}
