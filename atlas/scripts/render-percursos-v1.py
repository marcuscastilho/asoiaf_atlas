"""Render frozen candidate route geometry from local tiles for visual review."""
import importlib.util
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "test/evidencias"
spec = importlib.util.spec_from_file_location("region", Path(__file__).with_name("inspecionar-regiao.py"))
region = importlib.util.module_from_spec(spec)
spec.loader.exec_module(region)
data = json.loads((ROOT / "data/atlas-inventario-v3-percursos-candidato.json").read_text(encoding="utf-8"))

views = [
    ("westeros", (2200,2200,5800,7700), 4, ["tyrion","catelyn","jaime","cersei"]),
    ("tridente", (3200,5600,4700,6850), 5, ["robb","tyrion","catelyn","jaime"]),
    ("vale", (4050,5900,5800,6600), 5, ["catelyn"]),
    ("ouro", (2300,6600,4450,7500), 5, ["jaime"]),
    ("essos-oeste", (6300,6500,9300,7900), 5, ["daenerys"]),
    ("essos-leste", (8800,6500,14300,9400), 4, ["daenerys"]),
]
for name, box, zoom, ids in views:
    background = EVIDENCE / f"rotas-v1-{name}-fundo.png"
    region.render(box, background, zoom)
    scale = 2 ** (6 - zoom)
    with Image.open(background) as source:
        image = source.convert("RGB")
    draw = ImageDraw.Draw(image)
    for cid in ids:
        route = next(r for r in data["routes"] if r["id"] == cid)
        for segment in route["segments"]:
            xy = [((x-box[0])/scale,(y-box[1])/scale) for x,y in segment["points"]]
            draw.line(xy, fill="#fffaf0", width=5)
            draw.line(xy, fill=route["color"], width=2)
            for i,(x,y) in enumerate(xy):
                if 0 <= x < image.width and 0 <= y < image.height:
                    draw.ellipse((x-2,y-2,x+2,y+2),fill=route["color"])
                    if i == 0:
                        draw.text((x+5,y+3),f"{cid}:{segment['startChapter']}",
                                  fill=route["color"],stroke_width=1,stroke_fill="white")
    image.save(EVIDENCE / f"rotas-v1-{name}-revisao.png")
    image.close()
    print(EVIDENCE / f"rotas-v1-{name}-revisao.png")
