"""Apply manually reviewed names to a frozen inventory, never infer new pins."""
import copy
from collections import Counter
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
EVIDENCE = ROOT / "test/evidencias"
CONFIG = "identificacoes-ocidente-oriente-v1.json"
BASE = "atlas-inventario-v3-pre-referencias-v1.json"
WINDOWS = "identificacoes-cartograficas-janelas-v1.json"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def digest(data):
    return hashlib.sha256(data).hexdigest()


def freeze(name, data):
    path = DATA / name
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError("Frozen input differs: " + name)
    else:
        with path.open("xb") as stream:
            stream.write(data)


def write_candidate(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n",
                             encoding="utf-8")


def build():
    cfg = read(CONFIG)
    current_bytes = (DATA / BASE).read_bytes() if (DATA / BASE).exists() else (
        DATA / "atlas-inventario-v3.json").read_bytes()
    if digest(current_bytes) != cfg["baseDatasetSha256"]:
        raise ValueError("Unexpected base inventory; refusing implicit rebase")
    freeze(BASE, current_bytes)
    old_report_name = "inventario-v3-diagnostico-pre-referencias-v1.json"
    if not (DATA / old_report_name).exists():
        old_report_bytes = (DATA / "inventario-v3-diagnostico.json").read_bytes()
        old_report = json.loads(old_report_bytes)
        if (old_report["entries"], old_report["namedEntries"]) != (182, 115):
            raise ValueError("Expected original diagnostic before freezing")
        freeze(old_report_name, old_report_bytes)
    freeze(WINDOWS, (EVIDENCE / "ocidente-correspondencias-janelas.json").read_bytes())
    base = json.loads(current_bytes)
    result = copy.deepcopy(base)
    points = result["controlPoints"]
    initial_by_id = {p["id"]: p for p in points}
    windows = {w["pointId"]: w for w in read(WINDOWS)}
    maps = {m["id"]: m for m in cfg["referenceMaps"]}
    for ref in maps.values():
        with (ROOT.parent / ref["file"]).open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != ref["sha256"]:
                raise ValueError("Reference scan changed: " + ref["file"])

    anonymous = {}
    for p in points:
        if p["identificationStatus"] == "unidentified-symbol":
            for cid in p["reviewedCandidateIds"]:
                if cid in anonymous:
                    raise ValueError("Candidate belongs to multiple pins")
                anonymous[cid] = p
    touched = set()

    def anonymous_point(spec):
        p = anonymous[spec["candidateId"]]
        original_id = p["id"]
        if original_id in touched:
            raise ValueError("Same anonymous point assigned twice")
        touched.add(original_id)
        return p, original_id

    def reference(map_id, bbox, label, comparison=None):
        ref = maps[map_id]
        if len(bbox) != 4 or not (0 <= bbox[0] < bbox[2] and 0 <= bbox[1] < bbox[3]):
            raise ValueError("Invalid reference crop")
        scale = ref["draftScale"]
        ev = {
            "kind": "companion-scan",
            "label": label,
            "locator": ref["file"] + "; recorte de referencia " + str(bbox) +
                       " na copia de inspecao 1/" + str(scale),
            "sourceSha256": ref["sha256"],
            "referenceCropSourcePixels": [v * scale for v in bbox],
        }
        if comparison:
            ev["comparisonSheet"] = "atlas/test/evidencias/" + comparison
        return ev

    def identify(p, spec):
        previous = {
            "id": p["id"], "label": p["label"],
            "identificationStatus": p["identificationStatus"],
        }
        p["id"] = spec.get("replacementId", p["id"])
        p["label"] = spec["label"]
        p["english"] = spec.get("english", "")
        p["originalKey"] = p["english"].replace(" ", "_").replace("'", "%27")
        p["kind"] = spec.get("kind", p["kind"])
        p["status"] = "manual-review"
        p["identificationStatus"] = "companion-map-review"
        p["summary"] = spec.get("summary", "Localidade nomeada por correspondencia "
                               "do simbolo e da geografia com O Ocidente.")
        p["note"] = ("Nome transcrito do mapa regional. Correspondencia cartografica e "
                     "centro do simbolo em revisao; esta etapa nao certifica nomenclatura "
                     "de uma edicao literaria. Coordenada fisica do simbolo mantida.")
        p["referenceRevision"] = cfg["revision"]
        p["previousIdentification"] = previous

    corrections = []
    for spec in cfg["existingIdentityCorrections"]:
        p = initial_by_id[spec["pointId"]]
        if spec["candidateId"] not in p["reviewedCandidateIds"]:
            raise ValueError("Correction does not match original physical symbol")
        if spec["pointId"] in json.dumps(base["routes"]):
            raise ValueError("Correction touches a routed identity; explicit migration needed")
        identify(p, spec)
        for ev in p["evidence"]:
            if ev["kind"] == "scan":
                ev["label"] = "Simbolo do castelo no mapa-base; nome corrigido pelo mapa regional"
        p["evidence"].append(reference("ocidente", spec["referenceCropDraft"],
                                      "Portabronzea e Ponta Tempestade sao simbolos distintos",
                                      "ocidente-correcao-bronzegate-282.png"))
        corrections.append({
            "oldPointId": spec["pointId"], "newPointId": p["id"],
            "coordinate": [p["x"], p["y"]], "reason": spec["reason"],
        })

    for spec in cfg["westernIdentifications"]:
        p, original_id = anonymous_point(spec)
        window = windows[original_id]
        identify(p, spec)
        p["evidence"].append(reference(
            "ocidente", window["referenceCropDraft"],
            "Nome impresso e configuracao regional conferidos em O Ocidente",
            window["sheet"]))

    for spec in cfg["unidentifiedContext"]:
        p, original_id = anonymous_point(spec)
        p["summary"] = spec["summary"]
        p["note"] = "Referencia insular identificada; nome proprio desta edificacao nao estabelecido."
        window = windows[original_id]
        ev = reference("ocidente", window["referenceCropDraft"],
                       "Referencia regional; nome individual nao indicado", window["sheet"])
        ev["kind"] = "companion-region"
        p["evidence"].append(ev)

    expected_touched = {p["id"] for p in base["controlPoints"]
                        if p["identificationStatus"] == "unidentified-symbol"}
    if touched != expected_touched:
        raise ValueError("Every original anonymous symbol must be accounted for")

    final_by_id = {p["id"]: p for p in points}
    if len(final_by_id) != len(points):
        raise ValueError("Identity correction caused duplicate IDs")
    for spec in cfg["easternReferences"]:
        p = final_by_id[spec["pointId"]]
        if p["identificationStatus"] == "unidentified-symbol":
            raise ValueError("Eastern reference must not guess an anonymous identity")
        p["evidence"].append(reference(
            "oriente", spec["referenceCropDraft"],
            "Nome impresso tambem conferido em O Oriente"))

    # Identity correction may rename IDs, but never creates/deletes/moves a pin.
    if Counter((p["x"], p["y"]) for p in points) != Counter(
            (p["x"], p["y"]) for p in base["controlPoints"]):
        raise ValueError("Physical coordinate set changed")
    for key in ("routes", "chapters", "sourceSha256", "tileSetId", "cropBoxOriented"):
        if result[key] != base[key]:
            raise ValueError("Unexpected change outside naming scope: " + key)
    for region in result["regions"]:
        region["pointIds"] = [p["id"] for p in points if p["region"] == region["id"]]
    for p in read("atlas-agot-v2.json")["controlPoints"]:
        if [p["x"], p["y"]] != [final_by_id[p["id"]]["x"], final_by_id[p["id"]]["y"]]:
            raise ValueError("Original v2 control point changed")
    book_entries = read("nomes-inventario-v3-evidencias.json")["entries"]
    if any(e["id"] not in final_by_id or
           final_by_id[e["id"]]["identificationStatus"] == "unidentified-symbol"
           for e in book_entries):
        raise ValueError("Frozen book audit no longer matches named identities")

    counts = Counter(p["identificationStatus"] for p in points)
    result["inventory"]["entries"] = len(points)
    result["inventory"]["unidentifiedSymbols"] = counts["unidentified-symbol"]
    result["inventory"]["namedEntries"] = len(points) - counts["unidentified-symbol"]
    result["inventory"]["referenceNotice"] = (
        "Nomes revistos com O Ocidente e referencias adicionais em O Oriente. "
        "Correspondencia cartografica nao equivale a certificacao literaria.")
    result["inventory"]["bookAuditNotice"] = (
        "A auditoria opcional conserva seus 115 nomes anteriores. Novas associacoes "
        "recebem evidencia cartografica, sem nova certificacao nos livros.")
    result["referenceRevision"] = cfg["revision"]
    result["referenceMaps"] = copy.deepcopy(cfg["referenceMaps"])
    result["referenceCorrections"] = corrections
    result["inputSha256"].update({
        name: digest((DATA / name).read_bytes()) for name in (BASE, CONFIG, WINDOWS)
    })
    report = copy.deepcopy(read(old_report_name))
    report.update(result["inventory"])
    report.update({
        "referenceRevision": cfg["revision"],
        "newlyNamedEntries": len(cfg["westernIdentifications"]),
        "correctedPriorIdentityPairs": len(corrections),
        "easternReferenceEntries": len(cfg["easternReferences"]),
        "byKind": dict(Counter(p["kind"] for p in points)),
        "identificationStatusCounts": dict(counts),
    })
    write_candidate("atlas-inventario-v3-referencias-candidato.json", result)
    write_candidate("inventario-v3-referencias-diagnostico.json", report)
    print(json.dumps({k: report[k] for k in (
        "entries", "namedEntries", "unidentifiedSymbols", "newlyNamedEntries",
        "correctedPriorIdentityPairs", "easternReferenceEntries")}, indent=2))


if __name__ == "__main__":
    build()
