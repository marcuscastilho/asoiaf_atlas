"""Lead-reviewed AGOT corridors; never transform the old portal's raw vertices.

The frozen pre-revision artifact is the input, not the mutable published file.
Coordinates describe illustrative corridors, never continuous character positions.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "data"
BASE = "atlas-inventario-v3-pre-percursos-v1.json"
BASE_SHA = "605192a25ce5c49864ddc16a6e6ebcefe4c4789b9042067285acc3571540186f"
REVISION = "percursos-agot-v1"
NOTICE = (
    "Corredor cartografico aproximado, nao caminho exato medido. O capitulo indica "
    "quando este trecho e mostrado, nao uma data de chegada. Sem interpolacao de posicao."
)


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def digest(name):
    return hashlib.sha256((DATA / name).read_bytes()).hexdigest()


def write(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=True, indent=2) + "\n",
                             encoding="utf-8")


def joined(*paths):
    result = []
    for path in paths:
        for point in path:
            if not result or result[-1] != point:
                result.append(copy.deepcopy(point))
    return result


def build():
    if digest(BASE) != BASE_SHA:
        raise ValueError("Frozen input changed")
    base = read(BASE)
    output = copy.deepcopy(base)
    source = read("portal-agot-v2-referencia.json")
    sheet = read("planilha-v3-referencia.json")
    routes = {r["id"]: r for r in output["routes"]}
    originals = {c["id"]: {r["index"]: r["record"] for r in c["records"]}
                 for c in source["characters"]}
    north = routes["jon"]["segments"][0]["points"]
    royal_north = routes["eddard"]["segments"][0]["points"]
    royal_neck = routes["eddard"]["segments"][1]["points"]
    royal_south = [
        [4060,6380],[4116,6426],[4145,6490],[4115,6590],[4120,6700],
        [4140,6790],[4170,6900],[4180,7000],[4200,7110],[4230,7220],
        [4290,7330],[4350,7400],
    ]
    royal_all = joined(royal_north, royal_neck, royal_south)
    inn = [4116,6426]
    mountain_road = [
        inn,[4190,6395],[4260,6365],[4330,6340],[4390,6310],
        [4430,6270],[4470,6220],
    ]
    ascent = [[4470,6220],[4510,6190],[4542,6160],[4570,6130],
              [4580,6090],[4595,6050]]
    twins_wood = [
        [3535,5740],[3470,5760],[3440,5800],[3460,5860],[3500,5930],
        [3540,6000],[3580,6050],[3630,6100],[3680,6150],[3724,6190],
        [3680,6230],[3600,6260],[3500,6280],[3400,6310],[3280,6350],
    ]
    wood_riverrun = [[3280,6350],[3305,6400],[3360,6460]]
    goldroad = [
        [4350,7400],[4220,7420],[4040,7390],[3920,7300],[3850,7220],
        [3640,7240],[3450,7270],[3230,7250],[3030,7200],[2960,7120],
        [2936,7040],[2790,7010],[2630,7040],[2450,7060],[2360,7060],
    ]
    western_host = [
        [2360,7060],[2420,7010],[2490,6940],[2550,6890],[2626,6870],
        [2710,6830],[2830,6790],[2922,6742],[3000,6710],[3090,6650],
        [3170,6590],[3270,6530],[3360,6460],
    ]
    gulltown = [
        [4595,6050],[4580,6090],[4600,6140],[4690,6170],[4810,6160],
        [4914,6130],[5050,6160],[5180,6200],[5325,6240],
    ]
    gulf_return = [
        [5325,6240],[5360,6280],[5440,6320],[5600,6300],[5680,6100],
        [5650,5900],[5730,5700],[5700,5500],[5580,5300],[5300,5080],
        [4900,5020],[4530,5000],[4250,5000],[4115,4790],[4100,4700],
        [4100,4590],
    ]
    cat_road = [
        [4350,7400],[4290,7330],[4230,7220],[4200,7110],[4180,7000],
        [4170,6900],
    ]
    cat_road_end = joined(list(reversed(royal_south))[5:-1])
    # The first-book text names hills/forests, not stops inside these cities.
    # Follow the reference corridor without asserting visits to city centers.
    pentos_qohor = [
        [6415,7325],[6540,7310],[6710,7260],[6870,7220],[6998,7190],
        [7110,7080],[7230,6950],[7350,6810],[7490,6740],[7600,6810],
        [7770,6910],[7930,7020],[8090,7130],[8290,7220],[8480,7300],
        [8650,7310],[8840,7300],[9000,7310],
    ]
    dothraki = [
        [9000,7310],[9250,7300],[9500,7310],[9770,7350],[10030,7370],
        [10290,7410],[10500,7460],[10692,7474],[10920,7390],[11130,7320],
        [11350,7330],[11600,7400],[11800,7470],[12020,7400],[12250,7290],
        [12500,7160],[12760,7040],[13030,7000],[13310,6950],[13600,6890],
        [13845,6830],
    ]
    lhazar = [
        [13845,6830],[13680,7010],[13630,7240],[13680,7450],[13720,7680],
        [13650,7860],[13720,8070],[13650,8260],[13580,8390],[13560,8530],
        [13530,8650],[13480,8740],[13380,8920],[13350,9050],
        [13240,9160],[13100,9220],
    ]
    corridors = {
        "north": north, "royal-north": royal_north, "royal-neck": royal_neck,
        "royal-south": royal_south, "royal-all": royal_all,
        "mountain-road": mountain_road, "eyrie-ascent": ascent,
        "twins-wood": twins_wood, "wood-riverrun": wood_riverrun,
        "goldroad": goldroad, "western-host": western_host,
        "vale-return": joined(gulltown, gulf_return), "cat-road": cat_road,
        "cat-road-end": cat_road_end, "pentos-qohor": pentos_qohor,
        "dothraki": dothraki, "lhazar": lhazar,
        "green-fork": [
            inn,[4060,6380],[4010,6386],[3964,6348],[3914,6300],
            [3876,6244],[3844,6176],[3816,6100],
        ],
        "jon-desertion": [
            [4260,2370],[4254,2460],[4252,2520],[4252,2578],
            [4244,2660],[4252,2578],[4252,2520],[4254,2460],[4260,2370],
        ],
    }
    reviewed = []
    chronology = []

    def evidence(cid, index, chapters):
        refs = [
            {"kind": "scan-corridor",
             "label": "Corredor conferido no mapa-base; curvas aproximadas",
             "locator": "mapas/jpeg/O Mundo Conhecido.jpg; coordenadas nativas recortadas"},
            {"kind": "journeys-reference",
             "label": "Comparacao regional; nao copia de coordenadas ou de livros seguintes",
             "locator": "mapas/jpeg/Viagens.jpg; mapas/jpeg/" +
                        ("O Oriente.jpg" if cid == "daenerys" else "O Ocidente.jpg")},
        ]
        if index is not None:
            refs.append({"kind": "legacy-record", "label": "Registro original preservado para auditoria",
                         "locator": f"portal-agot-v2-referencia.json; {cid}; registro {index}"})
        for cap in chapters:
            refs.append({
                "kind": "book-scene",
                "label": "Contexto narrativo LeYa; nao certifica curvas nem distancias",
                "locator": f"AGOT-LEYA; capitulo global {cap}; OEBPS/Text/"
                           f"9788580442786_a_guerra_dos_tronos-{cap + 3}.html",
            })
            for row in sheet["rows"]:
                if row["chapterIndex"] == cap:
                    refs.append({
                        "kind": "spreadsheet",
                        "label": "Cronologia colaborativa; contexto, nao coordenadas",
                        "locator": f"planilha-v3-referencia.json; gid=1740264601; linha {row['sourceRow']}",
                    })
        return refs

    def remove_omission(route, index):
        route["omittedSourceRecordIndices"] = [
            i for i in route["omittedSourceRecordIndices"] if i != index]
        route["omittedRecords"] = [r for r in route["omittedRecords"]
                                  if r["sourceRecordIndex"] != index]

    def leg(cid, index, path, label, chapters, start=None, mode="land",
            note="", derived=None, reverse=False):
        route = routes[cid]
        previous = next((s for s in route["segments"]
                         if index is not None and s["sourceRecordIndex"] == index), None)
        if index is not None:
            raw = originals[cid][index]
            if "line" not in raw:
                raise ValueError("A source marker cannot masquerade as a source line")
            cap = raw["chapters"]
            original_start = cap if isinstance(cap, int) else cap[0]
            original_end = min(cap[1], 72) if isinstance(cap, list) and len(cap) == 2 else 72
            start = original_start if start is None else start
        else:
            original_start, original_end = start, 72
        pts = copy.deepcopy(corridors[path] if isinstance(path, str) else path)
        if reverse:
            pts.reverse()
        segment = copy.deepcopy(previous) if previous else {}
        segment.update({
            "id": f"{cid}-line-{index}" if index is not None else f"{cid}-supplement-{len(reviewed)}",
            "sourceRecordIndex": index, "startChapter": start, "endChapter": original_end,
            "status": "approximate", "points": pts, "label": label, "travelMode": mode,
            "geometryStatus": "manual-route-review-v1",
            "geometryNotice": NOTICE + (" " + note if note else ""),
            "routeRevision": REVISION, "evidence": evidence(cid, index, chapters),
            "vertices": [
                {"point": point, "method": "manual-route-corridor", "source": "scan-review",
                 "corridor": path if isinstance(path, str) else "retained-reviewed-corridor"}
                for point in pts],
        })
        segment.pop("transportLegs", None)
        if index is not None:
            segment["sourcePath"] = copy.deepcopy(raw["path"])
            if start != original_start:
                correction = {
                    "originalStartChapter": original_start, "reviewedStartChapter": start,
                    "reason": note, "characterId": cid, "sourceRecordIndex": index,
                }
                segment["chronologyRevision"] = correction
                chronology.append(correction)
            remove_omission(route, index)
        else:
            if not derived:
                raise ValueError("Narrative supplement requires frozen source lineage")
            segment["origin"] = "narrative-supplement"
            segment["derivedSourceRecordIndices"] = derived
        if previous:
            route["segments"][route["segments"].index(previous)] = segment
        else:
            route["segments"].append(segment)
        reviewed.append({"characterId": cid, "sourceRecordIndex": index,
                         "id": segment["id"], "label": label, "startChapter": start,
                         "vertices": len(pts)})
        return segment

    def position(cid, index, location, start, end, chapters, derived=None):
        route = routes[cid]
        if index is not None:
            if originals[cid][index].get("key") not in (
                    location, next(p.get("originalKey") for p in output["controlPoints"]
                                   if p["id"] == location)):
                raise ValueError("Source position identity mismatch")
            remove_omission(route, index)
        elif not derived:
            raise ValueError("Position supplement requires lineage")
        route["positions"].append({
            "id": f"{cid}-position-{index}" if index is not None else f"{cid}-attested-{start}",
            "sourceRecordIndex": index, "locationId": location, "startChapter": start,
            "endChapter": end, "status": "approximate", "routeRevision": REVISION,
            "origin": "book-attested-position" if index is None else "restored-source-position",
            "derivedSourceRecordIndices": derived or [index],
            "evidence": evidence(cid, index, chapters),
        })

    leg("jon", 4, "north", "Winterfell -> Castelo Negro: Estrada do Rei", [10,13,19])
    leg("tyrion", 3, "north", "Winterfell -> Castelo Negro: Estrada do Rei", [13,19])
    leg("jon", 8, "jon-desertion", "Tentativa de partida e regresso a Castelo Negro", [70],
        note="A extensao ao sul e esquematica: o ponto onde os amigos o encontram nao foi localizado.")

    for cid in ("tyrion", "jaime", "cersei"):
        leg(cid, 1, "royal-all", "Porto Real -> Winterfell: comitiva real", [4],
            reverse=True, note="Desvios locais por Darry e Hayford nao foram localizados individualmente.")
    for cid in ("eddard", "arya", "sansa"):
        a, b, c = {"eddard": (4,6,8), "arya": (1,3,6), "sansa": (1,3,5)}[cid]
        leg(cid, a, "royal-north", "Winterfell -> terras ao sul: Estrada do Rei", [12])
        leg(cid, b, "royal-neck", "Gargalo -> Tridente: Estrada do Rei", [15,16])
        leg(cid, c, "royal-south", "Tridente -> Porto Real: Estrada do Rei", [16,20],
            note="Darry consta no relato; seu desvio local nao esta resolvido nesta escala.")
    for cid in ("jaime", "cersei"):
        for path, start, label in (
                ("royal-north",12,"Winterfell -> terras ao sul: comitiva real"),
                ("royal-neck",15,"Gargalo -> Tridente: comitiva real"),
                ("royal-south",20,"Tridente -> Porto Real: comitiva real")):
            leg(cid, None, path, label, [start], start=start, derived=[2,3,4,5],
                note="Complemento narrativo da comitiva; nao existia como linha separada no portal.")

    leg("tyrion", None, "north", "Castelo Negro -> Winterfell: regresso pelo Norte",
        [21,24], start=24, reverse=True, derived=[4,5])
    leg("tyrion", None, joined(royal_north, royal_neck, [inn]),
        "Winterfell -> Estalagem no Entroncamento", [24,28], start=28, derived=[4,5])
    for cid, first, second in (("tyrion",6,8),("catelyn",8,10)):
        leg(cid, first, "mountain-road", "Entroncamento -> montanhas da Lua", [28,31])
        leg(cid, second, "eyrie-ascent", "Passo Sangrento -> Ninho da Aguia", [34],
            note="Subida final esquematica; os patamares de montanha nao foram medidos.")
    leg("tyrion", None, "eyrie-ascent", "Saida do Ninho da Aguia rumo as montanhas",
        [42], start=42, reverse=True, derived=[9,10])
    leg("tyrion", None, "mountain-road", "Montanhas da Lua -> acampamento no Entroncamento",
        [42,56], start=56, reverse=True, derived=[10,11])
    leg("tyrion", 11, "green-fork", "Entroncamento -> batalha do Ramo Verde", [56,62], start=62,
        note="O portal mostrava este movimento no capitulo 56. A marcha e batalha sao "
             "mostradas aqui apenas no 62; local do campo de batalha e aproximado.")
    leg("tyrion", None, "green-fork", "Ramo Verde -> regresso ao Entroncamento",
        [69], start=69, reverse=True, derived=[12,13])
    wall_pos = next(p for p in routes["tyrion"]["positions"] if p["sourceRecordIndex"] == 4)
    wall_pos["endChapter"] = 23
    wall_pos["chronologyRevision"] = {
        "originalEndChapter": 27, "reviewedEndChapter": 23,
        "reason": "Bran IV, capitulo 24, atesta Tyrion em Winterfell; nao interpolacao.",
        "evidence": evidence("tyrion",4,[24]),
    }
    chronology.append({"characterId": "tyrion", "sourceRecordIndex": 4,
                       **wall_pos["chronologyRevision"]})
    position("tyrion", None, "Winterfell", 24, 27, [24], derived=[4,5])
    position("tyrion", 5, "scan-site-4116-6426", 28, 30, [28])
    position("tyrion", None, "scan-site-4116-6426", 56, 61, [56], derived=[11,12])
    position("tyrion", 13, "scan-site-4116-6426", 69, 72, [69])
    position("catelyn", 7, "scan-site-4116-6426", 28, 30, [28])

    sea = next(s for s in routes["catelyn"]["segments"] if s["sourceRecordIndex"] == 1)
    old_transport = copy.deepcopy(sea["transportLegs"])
    sea = leg("catelyn", 1, sea["points"], "Winterfell -> Porto Branco -> Porto Real",
              [18], mode="mixed", note="Separacao entre viagem por terra, embarque e navegacao.")
    sea["transportLegs"] = old_transport
    leg("catelyn", 3, "cat-road", "Porto Real -> estrada para o Tridente", [20,28])
    leg("catelyn", 5, "cat-road-end", "Estrada do Rei -> Estalagem no Entroncamento", [28])
    return_leg = leg("catelyn",12,"vale-return","Ninho da Aguia -> Vila Gaivota -> Porto Branco",
                     [55], mode="mixed",
                     note="Porto Branco e atestado no livro. O embarque por Vila Gaivota "
                          "e a passagem pelo Vale sao referencias cartograficas/portal, nao cena detalhada.")
    return_leg["transportLegs"] = [
        {"mode": "land", "startVertex": 0, "endVertex": len(gulltown)-1},
        {"mode": "sea", "startVertex": len(gulltown)-1, "endVertex": len(return_leg["points"])-1},
    ]
    for cid in ("robb","theon","catelyn"):
        route = routes[cid]
        indices = {"robb": (4,6,8,10), "theon": (4,6,8,10), "catelyn": (13,15,17,20)}[cid]
        for index, label, caps in (
                (indices[0], "Porto Branco -> Fosso Cailin" if cid == "catelyn" else
                 "Winterfell -> Fosso Cailin", [53,55]),
                (indices[1], "Fosso Cailin -> As Gemeas: passagem pelo Gargalo", [55,59])):
            old = next(s for s in route["segments"] if s["sourceRecordIndex"] == index)
            leg(cid,index,old["points"],label,caps)
        leg(cid,indices[2],"twins-wood","As Gemeas -> Feirajusta -> Bosque dos Murmurios",
            [59,63], note="Feirajusta e correspondencia de Viagens/portal. Local do bosque "
                          "e aproximado; nao e um novo assentamento calibrado.")
        leg(cid,indices[3],"wood-riverrun","Bosque dos Murmurios -> Correrrio", [63,71],
            note="Corredor curto; o bosque nao tem um centro cartografico estabelecido.")
    leg("jaime",6,"goldroad","Porto Real -> Rochedo Casterly: Estrada do Ouro",
        [35,40], start=40, note="A reuniao da hoste em Rochedo Casterly e informada no "
                               "capitulo 40; o portal iniciava um trecho incompleto no 39.")
    leg("jaime",8,"western-host","Rochedo Casterly -> Dente Dourado -> Correrrio",
        [40,59], start=59, note="O cerco e conhecido no capitulo 59. O desvio por "
                               "Wayfarer's Rest da fonte antiga nao foi transferido sem calibracao.")
    leg("jaime",11,"wood-riverrun","Correrrio -> Bosque dos Murmurios", [63], reverse=True)
    leg("jaime",None,"wood-riverrun","Regresso a Correrrio sob custodia", [71],
        start=71, derived=[12,13])

    leg("daenerys",3,"pentos-qohor","Pentos -> colinas de Norvos -> floresta de Qohor",
        [23], note="O texto descreve regioes, nao visitas aos centros das cidades. "
                   "A extremidade leste e apenas limite do corredor desenhado, nao posicao atual.")
    leg("daenerys",5,"dothraki","Mar Dothraki -> Vaes Dothrak", [23,36],
        note="Corredor comparado com Viagens. As ruinas proximas nao sao paradas literarias certificadas.")
    leg("daenerys",7,"lhazar","Vaes Dothrak -> regiao de Lhazar", [54,61],
        note="Final regional esquematico: a aldeia lhazarenha nao esta identificada. "
             "Nao foi associada por suposicao a Hesh, Kosrak ou Lhazosh.")
    for record in routes["daenerys"]["omittedRecords"]:
        if record["sourceRecordIndex"] == 1:
            record["reason"] = "Casamento nos arredores de Pentos; local exato nao calibrado."
        if record["sourceRecordIndex"] == 8:
            record["reason"] = "Aldeia lhazarenha sem identidade/posicao segura; apenas corredor regional."
    colors = {"jon":"#2166ac","tyrion":"#c23b23","robb":"#387443","catelyn":"#008b8b",
              "eddard":"#76532b","arya":"#b2477d","sansa":"#d27600","bran":"#50647b",
              "theon":"#db8a19","daenerys":"#773da2","jaime":"#b52d48","cersei":"#a68400"}
    for cid, route in routes.items():
        route["segments"].sort(key=lambda s: (s["startChapter"], s["id"]))
        route["positions"].sort(key=lambda p: (p["startChapter"], p["id"]))
        route["color"] = colors[cid]
        route["routeRevision"] = REVISION
        route["historicalEvidence"] = copy.deepcopy(route.get("evidence", []))
        current_evidence = [e for s in route["segments"] + route["positions"]
                            for e in s.get("evidence", [])]
        route["evidence"] = list({(e["kind"],e["locator"]): e
                                  for e in current_evidence}.values())
        if not route["evidence"]:
            route["evidence"] = evidence(cid, None, [1,8,24,53,66])
        route["notice"] = (
            "A Guerra dos Tronos, capitulos 0-72. Percurso acumulado; corredores aproximados "
            "revistos nas referencias. Movimento local sem localizacao segura permanece omitido.")
        route["stationaryNotice"] = (
            "Sem deslocamento mapeavel neste capitulo. Movimentos locais sem localizacao "
            "segura nao recebem linhas ou posicoes inventadas.")
        coverage = route["coverage"]
        coverage["segmentRecords"] = sum(s["sourceRecordIndex"] is not None for s in route["segments"])
        coverage["positionRecords"] = sum(p["sourceRecordIndex"] is not None for p in route["positions"])
        coverage["omittedRecords"] = len(route["omittedRecords"])
        coverage["supplementalSegments"] = sum(s["sourceRecordIndex"] is None for s in route["segments"])
        coverage["supplementalPositions"] = sum(p["sourceRecordIndex"] is None for p in route["positions"])
        assert coverage["sourceRecords"] == sum(coverage[k] for k in
                                                ("segmentRecords","positionRecords","omittedRecords"))
        imported = [i["sourceRecordIndex"] for i in route["segments"] + route["positions"]
                    if i["sourceRecordIndex"] is not None]
        omitted = route["omittedSourceRecordIndices"]
        assert len(imported + omitted) == len(set(imported + omitted))
        assert set(imported + omitted) == set(originals[cid])
        for segment in route["segments"]:
            assert 0 <= segment["startChapter"] <= segment["endChapter"] <= 72
            assert segment["geometryStatus"] == "manual-route-review-v1"
            for x,y in segment["points"]:
                assert math.isfinite(x) and math.isfinite(y)
                assert 0 <= x < output["mapWidth"] and 0 <= y < output["mapHeight"]
    assert output["controlPoints"] == base["controlPoints"]
    assert output["chapters"] == base["chapters"]
    output["inputSha256"][BASE] = BASE_SHA
    output["historicalCalibration"] = copy.deepcopy(base["calibration"])
    output["calibration"] = {
        "method": "manual-native-corridor-review",
        "notice": "Current lines use reviewed native scan corridors, not an affine fit. "
                  "Former transform and residuals are historicalCalibration only. "
                  "This does not establish measured path accuracy.",
    }
    output["limitations"][4] = (
        "Cronologia do portal com correcoes narrativas explicitas; planilha colaborativa "
        "e contexto, nao datas oficiais ou posicao em tempo real.")
    output["limitations"][5] = (
        "Todas as linhas exibidas foram revistas como corredores aproximados. "
        "Movimentos sem geografia segura continuam omitidos; nenhum caminho e medido.")
    output["routeRevision"] = {
        "id": REVISION, "scope": "AGOT only, 0-72; 12 characters",
        "baseDatasetSha256": BASE_SHA,
        "reviewScriptSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "bookEdition": read("nomes-agot-v2-evidencias.json")["edition"],
        "policy": NOTICE,
        "sourceLedgerPolicy": "sourceRecordIndex null = narrative supplement; separately counted; "
                             "derivedSourceRecordIndices reference frozen original records.",
        "chronologyPolicy": "Legacy ranges retained except explicit chronologyRevision; "
                            "supplements shown only when supported by the specified chapter.",
        "unresolved": [
            "Execution site near Winterfell, Jon's oath grove and patrol endpoints not calibrated.",
            "Local Darry/Hayford detours not measured; no new settlement identity guessed.",
            "Whispering Wood, Green Fork battlefield and Lhazareen village only regional corridors.",
            "No exact position inferred from route vertices, dates or sheet allocations.",
        ],
    }
    output["inventory"]["routeNotice"] = (
        "Percursos revistos para os 12 personagens do primeiro livro; corredores aproximados. "
        "Bran nao tem deslocamento externo calibrado. Nenhuma posicao interpolada.")
    report = {
        "revision": REVISION, "baselineSha256": BASE_SHA, "reviewedSegments": reviewed,
        "chronologyCorrections": chronology, "characters": [
            {"id": cid, "segments": len(r["segments"]), "positions": len(r["positions"]),
             "coverage": r["coverage"]} for cid,r in routes.items()],
        "unresolved": output["routeRevision"]["unresolved"],
        "preserved": ["all 182 physical points and identities", "chapters 0-72",
                      "frozen book-name audit", "original portal", "image masters and tiles"],
    }
    return output, report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--publish", action="store_true")
    args = parser.parse_args()
    result, report = build()
    write("atlas-inventario-v3-percursos-candidato.json", result)
    write("percursos-v1-diagnostico.json", report)
    if args.publish:
        write("atlas-inventario-v3.json", result)
    print(json.dumps({"characters": report["characters"],
                      "reviewedSegments": len(report["reviewedSegments"]),
                      "chronologyCorrections": len(report["chronologyCorrections"]),
                      "published": args.publish}, ensure_ascii=True, indent=2))
