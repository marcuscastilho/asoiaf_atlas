"""Build a partial atlas from frozen inputs; never infer positions across gaps."""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "atlas/data"
SPEC = importlib.util.spec_from_file_location(
    "north_math", ROOT / "atlas/scripts/preparar-piloto-norte.py")
MATH = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MATH)


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def digest(name):
    return hashlib.sha256((DATA / name).read_bytes()).hexdigest()


def freeze(name, value):
    path = DATA / name
    text = json.dumps(value, ensure_ascii=True, indent=2) + "\n"
    if path.exists():
        if path.read_text(encoding="utf-8") != text:
            raise ValueError("Frozen artifact differs; refusing overwrite: " + name)
    else:
        with path.open("x", encoding="utf-8") as out:
            out.write(text)


def chapter_range(raw):
    if isinstance(raw, int):
        start, end = raw, 999
    elif isinstance(raw, list) and len(raw) in (1, 2):
        start, end = raw[0], raw[1] if len(raw) == 2 else 999
    else:
        raise ValueError("Unexpected source chapter range")
    if not isinstance(start, int) or not isinstance(end, int) or not 0 <= start <= end:
        raise ValueError("Invalid source chapter range")
    return start, min(end, 72)


def build():
    config = read("calibracao-agot-v2.json")
    source = read("portal-agot-v2-referencia.json")
    north = read("piloto-norte.json")
    manifest = read("mapa.json")
    for obj in (config, north):
        for field in ("sourceSha256", "tileSetId", "coordinateSystem"):
            expected = manifest.get(field, "cropped-native-pixels")
            if obj[field] != expected:
                raise ValueError("Map identity mismatch: " + field)
    if source["datasetId"] != config["datasetId"] or source["chapters"] != north["chapters"]:
        raise ValueError("Snapshot identity or chapters differ")

    points = copy.deepcopy(north["controlPoints"])
    for point in points:
        point["region"] = "norte"
    for cp in config["additionalControlPoints"]:
        original = source["locations"][cp["id"]]
        points.append({
            "id": cp["id"], "originalKey": cp["id"],
            "label": original["label"], "english": original["english"],
            "x": cp["x"], "y": cp["y"], "region": cp["region"],
            "sourceLatLng": [original["lat"], original["lng"]],
            "oldPixel": MATH.old_pixel([original["lat"], original["lng"]]),
            "status": "manual-review",
            "note": cp.get("note", "Centro aproximado do simbolo impresso; em revisao.")
                    + " Nome do dicionario existente; verificacao literaria independente pendente.",
            "evidence": [
                {"kind": "scan", "label": "Nome e simbolo impressos; inspecao manual aproximada",
                 "locator": "mapas/jpeg/O Mundo Conhecido.jpg"},
                {"kind": "portal-dictionary", "label": "Nome e identidade herdados, nao certificacao literaria",
                 "locator": "assets/js/i18n-pt.js + assets/js/data.js"},
            ],
        })
    by_id = {p["id"]: p for p in points}
    if len(by_id) != len(points):
        raise ValueError("Duplicate point ID")
    for p in points:
        if not (0 <= p["x"] < manifest["width"] and 0 <= p["y"] < manifest["height"]):
            raise ValueError("Manual control outside map")
        original = source["locations"][p["id"]]
        if p["sourceLatLng"] != [original["lat"], original["lng"]]:
            raise ValueError("Frozen northern source changed: " + p["id"])

    western = [p for p in points if p["region"] != "essos"]
    model = MATH.fit(western)
    boundary = MATH.hull(western)
    edges = list(zip(boundary, boundary[1:] + boundary[:1]))
    residuals = [{
        "id": p["id"],
        "pixels": round(math.dist(MATH.transform(model, p["oldPixel"]), [p["x"], p["y"]]), 2),
    } for p in western]
    frozen_vertices = north["route"]["segments"][0]["vertices"]
    frozen_path = [v["source"] for v in frozen_vertices]

    def geometry(raw, character):
        if len(raw) < 2:
            raise ValueError("Linha sem pelo menos dois vertices")
        if raw == frozen_path:
            return copy.deepcopy(frozen_vertices)
        result = []
        eastern = character == "daenerys" or any(
            isinstance(v, str) and v in by_id and by_id[v]["region"] == "essos" for v in raw)
        for vertex in raw:
            if isinstance(vertex, str):
                if vertex not in by_id:
                    raise ValueError("Localidade nao calibrada: " + vertex)
                p = by_id[vertex]
                result.append({"source": vertex, "point": [p["x"], p["y"]],
                               "method": "manual-control-point"})
            else:
                if eastern:
                    raise ValueError("Vertices diretos de Essos sem transformacao regional validada")
                if not isinstance(vertex, list) or len(vertex) != 2:
                    raise ValueError("Vertice de origem invalido")
                pixel = MATH.old_pixel(vertex)
                if any(MATH.cross(a, b, pixel) < -1e-6 for a, b in edges):
                    raise ValueError("Vertice fora do casco regional; extrapolacao recusada")
                destination = [round(v, 2) for v in MATH.transform(model, pixel)]
                if not all(math.isfinite(v) for v in destination) or not (
                    0 <= destination[0] < manifest["width"] and
                    0 <= destination[1] < manifest["height"]
                ):
                    raise ValueError("Vertice transformado fora da imagem")
                result.append({"source": vertex, "point": destination,
                               "method": "westeros-affine-estimate"})
        return result

    routes = []
    for character in source["characters"]:
        key = character["id"]
        route = {
            "id": key, "character": character["character"], "color": character["color"],
            "book": "A Guerra dos Tronos", "status": "approximate",
            "notice": "Importacao parcial do portal antigo. Linhas tracejadas aproximadas; "
                      "lacunas nao indicam ausencia de movimento. Cronologia em revisao.",
            "segments": [], "positions": [], "omittedRecords": [],
            "omittedSourceRecordIndices": [],
            "evidence": [{"kind": "portal", "label": "Registros do primeiro livro; cronologia herdada",
                          "locator": "assets/js/data.js paths." + key}],
        }
        if key == "jon":
            route["evidence"] += copy.deepcopy(north["route"]["evidence"])
        for item in character["records"]:
            index, record = item["index"], item["record"]
            start, end = chapter_range(record["chapters"])
            base = {"sourceRecordIndex": index, "startChapter": start,
                    "endChapter": end, "status": "approximate"}
            try:
                if "line" in record:
                    vertices = geometry(record["path"], key)
                    route["segments"].append({
                        **base, "id": f"{key}-line-{index}",
                        "points": [v["point"] for v in vertices], "vertices": vertices,
                    })
                elif record.get("icon") not in ("skull", "lost") and "key" in record:
                    if record["key"] not in by_id:
                        raise ValueError("Localidade nao calibrada: " + record["key"])
                    route["positions"].append({
                        **base, "id": f"{key}-position-{index}", "locationId": record["key"],
                    })
                elif "coord" in record:
                    raise ValueError("Marcador ou seta com coordenada avulsa; sem localidade calibrada")
                else:
                    raise ValueError("Evento especial nao importado neste piloto")
            except ValueError as error:
                route["omittedSourceRecordIndices"].append(index)
                route["omittedRecords"].append({
                    "sourceRecordIndex": index, "startChapter": start,
                    "endChapter": end, "reason": str(error),
                })
        route["coverage"] = {
            "sourceRecords": len(character["records"]),
            "positionRecords": len(route["positions"]),
            "segmentRecords": len(route["segments"]),
            "omittedRecords": len(route["omittedRecords"]),
        }
        if sum(route["coverage"][k] for k in
               ("positionRecords", "segmentRecords", "omittedRecords")) != route["coverage"]["sourceRecords"]:
            raise ValueError("Incomplete record accounting")
        routes.append(route)

    output = {
        "schemaVersion": 2, "datasetId": config["datasetId"], "mapId": manifest["id"],
        "tileSetId": manifest["tileSetId"], "sourceSha256": manifest["sourceSha256"],
        "coordinateSystem": config["coordinateSystem"], "mapWidth": manifest["width"],
        "mapHeight": manifest["height"], "cropBoxOriented": manifest["cropBoxOriented"],
        "controlPoints": points, "chapters": source["chapters"], "routes": routes,
        "regions": [
            {"id": region, "label": label, "pointIds": [p["id"] for p in points if p["region"] == region]}
            for region, label in (("norte", "Norte"), ("westeros", "Demais regioes de Westeros"),
                                  ("essos", "Essos"))
        ],
        "calibration": {
            "method": "manual-anchors-with-conservative-regional-affine-route-estimates",
            "notice": "Residuals describe fit disagreement, NOT ground-truth accuracy. "
                      "Locality markers use manual anchors, never fitted positions. "
                      "The Westeros model is not applied to Essos. Road geometry remains unreviewed.",
            "westerosModel": model, "westerosControlPointResiduals": residuals,
            "sourceProjection": north["calibration"]["sourceProjection"],
            "preservedNorthernRoute": "piloto-norte.json route.segments[0], vertices copied without refitting",
        },
        "sourceFiles": source["sourceFiles"],
        "inputSha256": {name: digest(name) for name in (
            "calibracao-agot-v2.json", "portal-agot-v2-referencia.json", "piloto-norte.json", "mapa.json")},
        "limitations": config["limitations"],
    }
    report = {
        "datasetId": output["datasetId"], "manualLocalities": len(points),
        "characters": len(routes), "chapters": len(source["chapters"]),
        "byCharacter": [{"id": r["id"], **r["coverage"]} for r in routes],
        "westerosFitResiduals": residuals,
        "note": "Counts are import coverage, not verified literary completeness.",
    }
    freeze("atlas-agot-v2-candidato.json", output)
    freeze("atlas-agot-v2-diagnostico.json", report)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    build()
