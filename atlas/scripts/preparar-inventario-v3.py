"""Curated scan inventory and explicitly approximate route corridors.

Only lead-reviewed candidates enter this build. Color detection never becomes
an automatic identification. Frozen v2 inputs remain unchanged.
"""
import copy
from collections import Counter
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def sha(name):
    return hashlib.sha256((DATA / name).read_bytes()).hexdigest()


def write(name, obj):
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=True, indent=2) + "\n",
                             encoding="utf-8")


def build():
    base = read("atlas-agot-v2.json")
    cfg = read("inventario-v3-revisao.json")
    candidates = {p["candidateId"]: p for p in read("simbolos-v3-candidatos.json")["candidates"]}
    sheet = read("planilha-v3-referencia.json")
    source = read("portal-agot-v2-referencia.json")
    for key in ("sourceSha256", "tileSetId"):
        assert cfg[key] == base[key]
    output = copy.deepcopy(base)
    output["datasetId"] = cfg["datasetId"]
    points = output["controlPoints"]
    city_ids = {
        "White_Harbor", "Barrowton", "Gulltown", "King%27s_Landing", "Oldtown",
        "Braavos", "Lorath", "Norvos", "Pentos", "Qohor", "Myr", "Tyrosh",
        "Lys", "Volantis", "Vaes_Dothrak", "Meereen", "Yunkai", "Astapor",
    }
    ruin_ids = {"Moat_Cailin", "Ny_Sar", "Ar_Noy"}
    for point in points:
        point["kind"] = ("city" if point["id"] in city_ids else
                         "ruin" if point["id"] in ruin_ids else "castle")
        point["identificationStatus"] = "printed-name"
        point["summary"] = "Localidade nomeada na digitalizacao; marcador no simbolo impresso."
    by_id = {p["id"]: p for p in points}

    def add_named(spec):
        if spec["id"] in by_id:
            raise ValueError("Duplicate named identity: " + spec["id"])
        if "candidateId" in spec:
            c = candidates[spec["candidateId"]]
            x, y = c["x"], c["y"]
        else:
            x, y = spec["x"], spec["y"]
        assert all(math.isfinite(v) for v in (x, y))
        assert 0 <= x < base["mapWidth"] and 0 <= y < base["mapHeight"]
        p = {
            "id": spec["id"], "label": spec["label"],
            "english": spec["id"].replace("_", " ").replace("%27", "'"),
            "originalKey": spec["id"], "x": x, "y": y,
            "kind": spec["kind"], "region": spec["region"],
            "identificationStatus": "printed-name", "status": "manual-review",
            "summary": ("Ruina identificada pelo nome e simbolo vazado no mapa."
                        if spec["kind"] == "ruin" else
                        "Nome e simbolo identificados na digitalizacao."),
            "note": "Transcricao do mapa, nao certificacao de nomenclatura editorial nos livros. "
                    "Centro aproximado do simbolo; em revisao.",
            "evidence": [{"kind": "scan", "label": "Inspecao visual do nome e simbolo",
                          "locator": "mapas/jpeg/O Mundo Conhecido.jpg"}],
        }
        if "candidateId" in spec:
            p["reviewedCandidateIds"] = [spec["candidateId"]]
        points.append(p)
        by_id[p["id"]] = p

    for spec in cfg["namedCandidateDecisions"] + cfg["pendingManualPoints"]:
        add_named(spec)

    # Western glyphs were reviewed in four magnified contact sheets. Preserve
    # duplicate component provenance, but publish only one pin per printed site.
    western = []
    for cid in cfg["reviewedWestCandidateIds"]:
        c = candidates[cid]
        if not (1400 <= c["x"] < 5600 and 1600 <= c["y"] < 10300):
            raise ValueError("Western review ID outside reviewed frame: " + str(cid))
        western.append(c)
    # Larger connected fragment is generally the center of a split glyph.
    for c in sorted(western, key=lambda p: (-p["componentPixels"], p["candidateId"])):
        nearest = min(points, key=lambda p: math.hypot(p["x"] - c["x"], p["y"] - c["y"]))
        distance = math.hypot(nearest["x"] - c["x"], nearest["y"] - c["y"])
        tolerance = 64 if nearest["identificationStatus"] == "unidentified-symbol" else 75
        if distance <= tolerance:
            reviewed = nearest.setdefault("reviewedCandidateIds", [])
            if c["candidateId"] not in reviewed:
                reviewed.append(c["candidateId"])
            continue
        cid = c["candidateId"]
        kind = ("ruin" if cid in (58, 85, 155) else
                "unknown-settlement" if cid in (58, 60, 64, 105, 111, 114) else
                "village" if cid in (177, 183, 185, 188, 191, 206, 221, 225, 228,
                                     261, 275, 313, 624, 638) else "castle")
        p = {
            "id": "scan-site-" + str(c["x"]) + "-" + str(c["y"]),
            "label": "Simbolo sem nome " + str(cid), "english": "",
            "x": c["x"], "y": c["y"], "kind": kind,
            "region": "norte" if c["y"] < 5300 else "westeros",
            "identificationStatus": "unidentified-symbol", "status": "manual-review",
            "summary": "Simbolo visivel na digitalizacao. Nenhuma identidade foi atribuida.",
            "note": "Nome nao estabelecido. Tipo interpretado pela legenda quando legivel; "
                    "nao associado ao lugar mais proximo do portal por adivinhacao.",
            "reviewedCandidateIds": [cid],
            "evidence": [{"kind": "scan-symbol", "label": "Simbolo revisto visualmente",
                          "locator": "atlas/test/evidencias/revisao-west-*.png; candidato " + str(cid)}],
        }
        points.append(p)
        by_id[p["id"]] = p

    # Names absent from the global scan are not guessed from old portal
    # coordinates: these ten correspondences were inspected in Westeros.jpg.
    for spec in cfg.get("symbolIdentifications", []):
        matches = [p for p in points if spec["candidateId"] in p.get("reviewedCandidateIds", [])]
        if len(matches) != 1 or matches[0]["identificationStatus"] != "unidentified-symbol":
            raise ValueError("Ambiguous companion identification: " + spec["id"])
        p = matches[0]
        del by_id[p["id"]]
        if spec["id"] in by_id:
            raise ValueError("Companion identity duplicates named point")
        p.update({k: spec[k] for k in ("id", "label", "kind", "summary")})
        p["english"] = spec["id"].replace("_", " ").replace("%27", "'")
        p["originalKey"] = spec["id"]
        p["identificationStatus"] = "companion-map-review"
        p["note"] = ("Correspondencia visual entre o simbolo do mapa mundial e a cartografia "
                     "regional nomeada. Identidade e centro em revisao; nao certifica edicao literaria.")
        p["evidence"].append({
            "kind": "companion-scan",
            "label": "Nome e configuracao regional inspecionados no mapa Westeros",
            "locator": "mapas/jpeg/Westeros.jpg; atlas/test/evidencias/westeros-v3-norte.png",
        })
        by_id[p["id"]] = p

    # Corridor anchors are map-pixel waypoints, NOT new settlement coordinates.
    roads = {
        "north": [[3640,3720],[3628,3590],[3666,3526],[3720,3448],[3772,3410],
                  [3820,3386],[3894,3318],[3922,3238],[3964,3186],[4054,3110],
                  [4116,3020],[4158,2960],[4200,2900],[4206,2840],[4224,2732],
                  [4244,2660],[4252,2578],[4252,2520],[4254,2460],[4260,2370]],
        "winterfell-moat": [[3640,3720],[3550,3836],[3592,3908],[3624,3942],
                            [3628,4004],[3612,4056],[3606,4126],[3626,4180],
                            [3620,4222],[3610,4270],[3624,4342],[3620,4398],
                            [3632,4480],[3696,4570],[3714,4610],[3724,4700],
                            [3676,4762],[3680,4780]],
        "moat-twins": [[3680,4780],[3678,4874],[3668,4940],[3660,5008],
                       [3660,5100],[3652,5184],[3642,5242],[3640,5400],
                       [3630,5540],[3600,5660],[3570,5725],[3535,5740]],
        "whisper-riverrun": [[3280,6350],[3305,6400],[3360,6460]],
        "royal-north": [[3640,3720],[3550,3836],[3592,3908],[3624,3942],
                        [3628,4004],[3612,4056],[3606,4126],[3626,4180],
                        [3620,4222],[3610,4270],[3624,4342],[3620,4398],[3632,4480]],
        "royal-neck": [[3632,4480],[3696,4570],[3714,4610],[3724,4700],[3680,4780],
                       [3678,4874],[3668,4940],[3660,5008],[3660,5100],[3652,5184],
                       [3642,5242],[3618,5304],[3630,5380],[3648,5460],[3668,5526],
                       [3682,5620],[3700,5694],[3706,5760],[3722,5832],[3742,5896],
                       [3756,5950],[3790,6020],[3816,6100],[3844,6176],[3876,6244],
                       [3914,6300],[3964,6348],[4010,6386],[4060,6380]],
        "whiteharbor-moat": [[4100,4590],[3980,4640],[3840,4700],[3680,4780]],
        "cat-sea": [[3640,3720],[3580,3820],[3600,3940],[3730,4070],[3790,4270],
                    [3950,4430],[4040,4510],[4100,4590],[4100,4700],[4115,4790],
                    [4250,5000],[4530,5000],[4900,5020],[5300,5080],[5580,5300],
                    [5650,5500],[5570,5900],[5600,6300],[5500,6650],[5470,6890],
                    [5400,7040],[5300,7070],[5080,7140],[4850,7330],[4700,7370],
                    [4550,7400],[4450,7400],[4350,7400]],
    }
    assignments = {
        "jon": {4:"north"}, "tyrion": {3:"north"},
        "robb": {4:"winterfell-moat",6:"moat-twins",10:"whisper-riverrun"},
        "catelyn": {1:"cat-sea",13:"whiteharbor-moat",15:"moat-twins",20:"whisper-riverrun"},
        "eddard": {4:"royal-north",6:"royal-neck"},
        "arya": {1:"royal-north",3:"royal-neck"},
        "sansa": {1:"royal-north",3:"royal-neck"},
        "theon": {4:"winterfell-moat",6:"moat-twins",10:"whisper-riverrun"},
        "jaime": {11:"whisper-riverrun"},
    }
    changes = []
    for route in output["routes"]:
        originals = {r["index"]: r["record"] for char in source["characters"]
                     if char["id"] == route["id"] for r in char["records"]}
        for index, corridor in assignments.get(route["id"], {}).items():
            raw = originals[index]
            match = next((s for s in route["segments"] if s["sourceRecordIndex"] == index), None)
            if match is None:
                if not (route["id"] == "catelyn" and index == 1):
                    raise ValueError("Unexpected omitted corridor")
                chapter = raw["chapters"]
                assert isinstance(chapter, int)
                match = {"id": route["id"] + "-line-" + str(index),
                         "sourceRecordIndex": index, "startChapter": chapter,
                         "endChapter": 72, "status": "approximate"}
                route["segments"].append(match)
                route["omittedSourceRecordIndices"].remove(index)
                route["omittedRecords"] = [r for r in route["omittedRecords"]
                                           if r["sourceRecordIndex"] != index]
            xy = copy.deepcopy(roads[corridor])
            if route["id"] == "jaime":
                xy.reverse()
            match["points"] = xy
            match["vertices"] = []
            for vertex in xy:
                anchor = next((p for p in points if [p["x"], p["y"]] == vertex), None)
                match["vertices"].append({
                    "point": vertex,
                    "method": "manual-control-point" if anchor else "manual-corridor-estimate",
                    "source": anchor["id"] if anchor else {"scanPixel": vertex},
                    "corridor": corridor,
                })
            match["sourcePath"] = raw["path"]
            if corridor == "cat-sea":
                match["transportLegs"] = [
                    {"mode": "land", "startVertex": 0, "endVertex": 7},
                    {"mode": "embarkation", "startVertex": 7, "endVertex": 8},
                    {"mode": "sea", "startVertex": 8, "endVertex": len(xy) - 1},
                ]
            match["geometryStatus"] = "manual-corridor-review"
            match["geometryNotice"] = (
                "Corredor aproximado revisto na cartografia. Curvas e travessias nao sao "
                "estradas medidas. Cronologia herdada; nenhuma posicao interpolada.")
            changes.append({"characterId": route["id"], "sourceRecordIndex": index,
                            "corridor": corridor, "vertexCount": len(xy)})
        route["coverage"]["segmentRecords"] = len(route["segments"])
        route["coverage"]["omittedRecords"] = len(route["omittedRecords"])
        assert (route["coverage"]["sourceRecords"] ==
                route["coverage"]["segmentRecords"] + route["coverage"]["positionRecords"] +
                route["coverage"]["omittedRecords"])
        route["notice"] = (
            "Registros parciais do primeiro livro. Corredores revistos continuam aproximados; "
            "outros trechos ainda usam estimativa anterior. Lacunas permanecem explicitas.")
        if route["id"] in assignments:
            route["evidence"].append({
                "kind": "scan-corridor",
                "label": "Revisao de corredores terrestres e maritimos, nao geometria certificada",
                "locator": "O Mundo Conhecido.jpg + Viagens.jpg; preparar-inventario-v3.py",
            })
            chapter_refs = {
                "jon": [13,19], "tyrion": [13,19], "eddard": [12],
                "arya": [12], "sansa": [12], "robb": [55,59,63],
                "theon": [55,59,63], "catelyn": [18,55,59,63], "jaime": [63],
            }
            for chapter in chapter_refs.get(route["id"], []):
                route["evidence"].append({
                    "kind": "book-scene",
                    "label": "Contexto de deslocamento/cena na edicao LeYa; nao certifica curvas",
                    "locator": "AGOT-LEYA capitulo global " + str(chapter) +
                               "; OEBPS/Text/9788580442786_a_guerra_dos_tronos-" +
                               str(chapter + 3) + ".html",
                })
        pov = {"jon":"Jon", "tyrion":"Tyrion", "catelyn":"Cat", "eddard":"Ned",
               "arya":"Arya", "sansa":"Sansa", "bran":"Bran", "daenerys":"Dany"}.get(route["id"])
        if pov:
            row_ids = [r["sourceRow"] for r in sheet["rows"] if r["pov"].split(" ")[0] == pov]
            route["evidence"].append({
                "kind": "spreadsheet",
                "label": "Referencias de capitulos na cronologia colaborativa; datas nao oficiais",
                "locator": "gid=1740264601; linhas " + ", ".join(map(str, row_ids)),
            })
    names = [
        ("norte","Norte"), ("westeros","Demais regioes de Westeros"),
        ("essos","Essos ocidental e central"), ("oriente","Oriente"),
        ("ilhas-verao","Ilhas do Verao"), ("sothoryos","Sothoryos e ilhas Basilisco"),
    ]
    output["regions"] = [{"id": r, "label": label, "pointIds": [
        p["id"] for p in points if p["region"] == r]} for r, label in names]
    assert len({p["id"] for p in points}) == len(points)
    for p in points:
        assert 0 <= p["x"] < base["mapWidth"] and 0 <= p["y"] < base["mapHeight"]
    output["inventory"] = {
        "entries": len(points),
        "namedEntries": sum(p["identificationStatus"] != "unidentified-symbol" for p in points),
        "unidentifiedSymbols": sum(p["identificationStatus"] == "unidentified-symbol" for p in points),
        "coverageNotice": "Inventario ampliado, NAO exaustivo. Simbolos sem nome permanecem "
                          "sem identidade. Candidatos de deteccao nao entram automaticamente.",
        "routeNotice": "Corredores revistos: " + str(len(changes)) +
                       ". Revisao cartografica nao certifica cada curva nem toda a cronologia.",
        "spreadsheetNotice": "Planilha consultada e capturada; cronologia colaborativa, datas nao oficiais.",
    }
    output["calibration"]["v3Notice"] = (
        "Novos simbolos usam centros manuais/visuais, nao ajuste afim. Corredores selecionados "
        "substituem geometria afim. Trechos nao revistos continuam identificados no historico v2.")
    output["inputSha256"] = {name: sha(name) for name in (
        "atlas-agot-v2.json", "inventario-v3-revisao.json",
        "simbolos-v3-candidatos.json", "planilha-v3-referencia.json",
        "portal-agot-v2-referencia.json", "mapa.json")}
    output["limitations"] = [
        "Inventario ampliado mas ainda nao exaustivo; nomes nao foram adivinhados para completar o mapa.",
        "Identificacao pelo nome impresso nao equivale a verificacao literaria de cada entidade.",
        "Tipos seguem a leitura da legenda; classificacoes e centros dos simbolos estao em revisao.",
        "Apenas capitulos 0 a 72 do primeiro livro; movimentos omitidos continuam indicados.",
        "Cronologia herdada do portal; planilha colaborativa consultada como contexto, nao como datas oficiais.",
        "Corredores revistos sao aproximados. Outros trechos ainda mantem estimativas da versao anterior.",
        "Nenhuma linha em Essos foi criada por aplicar a transformacao de Westeros.",
        "Lhazar e uma regiao: nenhuma aldeia foi inventada como local exato dos eventos de Daenerys.",
        "Referencias LeYa e Suma nao sao intercambiaveis; ocorrencia de nome nao certifica trajetos.",
    ]
    report = {
        "datasetId": output["datasetId"], **output["inventory"],
        "byRegion": dict(Counter(p["region"] for p in points)),
        "byKind": dict(Counter(p["kind"] for p in points)),
        "routeChanges": changes,
    }
    write("atlas-inventario-v3-candidato.json", output)
    write("inventario-v3-diagnostico.json", report)
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    build()
