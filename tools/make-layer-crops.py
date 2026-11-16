# Mechanical crops/downscales of the author's raster layers for review.
# Run: .venv-book-audit/Scripts/python.exe tools/make-layer-crops.py
from PIL import Image
import os

D = 'reference/map-layers'

# labels layer: black-background downscale and white-composited downscale
labels = Image.open(f'{D}/labels.png')
labels.resize((2321, 2321), Image.LANCZOS).save(f'{D}/labels-2321-black.png')
white = Image.new('RGBA', labels.size, (255, 255, 255, 255))
white.alpha_composite(labels)
white.convert('RGB').resize((2321, 2321), Image.LANCZOS).save(f'{D}/labels-2321-white.png')

# legend: top-right of the full speculative map (clip to image bounds)
orig = Image.open('reference/map-original.jpg')
box = (2950, 120, min(2950 + 1550, orig.width), min(120 + 1700, orig.height))
orig.crop(box).save(f'{D}/crop-legend.png')

# cities around the center of Westeros on the white-composited labels layer
box = (700, 1850, min(700 + 600, white.width), min(1850 + 850, white.height))
white.crop(box).save(f'{D}/crop-labels-cities.png')

print('crops written:', sorted(f for f in os.listdir(D) if f.startswith('crop') or '2321' in f))
