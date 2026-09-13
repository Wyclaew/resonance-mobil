#!/usr/bin/env python3
"""Uygulama ikonlarını masaüstünün `src-tauri/app-icon.svg` geometrisinden üretir.

Neden betik: ikon Expo şablonunun mavi okuydu. Masaüstü logosu (7 kehribar çubuk,
koyu zemin) SVG olarak duruyor ama makinede SVG rasterleştirici yok; geometri
basit olduğu için Pillow ile 4x süper örnekleme yapıp küçültüyoruz.

Üretilenler (mobile/assets/):
  icon.png                      — tam ikon (yuvarlak köşeli zemin + çubuklar)
  android-icon-foreground.png   — uyarlanabilir ikon ön katmanı (şeffaf + çubuklar)
  android-icon-background.png   — uyarlanabilir ikon zemini (dikey degrade)
  android-icon-monochrome.png   — Android 13 tematik ikon (beyaz çubuklar)
  splash-icon.png               — açılış ekranı işareti (şeffaf + çubuklar)
"""
import pathlib
from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent.parent / "mobile/assets"
SS = 4  # süper örnekleme
N = 1024

# app-icon.svg'deki çubuklar (x, y, w, h), rx = 26
BARS = [
    (232.5, 430.75, 52, 162.5), (317, 373.875, 52, 276.25), (401.5, 317, 52, 390),
    (486, 268.25, 52, 487.5), (570.5, 317, 52, 390), (655, 373.875, 52, 276.25),
    (739.5, 430.75, 52, 162.5),
]

def gradient(size, top, bottom):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(size):
            px[x, y] = c
    return img

def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def bars_mask(scale=1.0):
    size = N * SS
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    cx = cy = N / 2
    for x, y, w, h in BARS:
        # merkeze göre ölçekle
        x0 = cx + (x - cx) * scale
        y0 = cy + (y - cy) * scale
        x1 = cx + (x + w - cx) * scale
        y1 = cy + (y + h - cy) * scale
        r = 26 * scale
        d.rounded_rectangle([x0 * SS, y0 * SS, x1 * SS, y1 * SS], radius=r * SS, fill=255)
    return m

def amber_bars(scale=1.0):
    size = N * SS
    g = gradient(256, hexrgb("#f4c163"), hexrgb("#c4861f")).resize((size, size), Image.BICUBIC)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(g, (0, 0), bars_mask(scale))
    return out

def finish(img, name):
    img.resize((N, N), Image.LANCZOS).save(OUT / name)
    print("yazıldı:", name)

def main():
    size = N * SS
    # Tam ikon: yuvarlak köşeli koyu zemin + çubuklar (masaüstüyle birebir).
    bg = gradient(256, hexrgb("#26262d"), hexrgb("#0b0b0d")).resize((size, size), Image.BICUBIC)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([96 * SS, 96 * SS, 928 * SS, 928 * SS], radius=182 * SS, fill=255)
    full = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    full.paste(bg, (0, 0), mask)
    full.alpha_composite(amber_bars())
    finish(full, "icon.png")

    # Uyarlanabilir ikon: Android maskeyi kendisi uygular → zemin tam kare.
    finish(amber_bars(1.0), "android-icon-foreground.png")
    finish(gradient(256, hexrgb("#26262d"), hexrgb("#0b0b0d")).resize((size, size), Image.BICUBIC), "android-icon-background.png")
    mono = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mono.paste(Image.new("RGBA", (size, size), (255, 255, 255, 255)), (0, 0), bars_mask(1.0))
    finish(mono, "android-icon-monochrome.png")
    finish(amber_bars(1.0), "splash-icon.png")

if __name__ == "__main__":
    main()
