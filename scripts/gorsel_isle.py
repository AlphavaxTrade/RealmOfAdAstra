# Kullanım örneği: C:/Users/AlphAvax/video_edit/venv/Scripts/python.exe scripts/gorsel_isle.py ikon ~/.claude/gemini/cikti/x_1.jpg public/assets/ui/x.webp
# Gemini görsellerini oyuna hazırlar:
#  ikon: lacivert arka plan kenarlardan taşan doldurmayla şeffaf yapılır, kırpılır, 256x256 webp
#        (isteğe bağlı 4. değer: renk toleransı, varsayılan 26; çerçeve arka plana yakınsa düşür, ör. 12)
#  portre: kare 256x256 webp (arka plan kalır, yuvarlak çerçevede kullanılır)
# Kullanım: python isle_gorsel.py <ikon|portre> <girdi> <çıktı> ; ayrıca: python isle_gorsel.py sayfa <çıktı.png> <girdi...>
import sys
from collections import deque
from PIL import Image

def close(c, ref, tol):
    return abs(c[0] - ref[0]) <= tol and abs(c[1] - ref[1]) <= tol and abs(c[2] - ref[2]) <= tol

def ikon(src, dst, size=256, tol=26):
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    small = im.resize((w // 4, h // 4), Image.NEAREST)   # hız için yarı çözünürlükte maske
    sw, sh = small.size
    px = small.load()
    ref = px[2, 2]
    seen = bytearray(sw * sh)
    q = deque([(0, 0), (sw - 1, 0), (0, sh - 1), (sw - 1, sh - 1)])
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= sw or y >= sh or seen[y * sw + x]:
            continue
        if not close(px[x, y], ref, tol):
            continue
        seen[y * sw + x] = 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    mask = Image.new('L', (sw, sh), 255)
    mp = mask.load()
    for y in range(sh):
        for x in range(sw):
            if seen[y * sw + x]:
                mp[x, y] = 0
    mask = mask.resize((w, h), Image.NEAREST)
    im.putalpha(mask)
    box = im.getbbox()
    if box:
        im = im.crop(box)
    side = max(im.size)
    pad = int(side * 0.08)
    canvas = Image.new('RGBA', (side + 2 * pad, side + 2 * pad), (0, 0, 0, 0))
    canvas.paste(im, ((canvas.width - im.width) // 2, (canvas.height - im.height) // 2), im)
    canvas.resize((size, size), Image.LANCZOS).save(dst, 'WEBP', quality=92, method=6)

def portre(src, dst, size=256):
    im = Image.open(src).convert('RGB')
    s = min(im.size)
    im = im.crop(((im.width - s) // 2, (im.height - s) // 2, (im.width + s) // 2, (im.height + s) // 2))
    im.resize((size, size), Image.LANCZOS).save(dst, 'WEBP', quality=90, method=6)

def sayfa(dst, files):
    tiles = [Image.open(f).convert('RGBA').resize((200, 200), Image.LANCZOS) for f in files]
    sheet = Image.new('RGBA', (210 * len(tiles), 210), (40, 44, 60, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t, (i * 210 + 5, 5), t)
    sheet.save(dst)

if __name__ == '__main__':
    kind = sys.argv[1]
    if kind == 'ikon':
        ikon(sys.argv[2], sys.argv[3], tol=int(sys.argv[4]) if len(sys.argv) > 4 else 26)
    elif kind == 'portre':
        portre(sys.argv[2], sys.argv[3])
    elif kind == 'sayfa':
        sayfa(sys.argv[2], sys.argv[3:])
