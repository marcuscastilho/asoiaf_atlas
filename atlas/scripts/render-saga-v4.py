"""Render frozen candidate corridors over existing tiles for lead visual review."""
import importlib.util
import json
from pathlib import Path

from PIL import ImageDraw

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "inspection", Path(__file__).with_name("inspecionar-cobertura-v4.py"))
inspection = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inspection)


def main():
    data = json.loads((ROOT / "data/atlas-inventario-v4-candidato.json").read_text(encoding="utf-8"))
    cases = [
        ("mar-oeste", (1800,6000,7000,10200), 4,
         [("samwell",270),("myrcella",227),("stannis",104),("stannis",131),("theon",84)]),
        ("mar-essos", (10400,8800,15400,11600), 4,
         [("daenerys",166),("daenerys",185),("daenerys",200)]),
        ("roine", (6200,6900,8800,9700), 5,
         [("tyrion",279),("tyrion",285),("tyrion",289),("tyrion",293),("tyrion",298)]),
        ("norte", (2800,2100,6500,5700), 4,
         [("samwell",251),("stannis",219),("stannis",297),("davos",286)]),
        ("pyke", (2200,5600,3500,6500), 6, [("theon",84)]),
    ]
    for name, box, zoom, selections in cases:
        image = inspection.tiles_crop(box,zoom)
        draw = ImageDraw.Draw(image)
        scale = 2**(6-zoom)
        for cid,chapter in selections:
            route = next(r for r in data["routes"] if r["id"] == cid)
            segment = next(s for s in route["segments"] if s["startChapter"] == chapter)
            vertices = [((x-box[0])/scale,(y-box[1])/scale) for x,y in segment["points"]]
            draw.line(vertices,fill="black",width=5)
            draw.line(vertices,fill=route["color"],width=3)
            for i,(x,y) in enumerate(vertices):
                draw.ellipse((x-2,y-2,x+2,y+2),fill="yellow")
                if len(vertices) < 40:
                    draw.text((x+2,y+2),str(i),fill="black",stroke_width=1,stroke_fill="white")
        path = ROOT / f"test/evidencias/v4-rotas-revisao-{name}.png"
        image.save(path)
        image.close()
        print(path)


if __name__ == "__main__":
    main()
