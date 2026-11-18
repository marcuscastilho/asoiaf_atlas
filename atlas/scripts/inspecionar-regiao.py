"""Render a coordinate grid from existing tiles, never from the master image."""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]


def render(box, output, zoom=4):
    scale = 2 ** (6 - zoom)
    left, top, right, bottom = [value // scale for value in box]
    view = Image.new("RGB", (right - left, bottom - top), "white")
    icc = None
    for x in range(left // 512, (right - 1) // 512 + 1):
        for y in range(top // 512, (bottom - 1) // 512 + 1):
            path = ROOT / f"tiles/o-mundo-conhecido-recorte-v2/{zoom}/{x}/{y}.webp"
            with Image.open(path) as tile:
                icc = tile.info.get("icc_profile")
                view.paste(tile.convert("RGB"), (x * 512 - left, y * 512 - top))
    draw = ImageDraw.Draw(view)
    step = 200 if zoom >= 5 else 400
    for x in range((box[0] // step + 1) * step, box[2], step):
        px = x / scale - left
        draw.line((px, 0, px, view.height), fill="#a06060", width=1)
        draw.text((px + 2, 4), str(x), fill="black", stroke_width=1, stroke_fill="white")
    for y in range((box[1] // step + 1) * step, box[3], step):
        py = y / scale - top
        draw.line((0, py, view.width, py), fill="#a06060", width=1)
        draw.text((4, py + 2), str(y), fill="black", stroke_width=1, stroke_fill="white")
    view.save(output, icc_profile=icc)
    view.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("box", type=int, nargs=4)
    parser.add_argument("output", type=Path)
    parser.add_argument("--zoom", type=int, default=4, choices=(4, 5, 6))
    args = parser.parse_args()
    render(args.box, args.output, args.zoom)
