"""Render frozen v6-candidate segments over existing tiles for lead visual review."""
import hashlib
import importlib.util
import json
from pathlib import Path

from PIL import ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test/evidencias"
CANDIDATE = ROOT / "data/atlas-percursos-v6-candidato.json"
EXPECTED_SHA256 = (
    "5677f7a5abaed8d0ad7bc724512c143d30a7d7489232294bd1dcb8ece33ee75d")

spec = importlib.util.spec_from_file_location(
    "inspection", Path(__file__).with_name("inspecionar-cobertura-v4.py"))
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)

# (nome, caixa em coordenadas nativas, zoom, selecoes (cid, capitulo))
CASES = [
    ("norte-mar", (1400, 2800, 3900, 6300), 4,
     [("asha", 123), ("victarion", 123)]),
    ("pyke", (1850, 5750, 2550, 6300), 6,
     [("asha", 123), ("victarion", 123)]),
    ("febre", (2200, 4600, 3800, 5100), 5,
     [("victarion", 123)]),
    ("deepwood", (2100, 2850, 3200, 3650), 5,
     [("asha", 123)]),
    ("norte-terra", (2800, 3300, 4700, 4900), 5,
     [("asha", 129), ("theon", 291), ("theon", 303), ("theon", 308)]),
    ("arya", (3500, 6250, 4480, 7460), 5,
     [("arya", 99), ("arya", 156), ("arya", 217)]),
    ("rosa", (3400, 7250, 4450, 7920), 5,
     [("littlefinger", 138)]),
    ("valiria", (8000, 8900, 11900, 12100), 4,
     [("tyrion", 311), ("tyrion", 318), ("victarion", 334)]),
    ("cedros", (10200, 8900, 11900, 11000), 5,
     [("tyrion", 318), ("victarion", 334)]),
    ("tempestade", (4550, 7750, 6200, 9600), 5,
     [("aegon", 332)]),
    ("mar-oeste", (5200, 9000, 8500, 10100), 4,
     [("aegon", 332)]),
    ("delta", (7900, 9250, 8450, 9900), 6,
     [("aegon", 332), ("tyrion", 311), ("victarion", 334)]),
    ("degraus", (5350, 8750, 5800, 9400), 6,
     [("aegon", 332)]),
    ("foz", (11300, 8850, 11850, 9250), 6,
     [("tyrion", 318)]),
    ("yaros", (10900, 9300, 11600, 9800), 6,
     [("victarion", 334)]),
    ("febre-detalhe", (3200, 4700, 3750, 4900), 6,
     [("victarion", 123)]),
]


def main():
    digest = hashlib.sha256(CANDIDATE.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(
            f"candidato divergente: {digest} != {EXPECTED_SHA256}")
    data = json.loads(CANDIDATE.read_text(encoding="utf-8"))

    for name, box, zoom, selections in CASES:
        image = inspection.tiles_crop(box, zoom)
        draw = ImageDraw.Draw(image)
        scale = 2 ** (6 - zoom)

        # grade a cada 200 px nativos; rotulos de x no topo e de y na
        # margem esquerda
        step = 200
        gx = (box[0] // step + 1) * step
        while gx < box[2]:
            px = (gx - box[0]) / scale
            draw.line([(px, 0), (px, image.height)], fill="#c8bfa0", width=1)
            draw.text((px + 2, 2), str(gx), fill="#5a4a2a",
                      stroke_width=1, stroke_fill="#fff9e8")
            gx += step
        gy = (box[1] // step + 1) * step
        while gy < box[3]:
            py = (gy - box[1]) / scale
            draw.line([(0, py), (image.width, py)], fill="#c8bfa0", width=1)
            draw.text((2, py + 2), str(gy), fill="#5a4a2a",
                      stroke_width=1, stroke_fill="#fff9e8")
            gy += step

        for cid, chapter in selections:
            route = next(r for r in data["routes"] if r["id"] == cid)
            alvos = [s for s in route["segments"]
                     if "-v6-" in s["id"] and s["startChapter"] == chapter]
            print(f"{name}: {cid}@{chapter} -> "
                  f"{[s['id'] for s in alvos] or 'NENHUM'}")
            for seg in alvos:
                vertices = [((x - box[0]) / scale, (y - box[1]) / scale)
                            for x, y in seg["points"]]
                draw.line(vertices, fill="black", width=5)
                draw.line(vertices, fill=route["color"], width=3)
                # vertices e indices inteiros so nos close-ups
                if zoom >= 5:
                    for i, (x, y) in enumerate(vertices):
                        draw.ellipse(
                            (x - 2, y - 2, x + 2, y + 2), fill="yellow")
                        draw.text((x + 3, y - 7), str(i), fill="black",
                                  stroke_width=1, stroke_fill="white")

        # legenda curta: cid@capitulo de cada selecao
        legenda = "  ".join(f"{cid}@{ch}" for cid, ch in selections)
        draw.rectangle(
            (4, image.height - 18,
             10 + draw.textlength(legenda), image.height - 2),
            fill="#fff9e8")
        draw.text((7, image.height - 16), legenda, fill="#171717")

        path = OUT / f"v6-rotas-revisao-{name}.png"
        image.save(path)
        image.close()
        print(path)


if __name__ == "__main__":
    main()
