"""Lossless native-resolution tiles from a byte-verified, renamed scan."""
import gc
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import tempfile
import time

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "mapas" / "relatorios"))
import converter

ATLAS = ROOT / "atlas"
TILE_SIZE = 512
MAP_ID = "o-mundo-conhecido"
ROTATION = Image.Transpose.ROTATE_90
Image.MAX_IMAGE_PIXELS = converter.MAX_PIXELS


def profile_hash(profile):
    return hashlib.sha256(profile).hexdigest() if profile else None


def validate_tile(path, expected, profile):
    with Image.open(path) as decoded:
        if decoded.format != "WEBP" or decoded.size != expected.size or decoded.mode != expected.mode:
            raise ValueError("Tile format/dimensions/sample mode differ: " + str(path))
        if decoded.info.get("icc_profile") != profile:
            raise ValueError("Tile ICC differs: " + str(path))
        decoded.load()
        if decoded.tobytes() != expected.tobytes():
            raise ValueError("Tile pixels differ: " + str(path))
    decoded.close()
    return converter.digest(path)


def save_tile(path, image, profile):
    if path.exists():
        return validate_tile(path, image, profile)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix="tile-", suffix=".webp", dir=path.parent,
                                     delete=False) as stream:
        temporary = Path(stream.name)
    try:
        # In lossless mode quality/method control search effort, not pixel fidelity.
        image.save(temporary, "WEBP", lossless=True, exact=True, quality=75, method=4,
                   icc_profile=profile)
        digest = validate_tile(temporary, image, profile)
        os.link(temporary, path)
        return digest
    finally:
        converter.retry_file_operation(temporary.unlink)


def crop_settings(source_hash, oriented_size):
    path = ATLAS / "data/recorte.json"
    full_box = (0, 0, *oriented_size)
    if not path.exists():
        return full_box, MAP_ID
    settings = json.loads(path.read_text(encoding="utf-8"))
    if (settings["sourceSha256"] != source_hash or
            settings["orientedDimensions"] != list(oriented_size)):
        raise ValueError("Crop configuration does not match the verified source")
    box = settings["box"]
    if (len(box) != 4 or any(type(v) is not int for v in box) or
            not (0 <= box[0] < box[2] <= oriented_size[0] and
                 0 <= box[1] < box[3] <= oriented_size[1])):
        raise ValueError("Invalid crop rectangle")
    tile_set = settings["tileSetId"]
    if (not tile_set or not all(c in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in tile_set)
            or (tuple(box) != full_box and tile_set == MAP_ID)):
        raise ValueError("Crop requires a distinct, safe tile-set ID")
    return tuple(box), tile_set


def main():
    converter.MEMORY_MIB = 4096
    converter.memory_limit()
    registry = json.loads((ROOT / "mapas/relatorios/renomeacao-jpeg.json").read_text(
        encoding="utf-8"))
    item = next(r for r in registry["arquivos"] if r["anterior"] == "HPSC0337.jpg")
    source = ROOT / "mapas/jpeg" / item["novo"]
    source_hash = converter.digest(source)
    if source_hash != item["sha256_depois"]:
        raise ValueError("Scan changed after byte-verified rename")
    with Image.open(source) as scan:
        if scan.mode != "RGB" or getattr(scan, "n_frames", 1) != 1:
            raise ValueError("Expected single-frame RGB scan")
        original_size = scan.size
        profile = scan.info.get("icc_profile")
        dpi = scan.info.get("dpi")
        scan.load()
        oriented = scan.transpose(ROTATION)
    scan.close()
    gc.collect()
    oriented_size = oriented.size
    crop_box, tile_set = crop_settings(source_hash, oriented_size)
    if crop_box != (0, 0, *oriented_size):
        cropped = oriented.crop(crop_box)
        oriented.close()
        oriented = cropped
        gc.collect()
    width, height = oriented.size
    report_path = ATLAS / "data" / (tile_set + "-validacao.json")
    preview_url = "assets/" + tile_set + "-preview.webp"
    max_zoom = max(0, math.ceil(math.log2(max(width, height) / TILE_SIZE)))
    report = {
        "source": source.relative_to(ROOT).as_posix(), "sourceSha256": source_hash,
        "sourceDimensions": list(original_size), "orientedDimensions": list(oriented_size),
        "displayDimensions": [width, height], "cropBoxOriented": list(crop_box),
        "displayToOrientedOffset": list(crop_box[:2]), "tileSetId": tile_set,
        "rotationDegreesCounterclockwise": 90, "nativePixelsResampled": False,
        "compression": {"format": "WebP", "lossless": True, "exact": True,
                        "quality": 75, "method": 4},
        "iccSha256": profile_hash(profile), "levels": [], "complete": False,
        "validation": "Every decoded tile compared byte-for-byte to its reference crop. "
                      "Native level uses the exact cropped, orthogonally rotated source pixels; "
                      "overview levels use explicit Lanczos downsampling.",
    }
    started = time.monotonic()
    try:
        for zoom in range(max_zoom + 1):
            divisor = 2 ** (max_zoom - zoom)
            level_size = (math.ceil(width / divisor), math.ceil(height / divisor))
            level = (oriented if zoom == max_zoom else
                     oriented.resize(level_size, Image.Resampling.LANCZOS, reducing_gap=None))
            columns, rows = (math.ceil(side / TILE_SIZE) for side in level.size)
            entries = []
            print(f"z{zoom}: {level.size}, {columns}x{rows} tiles", flush=True)
            try:
                for x in range(columns):
                    for y in range(rows):
                        box = (x * TILE_SIZE, y * TILE_SIZE,
                               min((x + 1) * TILE_SIZE, level.width),
                               min((y + 1) * TILE_SIZE, level.height))
                        tile = level.crop(box)
                        content_size = tile.size
                        if content_size != (TILE_SIZE, TILE_SIZE):
                            padded = Image.new("RGBA", (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
                            padded.paste(tile, (0, 0))
                            tile.close()
                            tile = padded
                        path = ATLAS / "tiles" / tile_set / str(zoom) / str(x) / f"{y}.webp"
                        try:
                            digest = save_tile(path, tile, profile)
                            entries.append({
                                "x": x, "y": y, "width": tile.width, "height": tile.height,
                                "contentWidth": content_size[0], "contentHeight": content_size[1],
                                "bytes": path.stat().st_size, "sha256": digest,
                            })
                        finally:
                            tile.close()
                    if x % 8 == 0:
                        print(f"z{zoom}: column {x + 1}/{columns}", flush=True)
            finally:
                if level is not oriented:
                    level.close()
            report["levels"].append({
                "zoom": zoom, "width": level_size[0], "height": level_size[1],
                "columns": columns, "rows": rows, "tiles": entries,
                "native": zoom == max_zoom, "pixelsValidated": True,
            })
            converter.write_json(report_path, report)
            gc.collect()
        preview = oriented.copy() if max(width, height) <= 1600 else oriented.resize(
            (1600, round(height * 1600 / width)), Image.Resampling.LANCZOS)
        try:
            save_tile(ATLAS / preview_url, preview, profile)
        finally:
            preview.close()
    finally:
        oriented.close()
    if converter.digest(source) != source_hash:
        raise ValueError("Source scan changed during tile generation")
    report.update(complete=True, sourceUnchanged=True,
                  durationSeconds=round(time.monotonic() - started, 2))
    converter.write_json(report_path, report)
    converter.write_json(ATLAS / "data/tiles-validacao.json", report)
    manifest = {
        "id": MAP_ID, "title": "O Mundo Conhecido",
        "width": width, "height": height, "tileSize": TILE_SIZE,
        "minZoom": 0, "maxNativeZoom": max_zoom, "maxZoom": max_zoom,
        "tileUrl": "tiles/" + tile_set + "/{z}/{x}/{y}.webp",
        "tileSetId": tile_set, "previewUrl": preview_url,
        "uncroppedOrientedDimensions": list(oriented_size),
        "cropBoxOriented": list(crop_box),
        "displayToOrientedOffset": list(crop_box[:2]),
        "sourceFile": "../mapas/jpeg/" + item["novo"],
        "sourceSha256": source_hash, "rotationDegreesCounterclockwise": 90,
        "dpi": dpi, "iccSha256": profile_hash(profile),
        "focusBounds": [0, 0, width, height],
        "nativePixelsValidated": True,
        "notice": "Piloto local. Arte digitalizada com nomes impressos; sem trajetos impressos. "
                  "Os percursos interativos herdados continuam em revisao.",
    }
    converter.write_json(ATLAS / "data/mapa.json", manifest)
    print(json.dumps({k: v for k, v in report.items() if k != "levels"}, indent=2))


if __name__ == "__main__":
    main()
