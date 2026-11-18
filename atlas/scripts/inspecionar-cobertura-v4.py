"""Lead review aids from frozen candidates and existing tiles, never masters."""
import argparse
import importlib.util
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test/evidencias"
spec = importlib.util.spec_from_file_location("regions", Path(__file__).with_name("inspecionar-regiao.py"))
regions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(regions)
points = json.loads((ROOT / "data/atlas-inventario-v3.json").read_text(encoding="utf-8"))["controlPoints"]
candidates = json.loads((ROOT / "data/simbolos-v3-candidatos.json").read_text(encoding="utf-8"))["candidates"]


def tiles_crop(box, zoom):
    scale = 2 ** (6-zoom)
    left, top, right, bottom = [v // scale for v in box]
    im = Image.new("RGB", (right-left, bottom-top), "#eee5cb")
    for x in range(left//512, (right-1)//512+1):
        for y in range(top//512, (bottom-1)//512+1):
            p = ROOT / f"tiles/o-mundo-conhecido-recorte-v2/{zoom}/{x}/{y}.webp"
            if not p.exists():
                continue
            with Image.open(p) as tile:
                im.paste(tile.convert("RGB"), (x*512-left, y*512-top))
    return im


def contacts():
    consumed = {i for p in points for i in p.get("reviewedCandidateIds", [])}
    remaining = [c for c in candidates if c["candidateId"] not in consumed]
    for start in range(0,len(remaining),96):
        page = Image.new("RGB",(1200,1184),"#fff9e8")
        draw = ImageDraw.Draw(page)
        for i,c in enumerate(remaining[start:start+96]):
            x, y = (i%12)*100,(i//12)*148
            box = [c["x"]-70,c["y"]-70,c["x"]+70,c["y"]+70]
            crop = tiles_crop(box,5).resize((96,96))
            page.paste(crop,(x+2,y+20))
            crop.close()
            near = min(math.hypot(p["x"]-c["x"],p["y"]-c["y"]) for p in points)
            draw.text((x+3,y+2),f"{c['candidateId']} d={round(near)}",fill="#171717")
            draw.text((x+3,y+120),f"{c['x']},{c['y']}",fill="#171717")
        name = OUT / f"v4-candidatos-{start:03d}.png"
        page.save(name)
        page.close()
        print(name)


def sectors():
    review = json.loads((ROOT / "data/revisao-cobertura-v4.json").read_text(encoding="utf-8"))
    show_ids = {g["candidateId"] for g in review["glyphCandidatesForSectorReview"]}
    show_ids.update(review["partialGlyphsToResolve"])
    show_ids.update(i for group in review["duplicateFragmentPairsToResolve"] for i in group)
    for row,y in enumerate(range(0,14428,2400)):
        for col,x in enumerate(range(0,21654,3600)):
            box = (x,y,21654 if x == 18000 else min(x+3600,21654),
                   14428 if y == 12000 else min(y+2400,14428))
            if box[2]-x < 200 or box[3]-y < 200:
                continue
            im = tiles_crop(box,4)
            draw = ImageDraw.Draw(im)
            for p in points:
                if x <= p["x"] < box[2] and y <= p["y"] < box[3]:
                    px,py=(p["x"]-x)/4,(p["y"]-y)/4
                    draw.ellipse((px-8,py-8,px+8,py+8),outline="#00c876",width=1)
            for c in candidates:
                if c["candidateId"] not in show_ids:
                    continue
                if x <= c["x"] < box[2] and y <= c["y"] < box[3]:
                    px,py=(c["x"]-x)/4,(c["y"]-y)/4
                    draw.text((px+6,py-12),str(c["candidateId"]),
                              fill="#1254b8",stroke_width=1,stroke_fill="white")
            draw.text((8,8),f"setor {row}-{col} / {box}",fill="black",
                      stroke_width=1,stroke_fill="white")
            name = OUT / f"v4-setor-{row}-{col}.png"
            im.save(name)
            im.close()
            print(name)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode",choices=["contacts","sectors"])
    args=parser.parse_args()
    contacts() if args.mode == "contacts" else sectors()
