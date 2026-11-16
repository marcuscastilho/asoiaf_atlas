"""Synthetic end-to-end checks; never reads or writes map masters."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

SPEC = importlib.util.spec_from_file_location(
    "atlas_tiles", Path(__file__).resolve().parents[1] / "scripts/build_tiles.py")
tiles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tiles)


class TileTests(unittest.TestCase):
    def test_crop_preserves_exact_retained_pixels_and_offset(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            atlas = root / "atlas"
            (root / "mapas/jpeg").mkdir(parents=True)
            (root / "mapas/relatorios").mkdir()
            (atlas / "data").mkdir(parents=True)
            (atlas / "assets").mkdir()
            source = root / "mapas/jpeg/O Mundo Conhecido.jpg"
            image = Image.new("RGB", (789, 273), (30, 90, 130))
            image.paste((180, 110, 50), (25, 20, 610, 240))
            image.save(source, "JPEG")
            image.close()
            digest = tiles.converter.digest(source)
            (root / "mapas/relatorios/renomeacao-jpeg.json").write_text(json.dumps({
                "arquivos": [{"anterior": "HPSC0337.jpg", "novo": source.name,
                              "sha256_depois": digest}]}), encoding="utf-8")
            box = [5, 19, 270, 770]
            settings = {"sourceSha256": digest, "orientedDimensions": [273, 789],
                        "box": box, "tileSetId": "test-crop-v1"}
            config = atlas / "data/recorte.json"
            config.write_text(json.dumps(settings), encoding="utf-8")
            with patch.object(tiles, "ROOT", root), patch.object(tiles, "ATLAS", atlas), \
                    patch.object(tiles.converter, "memory_limit"):
                tiles.main()
                manifest = json.loads((atlas / "data/mapa.json").read_text())
                self.assertEqual([manifest["width"], manifest["height"]], [265, 751])
                self.assertEqual(manifest["displayToOrientedOffset"], [5, 19])
                self.assertEqual(manifest["cropBoxOriented"], box)
                with Image.open(source) as decoded:
                    oriented = decoded.transpose(Image.Transpose.ROTATE_90)
                reference = oriented.crop(box)
                oriented.close()
                try:
                    for y in range(2):
                        h = min(512, 751 - y * 512)
                        with Image.open(atlas / f"tiles/test-crop-v1/1/0/{y}.webp") as tile:
                            actual = tile.crop((0, 0, 265, h)).convert("RGB")
                            expected = reference.crop((0, y * 512, 265, y * 512 + h))
                            self.assertEqual(actual.tobytes(), expected.tobytes())
                            actual.close()
                            expected.close()
                finally:
                    reference.close()
                self.assertEqual(tiles.converter.digest(source), digest)
                self.assertFalse((atlas / "tiles/o-mundo-conhecido").exists())
                settings["box"] = [0, -1, 273, 789]
                config.write_text(json.dumps(settings), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "Invalid crop"):
                    tiles.crop_settings(digest, (273, 789))
                settings["box"] = box
                settings["orientedDimensions"] = [789, 273]
                config.write_text(json.dumps(settings), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "does not match"):
                    tiles.crop_settings(digest, (273, 789))

    def test_native_pixels_padding_profile_and_safe_rerun(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            atlas = root / "atlas"
            (root / "mapas/jpeg").mkdir(parents=True)
            (root / "mapas/relatorios").mkdir()
            (atlas / "data").mkdir(parents=True)
            (atlas / "assets").mkdir()
            source = root / "mapas/jpeg/O Mundo Conhecido.jpg"
            # Not a display profile: these bytes test exact ICC transport only.
            profile = b"atlas-test-profile"
            original = Image.new("RGB", (1379, 987))
            original.putdata([
                ((x * 7 + y * 11) % 256, x % 256, y % 256)
                for y in range(original.height) for x in range(original.width)
            ])
            original.save(source, "JPEG", quality=92, icc_profile=profile)
            original.close()
            source_hash = tiles.converter.digest(source)
            registry = {"arquivos": [{
                "anterior": "HPSC0337.jpg", "novo": source.name,
                "sha256_depois": source_hash,
            }]}
            (root / "mapas/relatorios/renomeacao-jpeg.json").write_text(
                json.dumps(registry), encoding="utf-8")
            with patch.object(tiles, "ROOT", root), patch.object(tiles, "ATLAS", atlas), \
                    patch.object(tiles.converter, "memory_limit"):
                tiles.main()
                manifest = json.loads((atlas / "data/mapa.json").read_text())
                report = json.loads((atlas / "data/tiles-validacao.json").read_text())
                self.assertEqual((manifest["width"], manifest["height"]), (987, 1379))
                self.assertEqual(manifest["maxNativeZoom"], 2)
                self.assertTrue(report["complete"])
                self.assertTrue(report["sourceUnchanged"])
                with Image.open(source) as decoded:
                    reference = decoded.transpose(Image.Transpose.ROTATE_90)
                try:
                    for entry in report["levels"][-1]["tiles"]:
                        x, y = entry["x"] * 512, entry["y"] * 512
                        w, h = entry["contentWidth"], entry["contentHeight"]
                        path = atlas / f"tiles/o-mundo-conhecido/2/{entry['x']}/{entry['y']}.webp"
                        with Image.open(path) as tile:
                            self.assertEqual(tile.size, (512, 512))
                            self.assertEqual(tile.info["icc_profile"], profile)
                            content = tile.crop((0, 0, w, h)).convert("RGB")
                            expected = reference.crop((x, y, x + w, y + h))
                            self.assertEqual(content.tobytes(), expected.tobytes())
                            content.close()
                            expected.close()
                            if w < 512 or h < 512:
                                self.assertEqual(tile.convert("RGBA").getpixel((511, 511))[3], 0)
                finally:
                    reference.close()
                paths = list((atlas / "tiles").rglob("*.webp"))
                before = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
                tiles.main()
                self.assertEqual(before, {
                    p: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths})
                self.assertEqual(source_hash, tiles.converter.digest(source))
                # Existing different tiles must never be silently overwritten.
                paths[0].write_bytes(b"not a webp")
                with self.assertRaises(Exception):
                    tiles.main()
                self.assertEqual(paths[0].read_bytes(), b"not a webp")
                # A changed source is refused before publishing any new tiles.
                source.write_bytes(source.read_bytes() + b"changed")
                with self.assertRaisesRegex(ValueError, "Scan changed"):
                    tiles.main()


if __name__ == "__main__":
    unittest.main()
