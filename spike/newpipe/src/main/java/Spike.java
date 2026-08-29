// Faz 0 / yol B: NewPipeExtractor bugün gerçekten çalışan bir ses adresi veriyor mu?
import org.schabi.newpipe.extractor.NewPipe;
import org.schabi.newpipe.extractor.ServiceList;
import org.schabi.newpipe.extractor.downloader.Downloader;
import org.schabi.newpipe.extractor.downloader.Request;
import org.schabi.newpipe.extractor.downloader.Response;
import org.schabi.newpipe.extractor.stream.AudioStream;
import org.schabi.newpipe.extractor.stream.StreamExtractor;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class Spike {
    static final HttpClient HTTP = HttpClient.newBuilder()
            .followRedirects(HttpClient.Redirect.ALWAYS)
            .connectTimeout(Duration.ofSeconds(20)).build();

    static class Dl extends Downloader {
        @Override public Response execute(Request request) throws IOException {
            try {
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(request.url()))
                        .timeout(Duration.ofSeconds(30));
                for (Map.Entry<String, List<String>> h : request.headers().entrySet())
                    for (String v : h.getValue()) {
                        String k = h.getKey().toLowerCase();
                        if (k.equals("host") || k.equals("connection") || k.equals("content-length")) continue;
                        b.header(h.getKey(), v);
                    }
                byte[] body = request.dataToSend();
                b.method(request.httpMethod(), body == null
                        ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofByteArray(body));
                HttpResponse<String> r = HTTP.send(b.build(), HttpResponse.BodyHandlers.ofString());
                return new Response(r.statusCode(), null, r.headers().map(), r.body(), r.uri().toString());
            } catch (InterruptedException e) { throw new IOException(e); }
        }
    }

    static int probe(String url, long from, long to) throws Exception {
        HttpRequest r = HttpRequest.newBuilder(URI.create(url))
                .header("Range", "bytes=" + from + "-" + to).GET().build();
        return HTTP.send(r, HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    public static void main(String[] args) throws Exception {
        String id = args.length > 0 ? args[0] : "rtL5oMyBHPs";
        NewPipe.init(new Dl());
        long t0 = System.nanoTime();
        StreamExtractor e = ServiceList.YouTube.getStreamExtractor("https://www.youtube.com/watch?v=" + id);
        e.fetchPage();
        double resolve = (System.nanoTime() - t0) / 1e9;
        System.out.printf("başlık: %s | süre: %ds | çözüm: %.2fs%n", e.getName(), e.getLength(), resolve);
        List<AudioStream> audios = e.getAudioStreams();
        System.out.println("ses akışı sayısı: " + audios.size());
        for (AudioStream a : audios) {
            System.out.printf("  itag=%s %s %dkbps url=%s%n", a.getItag(), a.getFormat(), a.getAverageBitrate(),
                    a.getContent() == null ? "yok" : "var(" + a.getContent().length() + " krk)");
        }
        AudioStream best = audios.stream().filter(a -> a.getContent() != null && !a.getContent().isEmpty())
                .max((x, y) -> Integer.compare(x.getAverageBitrate(), y.getAverageBitrate())).orElse(null);
        if (best == null) { System.out.println("❌ çalınabilir adres yok"); return; }
        String url = best.getContent();
        System.out.println("sağlık 0-512K: " + probe(url, 0, 524287));
        System.out.println("3MB civarı:    " + probe(url, 3000000, 3524287));
        long t1 = System.nanoTime();
        HttpResponse<byte[]> full = HTTP.send(HttpRequest.newBuilder(URI.create(url)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        double secs = (System.nanoTime() - t1) / 1e9;
        System.out.printf("TAM indirme: %d  %.2f MB  %.1fs  %s%n", full.statusCode(),
                full.body().length / 1048576.0, secs, full.statusCode() == 200 ? "✅" : "❌");
    }
}
