"""Compose the source-resolution terrain overlay (reproducible, mechanical).

Reads the ORIGINAL full-resolution layers downloaded from the author's site
(reference/map-layers/): map.jpg as base, then alpha-composites roads.png,
wall.png and non_canon.png in the original draw order (locations/labels are
deliberately excluded - they ship as separate overlays/vector labels).

Output: assets/img/map-layers/terrain.jpg, 4642x4642 RGB JPEG (quality 95,
4:4:4 subsampling, optimized, progressive). This avoids re-compressing the
source through the tile pipeline; it is NOT new geographic detail.

Run:  .venv-book-audit/Scripts/python tools/build-terrain.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'reference' / 'map-layers'
OUT = ROOT / 'assets' / 'img' / 'map-layers' / 'terrain.jpg'

base = Image.open(SRC / 'map.jpg').convert('RGBA')
for layer in ('roads.png', 'wall.png', 'non_canon.png'):
    overlay = Image.open(SRC / layer).convert('RGBA')
    assert overlay.size == base.size, f'{layer} size mismatch {overlay.size}'
    base.alpha_composite(overlay)

rgb = base.convert('RGB')
assert rgb.size == (4642, 4642), rgb.size
OUT.parent.mkdir(parents=True, exist_ok=True)
rgb.save(OUT, 'JPEG', quality=95, subsampling=0, optimize=True, progressive=True)
print('terrain.jpg', rgb.size, OUT.stat().st_size, 'bytes')
