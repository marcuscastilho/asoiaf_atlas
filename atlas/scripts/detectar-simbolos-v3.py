"""Color-component locating aid. Candidates require visual review before use."""
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/simbolos-v3-candidatos.json"
MANIFEST = json.loads((ROOT / "data/mapa.json").read_text(encoding="utf-8"))
SCALE = 4
W, H = (MANIFEST["width"] + 3) // 4, (MANIFEST["height"] + 3) // 4


def assemble():
    image = Image.new("RGB", (W, H))
    for x in range((W + 511) // 512):
        for y in range((H + 511) // 512):
            p = ROOT / f"tiles/o-mundo-conhecido-recorte-v2/4/{x}/{y}.webp"
            with Image.open(p) as tile:
                image.paste(tile.convert("RGB"), (x * 512, y * 512))
    return image


def detect(image):
    r, g, b = image.split()
    rg = ImageChops.subtract(r, g).point(lambda v: 255 if v >= 30 else 0)
    rb = ImageChops.subtract(r, b).point(lambda v: 255 if v >= 22 else 0)
    red = r.point(lambda v: 255 if 45 <= v <= 225 else 0)
    blue = b.point(lambda v: 255 if v <= 165 else 0)
    mask = ImageChops.multiply(ImageChops.multiply(rg, rb), ImageChops.multiply(red, blue))
    data = bytearray(mask.tobytes())
    result = []
    cursor = 0
    while True:
        seed = data.find(255, cursor)
        if seed < 0:
            break
        cursor = seed + 1
        data[seed] = 0
        pending = [seed]
        xs, ys = [], []
        while pending:
            point = pending.pop()
            y, x = divmod(point, W)
            xs.append(x)
            ys.append(y)
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1),
                           (-1, -1), (1, -1), (-1, 1), (1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    q = ny * W + nx
                    if data[q]:
                        data[q] = 0
                        pending.append(q)
        left, top, right, bottom = min(xs), min(ys), max(xs), max(ys)
        width, height = right - left + 1, bottom - top + 1
        if 6 <= len(xs) <= 210 and 4 <= width <= 19 and 4 <= height <= 20:
            result.append({
                "x": round((left + right) * 2), "y": round((top + bottom) * 2),
                "box": [left * 4, top * 4, (right + 1) * 4, (bottom + 1) * 4],
                "componentPixels": len(xs), "status": "unreviewed-candidate",
            })
    return sorted(result, key=lambda p: (p["y"], p["x"]))


def render(image, points, name, box):
    left, top, right, bottom = [v // 4 for v in box]
    view = image.crop((left, top, right, bottom))
    draw = ImageDraw.Draw(view)
    for p in points:
        if not (box[0] <= p["x"] < box[2] and box[1] <= p["y"] < box[3]):
            continue
        x, y = p["x"] / 4 - left, p["y"] / 4 - top
        draw.ellipse((x - 7, y - 7, x + 7, y + 7), outline="#167bc0", width=1)
        draw.text((x + 7, y - 14), str(p["candidateId"]), fill="#003e91",
                  stroke_width=1, stroke_fill="white")
    view.save(ROOT / f"test/evidencias/inventario-v3-{name}.png")
    view.close()


def main():
    image = assemble()
    if OUTPUT.exists():
        points = json.loads(OUTPUT.read_text(encoding="utf-8"))["candidates"]
    else:
        points = detect(image)
        for index, point in enumerate(points, 1):
            point["candidateId"] = index
        result = {
            "sourceSha256": MANIFEST["sourceSha256"], "tileSetId": MANIFEST["tileSetId"],
            "coordinateSystem": "cropped-native-pixels",
            "policy": "Locating aid only. Connected red components are NOT automatically "
                      "settlements, names, type classifications or completeness evidence.",
            "candidates": points,
        }
        with OUTPUT.open("x", encoding="utf-8") as out:
            out.write(json.dumps(result, ensure_ascii=True, indent=2) + "\n")
    for name, box in (
        ("norte", (1400, 1600, 5600, 5500)),
        ("centro", (1600, 5300, 5600, 7800)),
        ("sul", (1600, 7600, 5700, 10300)),
        ("essos-oeste", (5600, 5000, 10000, 10800)),
        ("essos-centro", (9600, 4800, 15400, 11000)),
        ("oriente", (14800, 4800, 21600, 13000)),
        ("sothoryos", (5000, 10500, 15000, 14400)),
    ):
        render(image, points, name, box)
    image.close()
    print("Frozen candidates:", len(points), "visual review required")


if __name__ == "__main__":
    main()
