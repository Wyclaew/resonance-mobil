package com.resonance.extractor

import android.content.ContentUris
import android.content.Context
import android.provider.MediaStore

/**
 * Telefondaki müzik dosyaları — masaüstündeki `scan_local_files` karşılığı.
 *
 * NEDEN MediaStore: Android dosyaları zaten dizinliyor; başlık/sanatçı/albüm
 * ETİKETLERİNİ de o okuyor. Dosya sistemini kendimiz taramak hem yavaş hem de
 * Android 11+ kapsamlı depolama yüzünden izin cehennemi olurdu.
 *
 * Kimlik: masaüstüyle aynı kural — `sourceId` = oynatılabilir adres. Burada
 * `content://` adresi kullanılıyor (ExoPlayer doğrudan çalar, dosya taşınsa
 * da MediaStore kimliği korunur).
 */
object LocalAudio {
    fun scan(context: Context, limit: Int): List<Map<String, Any?>> {
        val collection = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.ALBUM_ID
        )
        // Zil sesleri, bildirim sesleri, sesli notlar müzik DEĞİL.
        val selection = "${MediaStore.Audio.Media.IS_MUSIC} != 0 AND ${MediaStore.Audio.Media.DURATION} >= 30000"
        val out = ArrayList<Map<String, Any?>>()

        context.contentResolver.query(
            collection, projection, selection, null,
            "${MediaStore.Audio.Media.DATE_ADDED} DESC"
        )?.use { cursor ->
            val idCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
            val titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE)
            val artistCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST)
            val albumCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM)
            val durationCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION)
            val nameCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
            val albumIdCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID)

            while (cursor.moveToNext() && out.size < limit) {
                val id = cursor.getLong(idCol)
                val uri = ContentUris.withAppendedId(collection, id).toString()
                val rawArtist = cursor.getString(artistCol)
                // Etiketsiz dosyada Android "<unknown>" yazar → boş say.
                val artist = if (rawArtist == null || rawArtist == "<unknown>") "" else rawArtist
                val albumArt = ContentUris.withAppendedId(
                    android.net.Uri.parse("content://media/external/audio/albumart"),
                    cursor.getLong(albumIdCol)
                ).toString()
                out += mapOf(
                    "id" to "local:$uri",
                    "source" to "local",
                    "sourceId" to uri,
                    "title" to (cursor.getString(titleCol) ?: cursor.getString(nameCol) ?: ""),
                    "artist" to artist,
                    "album" to cursor.getString(albumCol),
                    "durationMs" to cursor.getLong(durationCol),
                    "thumbnail" to albumArt
                )
            }
        }
        return out
    }
}
