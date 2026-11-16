"""Curated saga expansion. Sources prove scenes, not measured route geometry."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re

DATA = Path(__file__).resolve().parents[1] / "data"
BASE_SHA = "0a982e04f7a3ffd7a0d3923a059b5002f847bd131267b948a590d302d7718ef5"
NOTICE = ("Corredor cartografico aproximado, nao caminho exato medido. "
          "Disponibilidade por capitulo na ordem de leitura, nao data de chegada. "
          "Sem interpolacao da posicao entre localidades.")
ROUTE_NOTICE = ("Cobertura parcial dos cinco livros publicados. Percursos acumulados "
                "e ultimas referencias de localidade, nao rastreamento continuo. "
                "AFFC e ADWD se sobrepoem no tempo; o filtro segue a publicacao.")


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def sha(name):
    return hashlib.sha256((DATA / name).read_bytes()).hexdigest()


def joined(*paths):
    result = []
    for path in paths:
        for p in path:
            if not result or result[-1] != p:
                result.append(copy.deepcopy(p))
    return result


def build():
    if sha("atlas-inventario-v3.json") != BASE_SHA:
        raise ValueError("Frozen v3 changed")
    base = read("atlas-inventario-v3.json")
    portal = read("portal-saga-v4-referencia.json")
    index = read("indice-livros-v4.json")
    review = read("cobertura-simbolos-v4-revisada.json")
    preliminary = read("revisao-cobertura-v4.json")
    source = {c["id"]: c for c in portal["characters"]}
    chapter_index = {c["globalIndex"]: c for c in index["chapters"]}
    assert index["portalSnapshotSha256"] == sha("portal-saga-v4-referencia.json")
    assert len(chapter_index) == 344 and 344 not in chapter_index
    output = copy.deepcopy(base)
    output["datasetId"] = "atlas-saga-v4"
    output["books"] = copy.deepcopy(portal["books"])
    output["chapters"] = copy.deepcopy(portal["chapters"])
    output["inputSha256"] = {
        name: sha(name) for name in (
            "atlas-inventario-v3.json", "portal-saga-v4-referencia.json",
            "indice-livros-v4.json", "cobertura-simbolos-v4-revisada.json",
            "revisao-cobertura-v4.json", "simbolos-v3-candidatos.json",
            "planilha-v3-referencia.json", "mapa.json",
        )
    }
    points = output["controlPoints"]
    by_id = {p["id"]: p for p in points}
    regions = {r["id"]: r for r in output["regions"]}
    candidates = {c["candidateId"]: c for c in
                  read("simbolos-v3-candidatos.json")["candidates"]}
    glyphs = {c["candidateId"]: c["kind"] for c in
              preliminary["glyphCandidatesForSectorReview"]}
    glyphs.update({414: "castle", 549: "castle", 587: "castle"})
    named = {c["candidateId"]: c for c in review["newNamedCandidates"]}
    corrections = {c["candidateId"]: c for c in review["coordinateCorrections"]}
    consumed = {i for p in points for i in p.get("reviewedCandidateIds", [])}

    def add_point(p, region, image, identity_notice):
        if p["id"] in by_id:
            raise ValueError("Duplicate point " + p["id"])
        named_point = not p["id"].startswith("scan-")
        label = portal["locations"].get(p["id"], {}).get("label")
        if named_point and label:
            p["label"] = label
        p.update({
            "originalKey": p["id"] if named_point else None,
            "status": "manual-review",
            "identificationStatus": ("companion-map-review" if named_point
                                     else "unidentified-symbol"),
            "region": region,
            "evidence": [
                {"kind": "scan", "label": "Simbolo conferido visualmente; centro aproximado",
                 "locator": image},
                {"kind": "coverage-review",
                 "label": "Revisao por setores e detalhe; nao certifica exaustividade",
                 "locator": "atlas/data/cobertura-simbolos-v4-revisada.json"},
            ],
            "note": identity_notice + " Centro manual em revisao.",
        })
        if named_point:
            p["evidence"].append({
                "kind": "companion-scan",
                "label": "Correspondencia regional e/ou nome impresso; nao auditoria literaria",
                "locator": "mapas/jpeg/" + (
                    "O Ocidente.jpg" if region in ("norte", "westeros") else "O Oriente.jpg"),
            })
        points.append(p)
        by_id[p["id"]] = p
        regions[region]["pointIds"].append(p["id"])

    for cid in review["acceptedCandidateIds"]:
        if cid in consumed:
            raise ValueError("Candidate already consumed " + str(cid))
        c = candidates[cid]
        x, y = c["x"], c["y"]
        if cid in corrections:
            x, y = corrections[cid]["x"], corrections[cid]["y"]
        region = ("westeros" if x < 5500 else "ilhas-verao" if x < 7200
                  else "sothoryos" if x < 14000 and y > 12000
                  else "oriente" if x >= 15000 else "essos")
        identity = named.get(cid)
        p = {"id": f"scan-site-v4-{cid}", "label": f"Simbolo sem nome {cid}",
             "english": "Unidentified printed settlement",
             "x": x, "y": y, "kind": glyphs[cid],
             "reviewedCandidateIds": [cid]}
        if identity:
            for key in ("id", "label", "english", "kind"):
                p[key] = identity[key]
        image = (identity["evidenceImage"] if identity else
                 f"atlas/test/evidencias/v4-setor-{min(y//2400,5)}-{min(x//3600,5)}.png")
        add_point(p, region, image, "Nome impresso associado." if identity else
                  "Simbolo real sem identidade individual segura; nenhum nome adivinhado.")
        consumed.add(cid)
    for item in review["manualSymbols"]:
        p = {k: item[k] for k in ("id", "label", "english", "x", "y", "kind")}
        p["reviewedCandidateIds"] = []
        add_point(p, item["region"], item["evidenceImage"], item["identityNotice"])

    # Stable portal keys can point at existing physical glyph IDs without
    # moving, duplicating or renaming any frozen v3 point.
    aliases = {
        "Bitterbridge": "scan-site-3550-7818",
        "The_Crag": "scan-site-2516-6554",
        "Seagard": "scan-site-3386-5862",
        "Duskendale": "scan-site-4656-7094",
        "Maidenpool": "scan-site-4584-6750",
        "Quiet_Isle": "scan-site-4440-6670",
        "Crossroads_Inn": "scan-site-4116-6426",
        "Inn_of_the_Kneeling_Man": "scan-site-3610-6356",
        "Acorn_Hall": "scan-site-3558-6710",
        "Stoney_Sept": "scan-site-3514-6972",
        "Lord_Harroway%27s_Town": "scan-site-4052-6476",
        "Saltpans": "scan-site-4400-6552",
    }
    output["locationAliases"] = aliases

    def xy(key):
        p = by_id[aliases.get(key, key)]
        return [p["x"], p["y"]]

    routes = {r["id"]: r for r in output["routes"]}
    for cid, character in source.items():
        if cid not in routes:
            colors = [r["record"]["line"] for r in character["records"]
                      if "line" in r["record"]]
            if not colors:
                colors = ["#" + re.search(r"([0-9a-fA-F]{6})$",
                          character["records"][0]["record"]["icon"]).group(1)]
            rt = {"id": cid, "character": character["character"],
                  "color": colors[0], "status": "approximate",
                  "segments": [], "positions": [], "evidence": []}
            routes[cid] = rt
            output["routes"].append(rt)
        rt = routes[cid]
        if cid == "aegon":
            rt["character"] = "Jovem Griff"
        rt["book"] = "Cinco livros publicados - cobertura parcial"
        rt["notice"] = ROUTE_NOTICE
        rt["routeRevision"] = "saga-v4"
        for s in rt["segments"]:
            s["endChapter"] = 343
            s["bookId"] = output["chapters"][s["startChapter"]]["bookId"]
        # Full record accounting is rebuilt below against the full saga source.
        rt["omittedRecords"] = []
        rt["omittedSourceRecordIndices"] = []

    def book_evidence(cap):
        c = chapter_index[cap]
        locator = f"{c['edition']}; {c['member']}"
        if c["anchor"]:
            locator += "#" + c["anchor"]
        if c.get("unanchoredHeading"):
            locator += "; titulo Daenerys sem ancora, apos Theon"
        return {"kind": "book-scene",
                "label": f"Contexto narrativo conferido; capitulo global {cap}; nao prova curvas",
                "locator": locator}

    paths = {
        "royal": joined(*(s["points"] for s in routes["eddard"]["segments"])),
        "north-craster": [
            xy("Castle_Black"), [4220,2320], [4180,2260], [4120,2210],
            xy("Craster%27s_Keep")],
        "craster-fist": [
            xy("Craster%27s_Keep"), [4000,2140], [3910,2090], [3850,2040],
            [3800,1980], xy("Fist_of_the_First_Men")],
        "queenscrown-black": [
            xy("Queenscrown"), [4190,2550], [4220,2500], [4250,2430], xy("Castle_Black")],
        "riverrun-bitter": [
            xy("Riverrun"), [3430,6620], [3500,6800], [3530,7000], [3560,7240],
            [3540,7440], [3550,7620], xy("Bitterbridge")],
        "bitter-storm": [
            xy("Bitterbridge"), [3700,7890], [3880,7940], [4050,7970], [4200,7980],
            [4380,7980], [4550,7960], [4700,7980], [4830,8040], xy("Storm%27s_End")],
        "riverrun-twins": [
            xy("Riverrun"), [3400,6380], [3450,6290], [3500,6200], [3540,6100],
            [3570,6010], [3560,5910], [3535,5810], xy("Twins")],
        "crag-riverrun": [
            xy("The_Crag"), [2630,6590], [2750,6630], [2830,6680], [2922,6742],
            [3000,6710], [3090,6650], [3170,6590], [3270,6530], xy("Riverrun")],
        "riverrun-kneeling": [
            xy("Riverrun"), [3410,6420], [3490,6380], [3570,6380],
            xy("Inn_of_the_Kneeling_Man")],
        "kneeling-harrenhal": [
            xy("Inn_of_the_Kneeling_Man"), [3690,6400], [3780,6470], [3880,6530],
            [3970,6600], xy("Harrenhal")],
        "harrenhal-capital": [
            xy("Harrenhal"), [4110,6780], [4170,6900], [4180,7000], [4200,7110],
            [4230,7220], [4290,7330], xy("King%27s_Landing")],
        "capital-duskendale": [
            xy("King%27s_Landing"), [4390,7310], [4452,7282], [4520,7230],
            [4580,7180], xy("Duskendale")],
        "duskendale-maidenpool": [
            xy("Duskendale"), [4640,7000], [4610,6900], [4590,6820], xy("Maidenpool")],
        "maidenpool-quiet": [
            xy("Maidenpool"), [4520,6750], [4470,6730], xy("Quiet_Isle")],
        "quiet-crossroads": [
            xy("Quiet_Isle"), [4370,6620], [4290,6560], [4200,6490], xy("Crossroads_Inn")],
        "acorn-stoney": [
            xy("Acorn_Hall"), [3550,6780], [3530,6860], xy("Stoney_Sept")],
        "harroway-twins": [
            xy("Lord_Harroway%27s_Town"), [4010,6380], [3940,6280], [3870,6170],
            [3820,6050], [3750,5920], [3660,5810], xy("Twins")],
        "saltpans-braavos": [
            xy("Saltpans"), [4500,6600], [4700,6580], [4890,6550], [5100,6510],
            [5330,6500], [5520,6480], [5720,6330], [5800,6100], [5930,5900],
            [6100,5680], xy("Braavos")],
        "riverrun-seagard": [
            xy("Riverrun"), [3350,6320], [3340,6200], [3350,6080], xy("Seagard")],
        "seagard-pyke": [
            xy("Seagard"), [3340,5895], [3270,5950], [3130,6000], [2970,6050],
            [2820,6100], [2670,6210], [2540,6230], [2440,6200], xy("Pyke")],
        "red-waste": [
            [13100,9220], [13250,9400], [13450,9560], [13650,9750], [13800,9850],
            xy("Vaes_Tolorro")],
        "tolorro-qarth": [
            xy("Vaes_Tolorro"), [14100,10070], [14200,10200], [14400,10360],
            [14600,10500], [14750,10610], xy("Qarth")],
        "qarth-astapor": [
            xy("Qarth"), [14850,10850], [14650,10920], [14420,10960], [14100,11020],
            [13750,11090], [13400,11110], [13100,11100], [12800,11150], [12450,11200],
            [12150,11400], [11900,11330], [11650,11000], [11300,10880], [11000,10600],
            [10850,10400], [10750,10200], [10700,10050], [10680,9880], [10700,9760],
            [10860,9760], [11050,9820], [11200,9880], xy("Astapor")],
        "astapor-yunkai": [
            xy("Astapor"), [11440,9880], [11510,9780], [11570,9660], [11600,9530],
            [11540,9430], [11510,9340], xy("Yunkai")],
        "yunkai-meereen": [
            xy("Yunkai"), [11520,9160], [11600,9100], [11690,9060], [11710,9030], xy("Meereen")],
        "capital-pentos": [
            xy("King%27s_Landing"), [4510,7330], [4680,7260], [4860,7170], [5030,7080],
            [5170,7000], [5480,7040], [5780,7160], [6100,7310], xy("Pentos")],
        "pentos-ghoyan": [
            xy("Pentos"), [6540,7310], [6710,7260], [6870,7220], xy("Ghoyan_Drohe")],
        "ghoyan-ny-sar": [
            xy("Ghoyan_Drohe"), [7025,7205], [7070,7210], [7110,7225], [7130,7242],
            [7144,7265], [7164,7260], [7180,7272], [7182,7305], [7191,7324],
            [7210,7341], [7231,7352], [7255,7356], [7275,7374], [7284,7405],
            [7290,7433], [7304,7456], [7322,7477], [7348,7492], [7380,7502],
            [7399,7518], [7428,7527], [7465,7530], [7485,7529], [7499,7514],
            [7522,7512], [7540,7517], [7566,7526], [7601,7529], xy("Ny_Sar")],
        "ny-sorrows": [
            xy("Ny_Sar"), [7650,7612], [7693,7625], [7737,7635], [7764,7654],
            [7781,7676], [7788,7701], [7812,7730], [7820,7753], [7816,7778],
            [7801,7799], [7801,7818], [7808,7833], [7835,7843], [7854,7853],
            [7872,7875], [7890,7900], [7910,7960], [7919,8020], [7927,8070],
            [7929,8100], [7923,8128], [7911,8153], [7893,8172], [7878,8186],
            [7870,8204], [7867,8233], [7871,8256], [7885,8272], [7903,8291],
            [7913,8311], [7907,8333], [7893,8350], xy("Sorrows")],
        "sorrows-selhorys": [
            xy("Sorrows"), [7882,8472], [7871,8510], [7849,8544], [7841,8579],
            [7832,8611], [7826,8656], [7828,8694], [7835,8732], [7862,8764],
            [7869,8792], [7891,8818], [7921,8828], [7949,8831], [7964,8848],
            [7960,8880], [7949,8910], [7952,8944], xy("Selhorys")],
        "selhorys-volantis": [
            xy("Selhorys"), [7952,8944], [7955,8981], [7954,9012], [7960,9034],
            [7978,9051], [7981,9084], [7981,9124], [7982,9166], [7990,9195],
            [7988,9224], [7995,9244], [8012,9264], [8020,9294], [8034,9312],
            [8060,9329], [8066,9356], [8076,9375], [8096,9389], [8125,9396],
            [8150,9399], [8169,9410], [8181,9431], [8190,9451], [8216,9461],
            [8241,9468], [8266,9481], [8286,9508], [8306,9524], xy("Volantis")],
        "selhorys-volon": [
            xy("Selhorys"), [7952,8944], [7955,8981], [7954,9012], [7960,9034],
            [7978,9051], [7981,9084], [7981,9124], [7982,9166], [7990,9195],
            [7988,9224], [7995,9244], [8012,9264], [8020,9294], [8034,9312],
            [8060,9329], [8066,9356], [8076,9375], [8096,9389], [8125,9396],
            [8150,9399], [8169,9410], [8181,9431], [8190,9451]],
        "dragon-storm": [
            xy("Dragonstone"), [5290,7020], [5450,7190], [5520,7420], [5530,7690],
            [5550,7980], [5470,8220], [5250,8260], [5080,8180], xy("Storm%27s_End")],
        "storm-blackwater": [
            xy("Storm%27s_End"), [5090,8180], [5280,8240], [5480,8200], [5580,8000],
            [5570,7720], [5520,7440], [5440,7230], [5290,7090], [5170,7000],
            [5000,7070], [4820,7180], [4670,7280], [4510,7390], [4490,7460]],
        "blackwater-dragon": [
            [4490,7460], [4510,7390], [4670,7280], [4860,7170], [5030,7080],
            xy("Dragonstone")],
        "black-eastwatch": [
            xy("Castle_Black"), [4310,2380], [4380,2390], [4460,2390],
            [4530,2395], xy("Eastwatch-by-the-Sea")],
        "eastwatch-braavos": [
            xy("Eastwatch-by-the-Sea"), [4710,2530], [4820,2690], [4950,2780],
            [5130,2800], [5320,2810], [5480,2910], [5690,3030], [5900,3200],
            [5980,3500], [5990,3850], [5970,4220], [5920,4600], [5980,4980],
            [6120,5290], xy("Braavos")],
        "braavos-tyrosh": [
            xy("Braavos"), [6240,5640], [6080,5900], [5940,6200], [5880,6560],
            [5890,6920], [5930,7310], [5900,7680], [5880,8000], [5860,8310], xy("Tyrosh")],
        "tyrosh-oldtown": [
            xy("Tyrosh"), [5900,8850], [5850,9100], [5760,9370], [5580,9640],
            [5330,9880], [5030,10010], [4710,10000], [4380,9970], [4040,9980],
            [3720,9950], [3420,9890], [3150,9780], [2900,9650], [2680,9640],
            [2460,9670], [2280,9610], [2190,9500], [2120,9370], [2090,9250],
            [2120,9150], [2200,9120], [2280,9080], [2320,9030], [2350,8995], xy("Oldtown")],
        "sisterton-whiteharbor": [
            xy("Sisterton"), [4370,5100], [4280,5050], [4200,4940], [4140,4820],
            [4100,4700], xy("White_Harbor")],
        "black-deepwood": [
            xy("Castle_Black"), [4170,2450], [4050,2510], [3900,2600], [3750,2700],
            [3600,2800], [3450,2920], [3310,3080], [3170,3210], [3070,3320],
            xy("Deepwood_Motte")],
    }
    paths["storm-riverrun"] = joined(
        list(reversed(paths["bitter-storm"])),
        [[3540,7600],[3500,7400],[3480,7200],[3430,6970],[3380,6730],xy("Riverrun")])
    paths["dragon-eastwatch"] = joined(
        [xy("Dragonstone"),[5360,6910],[5550,6790],[5740,6600],[5900,6370],
         [6030,6090],[6090,5780],[6050,5400]],
        list(reversed(paths["eastwatch-braavos"][:-1]))[1:])
    paths["eastwatch-black-north"] = [
        xy("Eastwatch-by-the-Sea"),[4510,2320],[4410,2280],[4310,2290],xy("Castle_Black")]
    paths["capital-sunspear"] = joined(
        paths["capital-pentos"][:6],
        [[5360,7020],[5510,7300],[5640,7640],[5740,7990],[5790,8340],
         [5790,8700],[5720,9030],[5630,9290],[5500,9440],xy("Sunspear")])
    reviewed_events = []

    def segment(cid, cap, path, label, scenes, mode="land", note="", legs=None, reverse=False):
        route = routes[cid]
        pts = copy.deepcopy(paths[path] if isinstance(path, str) else path)
        if reverse:
            pts.reverse()
        item = {
            "id": f"{cid}-v4-{cap}-{len(route['segments'])}",
            "sourceRecordIndex": None,
            "supplementPolicy": "Narrative supplement, not a replayed portal record",
            "startChapter": cap, "endChapter": 343,
            "bookId": output["chapters"][cap]["bookId"],
            "status": "approximate", "geometryStatus": "manual-regional-corridor-v4",
            "geometryNotice": NOTICE + (" " + note if note else ""),
            "label": label, "points": pts, "travelMode": mode,
            "evidence": [book_evidence(c) for c in scenes] + [
                {"kind": "scan-corridor", "label": "Corredor regional manual; curvas estimadas",
                 "locator": "mapas/jpeg/O Mundo Conhecido.jpg; coordenadas nativas recortadas"},
                {"kind": "journeys-reference",
                 "label": "Referencia regional, nao copia de coordenadas nem prova de paradas",
                 "locator": "mapas/jpeg/Viagens.jpg; mapas/jpeg/O Ocidente.jpg; mapas/jpeg/O Oriente.jpg"},
            ],
        }
        if legs:
            item["transportLegs"] = legs
        else:
            item["transportLegs"] = [{
                "mode": mode, "startVertex": 0, "endVertex": len(pts)-1,
            }]
        route["segments"].append(item)
        reviewed_events.append({"kind": "segment", "character": cid, "id": item["id"],
                                "availableFrom": cap, "chaptersRead": scenes, "note": note})

    def position(cid, key, start, end, scenes, note=""):
        route = routes[cid]
        location_id = aliases.get(key, key)
        assert location_id in by_id
        item = {
            "id": f"{cid}-v4-pos-{start}-{len(route['positions'])}",
            "sourceRecordIndex": None,
            "supplementPolicy": "Narrative supplement, not a replayed portal record",
            "startChapter": start, "endChapter": end, "locationId": location_id,
            "status": "approximate", "evidence": [book_evidence(c) for c in scenes],
            "note": ("Ultima referencia de localidade na ordem de leitura; "
                     "nao posicao continua nem interpolada. " + note).strip(),
        }
        route["positions"].append(item)
        reviewed_events.append({"kind": "position", "character": cid, "id": item["id"],
                                "window": [start,end], "chaptersRead": scenes, "note": note})

    # Arrival/context gates deliberately correct several inherited portal offsets.
    for cid in ("jon", "samwell"):
        segment(cid,96,"north-craster","Castelo Negro -> Fortaleza de Craster",[86,96],
                note="Passagem por Brancarbor sem novo ponto nomeado: identidade do pequeno simbolo nao foi fechada.")
        segment(cid,107,"craster-fist","Craster -> Punho dos Primeiros Homens",[96,107])
    segment("jon",191,"queenscrown-black","Coroadarrainha -> Castelo Negro",[184,191],
            note="Fuga e regresso; local exato dos ferimentos e desvios nao medidos.")
    segment("samwell",176,"craster-fist","Retirada do Punho -> Craster",[161,176],
            reverse=True,note="Retirada pelo corredor regional; acampamentos intermediarios nao georreferenciados.")
    segment("samwell",240,"black-eastwatch","Castelo Negro -> Atalaialeste",[230,240])
    segment("samwell",251,"eastwatch-braavos","Atalaialeste -> Braavos",[240,251],mode="sea",
            note="A escala em Skagos nao tem porto calibrado; linha e corredor maritimo, nao rastro do navio.")
    segment("samwell",270,joined(paths["braavos-tyrosh"],paths["tyrosh-oldtown"]),
            "Braavos -> Tyrosh -> Vilavelha",[251,260,270],mode="sea",
            note="Chegada em O Festim dos Corvos, Samwell V; nao em ADWD. Escalas nao equivalem a todos os portos.")
    for cid in ("robert","joffrey","myrcella"):
        segment(cid,20,"royal","Winterfell -> Porto Real: comitiva real",[12,15,20])
    segment("theon",84,joined(paths["riverrun-seagard"],paths["seagard-pyke"]),
            "Correrrio -> Guardamar -> Pyke",[84],mode="mixed",
            note="Pyke e ancora da ilha; nao coordenada exata do desembarque em Porto dos Fidalgos.",
            legs=[{"mode":"land","startVertex":0,"endVertex":len(paths["riverrun-seagard"])-1},
                  {"mode":"sea","startVertex":len(paths["riverrun-seagard"])-1,
                   "endVertex":len(joined(paths["riverrun-seagard"],paths["seagard-pyke"]))-1}])
    segment("catelyn",95,"riverrun-bitter","Correrrio -> regiao de Ponte Amarga",[80,95],
            note="Acampamento de Renly perto da ponte, nao visita medida ao centro do castelo.")
    for cid in ("catelyn","brienne","renly"):
        segment(cid,104,"bitter-storm","Ponte Amarga -> Ponta Tempestade",[95,104])
    for cid in ("catelyn","brienne"):
        segment(cid,112,"storm-riverrun","Ponta Tempestade -> Correrrio",[106,112])
    segment("robb",157,"crag-riverrun","Regresso do Ocidente -> Correrrio",[145,157],
            note="No capitulo145 Robb ainda e esperado; chegada mostrada em157. Passagens intermediarias aproximadas.")
    for cid in ("catelyn","robb"):
        segment(cid,192,"riverrun-twins","Correrrio -> As Gemeas",[188,192])
    for cid in ("jaime","brienne"):
        segment(cid,154,"riverrun-kneeling","Correrrio -> Estalagem do Ajoelhado",[144,154],mode="river")
        segment(cid,174,"kneeling-harrenhal","Estalagem -> Harrenhal, sob custodia",[164,174],
                note="Captura e desvios intermediarios nao possuem centros seguros; corredor regional.")
        segment(cid,205,"harrenhal-capital","Harrenhal -> Porto Real",[187,205],
                note="Inclui retorno narrativo a Harrenhal antes da partida conjunta; episodio local do urso nao medido.")
    segment("jaime",252,"harrenhal-capital","Porto Real -> Harrenhal",[241,252],reverse=True)
    segment("brienne",234,"capital-duskendale","Porto Real -> Valdocaso",[229,234])
    segment("brienne",239,"duskendale-maidenpool","Valdocaso -> Lagoa da Donzela",[234,239])
    segment("brienne",256,"maidenpool-quiet","Lagoa da Donzela -> Ilha Quieta",[250,256])
    segment("brienne",262,"quiet-crossroads","Ilha Quieta -> Estalagem no Entroncamento",[256,262])
    segment("arya",172,"acorn-stoney","Solar de Bolotas -> Septo de Pedra",[165,172])
    segment("arya",193,"harroway-twins","Regiao de Harroway -> As Gemeas",[190,193],
            note="Travessias e desvios com Sandor sao aproximados; nao implica passagem pelo castelo do Passo Sangrento.")
    segment("arya",231,"saltpans-braavos","Salinas -> Braavos",[217,231],mode="sea")
    segment("daenerys",85,"red-waste","Lhazar -> Vaes Tolorro: Deserto Vermelho",[85],
            note="Inicio em ancora regional de Lhazar, nao aldeia identificada.")
    segment("daenerys",100,"tolorro-qarth","Vaes Tolorro -> Qarth",[85,100],
            note="O portal ativava a segunda viagem em85; a chegada a Qarth so e mostrada em100.")
    segment("daenerys",166,"qarth-astapor","Qarth -> Astapor",[151,166],mode="sea")
    segment("daenerys",185,"astapor-yunkai","Astapor -> Yunkai",[170,185])
    segment("daenerys",200,"yunkai-meereen","Yunkai -> Meereen: estrada costeira",[185,200])
    segment("tyrion",272,"capital-pentos","Porto Real -> Pentos",[220,272],mode="sea",
            note="ADWD0 e prologo de Varamyr; a chegada de Tyrion e conhecida em ADWD1, indice272.")
    segment("tyrion",279,"pentos-ghoyan","Pentos -> Ghoyan Drohe",[276,279])
    for cid in ("tyrion","aegon"):
        segment(cid,285,"ghoyan-ny-sar","Ghoyan Drohe -> Ny Sar",[279,285],mode="river")
        segment(cid,289,"ny-sorrows","Ny Sar -> Os Sofrimentos",[285,289],mode="river")
        segment(cid,293,"sorrows-selhorys","Os Sofrimentos -> Selhorys",[289,293],mode="river")
    segment("tyrion",298,"selhorys-volantis","Selhorys -> Volantis",[293,298],mode="river",
            note="Sem afirmar desembarques em todas as cidades por onde passa o Roine.")
    segment("aegon",295,"selhorys-volon","Selhorys -> porto de Volon Therys",[293,295],mode="river",
            note="O acampamento da Companhia Dourada fica fora da cidade e nao recebeu posicao inventada.")
    segment("myrcella",227,"capital-sunspear","Porto Real -> Dorne: viagem de Myrcella",[114,227],mode="sea",
            note="Disponivel quando o destino e confirmado. A viagem por Braavos anunciada como disfarce nao foi tratada como visita real.")
    segment("stannis",104,"dragon-storm","Pedra do Dragao -> Ponta Tempestade",[73,104],mode="sea")
    segment("davos",115,"dragon-storm","Pedra do Dragao -> Ponta Tempestade",[83,115],mode="sea",
            note="Sem desenhar o giro de recrutamento do portal como itinerario integral certificado.")
    for cid in ("stannis","davos"):
        segment(cid,131,"storm-blackwater","Ponta Tempestade -> Baia da Agua Negra",[115,131],mode="sea",
                note="Termina na baia, nao afirma entrada de Stannis na cidade.")
        segment(cid,153,"blackwater-dragon","Baia da Agua Negra -> Pedra do Dragao",[148,153],mode="sea",
                note="Resgate de Davos e retirada nao possuem rastro exato conhecido.")
    northern = joined(paths["dragon-eastwatch"],paths["eastwatch-black-north"])
    boundary = len(paths["dragon-eastwatch"])-1
    segment("stannis",219,northern,"Pedra do Dragao -> Atalaialeste -> Castelo Negro",[216,219],
            mode="mixed",note="Corredor norte da Muralha e regresso apos a batalha; nao desenho tatico do combate.",
            legs=[{"mode":"sea","startVertex":0,"endVertex":boundary},
                  {"mode":"land","startVertex":boundary,"endVertex":len(northern)-1}])
    segment("stannis",297,"black-deepwood","Castelo Negro -> clas das montanhas -> Bosque Profundo",[288,297],
            note="Segue a alternativa pelos clas, nao uma marcha ao Forte do Pavor. Trilhas internas estimadas.")
    segment("davos",286,"sisterton-whiteharbor","Vilirmas -> Porto Branco",[280,286],mode="sea",
            note="Relato de execucao em AFFC nao foi convertido em morte real nem usado para antecipar ADWD.")

    windows = {
        "jon": [("Castle_Black",73,79,[79]),("Craster%27s_Keep",96,106,[96]),
                ("Fist_of_the_First_Men",107,116,[107,116]),
                ("Queenscrown",184,184,[184]),("Castle_Black",191,339,[191,274,340])],
        "tyrion": [("King%27s_Landing",76,219,[76,220]),("Pentos",272,275,[272]),
                   ("Ghoyan_Drohe",279,284,[279]),("Ny_Sar",285,288,[285]),
                   ("Sorrows",289,292,[289]),("Selhorys",293,297,[293]),("Volantis",298,303,[298,304])],
        "robb": [("Riverrun",73,98,[80]),("The_Crag",128,128,[128,145]),
                 ("Riverrun",157,187,[157,188]),("Twins",192,193,[192,194])],
        "catelyn": [("Riverrun",73,94,[80]),("Bitterbridge",95,103,[95]),
                    ("Storm%27s_End",104,105,[104,106]),("Riverrun",112,187,[112,188]),
                    ("Twins",192,193,[192,194])],
        "arya": [("Harrenhal",99,136,[99,137]),("Inn_of_the_Kneeling_Man",156,156,[156]),
                 ("Acorn_Hall",165,171,[165]),("Stoney_Sept",172,176,[172]),
                 ("Lord_Harroway%27s_Town",190,190,[190]),("Twins",193,193,[193]),
                 ("Saltpans",217,217,[217]),("Braavos",231,343,[231,259,316,335])],
        "sansa": [("King%27s_Landing",73,203,[75,204]),("Eyrie",223,265,[223,235,266])],
        "bran": [("Winterfell",73,141,[77,142]),("Queenscrown",183,183,[183])],
        "theon": [("Pyke",84,109,[84,97]),("Winterfell",119,138,[119,139]),
                  ("Dreadfort",283,290,[283]),("Moat_Cailin",291,291,[291]),
                  ("Barrowton",303,307,[303,308]),
                  ("Winterfell",308,321,[308,322])],
        "daenerys": [("Vaes_Tolorro",85,99,[85]),("Qarth",100,150,[100,151]),
                     ("Astapor",166,184,[166,170]),("Yunkai",185,199,[185]),
                     ("Meereen",200,322,[200,214,273,323])],
        "jaime": [("Riverrun",73,143,[118,144]),("Inn_of_the_Kneeling_Man",154,163,[154,164]),
                  ("Harrenhal",174,186,[174,180,187]),("King%27s_Landing",205,251,[205,233,241]),
                  ("Harrenhal",252,254,[252]),("Riverrun",258,318,[258,263,319])],
        "cersei": [("King%27s_Landing",73,343,[228,325,336])],
        "rickon": [("Winterfell",8,141,[8,108,142])],
        "aegon": [("Ghoyan_Drohe",279,284,[279]),("Ny_Sar",285,288,[285]),
                  ("Sorrows",289,292,[289]),("Selhorys",293,294,[293]),("Volon_Therys",295,295,[295])],
        "tywin": [("Harrenhal",99,110,[99,111]),("King%27s_Landing",135,219,[135,220])],
        "joffrey": [("Winterfell",4,11,[4,12]),("King%27s_Landing",20,202,[20,203])],
        "myrcella": [("Winterfell",4,11,[4,12]),("King%27s_Landing",20,113,[20,114]),
                     ("Sunspear",227,245,[227,238,246]),("Sunspear",265,265,[265])],
        "robert": [("Winterfell",4,11,[4,12]),("King%27s_Landing",20,42,[20,43]),
                   ("King%27s_Landing",47,48,[47,49])],
        "stannis": [("Dragonstone",73,94,[73]),("Storm%27s_End",104,130,[104,115]),
                    ("Dragonstone",153,215,[153]),("Castle_Black",219,296,[219,288]),
                    ("Deepwood_Motte",297,312,[297,313])],
        "renly": [("Bitterbridge",95,103,[95]),("Storm%27s_End",104,105,[104,106])],
        "brienne": [("Bitterbridge",95,103,[95]),("Storm%27s_End",104,105,[104,106]),
                    ("Riverrun",112,143,[112,144]),("Inn_of_the_Kneeling_Man",154,163,[154]),
                    ("Harrenhal",174,186,[174,187]),("King%27s_Landing",205,228,[205,229]),
                    ("Duskendale",234,238,[234]),("Maidenpool",239,244,[239,245]),
                    ("Maidenpool",250,255,[250]),("Quiet_Isle",256,261,[256]),
                    ("Crossroads_Inn",262,266,[262,267])],
        "davos": [("Dragonstone",83,94,[83]),("Storm%27s_End",115,130,[115,131]),
                  ("Dragonstone",153,215,[153]),("Sisterton",280,285,[280]),
                  ("White_Harbor",286,300,[286,300])],
        "samwell": [("Castle_Black",26,79,[26,79]),("Craster%27s_Keep",96,106,[96]),
                    ("Fist_of_the_First_Men",107,143,[107,143,161]),("Craster%27s_Keep",176,176,[176]),
                    ("Castle_Black",218,239,[218,230]),("Braavos",251,259,[251]),
                    ("Oldtown",270,343,[270])],
        "asha": [("Winterfell",129,129,[129]),("Deepwood_Motte",297,312,[297,313])],
        "victarion": [("Moat_Cailin",123,123,[123])],
        "arianne": [("Sunspear",265,265,[265])],
        "littlefinger": [("King%27s_Landing",98,108,[98,109]),("King%27s_Landing",135,161,[135,162]),
                         ("Eyrie",223,265,[223,266])],
    }
    for cid, values in windows.items():
        for key, start, end, scenes in values:
            position(cid,key,start,end,scenes)

    ledger = []
    for cid, route in routes.items():
        route["segments"].sort(key=lambda s: s["startChapter"])
        route["positions"].sort(key=lambda p: p["startChapter"])
        for earlier, later in zip(route["segments"], route["segments"][1:]):
            if earlier["points"][-1] != later["points"][0]:
                later["gapBefore"] = True
                later["geometryNotice"] += (
                    " Ha deslocamentos nao calibrados desde o trecho anterior; "
                    "nenhuma linha automatica foi criada para preencher a lacuna.")
        imported = [item["sourceRecordIndex"] for item in
                    route["segments"] + route["positions"]
                    if item["sourceRecordIndex"] is not None]
        assert len(imported) == len(set(imported))
        for entry in source[cid]["records"]:
            i, record = entry["index"], entry["record"]
            caps = record["chapters"]
            start = caps[0] if isinstance(caps, list) else caps
            disposition = ("inherited-v3" if i in imported else
                           "unpublished-preview-excluded" if start > 343 else
                           "not-directly-replayed")
            row = {"character": cid, "sourceRecordIndex": i, "disposition": disposition}
            ledger.append(row)
            if i not in imported:
                reason = ("Previa TWOW fora dos cinco livros publicados." if start > 343 else
                          "Registro legado nao reproduzido diretamente: suplementos narrativos "
                          "independentes nao certificam coordenadas ou intervalo originais.")
                route["omittedSourceRecordIndices"].append(i)
                route["omittedRecords"].append({"sourceRecordIndex": i, "reason": reason,
                                                "startChapter": start, "endChapter": min(
                                                    caps[1] if isinstance(caps,list) and len(caps)>1 else 343,343)})
        route["coverage"] = {
            "sourceRecords": len(source[cid]["records"]),
            "segmentRecords": sum(s["sourceRecordIndex"] is not None for s in route["segments"]),
            "positionRecords": sum(p["sourceRecordIndex"] is not None for p in route["positions"]),
            "omittedRecords": len(route["omittedRecords"]),
            "supplementalSegments": sum(s["sourceRecordIndex"] is None for s in route["segments"]),
            "supplementalPositions": sum(p["sourceRecordIndex"] is None for p in route["positions"]),
        }
        # Scene-specific evidence stays on the chapter-gated feature, not the
        # always-open sources panel, to avoid exposing later itinerary names.
        if cid not in {r["id"] for r in base["routes"]}:
            route["evidence"] = [{
                "kind": "portal", "label": "Identidade e registros de referencia; integracao parcial",
                "locator": f"atlas/data/portal-saga-v4-referencia.json; {cid}",
            }]

    output["inventory"] = {
        "entries": len(points),
        "namedEntries": sum(p["identificationStatus"] != "unidentified-symbol" for p in points),
        "unidentifiedSymbols": sum(p["identificationStatus"] == "unidentified-symbol" for p in points),
        "reviewedSectors": 36,
        "coverageNotice": "36 setores revistos; novos simbolos escuros incluidos manualmente. "
                          "Expansao auditavel, nao certificacao independente de exaustividade.",
        "routeNotice": "27 perfis; parte tem apenas localidades verificadas, sem linha em lacunas. "
                       "Todas as linhas sao corredores aproximados.",
        "spreadsheetNotice": "Captura colaborativa anterior preservada; nao foi afirmada nova auditoria "
                             "de todas as linhas da planilha para os livros seguintes.",
        "bookAuditNotice": "Indice LeYa dos344 capitulos; cenas de novos suplementos conferidas "
                           "separadamente. Auditoria de nomes conserva seus115 registros anteriores.",
    }
    output["limitations"] = [
        "Cinco livros publicados, capitulos0-343 em ordem de publicacao, nao cronologia sincronizada.",
        "AFFC e ADWD narram periodos sobrepostos. Ultima referencia por leitura nao e posicao em tempo real.",
        "Inventario ampliado apos revisao visual dos36 setores; nao promessa de censo infalivel.",
        "Simbolos sem nome seguro recebem ponto anonimo, sem associacao por simples proximidade.",
        "Corredores regionais manuais, nunca caminhos exatos medidos. Desvios e escalas podem nao estar calibrados.",
        "Os27 perfis nao representam27 itinerarios completos; alguns possuem apenas posicoes parciais.",
        "Capitulos de chegada corrigidos explicitamente; nenhuma previa inedita TWOW integrada.",
        "Sem interpolar localidades em lacunas, prolongar personagens mortos ou desenhar voos sem destino seguro.",
        "Planilha colaborativa nao prova datas oficiais, geometria nem verificacao literaria de cada trecho.",
        "LeYa e Suma sao edicoes distintas; nomes da interface herdados nao certificam todas as traducoes.",
    ]
    output["routeRevision"] = {
        "id": "saga-v4", "baseDatasetSha256": BASE_SHA,
        "policy": NOTICE,
        "bookIndex": "atlas/data/indice-livros-v4.json",
        "sourceLedger": "atlas/data/saga-v4-diagnostico.json",
        "unresolved": [
            "Bran alem de Coroadarrainha, Rickon apos Winterfell e refugios sem centro calibrado.",
            "Viagens completas de Asha, Victarion, Arianne, Mindinho e chegada de Jovem Griff a Westeros.",
            "Voo de Daenerys, acampamentos de Tyrion e aldeia da marcha de Stannis sem posicao exata.",
            "Outros movimentos entre posicoes confirmadas permanecem sem linha quando a geografia e insuficiente.",
        ],
    }
    sidecar = copy.deepcopy(read("nomes-inventario-v3-evidencias.json"))
    sidecar["datasetId"] = "atlas-saga-v4"
    sidecar["scopeNotice"] = (
        "115 registros de ocorrencia herdados e preservados; nao estender a novos nomes ou trajetos.")
    report = {
        "datasetId": output["datasetId"], "inventory": output["inventory"],
        "characters": len(routes),
        "segments": sum(len(r["segments"]) for r in routes.values()),
        "positions": sum(len(r["positions"]) for r in routes.values()),
        "newSegments": sum(e["kind"] == "segment" for e in reviewed_events),
        "events": reviewed_events, "sourceLedger": ledger,
        "policy": "Every frozen original record is accounted once. Narrative supplements are separate. "
                  "Book scene locators establish context, not exact geometry or continuous tracking.",
        "chaptersRead": sorted({c for e in reviewed_events for c in e["chaptersRead"]}),
        "chronologyCorrections": [
            "Qarth100, not85; Tyrion Pentos272, notADWD prologue271.",
            "Samwell Oldtown270 inAFFC, not281 inADWD.",
            "Robb returns157, still expected145; no living marker afterRedWedding194.",
            "Jaime andBrienne arriveKingsLanding205, not210.",
            "Arya leavesHarrenhal137, BranQueenscrown183, Sansa leavesEyrie266.",
            "Theon escapesWinterfell322; no continuing city marker thereafter.",
            "Theon atBarrowton303, not a prolongedMoatCailin position; Brienne already outsideKingsLanding229.",
            "Jon leavesFist after116; Sam atFist throughASOS prologue143, not continuously through160.",
            "Daenerys departsMeereen323, not342; unknown flight endpoint not drawn.",
            "Myrcella announcedBraavos decoy not asserted as actual stop; falseDavos execution not accepted.",
            "Dead Robert49, Eddard65, Renly106, Robb/Catelyn194, Joffrey203, Tywin220 not prolonged as living markers.",
        ],
    }
    validate(output, base, portal, review, report)
    return output, sidecar, report


def validate(output, base, portal, review, report):
    assert output["controlPoints"][:len(base["controlPoints"])] == base["controlPoints"]
    assert len(output["controlPoints"]) == 242
    points = {p["id"]: p for p in output["controlPoints"]}
    assert len(points) == len(output["controlPoints"])
    memberships = [i for r in output["regions"] for i in r["pointIds"]]
    assert len(memberships) == len(set(memberships)) == len(points)
    assert set(memberships) == set(points)
    candidate_ids = [i for p in points.values() for i in p.get("reviewedCandidateIds", [])]
    assert len(candidate_ids) == len(set(candidate_ids))
    assert set(review["acceptedCandidateIds"]) <= set(candidate_ids)
    for p in points.values():
        assert 0 <= p["x"] < output["mapWidth"] and 0 <= p["y"] < output["mapHeight"]
    assert [c["index"] for c in output["chapters"]] == list(range(344))
    assert len(output["routes"]) == 27
    for route in output["routes"]:
        for c in range(344):
            active = [p for p in route["positions"] if p["startChapter"] <= c <= p["endChapter"]]
            assert len(active) <= 1, (route["id"], c, active)
        for p in route["positions"]:
            assert p["locationId"] in points and 0 <= p["startChapter"] <= p["endChapter"] <= 343
        for s in route["segments"]:
            assert 0 <= s["startChapter"] <= s["endChapter"] <= 343
            assert len(s["points"]) >= 2 and s["status"] == "approximate"
            for x,y in s["points"]:
                assert 0 <= x < output["mapWidth"] and 0 <= y < output["mapHeight"]
            if s["travelMode"] == "mixed":
                legs = s["transportLegs"]
                assert legs[0]["startVertex"] == 0 and legs[-1]["endVertex"] == len(s["points"])-1
                for a,b in zip(legs,legs[1:]):
                    assert a["endVertex"] == b["startVertex"]
        coverage = route["coverage"]
        assert coverage["sourceRecords"] == (coverage["segmentRecords"] +
                                              coverage["positionRecords"] + coverage["omittedRecords"])
    expected = {(c["id"],r["index"]) for c in portal["characters"] for r in c["records"]}
    ledger_keys = [(r["character"],r["sourceRecordIndex"]) for r in report["sourceLedger"]]
    assert len(ledger_keys) == len(set(ledger_keys)) and set(ledger_keys) == expected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--replace-candidate", action="store_true",
                        help="Explicitly replace only the unpublished candidate/report, never frozen sources")
    args = parser.parse_args()
    output, sidecar, report = build()
    outputs = {
        "atlas-inventario-v4-candidato.json": output,
        "nomes-inventario-v4-evidencias-candidato.json": sidecar,
        "saga-v4-diagnostico-candidato.json": report,
    }
    encoded = {name: json.dumps(value, ensure_ascii=True, indent=2)+"\n"
               for name,value in outputs.items()}
    for name,text in encoded.items():
        path = DATA / name
        if path.exists() and path.read_text(encoding="utf-8") != text and not args.replace_candidate:
            raise ValueError("Candidate differs; explicit --replace-candidate required: " + name)
    for name,text in encoded.items():
        (DATA / name).write_text(text,encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k in
                      ("inventory","characters","segments","positions","newSegments")},indent=2))


if __name__ == "__main__":
    main()
