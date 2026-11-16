"""Independent semantic gates for the curated v4 candidate, not measured accuracy."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def main():
    data = read("atlas-inventario-v4-candidato.json")
    base = read("atlas-inventario-v3.json")
    review = read("cobertura-simbolos-v4-revisada.json")
    diag = read("saga-v4-diagnostico-candidato.json")
    routes = {r["id"]: r for r in data["routes"]}
    checks = []

    def check(name, value):
        checks.append({"name": name, "passed": bool(value)})
        if not value:
            raise AssertionError(name)

    def at(cid, chapter):
        return [p["locationId"] for p in routes[cid]["positions"]
                if p["startChapter"] <= chapter <= p["endChapter"]]

    def new_segment(cid, chapter):
        return [s for s in routes[cid]["segments"]
                if s["startChapter"] == chapter and s["sourceRecordIndex"] is None]

    check("frozen v3", hashlib.sha256((DATA / "atlas-inventario-v3.json").read_bytes()).hexdigest()
          == "0a982e04f7a3ffd7a0d3923a059b5002f847bd131267b948a590d302d7718ef5")
    check("all182 old physical points preserved", data["controlPoints"][:182] == base["controlPoints"])
    check("344 chapters exclude unpublished preview",
          [c["index"] for c in data["chapters"]] == list(range(344)))
    check("five exact book boundaries", [(b["startChapter"], b["endChapter"]) for b in data["books"]]
          == [(0,72),(73,142),(143,224),(225,270),(271,343)])
    check("242 points and27 profiles", len(data["controlPoints"]) == 242 and len(routes) == 27)
    check("49 visually accepted and11 manual glyphs",
          len(review["acceptedCandidateIds"]) == 49 and len(review["manualSymbols"]) == 11)
    check("186 named56 anonymous, not guessed", data["inventory"]["namedEntries"] == 186
          and data["inventory"]["unidentifiedSymbols"] == 56)
    check("Dany does not reach Qarth in85", at("daenerys",85) == ["Vaes_Tolorro"]
          and at("daenerys",100) == ["Qarth"] and bool(new_segment("daenerys",100)))
    check("Dany Slavers Bay order", at("daenerys",166) == ["Astapor"]
          and at("daenerys",185) == ["Yunkai"] and at("daenerys",200) == ["Meereen"])
    check("Dany flight not falsely pinned in Meereen", not at("daenerys",323) and not at("daenerys",342))
    check("Tyrion Pentos272 not prologue271", not at("tyrion",271) and at("tyrion",272) == ["Pentos"])
    check("Sam Oldtown AFFC270 not ADWD281", at("samwell",270) == ["Oldtown"]
          and bool(new_segment("samwell",270)) and not at("samwell",269))
    check("Robb not yet back145", not at("robb",145) and at("robb",157) == ["Riverrun"])
    check("living markers stop at death gates", all(not at(cid,cap) for cid,cap in (
        ("eddard",65),("robert",49),("renly",106),("robb",194),("catelyn",194),
        ("joffrey",203),("tywin",220))))
    check("Bran Queenscrown183 not181", not at("bran",181) and at("bran",183) == ["Queenscrown"])
    check("Bran no invented calibrated Nightfort", not at("bran",199))
    check("Sansa descends266", at("sansa",265) == ["Eyrie"] and not at("sansa",266))
    check("Arya escaped Harrenhal137", at("arya",136) == ["Harrenhal"] and not at("arya",137))
    check("Theon not held in Moat until307", at("theon",303) == ["Barrowton"])
    check("Theon escape322 stops city marker", at("theon",321) == ["Winterfell"] and not at("theon",322))
    check("Brienne already out of capital229", not at("brienne",229))
    check("Jon departed Fist117", not at("jon",117))
    check("Sam not held at Fist after attack", not at("samwell",144))
    check("Jovem Griff identity not prematurely named in selector",
          routes["aegon"]["character"] == "Jovem Griff")
    check("river geometry explicit and legged",
          all(s["travelMode"] == "river" and s["transportLegs"][0]["mode"] == "river"
              for s in routes["tyrion"]["segments"] if s["startChapter"] in (285,289,293,298)))
    check("single-mode sea legs explicit", all(
        len(s["transportLegs"]) == 1 and s["transportLegs"][0]["mode"] == "sea"
        for r in routes.values() for s in r["segments"]
        if s["sourceRecordIndex"] is None and s["travelMode"] == "sea"))
    check("all546 original records accounted once", len(diag["sourceLedger"]) == 546
          and len({(r["character"],r["sourceRecordIndex"]) for r in diag["sourceLedger"]}) == 546)
    for name, expected in data["inputSha256"].items():
        check("unchanged input " + name,
              hashlib.sha256((DATA / name).read_bytes()).hexdigest() == expected)
    result = {
        "passed": len(checks), "failed": 0, "checks": checks,
        "datasetSha256": hashlib.sha256((DATA / "atlas-inventario-v4-candidato.json").read_bytes()).hexdigest(),
        "notice": "Internal data and scene gates only. Native corridor diagrams were inspected separately. "
                  "This does not certify exact routes or an exhaustive symbol census.",
    }
    (ROOT / "test/evidencias/saga-v4-auditoria-dados.json").write_text(
        json.dumps(result,ensure_ascii=True,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k != "checks"},indent=2))


if __name__ == "__main__":
    main()
