"""Check the naming revision independently of its builder and reference locator."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import unicodedata
import unittest

DATA = Path(__file__).resolve().parents[1] / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class ReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base = read("atlas-inventario-v3-pre-referencias-v1.json")
        cls.new = read("atlas-inventario-v3-referencias-candidato.json")
        cls.cfg = read("identificacoes-ocidente-oriente-v1.json")
        cls.report = read("inventario-v3-referencias-diagnostico.json")
        cls.points = cls.new["controlPoints"]
        cls.by_id = {p["id"]: p for p in cls.points}

    def test_physical_map_and_all_story_records_unchanged(self):
        self.assertEqual(Counter((p["x"], p["y"]) for p in self.base["controlPoints"]),
                         Counter((p["x"], p["y"]) for p in self.points))
        for key in ("routes", "chapters", "tileSetId", "sourceSha256", "cropBoxOriented",
                    "mapWidth", "mapHeight", "coordinateSystem"):
            self.assertEqual(self.base[key], self.new[key])
        for p in read("atlas-agot-v2.json")["controlPoints"]:
            self.assertEqual([p["x"], p["y"]],
                             [self.by_id[p["id"]]["x"], self.by_id[p["id"]]["y"]])

    def test_every_anonymous_symbol_accounted_for_once(self):
        before = [p for p in self.base["controlPoints"]
                  if p["identificationStatus"] == "unidentified-symbol"]
        expected = {p["id"] for p in before}
        by_candidate = {c: p for p in before for c in p["reviewedCandidateIds"]}
        specs = self.cfg["westernIdentifications"] + self.cfg["unidentifiedContext"]
        actual = [by_candidate[s["candidateId"]]["id"] for s in specs]
        self.assertEqual(expected, set(actual))
        self.assertEqual(len(actual), len(set(actual)))
        self.assertEqual(len(self.points), 182)
        unnamed = [p for p in self.points if p["identificationStatus"] == "unidentified-symbol"]
        self.assertEqual(len(unnamed), 3)
        self.assertEqual({c for p in unnamed for c in p["reviewedCandidateIds"]},
                         {86, 624, 638})
        self.assertEqual(self.report["namedEntries"], 179)
        self.assertEqual(self.report["unidentifiedSymbols"], 3)
        for p in unnamed:
            self.assertIn("sem nome", p["label"])
            self.assertTrue(any(e["kind"] == "companion-region" for e in p["evidence"]))

    def test_storms_end_bronzegate_identity_pair_is_corrected(self):
        bronze = self.by_id["Bronzegate"]
        storm = self.by_id["Storm%27s_End"]
        self.assertEqual([bronze["x"], bronze["y"]], [4818, 7882])
        self.assertEqual([storm["x"], storm["y"]], [4978, 8094])
        self.assertEqual(bronze["label"], "Portabr\u00f4nzea")
        self.assertEqual(storm["label"], "Ponta Tempestade")
        self.assertEqual(bronze["previousIdentification"]["label"], "Ponta Tempestade")
        self.assertEqual(storm["previousIdentification"]["id"], "scan-site-4978-8094")
        self.assertEqual(storm["identificationStatus"], "companion-map-review")

    def test_names_are_unique_and_closeup_corrections_are_preserved(self):
        self.assertEqual(len(self.by_id), len(self.points))
        names = [unicodedata.normalize("NFC", p["label"]).casefold() for p in self.points]
        self.assertEqual(len(names), len(set(names)))
        for cid, label, english in (
                (133, "Bosque Afundado", "Sunkenwood"),
                (191, "Salinas", "Saltpans"),
                (206, "Lagoa da Donzela", "Maidenpool")):
            p = next(p for p in self.points if cid in p.get("reviewedCandidateIds", []))
            self.assertEqual((p["label"], p["english"]), (label, english))

    def test_eastern_references_do_not_reidentify_or_move_places(self):
        before = {p["id"]: p for p in self.base["controlPoints"]}
        for spec in self.cfg["easternReferences"]:
            p = self.by_id[spec["pointId"]]
            old = before[p["id"]]
            for key in ("label", "english", "x", "y", "kind", "identificationStatus"):
                self.assertEqual(old[key], p[key])
            refs = [e for e in p["evidence"] if e.get("sourceSha256") ==
                    self.cfg["referenceMaps"][1]["sha256"]]
            self.assertEqual(len(refs), 1)
            x0, y0, x1, y1 = refs[0]["referenceCropSourcePixels"]
            self.assertTrue(0 <= x0 < x1 <= 14484 and 0 <= y0 < y1 <= 21653)

    def test_inputs_and_frozen_book_audit_membership(self):
        for name, expected in self.new["inputSha256"].items():
            self.assertEqual(hashlib.sha256((DATA / name).read_bytes()).hexdigest(), expected)
        self.assertEqual(hashlib.sha256(
            (DATA / "atlas-inventario-v3-pre-referencias-v1.json").read_bytes()).hexdigest(),
            self.cfg["baseDatasetSha256"])
        entries = read("nomes-inventario-v3-evidencias.json")["entries"]
        self.assertEqual(len(entries), 115)
        for entry in entries:
            p = self.by_id[entry["id"]]
            self.assertEqual(p["label"], entry["label"])
            self.assertNotEqual(p["identificationStatus"], "unidentified-symbol")


if __name__ == "__main__":
    unittest.main(verbosity=2)
