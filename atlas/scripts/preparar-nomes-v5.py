"""Apply lead-reviewed identities, never infer a proper name from proximity."""
import argparse
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
EVIDENCE = ROOT / "test/evidencias"
CONFIG = "identificacoes-v5-revisadas.json"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def build():
    cfg = read(CONFIG)
    assert digest(DATA / "atlas-inventario-v4.json") == cfg["baseDatasetSha256"]
    base = read("atlas-inventario-v4.json")
    portal = read("portal-saga-v4-referencia.json")["locations"]
    for ref in cfg["referenceMaps"]:
        assert digest(ROOT.parent / ref["file"]) == ref["sha256"], ref["file"]
    result = copy.deepcopy(base)
    result["datasetId"] = "atlas-saga-v5"
    original = {p["id"]: p for p in base["controlPoints"]}
    points = {p["id"]: p for p in result["controlPoints"]}
    unknown = {p["id"] for p in points.values()
               if p.get("identificationStatus") == "unidentified-symbol"}
    assert len(unknown) == 56
    west = [p["id"] for p in base["controlPoints"] if p["id"] in unknown and p["x"] < 5500]
    east = [p["id"] for p in base["controlPoints"] if p["id"] in unknown and p["x"] >= 5500]
    decisions = []
    touched = set()
    proofs = set()

    def inspect(pid, disposition, spec, proof=None):
        assert pid not in touched and pid in unknown, pid
        touched.add(pid)
        if not proof:
            collection, prefix = (west, "ocidente") if pid in west else (east, "outros")
            proof = f"nomes-v5-{prefix}-{collection.index(pid)//6*6:02}.png"
        path = EVIDENCE / proof
        assert path.exists(), path
        proofs.add(proof)
        row = {"pointId": pid, "disposition": disposition,
               "before": copy.deepcopy(original[pid]), "decision": copy.deepcopy(spec),
               "proofImage": "atlas/test/evidencias/" + proof}
        decisions.append(row)
        return row

    def apply(p, spec, status, proof, summary):
        p["label"] = spec["label"]
        p["english"] = spec["english"]
        p["status"] = "manual-review"
        p["identificationStatus"] = status
        p["namingRevision"] = cfg["revision"]
        p["summary"] = summary
        p["evidence"].append({
            "kind": "naming-review",
            "label": "Revisao visual individual; nome proprio ou descricao explicitamente distinguidos",
            "locator": "atlas/data/" + CONFIG + "; " + p["id"],
            "comparisonSheet": proof,
        })

    for spec in cfg["properIdentifications"]:
        pid = spec["id"]
        p = points[pid]
        dictionary = portal.get(spec["key"], {})
        label = spec.get("label") or dictionary["label"]
        english = spec.get("english") or dictionary["english"]
        row = inspect(pid, "proper-name-associated", spec, spec.get("proofImage"))
        apply(p, {"label": label, "english": english}, "companion-map-review",
              row["proofImage"],
              "Nome associado pela correspondencia do simbolo e da geografia nas "
              "referencias cartograficas. Centro e correspondencia continuam em revisao.")
        p["labelType"] = "proper-name"
        p["originalKey"] = spec["key"]
        aliases = spec.get("aliases", []) + [dictionary.get("label"), dictionary.get("english")]
        p["aliases"] = sorted({v for v in aliases if v and v not in (label, english)})
        p["note"] = (
            "Identidade cartografica revista; grafia portuguesa do dicionario do portal "
            "quando disponivel, sem certificacao literaria independente desta grafia. "
            "A janela de registro apenas ajudou a localizar a comparacao, nao atribuiu a identidade.")
        ref = cfg["referenceMaps"][0 if p["x"] < 5500 else 2]
        p["evidence"].append({
            "kind": "companion-scan",
            "label": "Simbolo, costa, rios, estradas e vizinhos comparados manualmente",
            "locator": ref["file"],
            "sourceSha256": ref["sha256"],
            "comparisonSheet": row["proofImage"],
        })
        if "coordinateCorrection" in spec:
            assert not any(pid == pos["locationId"] for r in result["routes"] for pos in r["positions"])
            p["coordinateRevision"] = {
                "before": [p["x"],p["y"]], "after": spec["coordinateCorrection"],
                "reason": spec["reason"], "proofImage": row["proofImage"],
            }
            p["x"],p["y"] = spec["coordinateCorrection"]
        row["afterLabel"] = label
        row["afterEnglish"] = english

    for spec in cfg["geographicDescriptions"]:
        pid = spec["id"]
        p = points[pid]
        row = inspect(pid, "geographic-description-not-proper-name", spec)
        apply(p, spec, "geographically-described", row["proofImage"],
              "Descricao geografica do simbolo: " + spec["context"] +
              ". Nao foi localizado nome proprio individual nas referencias consultadas.")
        p["labelType"] = "geographic-description"
        p["originalKey"] = None
        p["note"] = (
            "O rotulo e uma descricao editorial de localizacao, nao um nome canonico "
            "nem uma traducao nova. Nao associar este edificio a outro lugar por proximidade.")

    for spec in cfg["fiveForts"]["members"]:
        pid = spec["id"]
        if "newPoint" in spec:
            assert pid not in points
            x,y = spec["newPoint"]
            p = {"id": pid, "x":x, "y":y, "kind":"castle", "region":"oriente",
                 "reviewedCandidateIds":[], "evidence":[]}
            points[pid] = p
            result["controlPoints"].append(p)
            next(r for r in result["regions"] if r["id"] == "oriente")["pointIds"].append(pid)
            proofs.add(cfg["fiveForts"]["proofImage"])
            row = {"pointId":pid, "disposition":"missing-group-member-added",
                   "decision":copy.deepcopy(spec),
                   "proofImage":"atlas/test/evidencias/"+cfg["fiveForts"]["proofImage"]}
            decisions.append(row)
        else:
            p = points[pid]
            row = inspect(pid, "named-group-member-not-individual-name", spec,
                          cfg["fiveForts"]["proofImage"])
        apply(p, spec, "named-group-member", row["proofImage"],
              "Uma das cinco fortalezas do conjunto Cinco Fortes. O sufixo indica "
              "apenas sua localizacao relativa na digitalizacao, nao um nome proprio individual.")
        p["labelType"] = "group-member"
        p["originalKey"] = "Five_Forts"
        p["aliases"] = ["Cinco Fortes", "Five Forts"]
        p["note"] = cfg["fiveForts"]["policy"]

    rejected = {s["id"] for s in cfg["rejectedNonSymbols"]}
    for spec in cfg["rejectedNonSymbols"]:
        pid = spec["id"]
        assert not any(pid == pos["locationId"] for r in result["routes"] for pos in r["positions"])
        inspect(pid, "rejected-terrain-not-settlement", spec, spec["proofImage"])
        del points[pid]
    result["controlPoints"] = [p for p in result["controlPoints"] if p["id"] not in rejected]
    for region in result["regions"]:
        region["pointIds"] = [pid for pid in region["pointIds"] if pid not in rejected]
    assert touched == unknown, (unknown-touched, touched-unknown)

    result["inputSha256"].update({
        CONFIG: digest(DATA / CONFIG),
        "atlas-inventario-v4.json": cfg["baseDatasetSha256"],
    })
    result["namingRevision"] = {
        "id": cfg["revision"], "baseDatasetSha256": cfg["baseDatasetSha256"],
        "decisionFile": "atlas/data/"+CONFIG,
        "diagnostic": "atlas/data/nomes-v5-diagnostico.json",
        "scriptSha256": digest(Path(__file__)),
        "policy": cfg["policy"],
    }
    result["inventory"].update({
        "entries": 240, "namedEntries":217, "unidentifiedSymbols":18,
        "collectivelyIdentifiedFortresses":5, "geographicDescriptionsWithoutProperName":18,
        "properNamesNewlyAssociated":31,
        "namingNotice":"217 nomes associados, 5 membros dos Cinco Fortes e 18 descricoes "
                       "geograficas sem nome proprio localizado. Descricao nao e nome canonico.",
        "glyphCorrectionNotice":"3 falsos simbolos de terreno removidos, 1 centro de castelo "
                                "corrigido e a fortaleza central dos Cinco Fortes acrescentada.",
    })
    result["limitations"].append(
        "Revisao dos56 pontos anteriormente anonimos:31 nomes associados,4 membros de "
        "um grupo nomeado,18 descricoes geograficas e3 falsas deteccoes descartadas. "
        "Um quinto membro ausente do grupo foi acrescentado. Nao ha nomes individuais "
        "inventados para edificios ou ruinas que as fontes consultadas nao nomeiam.")
    sidecar = copy.deepcopy(read("nomes-inventario-v4-evidencias.json"))
    sidecar["datasetId"] = result["datasetId"]
    sidecar["scopeNotice"] = "115 ocorrencias historicas preservadas; sem nova certificacao literaria dos31 nomes associados nesta revisao."
    report = {
        "datasetId":result["datasetId"], "baseDatasetSha256":cfg["baseDatasetSha256"],
        "entries":240, "newProperNames":31, "totalAssociatedProperNames":217,
        "namedGroupMembers":5, "describedWithoutProperName":18,
        "reviewedOriginalPoints":56, "removedNonSymbols":3, "newMissingSymbols":1,
        "coordinateCorrections":1,
        "decisions":decisions,
        "proofSha256":{name:digest(EVIDENCE / name) for name in sorted(proofs)},
        "referenceMaps":cfg["referenceMaps"], "policy":cfg["policy"],
    }
    validate(result, base, report)
    return result,sidecar,report


def validate(result, base, report):
    ps = result["controlPoints"]
    ids = [p["id"] for p in ps]
    assert len(ids) == len(set(ids)) == 240
    membership = [pid for r in result["regions"] for pid in r["pointIds"]]
    assert len(membership) == len(set(membership)) == 240 and set(membership) == set(ids)
    assert result["routes"] == base["routes"]
    for key in ("chapters","books","mapId","tileSetId","sourceSha256","coordinateSystem",
                "mapWidth","mapHeight","cropBoxOriented","locationAliases"):
        assert result[key] == base[key], key
    new = {p["id"]:p for p in ps}
    for old in base["controlPoints"]:
        if old.get("identificationStatus") != "unidentified-symbol":
            assert old == new[old["id"]], old["id"]
        if old["id"] in new and old["id"] != "scan-site-v4-300":
            p = new[old["id"]]
            assert [p["x"],p["y"]] == [old["x"],old["y"]]
    assert sum(p.get("identificationStatus") == "geographically-described" for p in ps) == 18
    assert sum(p.get("identificationStatus") == "named-group-member" for p in ps) == 5
    assert sum(p.get("labelType") == "proper-name" for p in ps) == 31
    assert len(report["decisions"]) == 57
    for p in ps:
        assert 0 <= p["x"] < result["mapWidth"] and 0 <= p["y"] < result["mapHeight"]
        assert "sem nome" not in p["label"].lower() and "sem identificação" not in p["label"].lower()
    assert new["scan-site-v4-475"]["label"] == "Ghaston Grey"
    assert "Sinistres Gris" in new["scan-site-v4-475"]["aliases"]
    assert [new["scan-site-v4-300"]["x"],new["scan-site-v4-300"]["y"]] == [4806,8216]
    assert [new["Five_Forts_Central"]["x"],new["Five_Forts_Central"]["y"]] == [19586,9116]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace-candidate",action="store_true")
    args = parser.parse_args()
    result,sidecar,report = build()
    values = {"atlas-inventario-v5-candidato.json":result,
              "nomes-inventario-v5-evidencias-candidato.json":sidecar,
              "nomes-v5-diagnostico-candidato.json":report}
    encoded = {name:json.dumps(value,ensure_ascii=True,indent=2)+"\n" for name,value in values.items()}
    for name,text in encoded.items():
        path = DATA / name
        if path.exists() and path.read_text(encoding="utf-8") != text and not args.replace_candidate:
            raise ValueError("Candidate differs; explicit --replace-candidate required: "+name)
    for name,text in encoded.items():
        (DATA / name).write_text(text,encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k not in
                     ("decisions","proofSha256","referenceMaps")},indent=2))


if __name__ == "__main__":
    main()
