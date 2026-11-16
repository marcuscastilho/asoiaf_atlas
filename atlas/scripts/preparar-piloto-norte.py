"""Prepare a limited, explicitly approximate pilot from frozen local references."""
import argparse
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "atlas/data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def old_pixel(latlng):
    lat, lng = latlng
    return [(lng + 180) / 360 * 4642,
            (0.5 - math.asinh(math.tan(math.radians(lat))) / (2 * math.pi)) * 4642]


def solve(matrix, values):
    rows = [list(row) + [value] for row, value in zip(matrix, values)]
    for col in range(3):
        pivot = max(range(col, 3), key=lambda i: abs(rows[i][col]))
        rows[col], rows[pivot] = rows[pivot], rows[col]
        if abs(rows[col][col]) < 1e-9:
            raise ValueError("Degenerate control points")
        divisor = rows[col][col]
        rows[col] = [v / divisor for v in rows[col]]
        for i in range(3):
            if i != col:
                scale = rows[i][col]
                rows[i] = [a - scale * b for a, b in zip(rows[i], rows[col])]
    return [row[3] for row in rows]


def fit(points):
    origin = [sum(p["oldPixel"][axis] for p in points) / len(points) for axis in (0, 1)]
    design = [[p["oldPixel"][0] - origin[0], p["oldPixel"][1] - origin[1], 1]
              for p in points]
    gram = [[sum(row[i] * row[j] for row in design) for j in range(3)]
            for i in range(3)]
    coefficients = [
        solve(gram, [sum(row[i] * p[axis] for row, p in zip(design, points))
                     for i in range(3)]) for axis in ("x", "y")
    ]
    return {"sourceOrigin": origin, "coefficients": coefficients}


def transform(model, pixel):
    vector = [pixel[0] - model["sourceOrigin"][0], pixel[1] - model["sourceOrigin"][1], 1]
    return [sum(a * b for a, b in zip(row, vector)) for row in model["coefficients"]]


def cross(a, b, p):
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def hull(points):
    ordered = sorted(tuple(p["oldPixel"]) for p in points)
    lower, upper = [], []
    for chain, sequence in ((lower, ordered), (upper, reversed(ordered))):
        for p in sequence:
            while len(chain) >= 2 and cross(chain[-2], chain[-1], p) <= 0:
                chain.pop()
            chain.append(p)
    return lower[:-1] + upper[:-1]


def main(write=False):
    config, snapshot, manifest = (read(n) for n in (
        "calibracao-norte.json", "portal-norte-referencia.json", "mapa.json"))
    for field in ("sourceSha256", "tileSetId"):
        if config[field] != manifest[field]:
            raise ValueError("Calibration/source manifest mismatch: " + field)
    points = []
    for point in config["controlPoints"]:
        original = snapshot["locations"][point["id"]]
        latlng = [original["lat"], original["lng"]]
        evidence = [
            {"kind": "scan", "label": "Simbolo e nome impressos, inspecao manual",
             "locator": "mapas/jpeg/O Mundo Conhecido.jpg"},
            {"kind": "portal", "label": "Chave, coordenada antiga e dicionario pt-BR",
             "locator": "assets/js/data.js + assets/js/i18n-pt.js"},
        ]
        if point["bookMember"]:
            evidence.append({
                "kind": "book-term",
                "label": "AGOT-LEYA: ocorrencia do nome; nao confirma coordenadas nem edicao Suma",
                "locator": point["bookMember"],
            })
        points.append({
            "id": point["id"], "originalKey": point["id"], "label": original["label"],
            "english": original["english"], "x": point["x"], "y": point["y"],
            "status": "manual-review", "sourceLatLng": latlng,
            "oldPixel": old_pixel(latlng), "evidence": evidence,
            "note": ("Centro aproximado do simbolo; pendente de revisao visual."
                     if point["bookMember"] else
                     "Centro aproximado; nome impresso e dicionario existente. Evidencia literaria pendente."),
        })
    model = fit(points)
    residuals = []
    for point in points:
        predicted = transform(model, point["oldPixel"])
        held_out = transform(fit([p for p in points if p is not point]), point["oldPixel"])
        residuals.append({
            "id": point["id"],
            "pixels": round(math.dist(predicted, [point["x"], point["y"]]), 2),
            "leaveOneOutPixels": round(math.dist(held_out, [point["x"], point["y"]]), 2),
        })
    by_id = {p["id"]: p for p in points}
    records = {r["index"]: r["record"] for r in snapshot["jonRecords"]}
    source_line = records[4]
    if (source_line["chapters"] != 19 or
            source_line["path"][0] != "Winterfell" or
            source_line["path"][-1] != "Castle_Black"):
        raise ValueError("Unexpected frozen Jon route")
    boundary = hull(points)
    geometry, vertices = [], []
    for value in source_line["path"]:
        if isinstance(value, str):
            cp = by_id[value]
            destination = [cp["x"], cp["y"]]
            method = "manual-control-point"
        else:
            pixel = old_pixel(value)
            if any(cross(a, b, pixel) < -1e-6
                   for a, b in zip(boundary, boundary[1:] + boundary[:1])):
                raise ValueError("Route vertex requires extrapolation outside calibration hull")
            destination = [round(v, 2) for v in transform(model, pixel)]
            method = "regional-affine-estimate"
        if not (0 <= destination[0] < manifest["width"] and
                0 <= destination[1] < manifest["height"]):
            raise ValueError("Route point outside map")
        geometry.append(destination)
        vertices.append({"source": value, "point": destination, "method": method})
    positions = []
    for index in (0, 3, 5):
        record = records[index]
        start, end = record["chapters"]
        positions.append({
            "id": "jon-position-" + str(index), "sourceRecordIndex": index,
            "startChapter": start, "endChapter": min(end, 72),
            "locationId": record["key"], "status": "approximate",
        })
    output = {
        "schemaVersion": 1, "mapId": manifest["id"],
        "tileSetId": manifest["tileSetId"], "sourceSha256": manifest["sourceSha256"],
        "coordinateSystem": config["coordinateSystem"],
        "mapWidth": manifest["width"], "mapHeight": manifest["height"],
        "cropBoxOriented": manifest["cropBoxOriented"],
        "controlPoints": points, "chapters": snapshot["chapters"],
        "route": {
            "id": "jon-agot-north", "character": "Jon Snow", "book": "A Guerra dos Tronos",
            "status": "approximate",
            "notice": "Piloto parcial de A Guerra dos Tronos. Linha tracejada aproximada; "
                      "a cronologia vem do portal antigo e nem todos os movimentos estao calibrados.",
            "segments": [{
                "id": "jon-agot-19", "sourceRecordIndex": 4, "startChapter": 19,
                "endChapter": 72, "points": geometry, "status": "approximate",
                "vertices": vertices,
            }],
            "positions": positions, "omittedSourceRecordIndices": [1, 2, 6, 7, 8],
            "evidence": config["routeEvidence"],
            "scope": "Only the selected first-book records; later books are not imported.",
        },
        "calibration": {
            "method": "regional-affine-least-squares-on-six-manual-references",
            "notice": "Regional experiment only, not a world transform. Residuals are fit diagnostics, "
                      "not ground-truth accuracy. Named locations use manual anchors, not fitted positions. "
                      "Direct-coordinate vertices remain approximate; roads require visual review.",
            "model": model, "controlPointResiduals": residuals,
            "sourceProjection": "Inverse of catalogLatLng in assets/js/app.js; 4642px Web Mercator artwork",
            "sourceFiles": snapshot["sourceFiles"],
        },
        "limitations": config["limitations"],
    }
    print(json.dumps({"residuals": residuals, "vertices": vertices}, indent=2))
    if write:
        path = DATA / "piloto-norte.json"
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(output, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        temporary.replace(path)
        print("Wrote", path)
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    main(parser.parse_args().write)
