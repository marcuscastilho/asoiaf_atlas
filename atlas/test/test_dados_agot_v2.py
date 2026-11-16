"""Validate frozen import provenance and omissions, not literary truth."""
import hashlib
import json
import math
from pathlib import Path
import unittest

DATA = Path(__file__).resolve().parents[1] / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class FrozenAtlasDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atlas = read("atlas-agot-v2.json")
        cls.source = read("portal-agot-v2-referencia.json")
        cls.north = read("piloto-norte.json")
        cls.manifest = read("mapa.json")
        cls.points = {p["id"]: p for p in cls.atlas["controlPoints"]}

    def test_frozen_identity_and_input_hashes(self):
        d, m = self.atlas, self.manifest
        self.assertEqual(d["schemaVersion"], 2)
        for key in ("tileSetId", "sourceSha256", "cropBoxOriented"):
            self.assertEqual(d[key], m[key])
        self.assertEqual((d["mapWidth"], d["mapHeight"]), (m["width"], m["height"]))
        self.assertEqual(d["sourceFiles"], self.source["sourceFiles"])
        for name, expected in d["inputSha256"].items():
            self.assertEqual(hashlib.sha256((DATA / name).read_bytes()).hexdigest(), expected)
        self.assertEqual((DATA / "atlas-agot-v2.json").read_bytes(),
                         (DATA / "atlas-agot-v2-candidato.json").read_bytes())

    def test_all_source_records_accounted_once_with_original_ranges(self):
        sources = {c["id"]: c for c in self.source["characters"]}
        self.assertEqual({r["id"] for r in self.atlas["routes"]}, set(sources))
        for route in self.atlas["routes"]:
            records = {r["index"]: r["record"] for r in sources[route["id"]]["records"]}
            items = route["positions"] + route["segments"] + route["omittedRecords"]
            self.assertEqual(sorted(i["sourceRecordIndex"] for i in items), sorted(records))
            for item in items:
                raw = records[item["sourceRecordIndex"]]["chapters"]
                start = raw if isinstance(raw, int) else raw[0]
                end = raw[1] if isinstance(raw, list) and len(raw) == 2 else 999
                self.assertEqual((item["startChapter"], item["endChapter"]), (start, min(end, 72)))
                self.assertLessEqual(start, min(end, 72))

    def test_positions_retain_named_sources_and_do_not_fill_gaps(self):
        for route, source in zip(self.atlas["routes"], self.source["characters"]):
            records = {r["index"]: r["record"] for r in source["records"]}
            for p in route["positions"]:
                self.assertEqual(p["locationId"], records[p["sourceRecordIndex"]]["key"])
                self.assertIn(p["locationId"], self.points)
                self.assertEqual(p["status"], "approximate")
        jon = next(r for r in self.atlas["routes"] if r["id"] == "jon")
        self.assertFalse(any(p["startChapter"] <= 1 <= p["endChapter"] for p in jon["positions"]))
        self.assertIn(2, jon["omittedSourceRecordIndices"])
        self.assertNotIn("Lhazar", self.points)

    def test_geometry_retains_source_vertices_and_manual_anchors(self):
        for route, source in zip(self.atlas["routes"], self.source["characters"]):
            records = {r["index"]: r["record"] for r in source["records"]}
            for segment in route["segments"]:
                self.assertEqual(segment["status"], "approximate")
                self.assertGreaterEqual(len(segment["points"]), 2)
                self.assertEqual([v["source"] for v in segment["vertices"]],
                                 records[segment["sourceRecordIndex"]]["path"])
                self.assertEqual(segment["points"], [v["point"] for v in segment["vertices"]])
                for vertex in segment["vertices"]:
                    x, y = vertex["point"]
                    self.assertTrue(math.isfinite(x) and math.isfinite(y))
                    self.assertTrue(0 <= x < self.manifest["width"] and
                                    0 <= y < self.manifest["height"])
                    if isinstance(vertex["source"], str):
                        cp = self.points[vertex["source"]]
                        self.assertEqual([cp["x"], cp["y"]], [x, y])

    def test_preserved_north_and_no_westeros_estimates_in_essos(self):
        for cp in self.north["controlPoints"]:
            self.assertEqual((self.points[cp["id"]]["x"], self.points[cp["id"]]["y"]),
                             (cp["x"], cp["y"]))
        jon = next(r for r in self.atlas["routes"] if r["id"] == "jon")
        first = next(s for s in jon["segments"] if s["sourceRecordIndex"] == 4)
        self.assertEqual(first["vertices"], self.north["route"]["segments"][0]["vertices"])
        daenerys = next(r for r in self.atlas["routes"] if r["id"] == "daenerys")
        self.assertEqual(daenerys["segments"], [])
        self.assertEqual({p["locationId"] for p in daenerys["positions"]}, {"Pentos", "Vaes_Dothrak"})
        self.assertEqual(self.atlas["chapters"], self.north["chapters"])
        self.assertEqual([c["index"] for c in self.atlas["chapters"]], list(range(73)))

    def test_book_sidecar_identifies_edition_without_certifying_routes(self):
        evidence = read("nomes-agot-v2-evidencias.json")
        self.assertEqual(evidence["datasetId"], self.atlas["datasetId"])
        self.assertEqual(evidence["edition"]["id"], "AGOT-LEYA")
        self.assertEqual(evidence["datasetSha256"],
                         hashlib.sha256((DATA / "atlas-agot-v2.json").read_bytes()).hexdigest())
        self.assertEqual({e["id"] for e in evidence["entries"]}, set(self.points))
        for e in evidence["entries"]:
            self.assertEqual(e["label"], self.points[e["id"]]["label"])
            self.assertIn(e["status"], ("term-occurrence-only", "not-established-by-exact-search"))
            self.assertEqual(bool(e["locators"]), e["status"] == "term-occurrence-only")
            for locator in e["locators"]:
                self.assertEqual(locator["book"], "AGOT-LEYA")
                self.assertTrue(locator["epubMember"].endswith((".html", ".xhtml", ".htm")))


if __name__ == "__main__":
    unittest.main()
