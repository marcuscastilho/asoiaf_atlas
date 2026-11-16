"""Independent consistency checks of the curated v3 artifact, not map accuracy."""
import hashlib
import json
from pathlib import Path
import unittest

DATA = Path(__file__).resolve().parents[1] / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class InventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.v = read("atlas-inventario-v3.json")
        cls.old = read("atlas-agot-v2.json")
        cls.source = read("portal-agot-v2-referencia.json")
        cls.report = read("inventario-v3-diagnostico.json")
        cls.route_report = read("percursos-v1-diagnostico.json")

    def test_identity_and_inputs(self):
        manifest = read("mapa.json")
        self.assertEqual(self.v["mapId"], manifest["id"])
        for key in ("sourceSha256", "tileSetId", "cropBoxOriented"):
            self.assertEqual(self.v[key], manifest[key])
        for name, expected in self.v["inputSha256"].items():
            self.assertEqual(hashlib.sha256((DATA / name).read_bytes()).hexdigest(), expected)

    def test_original_anchors_preserved(self):
        new = {p["id"]: p for p in self.v["controlPoints"]}
        for p in self.old["controlPoints"]:
            self.assertEqual([p["x"], p["y"]], [new[p["id"]]["x"], new[p["id"]]["y"]])

    def test_points_regions_and_counts(self):
        points = self.v["controlPoints"]
        ids = [p["id"] for p in points]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.report["entries"], len(points))
        named = [p for p in points if p["identificationStatus"] != "unidentified-symbol"]
        self.assertEqual(self.report["namedEntries"], len(named))
        self.assertEqual(self.report["unidentifiedSymbols"], len(points) - len(named))
        region_ids = [i for r in self.v["regions"] for i in r["pointIds"]]
        self.assertCountEqual(ids, region_ids)
        self.assertEqual(len(region_ids), len(set(region_ids)))
        for p in points:
            self.assertTrue(0 <= p["x"] < self.v["mapWidth"])
            self.assertTrue(0 <= p["y"] < self.v["mapHeight"])

    def test_symbol_provenance_is_not_reused(self):
        candidate_ids = [i for p in self.v["controlPoints"]
                         for i in p.get("reviewedCandidateIds", [])]
        self.assertEqual(len(candidate_ids), len(set(candidate_ids)))
        for p in self.v["controlPoints"]:
            if p["identificationStatus"] == "unidentified-symbol":
                self.assertTrue(p["id"].startswith("scan-site-"))
                self.assertIn("sem nome", p["label"])
                self.assertTrue(p["reviewedCandidateIds"])
            if p["identificationStatus"] == "companion-map-review":
                self.assertTrue(any(e["kind"] == "companion-scan" for e in p["evidence"]))

    def test_source_records_fully_accounted(self):
        for route in self.v["routes"]:
            source = next(c for c in self.source["characters"] if c["id"] == route["id"])
            expected = {r["index"] for r in source["records"]}
            imported = [s["sourceRecordIndex"] for s in route["segments"] + route["positions"]
                        if s["sourceRecordIndex"] is not None]
            omitted = route["omittedSourceRecordIndices"]
            self.assertEqual(len(imported), len(set(imported)))
            self.assertFalse(set(imported) & set(omitted))
            self.assertEqual(expected, set(imported) | set(omitted))
            self.assertEqual(len(expected), len(imported) + len(omitted))

    def test_no_positions_interpolated_or_chapter_spoilers_added(self):
        self.assertEqual(self.v["chapters"], self.old["chapters"])
        for route in self.v["routes"]:
            previous = next(r for r in self.old["routes"] if r["id"] == route["id"])
            for old in previous["positions"]:
                current = next(p for p in route["positions"]
                               if p["sourceRecordIndex"] == old["sourceRecordIndex"])
                expected = dict(old)
                if route["id"] == "tyrion" and old["sourceRecordIndex"] == 4:
                    expected["endChapter"] = 23
                    self.assertIn("chronologyRevision", current)
                self.assertEqual(expected, {k: v for k, v in current.items()
                                            if k != "chronologyRevision"})
            source = next(c for c in self.source["characters"] if c["id"] == route["id"])
            for segment in route["segments"]:
                index = segment["sourceRecordIndex"]
                if index is not None:
                    raw = next(r["record"] for r in source["records"]
                               if r["index"] == index)["chapters"]
                    start, end = ((raw, 72) if isinstance(raw, int) else
                                  (raw[0], min(raw[1], 72) if len(raw) == 2 else 72))
                    corrected = {("tyrion", 11): 62, ("jaime", 6): 40, ("jaime", 8): 59}
                    if (route["id"], index) in corrected:
                        self.assertEqual(segment["chronologyRevision"]["originalStartChapter"], start)
                        start = corrected[(route["id"], index)]
                    self.assertEqual([start, end], [segment["startChapter"], segment["endChapter"]])
                else:
                    self.assertEqual(segment["origin"], "narrative-supplement")
                    self.assertTrue(segment["derivedSourceRecordIndices"])
                    self.assertTrue(any(e["kind"] == "book-scene" for e in segment["evidence"]))
                for x, y in segment["points"]:
                    self.assertTrue(0 <= x < self.v["mapWidth"])
                    self.assertTrue(0 <= y < self.v["mapHeight"])

    def test_route_revisions_and_cat_transport(self):
        revised = [s for r in self.v["routes"] for s in r["segments"]
                   if s.get("geometryStatus") == "manual-route-review-v1"]
        self.assertEqual(len(revised), len(self.route_report["reviewedSegments"]))
        self.assertEqual(len(revised), 54)
        cat = next(r for r in self.v["routes"] if r["id"] == "catelyn")
        journey = next(s for s in cat["segments"] if s["sourceRecordIndex"] == 1)
        self.assertNotIn(1, cat["omittedSourceRecordIndices"])
        self.assertEqual(journey["startChapter"], 18)
        self.assertEqual(journey["points"][0], [3640, 3720])
        self.assertIn([4100, 4590], journey["points"])
        self.assertEqual(journey["points"][-1], [4350, 7400])
        self.assertEqual([leg["mode"] for leg in journey["transportLegs"]],
                         ["land", "embarkation", "sea"])
        dany = next(r for r in self.v["routes"] if r["id"] == "daenerys")
        self.assertEqual([s["startChapter"] for s in dany["segments"]], [23, 36, 61])
        self.assertEqual(dany["segments"][0]["points"][0], [6415, 7325])
        self.assertEqual(dany["segments"][1]["points"][-1], [13845, 6830])
        self.assertIn("aldeia", dany["segments"][2]["geometryNotice"])

    def test_sheet_and_book_context_are_not_geometry_proof(self):
        sheet = read("planilha-v3-referencia.json")
        self.assertEqual(sheet["gid"], "1740264601")
        self.assertTrue(all(0 <= r["chapterIndex"] <= 72 for r in sheet["rows"]))
        self.assertIn("not canonical dates", sheet["policy"])
        self.assertIn("coordinates", sheet["policy"])
        cat = next(r for r in self.v["routes"] if r["id"] == "catelyn")
        self.assertTrue(any(e["kind"] == "book-scene" for e in cat["evidence"]))
        self.assertTrue(any(e["kind"] == "spreadsheet" for e in cat["evidence"]))
        self.assertIn("NAO exaustivo", self.v["inventory"]["coverageNotice"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
