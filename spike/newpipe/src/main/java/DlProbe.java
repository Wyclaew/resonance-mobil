import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamExtractor;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * İndirme hatası teşhisi (kullanıcı raporu 2026-09-14): bazı şarkılar "İndirilemedi".
 * En iyi ses akışında farklı büyüklükte aralık isteklerinin HIZINI ölçer —
 * YouTube'un "n" parametresi yavaşlatması parça büyüklüğüne göre değişiyor mu?
 */
public class DlProbe {
    static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    static String timed(String url, long from, long to) {
        long t0 = System.nanoTime();
        try {
            HttpRequest r = HttpRequest.newBuilder(URI.create(url)).header("Range", "bytes=" + from + "-" + to).GET().build();
            HttpResponse<byte[]> res = HTTP.send(r, HttpResponse.BodyHandlers.ofByteArray());
            double s = (System.nanoTime() - t0) / 1e9;
            return String.format("%d %dKB %.1fs (%.0f KB/s)", res.statusCode(), res.body().length / 1024, s, res.body().length / 1024 / Math.max(0.01, s));
        } catch (Exception e) {
            return "HATA " + e.getClass().getSimpleName();
        }
    }

    public static void main(String[] args) throws Exception {
        NewPipe.init(new Spike.Dl());
        for (String id : args) {
            try {
                StreamExtractor e = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + id);
                e.fetchPage();
                AudioStream best = e.getAudioStreams().stream()
                        .filter(a -> a.getContent() != null && !a.getContent().isEmpty())
                        .max((x, y) -> Integer.compare(x.getAverageBitrate(), y.getAverageBitrate())).orElse(null);
                if (best == null) { System.out.printf("%n== %s akış yok%n", id); continue; }
                String url = best.getContent();
                long len = best.getItagItem() != null ? best.getItagItem().getContentLength() : -1;
                boolean hasN = url.contains("&n=");
                System.out.printf("%n== %s | %s | itag %d | len %d | n=%s%n", id, e.getName(), best.getItag(), len, hasN);
                System.out.println("  256KB : " + timed(url, 0, 262143));
                System.out.println("  1MB   : " + timed(url, 262144, 262144 + 1048575));
            } catch (Exception ex) {
                System.out.printf("%n== %s ÇÖZÜLEMEDİ: %s%n", id, ex);
            }
        }
    }
}
