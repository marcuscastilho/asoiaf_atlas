"""Renderiza visoes gerais dos itinerarios v7 sobre o mosaico z4.

Saida: atlas/test/evidencias/v7-<personagem>.png (um por rota) +
       v7-geral-westeros.png / v7-geral-essos.png (todas juntas).
Trechos deduzidos recebem traco pontilhado amarelo (#ffe600) por cima
da linha na cor do personagem, como no atlas."""
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "atlas/data"
OUT = ROOT / "atlas/test/evidencias"
TILES = ROOT / "atlas/tiles/o-mundo-conhecido-recorte-v1"
CELL = 4

CORES = {}  # preenchido a partir do JSON (rt["color"])


def mosaico():
    cols, rows = 11, 8
    big = Image.new("RGB", (cols * 512, rows * 512), (255, 255, 255))
    for tx in range(cols):
        for ty in range(rows):
            p = TILES / "4" / str(tx) / (str(ty) + ".webp")
            if p.exists():
                big.paste(Image.open(p).convert("RGB"),
                          (tx * 512, ty * 512))
    return big


def pontilhada(draw, pts, cor, width):
    """desenha traco pontilhado segmentando a cada 3px ligado/5px solto"""
    for i in range(len(pts) - 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        dx, dy = x1 - x0, y1 - y0
        d = max(1e-9, (dx * dx + dy * dy) ** 0.5)
        t = 0.0
        while t < d:
            t2 = min(t + 3, d)
            a = (x0 + dx * t / d, y0 + dy * t / d)
            b = (x0 + dx * t2 / d, y0 + dy * t2 / d)
            draw.line([a, b], fill=cor, width=width)
            t += 8


def desenha_rota(draw, rt):
    cor = rt.get("color") or CORES.get(rt["id"], "#e91e63")
    for seg in rt["segments"]:
        pts = [(x / CELL, y / CELL) for x, y in seg["points"]]
        draw.line(pts, fill="#2b2118", width=5)
        draw.line(pts, fill=cor, width=3,
                  joint="curve")
        if seg.get("rota") == "deduzida":
            pontilhada(draw, pts, "#ffe600", 2)
    for pos in rt["positions"]:
        if "locationId" in pos:
            continue
        draw.ellipse([pos["x"] / CELL - 4, pos["y"] / CELL - 4,
                      pos["x"] / CELL + 4, pos["y"] / CELL + 4],
                     outline="#ffffff", fill=cor)


def main():
    v7 = json.loads((DATA / "atlas-percursos-v7.json").read_text("utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    base = mosaico()
    for rt in v7["routes"]:
        img = base.copy()
        d = ImageDraw.Draw(img)
        desenha_rota(d, rt)
        xs = [p[0] for s in rt["segments"] for p in s["points"]]
        ys = [p[1] for s in rt["segments"] for p in s["points"]]
        if xs:
            x0 = max(0, min(xs) // CELL - 120)
            y0 = max(0, min(ys) // CELL - 120)
            x1 = min(img.width, max(xs) // CELL + 120)
            y1 = min(img.height, max(ys) // CELL + 120)
            img = img.crop((x0, y0, x1, y1))
        img.save(OUT / ("v7-%s.png" % rt["id"]))
        print(rt["id"], img.size)
    for nome, caixa in [("westeros", (0, 0, 1600, 2400)),
                        ("essos", (1000, 1500, 3400, 3100)),
                        ("geral", (0, 0, base.width, base.height))]:
        img = base.copy()
        d = ImageDraw.Draw(img)
        for rt in v7["routes"]:
            desenha_rota(d, rt)
        img.crop(caixa).save(OUT / ("v7-geral-%s.png" % nome))
        print("geral-" + nome)


if __name__ == "__main__":
    main()
