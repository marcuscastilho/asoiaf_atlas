"""Check route continuity, source lineage and spoiler corrections independently."""
import hashlib
import json
from pathlib import Path
import unittest

DATA = Path(__file__).resolve().parents[1] / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class RouteReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = read("atlas-inventario-v3-pre-percursos-v1.json")
        cls.current = read("atlas-inventario-v3.json")
        cls.routes = {r["id"]: r for r in cls.current["routes"]}
        cls.source = {c["id"]: c for c in read("portal-agot-v2-referencia.json")["characters"]}

    def test_frozen_input_and_physical_map_are_preserved(self):
        expected = "605192a25ce5c49864ddc16a6e6ebcefe4c4789b9042067285acc3571540186f"
        self.assertEqual(hashlib.sha256(
            (DATA / "atlas-inventario-v3-pre-percursos-v1.json").read_bytes()).hexdigest(), expected)
        for key in ("controlPoints","regions","chapters","referenceMaps","referenceCorrections",
                    "mapWidth","mapHeight","tileSetId","sourceSha256","coordinateSystem"):
            self.assertEqual(self.current[key], self.base[key])
        self.assertEqual(len(self.current["controlPoints"]), 182)

    def test_each_drawn_itinerary_is_continuous(self):
        for cid, route in self.routes.items():
            segments = route["segments"]
            self.assertEqual([s["startChapter"] for s in segments],
                             sorted(s["startChapter"] for s in segments))
            for earlier, later in zip(segments, segments[1:]):
                self.assertEqual(earlier["points"][-1], later["points"][0],
                                 f"{cid}: {earlier['label']} -> {later['label']}")

    def test_supplements_do_not_claim_to_be_portal_records(self):
        for cid, route in self.routes.items():
            originals = {r["index"] for r in self.source[cid]["records"]}
            for item in route["segments"] + route["positions"]:
                if item["sourceRecordIndex"] is None:
                    self.assertTrue(item["derivedSourceRecordIndices"])
                    self.assertLessEqual(set(item["derivedSourceRecordIndices"]), originals)
                    self.assertTrue(any(e["kind"] == "book-scene" for e in item["evidence"]))
            coverage = route["coverage"]
            for key, records in (("segmentRecords",route["segments"]),
                                 ("positionRecords",route["positions"])):
                self.assertEqual(coverage[key], sum(r["sourceRecordIndex"] is not None
                                                    for r in records))
            self.assertEqual(coverage["sourceRecords"],
                             coverage["segmentRecords"] + coverage["positionRecords"] +
                             len(route["omittedRecords"]))

    def test_tyrion_returns_to_winterfell_before_capture(self):
        route = self.routes["tyrion"]
        def position_at(chapter):
            return [p["locationId"] for p in route["positions"]
                    if p["startChapter"] <= chapter <= p["endChapter"]]
        self.assertEqual(position_at(23), ["Castle_Black"])
        self.assertEqual(position_at(24), ["Winterfell"])
        self.assertEqual(position_at(28), ["scan-site-4116-6426"])
        self.assertEqual(position_at(56), ["scan-site-4116-6426"])
        self.assertEqual(position_at(62), [])
        self.assertEqual(position_at(69), ["scan-site-4116-6426"])
        battle = next(s for s in route["segments"] if s["sourceRecordIndex"] == 11)
        self.assertEqual(battle["startChapter"], 62)

    def test_no_early_siege_or_region_claimed_as_a_city(self):
        jaime = self.routes["jaime"]
        self.assertEqual(next(s["startChapter"] for s in jaime["segments"]
                              if s["sourceRecordIndex"] == 6), 40)
        self.assertEqual(next(s["startChapter"] for s in jaime["segments"]
                              if s["sourceRecordIndex"] == 8), 59)
        dany = self.routes["daenerys"]
        self.assertEqual(len(dany["positions"]), 2)
        self.assertEqual({p["locationId"] for p in dany["positions"]}, {"Pentos","Vaes_Dothrak"})
        self.assertIn(8, dany["omittedSourceRecordIndices"])
        self.assertIn("nao esta identificada", dany["segments"][-1]["geometryNotice"])

    def test_nonoverlapping_book_positions_and_explicit_transport(self):
        for route in self.routes.values():
            for chapter in range(73):
                matches = [p for p in route["positions"]
                           if p["startChapter"] <= chapter <= p["endChapter"]]
                self.assertLessEqual(len(matches), 1)
            for segment in route["segments"]:
                if segment["travelMode"] == "mixed":
                    legs = segment["transportLegs"]
                    self.assertEqual(legs[0]["startVertex"], 0)
                    self.assertEqual(legs[-1]["endVertex"], len(segment["points"])-1)
                    for earlier, later in zip(legs,legs[1:]):
                        self.assertEqual(earlier["endVertex"], later["startVertex"])
                    for leg in legs:
                        self.assertTrue(0 <= leg["startVertex"] < leg["endVertex"] <
                                        len(segment["points"]))

    def test_all_characters_reviewed_without_inventing_brans_execution_site(self):
        self.assertEqual(len(self.routes), 12)
        self.assertEqual(self.routes["bran"]["segments"], [])
        self.assertIn(1, self.routes["bran"]["omittedSourceRecordIndices"])
        for cid, route in self.routes.items():
            if cid != "bran":
                self.assertTrue(route["segments"])
            for segment in route["segments"]:
                self.assertEqual(segment["geometryStatus"], "manual-route-review-v1")
                self.assertIn("nao caminho exato", segment["geometryNotice"])
                self.assertTrue(segment["label"])
        self.assertEqual(len({r["color"] for r in self.routes.values()}),12)


if __name__ == "__main__":
    unittest.main(verbosity=2)
