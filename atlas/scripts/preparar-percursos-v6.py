"""Lead-authored narrative supplements; writes candidates, never the live URL."""
import copy
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BASE_SHA = "e100756cbc9be874128db96ef6af540e8f6720312ff45df4086774e29e4d8999"
NOTICE = (
    "Corredor cartografico aproximado, nao caminho exato medido. "
    "Disponibilidade por capitulo na ordem de leitura, nao data de chegada. "
    "Sem interpolacao da posicao. Travessias, praias e desvios nao medidos. "
)
STATUS_NOTICES = {
    "partial-route": "Revisao cartografica parcial deste livro; ha lacunas e curvas aproximadas.",
    "positions-only": "Apenas referencias de localidade disponiveis; percurso deste livro incompleto.",
    "no-reviewed-records": (
        "Sem registros cartograficos revisados neste livro; "
        "isso nao significa ausencia de deslocamento."
    ),
}
GAPS = {
    "jon": "Passo de Qhorin, acampamentos selvagens e escalada sem pontos seguros.",
    "tyrion": "Temporais, abordagem e acampamentos de escravos sem coordenadas exatas; nao entra em Meereen nos cinco livros.",
    "robb": "Campanha ocidental, Oxcross e desvio por trilha de cabras sem calibracao suficiente.",
    "catelyn": "Desvios intermediarios e itinerario da Senhora Coracao de Pedra nao reconstruidos.",
    "eddard": "Itinerario parcial; deslocamentos internos de Porto Real nao modelados.",
    "arya": "Aldeias, Alto Coracao e esconderijos sem centro seguro; intento de ir ao Portao Sangrento nao prova chegada.",
    "sansa": "Desembarque nos Dedos e descida ao Portao da Lua sem calibracao pontual.",
    "bran": "Torres, Forte Noite e caverna alem da Muralha sem calibracao suficiente.",
    "theon": "Costa Pedregosa, fuga de Winterfell e aldeia dos pescadores sem caminho exato.",
    "daenerys": "Acampamentos e voo final sem destino cartografico seguro; nao interpolados.",
    "jaime": "Darry, Corvarbor e arvoredos intermediarios sem pontos calibrados; cerco nao significa presenca dentro do castelo.",
    "cersei": "Localidades e corredores parciais; movimentos intraurbanos nao modelados.",
    "rickon": "Refugios apos Winterfell nao posicionados por inferencia.",
    "aegon": "Frota dispersa e praia de desembarque nao localizadas; nenhuma conquista futura presumida.",
    "tywin": "Marchas, vaus do Tridente e encontro de exercitos nao completamente calibrados.",
    "joffrey": "Referencias de localidade, nao rastreamento urbano continuo.",
    "myrcella": "Pedramarela e intercepcao no Sangueverde sem ponto seguro; plano de subir o Vaith nao executado.",
    "robert": "Cacada e deslocamentos internos sem ponto seguro; limite final preservado.",
    "stannis": "Marcha apos Bosque Profundo e aldeia sem localizacao segura.",
    "renly": "Viagem anterior a Ponteamarga e deslocamentos intermediarios nao reconstruidos.",
    "brienne": "Sussurros, esconderijo da Irmandade e trajetos secundarios sem calibracao suficiente.",
    "davos": "Separacao da frota, tormentas e etapas apos Porto Branco nao reconstruidas.",
    "samwell": "Retirada entre acampamentos e Forte Noite nao completamente calibrada.",
    "asha": "Dez Torres, assembleia e marcha apos Bosque Profundo sem pontos seguros.",
    "victarion": "Assembleia, Escudos e local preciso das abordagens nao calibrados; nenhuma chegada a Meereen afirmada.",
    "arianne": "Pedramarela nao calibrada; captura impede a viagem planejada rio acima.",
    "littlefinger": "Dedos e transicao ao Vale sem corredor seguro; missao em Ponteamarga mostrada retrospectivamente.",
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def main():
    assert sha(DATA / "atlas-inventario-v5.json") == BASE_SHA
    base = read("atlas-inventario-v5.json")
    cfg = read("percursos-v6-cenarios.json")
    assert cfg["baseSha256"] == BASE_SHA
    index = read("indice-livros-v4.json")
    scenes = {s["globalIndex"]: s for s in index["chapters"]}
    assert set(scenes) == set(range(344))
    output = copy.deepcopy(base)
    output["datasetId"] = "atlas-saga-v6"
    routes = {r["id"]: r for r in output["routes"]}
    points = {p["id"]: p for p in output["controlPoints"]}
    aliases = dict(output["locationAliases"])
    aliases.update({p["originalKey"]: p["id"] for p in points.values()
                    if p.get("originalKey")})
    events = []

    def point_id(key):
        result = key if key in points else aliases[key]
        assert result in points, key
        return result

    def xy(key):
        p = points[point_id(key)]
        return [p["x"], p["y"]]

    def evidence(chapters):
        return [{
            "kind": "book-scene",
            "label": f"Contexto e limites; capitulo global {cap}; nao prova curvas",
            "locator": f"{scenes[cap]['edition']}; {scenes[cap]['member']}#{scenes[cap]['anchor']}",
        } for cap in chapters]

    def path(names):
        result = []
        for name in names:
            for raw in cfg["paths"][name]:
                p = xy(raw) if isinstance(raw, str) else raw[:]
                if not result or result[-1] != p:
                    result.append(p)
        return result

    for event in cfg["events"]:
        assert event["scenes"] and max(event["scenes"]) <= event["chapter"]
        vertices = path(event["paths"])
        if event.get("reverse"):
            vertices.reverse()
        policy = event.get("legPolicy")
        if policy == "asha-coast":
            coast = vertices.index([2850, 3308])
            legs = [("sea", 0, coast), ("land", coast, len(vertices) - 1)]
        elif policy == "victarion-fever":
            inlet = vertices.index([2950, 4820])
            head = vertices.index([3648, 4768])
            legs = [("sea", 0, inlet), ("river", inlet, head),
                    ("land", head, len(vertices) - 1)]
        elif policy == "aegon-river-sea":
            mouth = vertices.index([8350, 9580])
            legs = [("river", 0, mouth), ("sea", mouth, len(vertices) - 1)]
        else:
            assert event["mode"] in ("land", "sea", "river")
            legs = [(event["mode"], 0, len(vertices) - 1)]
        for cid in event["characters"]:
            route = routes[cid]
            for old_id in event.get("replaceIds", []):
                found = [s for s in route["segments"] if s["id"] == old_id]
                if not old_id.startswith(cid + "-"):
                    continue
                assert len(found) == 1, old_id
                route["segments"].remove(found[0])
            number = sum(s["id"].startswith(cid + "-v6-") for s in route["segments"])
            seg = {
                "id": f"{cid}-v6-{event['chapter']}-{number}",
                "sourceRecordIndex": None,
                "supplementPolicy": "Narrative supplement, not a replayed portal record",
                "startChapter": event["chapter"], "endChapter": 343,
                "bookId": scenes[event["chapter"]]["bookId"],
                "status": "approximate",
                "geometryStatus": "manual-regional-corridor-v6",
                "geometryNotice": NOTICE + event["context"],
                "label": event["label"], "points": copy.deepcopy(vertices),
                "travelMode": event["mode"],
                "transportLegs": [{"mode": mode, "startVertex": start, "endVertex": end}
                                  for mode, start, end in legs],
                "evidence": evidence(event["scenes"]) + [{
                    "kind": "scan-corridor",
                    "label": "Coordenadas nativas estimadas; praia, vau e trilhas nao certificados",
                    "locator": "mapas/jpeg/O Mundo Conhecido.jpg; coordenadas nativas recortadas",
                }, {
                    "kind": "control-point-reference",
                    "label": "Identidades e coordenadas de localidades preservadas; nao certificam curvas",
                    "locator": f"atlas/data/atlas-inventario-v5.json; SHA256 {BASE_SHA}",
                }],
            }
            route["segments"].append(seg)
            events.append({"character": cid, "featureId": seg["id"],
                           "chapter": event["chapter"], "scenes": event["scenes"],
                           "context": event["context"],
                           "replacedFeatureIds": [i for i in event.get("replaceIds", [])
                                                  if i.startswith(cid + "-")]})

    def position(cid, key, start, end, chapters, note):
        assert chapters and max(chapters) <= start
        p = {
            "id": f"{cid}-v6-pos-{start}", "sourceRecordIndex": None,
            "supplementPolicy": "Narrative supplement, not a replayed portal record",
            "startChapter": start, "endChapter": end, "locationId": point_id(key),
            "status": "approximate", "evidence": evidence(chapters),
            "note": "Referencia de cena, nao presenca continua. " + note,
        }
        routes[cid]["positions"].append(p)
        events.append({"character": cid, "featureId": p["id"], "chapter": start,
                       "scenes": chapters, "context": note})

    for cid in ("jon", "samwell"):
        position(cid, "White_Tree", 86, 86, [86],
                 "A coluna parte de Brancarbor no mesmo capitulo; nenhum pino prolongado ate 95.")
    position("asha", "Deepwood_Motte", 123, 123, [123],
             "Referencia indireta na cena de Theon em 123, nao o plano de 97; nenhum pino presumido em dias de caminho.")
    position("arianne", "Sunspear", 238, 238, [238],
             "Cena com Arys em Lancassolar; Pedramarela nao foi localizada.")
    position("aegon", "Griffin%27s_Roost", 332, 332, [332],
             "Jovem Griff chega pessoalmente, montado, quatro dias depois da tomada.")
    littlefinger = next(p for p in routes["littlefinger"]["positions"]
                        if p["startChapter"] == 135)
    littlefinger["startChapter"] = 138
    littlefinger["evidence"] = evidence([138])
    littlefinger["note"] = (
        "Retorno testemunhado na audiencia de recompensas em 138, nao presumido na batalha 135. "
        "Ultima referencia de localidade; nao rastreamento continuo."
    )

    matrix = []
    for cid, route in routes.items():
        route["segments"].sort(key=lambda s: s["startChapter"])
        route["positions"].sort(key=lambda p: p["startChapter"])
        for previous, seg in zip(route["segments"], route["segments"][1:]):
            if seg["id"].startswith(cid + "-v6-") and previous["points"][-1] != seg["points"][0]:
                seg["gapBefore"] = True
                seg["geometryNotice"] += " Ha lacuna desde o trecho anterior; nenhuma linha automatica a preenche."
        route["bookCoverage"] = []
        reviewed = {cap for check in cfg.get("extraSceneChecks", [])
                    if check["character"] == cid for cap in check["chapters"]}
        for feature in route["segments"] + route["positions"]:
            for ev in feature.get("evidence", []):
                if ev.get("kind") == "book-scene":
                    match = re.search(r"capitulo global (\d+)", ev.get("label", ""))
                    if match:
                        reviewed.add(int(match.group(1)))
        for book in output["books"]:
            lo, hi = book["startChapter"], book["endChapter"]
            ss = sum(lo <= s["startChapter"] <= hi for s in route["segments"])
            pp = sum(max(lo, p["startChapter"]) <= min(hi, p["endChapter"])
                     for p in route["positions"])
            status = "partial-route" if ss else "positions-only" if pp else "no-reviewed-records"
            entry = {
                "bookId": book["id"], "status": status,
                "notice": STATUS_NOTICES[status], "segmentsStartingInBook": ss,
                "positionReferencesInBook": pp,
                "reviewedChapters": sorted(c for c in reviewed if lo <= c <= hi),
            }
            route["bookCoverage"].append(entry)
            matrix.append({"character": cid, **entry})
        route["coverage"]["supplementalSegments"] = sum(
            s["sourceRecordIndex"] is None for s in route["segments"])
        route["coverage"]["supplementalPositions"] = sum(
            p["sourceRecordIndex"] is None for p in route["positions"])
        for chapter in range(344):
            assert sum(p["startChapter"] <= chapter <= p["endChapter"]
                       for p in route["positions"]) <= 1, (cid, chapter)
        for seg in route["segments"]:
            assert 0 <= seg["startChapter"] <= seg["endChapter"] <= 343
            assert all(0 <= x < output["mapWidth"] and 0 <= y < output["mapHeight"]
                       for x, y in seg["points"])
            legs = seg.get("transportLegs", [])
            assert not legs or legs[0]["startVertex"] == 0
            assert not legs or legs[-1]["endVertex"] == len(seg["points"]) - 1
            for left, right in zip(legs, legs[1:]):
                assert left["endVertex"] == right["startVertex"]
        for p in route["positions"]:
            assert p["locationId"] in points

    assert output["controlPoints"] == base["controlPoints"]
    assert output["regions"] == base["regions"]
    assert output["chapters"] == base["chapters"]
    assert output["books"] == base["books"]
    assert len(matrix) == 135
    assert not any(p["locationId"] == "Meereen" and p["startChapter"] >= 271
                   for p in routes["tyrion"]["positions"])
    totals = {"characters": len(routes), "controlPoints": len(points),
              "segments": sum(len(r["segments"]) for r in routes.values()),
              "positions": sum(len(r["positions"]) for r in routes.values()),
              "bookCharacterRows": len(matrix)}
    output["inventory"]["routeNotice"] = (
        f"{totals['segments']} trechos; cobertura parcial dos 27 perfis. "
        "Matriz por livro descreve registros disponiveis, nao percentual de completude."
    )
    output["inventory"]["bookAuditNotice"] = (
        "Indice LeYa por ancoras; cenas selecionadas, nao releitura integral dos cinco livros."
    )
    output["routeRevision"] = {
        "id": "percursos-v6", "baseDatasetSha256": BASE_SHA,
        "policy": cfg["policy"], "sourceLedger": "atlas/data/percursos-v6-diagnostico.json",
        "scopeNotice": "135 combinacoes inventariadas; isso nao certifica revisao literaria exaustiva.",
    }
    output["limitations"].append(
        "v6 amplia contextos selecionados. A planilha colaborativa congelada nao foi reauditada integralmente; "
        "nenhuma data estimada foi tratada como oficial."
    )
    sidecar = read("nomes-inventario-v5-evidencias.json")
    sidecar["datasetId"] = output["datasetId"]
    sidecar["scopeNotice"] = (
        "Mesmos 115 registros historicos de ocorrencia; v6 nao amplia certificacao de nomes."
    )
    report = {
        "datasetId": output["datasetId"], "totals": totals,
        "datasetSha256": hashlib.sha256(encoded(output)).hexdigest(),
        "builderSha256": sha(Path(__file__)),
        "geometryReviewStatus": cfg["state"],
        "geometryReview": cfg.get("geometryReview", {}),
        "inputs": {name: sha(DATA / name) for name in [
            "atlas-inventario-v5.json", "percursos-v6-cenarios.json",
            "indice-livros-v4.json", "nomes-inventario-v5-evidencias.json"]},
        "events": events, "additionalSceneChecks": cfg.get("extraSceneChecks", []),
        "bookCharacterCoverage": matrix,
        "knownNarrativeGaps": GAPS,
        "policy": (
            "Counts describe records, not source-completeness percentages. Reviewed chapters include "
            "frozen v4 scene evidence plus selected v6 contexts, not a new complete reread. "
            "Legacy omittedSourceRecordIndices account for portal replay only, not uncovered narrative events."
        ),
        "chronologyCorrection": {"character": "littlefinger", "oldStart": 135, "newStart": 138},
    }
    outputs = {
        "atlas-percursos-v6-candidato.json": output,
        "nomes-percursos-v6-evidencias-candidato.json": sidecar,
        "percursos-v6-diagnostico-candidato.json": report,
    }
    for name, value in outputs.items():
        payload = encoded(value)
        (DATA / name).write_bytes(payload)
        print(name, hashlib.sha256(payload).hexdigest())
    print(json.dumps(totals, sort_keys=True))


if __name__ == "__main__":
    main()
