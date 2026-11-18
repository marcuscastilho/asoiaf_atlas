#!/usr/bin/env python3
"""Projecao mecanica oldPixel->nativo para rotulos de docs/map-features.json.

Entradas:
  docs/map-features.json            (centros de rotulo no espaco do portal
                                     legado, artworkSize 4642)
  atlas/data/atlas-percursos-v7.json (32 pontos com oldPixel + x/y nativos)
  atlas/tiles/o-mundo-conhecido-recorte-v2/6/{x}/{y}.webp (imagem nativa)

Saidas (gitignored, evidencias):
  atlas/test/evidencias/subregioes-v1/projecao.json
  atlas/test/evidencias/subregioes-v1/crops/*.png
  atlas/test/evidencias/subregioes-v1/sheets/*.png

Metodo: afim local com os K=8 pontos-ancora mais proximos em espaco old
(extrapola com seguranca fora do hull). residualLocalPx = mediana dos
residuos dos 8 vizinhos sob a afim local. LOO global reportado no stdout.
"""

import json
import math
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
FEATS = ROOT / "docs/map-features.json"
DATA = ROOT / "atlas/data/atlas-percursos-v7.json"
TILES = ROOT / "atlas/tiles/o-mundo-conhecido-recorte-v2"
OUT = ROOT / "atlas/test/evidencias/subregioes-v1"
MAP_W, MAP_H = 21654, 14428
TILE, ZTILES = 512, 6
K = 8
CROP_W, CROP_H = 1200, 700
WIDE_W, WIDE_H = 2400, 1400

FEATURES = [
    "Land_of_Always_Winter", "Frostfangs", "Haunted_Forest", "Frozen_Shore",
    "Brandon%27s_Gift", "New_Gift", "Skagos", "Bear_Island",
    "Sea_Dragon_Point", "Wolfswood", "Lonely_Hills", "Hornwood_(forest)",
    "Barrowlands", "Rills", "Neck", "Flint_Cliffs", "Cape_Kraken",
    "Great_Wyk", "Old_Wyk", "Orkmont", "Harlaw", "Saltcliffe",
    "Pyke_(island)", "Cape_of_Eagles", "Whispering_Wood", "Isle_of_Faces",
    "Mountains_of_the_Moon", "Three_Sisters", "Fingers", "Crackclaw_Point",
    "Massey%27s_Hook", "Driftmark", "Claw_Isle", "Kingswood", "Fair_Isle",
    "Arbor", "Shield_Islands", "Rainwood", "Cape_Wrath", "Tarth",
    "Estermont", "Dornish_Marches", "Red_Mountains", "Greenblood",
    "Arm_of_Dorne", "Braavosian_Coastlands", "Andalos", "Hills_of_Norvos",
    "Forest_of_Qohor", "Axe", "Flatlands", "Golden_Fields",
    "Disputed_Lands", "Stepstones", "Isle_of_Cedars",
    "Lands_of_the_Long_Summer", "Womb_of_the_World", "Mother_of_Mountains",
    "Painted_Mountains", "Khyzai_Pass", "Skahazadhan", "Yaros", "Ghaen",
    "Jade_Gates", "Basilisk_Isles", "Naath",
]

EXTRA = [
    ("Bone Mountains", 14300, 8200), ("Grey Waste", 19000, 8000),
    ("Shadow Lands", 19500, 12800), ("Jade Sea", 17500, 12500),
    ("Isle of Elephants", 15850, 13100), ("Summer Isles", 6000, 12500),
    ("Sothoryos north coast", 11500, 12900), ("Ulthos", 21200, 12750),
    ("Red Waste", 13900, 10200), ("Lhazar", 12800, 9300),
    ("Dothraki Sea", 12500, 7500), ("Ibben", 14500, 4500),
]


def fit_affine(src, dst):
    """afim minimo-quadrados src->dst (N>=3). retorna matriz 2x3"""
    n = src.shape[0]
    A = np.hstack([src, np.ones((n, 1))])
    sol, _, _, _ = np.linalg.lstsq(A, dst, rcond=None)
    return sol.T  # 2x3


def apply(M, p):
    return np.array([M[0, 0] * p[0] + M[0, 1] * p[1] + M[0, 2],
                     M[1, 0] * p[0] + M[1, 1] * p[1] + M[1, 2]])


def tile_mosaic():
    """mosaico z6 inteiro (cache em memoria, montado por faixas)"""
    cols = math.ceil(MAP_W / TILE)
    rows = math.ceil(MAP_H / TILE)
    mos = Image.new("RGB", (cols * TILE, rows * TILE))
    for x in range(cols):
        for y in range(rows):
            f = TILES / str(ZTILES) / str(x) / ("%d.webp" % y)
            if f.exists():
                mos.paste(Image.open(f).convert("RGB"), (x * TILE, y * TILE))
    return mos


def recorte(mos, cx, cy, w, h, out):
    x0 = max(0, min(int(round(cx - w / 2)), MAP_W - w))
    y0 = max(0, min(int(round(cy - h / 2)), MAP_H - h))
    mos.crop((x0, y0, x0 + w, y0 + h)).save(out)
    return x0, y0


def folha(celulas, path, cell_w=CROP_W, cell_h=CROP_H, cols=2):
    """celulas: [(img_path, legenda)] -> folha 2x3 legenda acima"""
    rows = math.ceil(len(celulas) / cols)
    cap = 26
    sh = Image.new("RGB", (cols * cell_w, rows * (cell_h + cap)), "#222")
    dr = ImageDraw.Draw(sh)
    for i, (imgp, cap_txt) in enumerate(celulas):
        im = Image.open(imgp)
        x = (i % cols) * cell_w
        y = (i // cols) * (cell_h + cap)
        dr.text((x + 4, y + 4), cap_txt, fill="#ffd24a")
        sh.paste(im.resize((cell_w, cell_h)), (x, y + cap))
    sh.save(path)


def main():
    feats = {f["id"]: f for f in
             json.loads(FEATS.read_text("utf-8"))["features"]}
    ds = json.loads(DATA.read_text("utf-8"))
    anchors = [p for p in ds["controlPoints"] if p.get("oldPixel")]
    src_all = np.array([p["oldPixel"] for p in anchors])
    dst_all = np.array([[p["x"], p["y"]] for p in anchors])

    def vizinhos(ox, oy, exc=-1):
        d = np.hypot(src_all[:, 0] - ox, src_all[:, 1] - oy)
        idx = np.argsort(d)
        idx = [i for i in idx if i != exc][:K]
        return np.array(idx)

    def projetar(ox, oy):
        idx = vizinhos(ox, oy)
        M = fit_affine(src_all[idx], dst_all[idx])
        res = np.linalg.norm(
            dst_all[idx] - np.array([apply(M, q) for q in src_all[idx]]),
            axis=1)
        return apply(M, [ox, oy]), float(np.median(res)), len(idx)

    # LOO global para o relatorio
    loo = []
    for i, p in enumerate(anchors):
        ox, oy = p["oldPixel"]
        idx = vizinhos(ox, oy, exc=i)
        M = fit_affine(src_all[idx], dst_all[idx])
        loo.append(float(np.linalg.norm(
            np.array([p["x"], p["y"]]) - apply(M, [ox, oy]))))
    loo = np.array(loo)
    print("LOO %d ancoras: med=%.1f px  p90=%.1f  max=%.1f" % (
        len(loo), np.median(loo), np.percentile(loo, 90), loo.max()))

    (OUT / "crops").mkdir(parents=True, exist_ok=True)
    (OUT / "sheets").mkdir(parents=True, exist_ok=True)

    mos = tile_mosaic()

    projecao = {}
    celulas = []
    for n, fid in enumerate(FEATURES):
        f = feats[fid]
        (nx, ny), res, k = projetar(f["x"], f["y"])
        nx, ny = int(round(nx)), int(round(ny))
        projecao[fid] = {"old": [f["x"], f["y"]],
                         "native": [nx, ny],
                         "residualLocalPx": round(res, 1)}
        cp = OUT / "crops" / ("%02d-%s.png" % (n, fid.replace("%", "_")))
        recorte(mos, nx, ny, CROP_W, CROP_H, cp)
        celulas.append((str(cp), "%d: %s" % (n, fid)))
    for i in range(0, len(celulas), 6):
        folha(celulas[i:i + 6],
              OUT / "sheets" / ("features-%02d.png" % (i // 6)))

    celulas2 = []
    for n, (nome, nx, ny) in enumerate(EXTRA):
        cp = OUT / "crops" / ("extra-%02d.png" % n)
        recorte(mos, nx, ny, WIDE_W, WIDE_H, cp)
        # 2400x1400 -> 1200x700 ja na folha (resize dentro de folha)
        celulas2.append((str(cp), nome))
    for i in range(0, len(celulas2), 2):
        folha(celulas2[i:i + 2], OUT / "sheets" / ("extra-%02d.png" % (i // 2)),
              cols=1)

    (OUT / "projecao.json").write_text(
        json.dumps(projecao, ensure_ascii=False, indent=1) + "\n", "utf-8")
    meta = {"method": ("afim local K=8 vizinhos oldPixel; residualLocalPx="
                       "mediana dos residuos dos vizinhos"),
            "loo": {"medianPx": round(float(np.median(loo)), 1),
                    "p90Px": round(float(np.percentile(loo, 90)), 1),
                    "maxPx": round(float(loo.max()), 1),
                    "anchors": len(anchors)}}
    (OUT / "projecao-meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=1) + "\n", "utf-8")
    print("sheets:", sorted(os.listdir(OUT / "sheets")))


if __name__ == "__main__":
    main()
