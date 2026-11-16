"""Domain checks authored against the reviewed scenes, not portal offsets."""
import argparse
import hashlib
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
BASE_SHA = "e100756cbc9be874128db96ef6af540e8f6720312ff45df4086774e29e4d8999"
EXPECTED_RELEASES = {
    "jon": [86, 96], "samwell": [86, 96], "asha": [123, 129],
    "victarion": [123, 334], "arya": [99, 156, 217],
    "littlefinger": [138, 138], "theon": [291, 303, 308],
    "aegon": [332, 332], "tyrion": [311, 318],
}
EXPECTED_POSITIONS = {
    "jon-v6-pos-86": (86, "scan-v4-white-tree-glyph"),
    "samwell-v6-pos-86": (86, "scan-v4-white-tree-glyph"),
    "asha-v6-pos-123": (123, "Deepwood_Motte"),
    "arianne-v6-pos-238": (238, "Sunspear"),
    "aegon-v6-pos-332": (332, "scan-site-v4-300"),
}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=DATA / "atlas-percursos-v6-candidato.json")
    parser.add_argument("--diagnostic", type=Path, default=DATA / "percursos-v6-diagnostico-candidato.json")
    args = parser.parse_args()
    base_path = DATA / "atlas-inventario-v5.json"
    assert hashlib.sha256(base_path.read_bytes()).hexdigest() == BASE_SHA
    old, new, report = load(base_path), load(args.dataset), load(args.diagnostic)
    assert report["datasetSha256"] == hashlib.sha256(args.dataset.read_bytes()).hexdigest()
    assert report["inputs"]["atlas-inventario-v5.json"] == BASE_SHA
    if args.dataset.name == "atlas-percursos-v6.json":
        assert report["geometryReviewStatus"] == "lead-reviewed-native-corridors-v6"
        assert report["geometryReview"]["datasetSha256"] == report["datasetSha256"]
    assert report["totals"] == {
        "characters": 27, "controlPoints": 240, "segments": 133,
        "positions": 157, "bookCharacterRows": 135,
    }
    for key in ("controlPoints", "regions", "calibration", "books", "chapters",
                "mapId", "tileSetId", "sourceSha256", "namingRevision", "locationAliases"):
        assert new[key] == old[key], key
    assert len(new["chapters"]) == 344
    chapters = {c["globalIndex"]: c for c in load(DATA / "indice-livros-v4.json")["chapters"]}
    previous = {r["id"]: r for r in old["routes"]}
    current = {r["id"]: r for r in new["routes"]}
    assert set(previous) == set(current)
    old_segments = {s["id"]: s for r in previous.values() for s in r["segments"]}
    segments = {s["id"]: s for r in current.values() for s in r["segments"]}
    assert len(segments) == 133
    removed = {"jon-v4-96-2", "samwell-v4-96-0"}
    assert old_segments.keys() - segments.keys() == removed
    assert all(segments[sid] == s for sid, s in old_segments.items() if sid not in removed)
    assert len(segments.keys() - old_segments.keys()) == 20
    positions = {p["id"]: p for r in current.values() for p in r["positions"]}
    old_positions = {p["id"]: p for r in previous.values() for p in r["positions"]}
    assert len(positions) == 157
    assert positions.keys() - old_positions.keys() == EXPECTED_POSITIONS.keys()
    amendments = []
    for pid, p in old_positions.items():
        if positions[pid] != p:
            amendments.append(pid)
            assert pid.startswith("littlefinger-") and p["startChapter"] == 135
            assert positions[pid]["startChapter"] == 138
            assert {k for k in p if p[k] != positions[pid][k]} == {
                "startChapter", "evidence", "note"}
    assert len(amendments) == 1
    for pid, (cap, loc) in EXPECTED_POSITIONS.items():
        p = positions[pid]
        assert p["startChapter"] == p["endChapter"] == cap
        assert p["locationId"] == loc
    for cid, route in current.items():
        added = [s for s in route["segments"] if "-v6-" in s["id"]]
        assert [s["startChapter"] for s in added] == EXPECTED_RELEASES.get(cid, [])
        for f in added + [p for p in route["positions"] if "-v6-" in p["id"]]:
            found = []
            for ev in f["evidence"]:
                if ev["kind"] != "book-scene":
                    continue
                cap = int(re.search(r"capitulo global (\d+)", ev["label"]).group(1))
                assert cap <= f["startChapter"], (f["id"], "future evidence", cap)
                row = chapters[cap]
                assert ev["locator"] == f"{row['edition']}; {row['member']}#{row['anchor']}"
                found.append(cap)
            assert found, f["id"]
        for cap in range(344):
            assert sum(p["startChapter"] <= cap <= p["endChapter"]
                       for p in route["positions"]) <= 1
        assert len(route["bookCoverage"]) == 5
        assert {b["bookId"] for b in route["bookCoverage"]} == {b["id"] for b in new["books"]}
        for book, cell in zip(new["books"], route["bookCoverage"]):
            assert cell["bookId"] == book["id"]
            assert not re.search(r"%|\bcomplet[oa]\b", cell["notice"], re.I)
            lo, hi = book["startChapter"], book["endChapter"]
            assert cell["segmentsStartingInBook"] == len([
                s for s in route["segments"] if lo <= s["startChapter"] <= hi])
            assert cell["positionReferencesInBook"] == len([
                p for p in route["positions"] if p["startChapter"] <= hi and p["endChapter"] >= lo])
    matrix = [{"character": cid, **cell} for cid, r in current.items()
              for cell in r["bookCoverage"]]
    assert matrix == report["bookCharacterCoverage"]
    vic = next(s for s in current["victarion"]["segments"] if s["startChapter"] == 123)
    assert [leg["mode"] for leg in vic["transportLegs"]] == ["sea", "river", "land"]
    asha = next(s for s in current["asha"]["segments"] if s["startChapter"] == 123)
    assert [leg["mode"] for leg in asha["transportLegs"]] == ["sea", "land"]
    aegon = [s for s in current["aegon"]["segments"] if s["startChapter"] == 332]
    assert len(aegon) == 2 and aegon[1]["gapBefore"]
    assert [leg["mode"] for leg in aegon[0]["transportLegs"]] == ["river", "sea"]
    assert aegon[0]["points"][-1] != aegon[1]["points"][0]
    for cid in ("tyrion", "victarion"):
        assert not any(p["locationId"] == "Meereen" and p["endChapter"] >= 271
                       for p in current[cid]["positions"])
    assert current["arianne"]["segments"] == []  # Vaith ascent was thwarted.
    for cid, cutoff in {"robb": 194, "catelyn": 194, "eddard": 65, "joffrey": 203,
                        "tywin": 220, "robert": 49, "renly": 106}.items():
        assert all(p["endChapter"] < cutoff for p in current[cid]["positions"])
    print(json.dumps({
        "dataset": args.dataset.name,
        "datasetSha256": hashlib.sha256(args.dataset.read_bytes()).hexdigest(),
        "diagnosticSha256": hashlib.sha256(args.diagnostic.read_bytes()).hexdigest(),
        "verdict": "pass",
        "checks": [
            "113 retained v5 segments byte-equivalent as JSON objects; only two replaced",
            "20 new scene-gated segments; five scene-only positions; one corrected return boundary",
            "all new scene locators match the anchored book index, with no future-scene evidence",
            "135 inventory rows match actual publication-order ranges; no completeness percentage",
            "explicit maritime/fluvial/terrestrial legs, landing gap and unsupported-city exclusions",
            "frozen names, coordinates, books, legacy inputs and death cutoffs preserved",
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
