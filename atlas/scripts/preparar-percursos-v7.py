"""Constroi atlas-percursos-v7.json: itinerarios continuos por personagem.

Entradas (read-only):
  atlas/data/atlas-percursos-v6.json   — pontos de controle, livros, geometria v6
  atlas/scripts/itinerarios_v7_fonte.py — paradas/modos/vias/death (autoria do lead)
  assets/js/data.js                  — lat/lng do portal para waypoints portalKey
  atlas/tiles/o-mundo-conhecido-recorte-v1/4/{x}/{y}.webp — raster mar/terra

Saidas:
  atlas/data/atlas-percursos-v7.json
  atlas/data/percursos-v7-diagnostico.json

Geometria de cada trecho: primeiro tenta reaproveitar um segmento v6 cujas
pontas estejam a menos de ~80 px das do sub-trecho (qualquer sentido); senao,
busca caminho minimo no raster mar/terra (MCP) com custo por modo:
  land  : terra 1, agua 30    (rios/estreitos curtos ok; nunca mar longo)
  sea   : agua 1, terra 40;   terra ~1.3 perto das pontas (portos fluviais)
  river : agua 1, terra 2.5   (prefere pixels de agua/rio)
  mixed : agua 1, terra 1.6   (mar barato + terra normal)
Depois simplifica (Douglas-Peucker ~8 px) e limita a ~60 vertices por trecho.
"""
import argparse
import importlib.util
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "atlas/data"
TILES = ROOT / "atlas/tiles/o-mundo-conhecido-recorte-v1"
FONTE = ROOT / "atlas/scripts/itinerarios_v7_fonte.py"
PORTAL_JS = ROOT / "assets/js/data.js"

MAP_W, MAP_H = 21654, 14428
CELL = 4  # raster: 1 celula = 4 px nativos (mosaico z4)
REUSE_TOL = 80.0      # tolerancia de ponta para reuso de geometria v6
SEA_STUB = 140.0      # raio das pontas onde trecho maritimo pode ir por terra
SEA_GRAZE = 96.0      # terra costeira/ilhas que um trecho maritimo tangencia
SEA_GRAZE_RUN = 240.0 # comprimento max de um trecho maritimo sobre terra rasa
LAND_WATER_MAX = 260.0 # travessia max de agua num trecho terrestre
                       # (rio largo, braco de baia, estreito — nunca mar aberto)
LAND_SEA_COST = 30.0  # custo de agua num trecho terrestre
SEA_LAND_COST = 200.0 # custo de terra num trecho maritimo (forca contornar)
DP_TOL = 8.0          # tolerancia Douglas-Peucker em px nativos
MAX_VERTS = 60

# ---------------------------------------------------------------------------
# waypoints: coordenadas finais (px nativos) revisadas nos tiles z6.
# portalKey -> projecao westerosModel; approx -> conferidos visualmente e
# ajustados quando caem fora do desenho (ilhas, Muralha, rios).
# ---------------------------------------------------------------------------

PORTAL_LATLNG = {
    "Darry": (21.84110474906504, -112.470703125),
    "Nightfort": (76.33114246585924, -109.5556640625),
    "Stony_Shore": (62.66405506888221, -160.01953125),
    "High_Heart": (18.45876812001513, -124.6435546875),
    "Hollow_Hill": (11.2861607687526, -128.115234375),
    "Raventree_Hall": (19.91138351415555, -118.6669921875),
    "Whispers": (18.52128332549627, -84.60937),
    "Ten_Towers": (31.37239910488052, -144.462890625),
    "Shandystone": (-42.4558876419711, -92.197265625),
}

# ajustes manuais sobre projecao/approx (ver tabela no relatorio/diagnostico)
# novos simbolos confirmados na auditoria v7 (ver
# atlas/data/auditoria-simbolos-v7.json)
NEW_POINTS = [
    {"id": "scan-v7-3704-8732", "label": "Castelo nas Montanhas Vermelhas",
     "english": "Castle in the Red Mountains", "x": 3704, "y": 8732,
     "kind": "castle", "region": "westeros", "status": "manual-review",
     "identificationStatus": "geographically-described",
     "labelType": "geographic-description",
     "summary": "Descricao geografica do simbolo: vertente norte das "
                "Montanhas Vermelhas, na fronteira da Marca de Dorne. "
                "Nao foi localizado nome proprio individual nas "
                "referencias consultadas.",
     "note": "O rotulo e uma descricao editorial de localizacao, nao um "
             "nome canonico nem uma traducao nova."},
    {"id": "scan-v7-20370-8930", "label": "Castelo a oeste de Bonetown",
     "english": "Castle west of Bonetown", "x": 20370, "y": 8930,
     "kind": "castle", "region": "oriente", "status": "manual-review",
     "identificationStatus": "geographically-described",
     "labelType": "geographic-description",
     "summary": "Descricao geografica do simbolo: costa no extremo "
                "oriental de Essos, a oeste de Bonetown. Nao foi "
                "localizado nome proprio individual nas referencias "
                "consultadas.",
     "note": "O rotulo e uma descricao editorial de localizacao, nao um "
             "nome canonico nem uma traducao nova."},
]

# renomeacoes v7: nome proprio documentado no mapa companheiro
# (O Ocidente) + artigo AWOIAF; ver atlas/data/auditoria-simbolos-v7.json
RENAMES = {
    "scan-site-v4-799": {
        "label": "Último Lamento", "english": "Last Lament",
        "originalKey": "Last_Lament",
        "identificationStatus": "wiki-review",
        "labelType": "proper-name",
        "summary": "Localidade nomeada no mapa companheiro O Ocidente na "
                   "ponta noroeste de Walano; corresponde ao artigo "
                   "AWOIAF Last Lament, assentamento de Walano.",
        "note": "Nome proprio documentado por posicao no mapa regional "
                "e na wiki; nao e descricao editorial."},
}

WAYPOINT_FINAL = {
    "w:nightfort": (3850, 2330),      # Muralha, a oeste de Castelo Negro
    "w:wall-climb": (3960, 2330),     # sobre a linha da Muralha
    "w:skagos": (5230, 2590),         # sobre a ilha
    "w:old-wyk": (2460, 5960),        # sobre a ilha Velha Wyk
    "w:shield-islands": (2270, 8185), # sobre ilha do arquipelago Escudo
    "w:green-fork": (3835, 6150),     # margem oeste do Ramo Verde
    "w:red-fork": (3546, 6358),       # sobre o rio Ramo Vermelho
    "w:blackwater-bay": (4660, 7290), # sobre a agua da baia
    "w:stoneheart": (3980, 6415),     # em terra, ao sul da confluencia
    "w:mance-camp": (3568, 1955),     # margem do Guadeleite
    "w:ten-towers": (2670, 5990),     # sobre a ilha Harlaw
    "w:greenblood": (4350, 9020),     # sobre o rio Sangueverde
}


def load_fonte():
    spec = importlib.util.spec_from_file_location("itinerarios_v7_fonte", FONTE)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def old_pixel(latlng):
    lat, lng = latlng
    return [(lng + 180) / 360 * 4642,
            (0.5 - math.asinh(math.tan(math.radians(lat))) / (2 * math.pi)) * 4642]


def transform(model, pixel):
    vector = [pixel[0] - model["sourceOrigin"][0],
              pixel[1] - model["sourceOrigin"][1], 1]
    return [sum(a * b for a, b in zip(row, vector))
            for row in model["coefficients"]]


# ---------------------------------------------------------------------------
# raster mar/terra a partir dos tiles z4 (persistido em evidencias p/ reuso)
# ---------------------------------------------------------------------------

def build_raster():
    cache = DATA.parent / "test/evidencias/raster-agua.npy"
    if cache.exists():
        water = np.load(str(cache))
    else:
        cols, rows = 11, 8  # tiles z4 cobrem 22528x16384 >= mapa nativo
        big = np.zeros((rows * 512, cols * 512, 3), dtype=np.uint8)
        for tx in range(cols):
            for ty in range(rows):
                p = TILES / "4" / str(tx) / (str(ty) + ".webp")
                if p.exists():
                    big[ty * 512:(ty + 1) * 512,
                        tx * 512:(tx + 1) * 512] = np.asarray(
                            Image.open(p).convert("RGB"))
        water = (big[:, :, 2].astype(int) - big[:, :, 0].astype(int)) > 28
    dist = DATA.parent / "test/evidencias/raster-agua-dist.npy"
    if dist.exists():
        wdist = np.load(str(dist))
    else:
        # distancia (em celulas) ate o pixel de agua mais proximo; 0 na agua
        wdist = distance_transform_edt(~water)
        np.save(str(dist), wdist)
    return water, wdist


# ---------------------------------------------------------------------------
# raster de estradas (estradas-v1.json + corredores terrestres do portal)
# ---------------------------------------------------------------------------

ROAD_RADIUS_CELLS = 3      # ~12 px de margem em torno da linha impressa
ROAD_FACTOR = 0.25         # custo do corredor de estrada (fracao da terra)
PIN_RADIUS_PX = 25.0       # perna terrestre nao deve esmagar pinos alheios
PIN_PENALTY = 25.0
PIN_STUB_PX = 110.0        # pontas do trecho ficam isentas do penalty de pino


def build_corridor_rasters(shape):
    """Mask bool de corredores de estrada + distancia (em celulas) ate eles."""
    cache = DATA.parent / "test/evidencias/raster-estradas.npy"
    if cache.exists():
        road = np.load(str(cache))
        if road.shape == shape:
            return road, distance_transform_edt(~road)
    road = np.zeros(shape, dtype=bool)
    polys = []
    ef = DATA / "estradas-v1.json"
    if ef.exists():
        polys += [r["points"] for r in
                  json.loads(ef.read_text(encoding="utf-8"))]
    pf = DATA / "caminhos-portal-terra.json"
    if pf.exists():
        polys += [s["pts"] for s in
                  json.loads(pf.read_text(encoding="utf-8"))]
    for pts in polys:
        for x, y in sample_path(pts, step=2.0):
            cx, cy = int(x) // CELL, int(y) // CELL
            for dy in range(-ROAD_RADIUS_CELLS, ROAD_RADIUS_CELLS + 1):
                for dx in range(-ROAD_RADIUS_CELLS, ROAD_RADIUS_CELLS + 1):
                    if (dx * dx + dy * dy <= ROAD_RADIUS_CELLS ** 2
                            and 0 <= cy + dy < shape[0]
                            and 0 <= cx + dx < shape[1]):
                        road[cy + dy, cx + dx] = True
    np.save(str(cache), road)
    return road, distance_transform_edt(~road)


def build_pin_raster(shape, control_points):
    pin = np.zeros(shape, dtype=bool)
    r = int(math.ceil(PIN_RADIUS_PX / CELL))
    for cp in control_points:
        x, y = cp.get("x"), cp.get("y")
        if x is None or y is None:
            continue
        cx, cy = int(x) // CELL, int(y) // CELL
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                if (dx * dx + dy * dy <= r * r
                        and 0 <= cy + dy < shape[0]
                        and 0 <= cx + dx < shape[1]):
                    pin[cy + dy, cx + dx] = True
    return pin


def road_deviation(rdist, pts):
    """Maior distancia (px) da polilinha ate o corredor de estrada."""
    dev = 0.0
    for x, y in sample_path(pts, step=8.0):
        cx, cy = cell(x, y)
        if 0 <= cy < rdist.shape[0] and 0 <= cx < rdist.shape[1]:
            dev = max(dev, float(rdist[cy, cx]) * CELL)
    return dev


def on_road(rdist, p, tol=80.0):
    cx, cy = cell(*p)
    if 0 <= cy < rdist.shape[0] and 0 <= cx < rdist.shape[1]:
        return float(rdist[cy, cx]) * CELL <= tol
    return False


def cell(x, y):
    return (int(x) // CELL, int(y) // CELL)


def is_water(mask, x, y):
    cx, cy = cell(x, y)
    if 0 <= cy < mask.shape[0] and 0 <= cx < mask.shape[1]:
        return bool(mask[cy, cx])
    return False


def dist_water(wdist, x, y):
    """Distancia em px ate a agua mais proxima (0 se a celula e agua)."""
    cx, cy = cell(x, y)
    if 0 <= cy < wdist.shape[0] and 0 <= cx < wdist.shape[1]:
        return float(wdist[cy, cx]) * CELL
    return 0.0


def sample_path(pts, step=4.0):
    """Amostra a polilinha a cada ~step px (inclui pontas)."""
    out = []
    for i in range(len(pts) - 1):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        n = max(1, int(math.hypot(bx - ax, by - ay) / step))
        for k in range(n):
            t = k / n
            out.append((ax + (bx - ax) * t, ay + (by - ay) * t))
    out.append(tuple(pts[-1]))
    return out


def water_runs(mask, pts):
    """Comprimento (px) da maior sequencia interna de amostras em agua
    (despreza a agua nas pontas: waypoints podem ficar sobre rio/baia)."""
    seq = [is_water(mask, x, y) for x, y in sample_path(pts)]
    while seq and seq[0]:
        seq.pop(0)
    while seq and seq[-1]:
        seq.pop()
    best = run = 0
    for w in seq:
        run = run + CELL if w else 0
        best = max(best, run)
    return best


def sea_land_hits(mask, wdist, pts):
    """Violacoes de trecho maritimo: cada excursao contigua por terra (fora
    do raio das pontas) deve ficar a <= SEA_GRAZE px da agua e medir
    <= SEA_GRAZE_RUN px — cobre tangenciar costa/ilhas, nao cortar terra."""
    a, b = pts[0], pts[-1]
    hits = []
    run = []
    for x, y in sample_path(pts) + [(None, None)]:
        land = (x is not None and not is_water(mask, x, y)
                and min(math.hypot(x - a[0], y - a[1]),
                        math.hypot(x - b[0], y - b[1])) > SEA_STUB)
        if land:
            run.append((x, y))
        elif run:
            deep = max(dist_water(wdist, rx, ry) for rx, ry in run)
            if deep > SEA_GRAZE or len(run) * CELL > SEA_GRAZE_RUN:
                hits.append({"trecho": (round(run[0][0]), round(run[0][1])),
                             "px": len(run) * CELL,
                             "fundoPx": round(deep)})
            run = []
    return hits


# ---------------------------------------------------------------------------
# Douglas-Peucker + A* com custo de terreno
# ---------------------------------------------------------------------------

def dp_simplify(pts, tol):
    if len(pts) < 3:
        return pts[:]
    stack = [(0, len(pts) - 1)]
    keep = {0, len(pts) - 1}
    while stack:
        a, b = stack.pop()
        ax, ay = pts[a]
        bx, by = pts[b]
        dx, dy = bx - ax, by - ay
        seg = math.hypot(dx, dy)
        dmax, imax = -1.0, -1
        for i in range(a + 1, b):
            if seg < 1e-9:
                d = math.hypot(pts[i][0] - ax, pts[i][1] - ay)
            else:
                d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / seg
            if d > dmax:
                dmax, imax = d, i
        if dmax > tol:
            keep.add(imax)
            stack.append((a, imax))
            stack.append((imax, b))
    return [pts[i] for i in sorted(keep)]


def astar(mask, start, end, mode, estrada=None, pin=None):
    """Menor custo (MCP 8-conexo) num recorte do raster em torno das pontas.
    start/end = (cx, cy) celulas. Retorna lista de celulas ou None."""
    H, W = mask.shape
    sx, sy = start
    ex, ey = min(max(end[0], 0), W - 1), min(max(end[1], 0), H - 1)
    base = int(math.hypot(ex - sx, ey - sy))
    grow = 1
    while True:
        margin = max(60, int(base * 0.35)) * grow
        x0 = max(0, min(sx, ex) - margin)
        x1 = min(W, max(sx, ex) + margin + 1)
        y0 = max(0, min(sy, ey) - margin)
        y1 = min(H, max(sy, ey) + margin + 1)
        sub = mask[y0:y1, x0:x1]
        yy, xx = np.mgrid[0:sub.shape[0], 0:sub.shape[1]]
        roadsub = (estrada[y0:y1, x0:x1] if estrada is not None
                   else np.zeros_like(sub))
        pinsub = (pin[y0:y1, x0:x1] if pin is not None
                  else np.zeros_like(sub))
        if mode == "land":
            costs = np.where(sub, LAND_SEA_COST, 1.0)
            costs = np.where(roadsub & ~sub, ROAD_FACTOR, costs)
            stub = PIN_STUB_PX / CELL
            near = np.minimum(
                np.hypot(xx - (sx - x0), yy - (sy - y0)),
                np.hypot(xx - (ex - x0), yy - (ey - y0))) <= stub
            costs = np.where(pinsub & ~near & ~roadsub & ~sub,
                             costs + PIN_PENALTY, costs)
        elif mode == "river":
            costs = np.where(sub, 1.0, 2.5)
        elif mode == "sea":
            stub = SEA_STUB / CELL
            near = np.minimum(
                np.hypot(xx - (sx - x0), yy - (sy - y0)),
                np.hypot(xx - (ex - x0), yy - (ey - y0))) <= stub
            costs = np.where(sub, 1.0,
                             np.where(near, 1.3, SEA_LAND_COST))
        else:  # mixed: mar fortemente preferido (~4.5x terra)
            costs = np.where(sub, 1.0, 4.5)
        mcp = MCP_Geometric(costs, fully_connected=True)
        try:
            cum, _ = mcp.find_costs([(sy - y0, sx - x0)],
                                    [(ey - y0, ex - x0)])
            if not np.isfinite(cum[ey - y0, ex - x0]):
                path = None
            else:
                path = mcp.traceback((ey - y0, ex - x0))
        except (ValueError, IndexError):
            path = None
        if path is not None:
            touch = (any(r == 0 or c == 0 or r == sub.shape[0] - 1 or
                         c == sub.shape[1] - 1 for r, c in path[1:-1]))
            if not touch or grow >= 8:
                return [(c + x0, r + y0) for r, c in path]
        if grow >= 8:
            return None
        grow *= 2


def path_to_points(cells):
    return [[x * CELL + 2, y * CELL + 2] for x, y in cells]


def longest_water_run(mask, pts):  # legado simples por vertice (diagnostico)
    best = run = 0
    for x, y in pts:
        if is_water(mask, x, y):
            run += 1
            best = max(best, run)
        else:
            run = 0
    return best


# ---------------------------------------------------------------------------
# reuso de geometria v6
# ---------------------------------------------------------------------------

def build_reuse_index(v6):
    idx = []
    for rt in v6.get("routes", []):
        for seg in rt.get("segments", []):
            pts = seg.get("points")
            if pts and len(pts) >= 2:
                idx.append({"route": rt["id"], "id": seg["id"], "pts": pts})
    return idx


def d2(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def reuse_leg(index, a, b):
    """Retorna pontos v6 com pontas a~80px de a/b (qualquer sentido)."""
    for e in index:
        p = e["pts"]
        if d2(p[0], a) <= REUSE_TOL and d2(p[-1], b) <= REUSE_TOL:
            return [list(pt) for pt in p], e["id"]
        if d2(p[0], b) <= REUSE_TOL and d2(p[-1], a) <= REUSE_TOL:
            return [list(pt) for pt in reversed(p)], e["id"]
    return None, None


# ---------------------------------------------------------------------------
# helpers de trecho
# ---------------------------------------------------------------------------

def leg_points(mask, wdist, index, a, b, mode, diag,
               estrada=None, rdist=None, pin=None):
    """Geometria de um sub-trecho a->b: reuso v6 ou pathfinder + simplify."""
    pts, rid = reuse_leg(index, a, b)
    if pts is not None:
        reject = mode == "sea" and sea_land_hits(mask, wdist, pts)
        if (not reject and mode == "land" and rdist is not None
                and on_road(rdist, a) and on_road(rdist, b)
                and road_deviation(rdist, pts) > 60.0):
            reject = True
        if reject:
            diag.append({"kind": "reuso-rejeitado", "ref": rid})
            pts = None
        else:
            pts[0] = [round(a[0]), round(a[1])]
            pts[-1] = [round(b[0]), round(b[1])]
            diag.append({"kind": "reuso-v6", "ref": rid})
            return pts
    sa, sb = cell(*a), cell(*b)
    cells = astar(mask, sa, sb, mode, estrada=estrada, pin=pin)
    if cells is None:
        raise ValueError("pathfinder falhou: %s -> %s (%s)" % (a, b, mode))
    pts = path_to_points(cells)
    pts = dp_simplify(pts, DP_TOL)
    tol = DP_TOL
    while len(pts) > MAX_VERTS:
        tol += 2.0
        pts = dp_simplify(path_to_points(cells), tol)
    pts[0] = [round(a[0]), round(a[1])]
    pts[-1] = [round(b[0]), round(b[1])]
    diag.append({"kind": "pathfinder", "cells": len(cells),
                 "verts": len(pts), "waterRunPx": water_runs(mask, pts)})
    return pts


def per_vertex_legs(mask, pts, default_mode):
    """transportLegs por classificacao de vertice; 'land' nunca vira mar.
    Convencao: o vertice de juncao pertence as duas pernas vizinhas."""
    if not pts:
        return []
    if default_mode == "land":
        return [{"mode": "land", "startVertex": 0, "endVertex": len(pts) - 1}]
    legs = []
    cur, s = None, 0
    for i, pt in enumerate(pts):
        w = is_water(mask, pt[0], pt[1])
        m = ("sea" if default_mode == "mixed" else default_mode) \
            if w else "land"
        if m != cur:
            if cur is not None:
                legs.append({"mode": cur, "startVertex": s,
                             "endVertex": i})
            cur, s = m, i
    legs.append({"mode": cur, "startVertex": s, "endVertex": len(pts) - 1})
    return legs


def label_of(at, cps, waypts):
    if at.startswith("w:"):
        return waypts[at]["label"]
    return cps[at]["label"]


# ---------------------------------------------------------------------------
# build principal
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--raster", default=None,
                    help="caminho para raster-agua.npy (evita remontar mosaico)")
    args = ap.parse_args()

    v6 = json.loads((DATA / "atlas-percursos-v6.json").read_text("utf-8"))
    mod = load_fonte()
    cps = {p["id"]: p for p in v6["controlPoints"]}
    waypts = mod.WAYPOINTS

    # coordenadas finais dos waypoints: override manual > projecao > approx
    model = v6["historicalCalibration"]["westerosModel"]
    wcoords = {}
    wtable = []
    for wid, w in waypts.items():
        if wid in WAYPOINT_FINAL:
            base = w.get("approx") or transform(
                model, old_pixel(PORTAL_LATLNG[w["portalKey"]]))
            wcoords[wid] = WAYPOINT_FINAL[wid]
            wtable.append({"id": wid, "label": w["label"],
                           "origem": "ajuste-manual",
                           "base": [round(v) for v in base],
                           "final": list(WAYPOINT_FINAL[wid]),
                           "deltaPx": round(d2(WAYPOINT_FINAL[wid], base), 1)})
        elif w.get("portalKey"):
            pt = transform(model, old_pixel(PORTAL_LATLNG[w["portalKey"]]))
            wcoords[wid] = (round(pt[0]), round(pt[1]))
            wtable.append({"id": wid, "label": w["label"],
                           "origem": "portalKey-projetado",
                           "base": list(wcoords[wid]),
                           "final": list(wcoords[wid]), "deltaPx": 0.0})
        else:
            wcoords[wid] = tuple(w["approx"])
            wtable.append({"id": wid, "label": w["label"],
                           "origem": "approx-lead",
                           "base": list(w["approx"]),
                           "final": list(w["approx"]), "deltaPx": 0.0})

    def coord(at):
        if at.startswith("w:"):
            return list(wcoords[at])
        p = cps[at]
        return [p["x"], p["y"]]

    # livros por capitulo (para bookId dos segmentos)
    books = v6["books"]

    def book_of(ch):
        for b in books:
            if b["startChapter"] <= ch <= b["endChapter"]:
                return b["id"]
        return None

    if args.raster is None:
        mask, wdist = build_raster()
    else:
        mask = np.load(args.raster)
        wdist = distance_transform_edt(~mask)
    index = build_reuse_index(v6)
    estrada, rdist = build_corridor_rasters(mask.shape)
    pin = build_pin_raster(mask.shape,
                           list(v6["controlPoints"]) + list(NEW_POINTS))
    reuse_hits = {"reuso-v6": 0, "pathfinder": 0}

    v6routes = {r["id"]: r for r in v6["routes"]}
    out_routes = []
    diag = {"waypoints": wtable, "routes": {}}
    problemas = []

    for cid, ch in mod.CHARACTERS.items():
        stops = ch["stops"]
        death = ch.get("death")
        base = v6routes[cid]
        positions = []
        segments = []
        rdiag = []
        # posicao: uma por capitulo (ultimo stop do capitulo cobre o capitulo)
        pos_stops = []
        for i, s in enumerate(stops):
            nxt = stops[i + 1] if i + 1 < len(stops) else None
            if nxt is not None and nxt["ch"] == s["ch"]:
                continue  # mesmo capitulo: so o ultimo gera posicao
            pos_stops.append(i)
        for k, i in enumerate(pos_stops):
            s = stops[i]
            at = s["at"]
            end = (stops[pos_stops[k + 1]]["ch"] - 1
                   if k + 1 < len(pos_stops)
                   else (death if death is not None else 343))
            pos = {"id": "%s-pos-%d" % (cid, i),
                   "sourceRecordIndex": i,
                   "startChapter": s["ch"], "endChapter": end,
                   "status": "approximate"}
            if at.startswith("w:"):
                wx, wy = wcoords[at]
                pos.update({"x": int(wx), "y": int(wy),
                            "label": waypts[at]["label"],
                            "english": waypts[at]["english"]})
            else:
                pos["locationId"] = at
            positions.append(pos)
        # segmentos: um por par consecutivo
        for i in range(1, len(stops)):
            prev, s = stops[i - 1], stops[i]
            anchors = [prev["at"]] + list(s.get("via") or []) + [s["at"]]
            modes = list(s.get("modes") or [s["mode"]] * (len(anchors) - 1))
            if len(modes) != len(anchors) - 1:
                raise ValueError("%s ch%d: modes/via inconsistentes" %
                                 (cid, s["ch"]))
            pts = []
            legs = []
            for j in range(len(anchors) - 1):
                a = coord(anchors[j]); b = coord(anchors[j + 1])
                sub = leg_points(mask, wdist, index, a, b, modes[j],
                                 rdiag, estrada=estrada, rdist=rdist,
                                 pin=pin)
                if pts:
                    pts.pop()  # junta: ultimo do anterior == primeiro do novo
                off = len(pts)
                pts.extend(sub)
                legs.append({"mode": modes[j], "startVertex": off,
                             "endVertex": off + len(sub) - 1})
            if s.get("points"):
                # geometria fixada pelo lead (ex.: margem ocidental do Olho
                # de Deus); pontas continuam exatas
                pts = ([list(coord(prev["at"]))] +
                       [list(q) for q in s["points"]] +
                       [list(coord(s["at"]))])
                legs = per_vertex_legs(mask, pts, s["mode"])
                rdiag.append({"ch": s["ch"], "kind": "lead-fixed"})
            elif not s.get("via"):
                legs = per_vertex_legs(mask, pts, s["mode"])
            # pontas exatas
            a0, b0 = coord(prev["at"]), coord(s["at"])
            pts[0] = [round(a0[0]), round(a0[1])]
            pts[-1] = [round(b0[0]), round(b0[1])]
            segments.append({
                "id": "%s-v7-%d" % (cid, s["ch"]),
                "sourceRecordIndex": i,
                "startChapter": s["ch"], "endChapter": 343,
                "status": "approximate", "label":
                    "%s → %s" % (label_of(prev["at"], cps, waypts),
                                 label_of(s["at"], cps, waypts)),
                "travelMode": s["mode"], "rota": s.get("rota", "conhecida"),
                "transportLegs": legs, "points": pts,
                "bookId": book_of(s["ch"]),
            })
        rt = dict(base)  # copia metadados v6 (book, cor, avisos, coverage)
        rt["segments"] = segments
        rt["positions"] = positions
        out_routes.append(rt)
        diag["routes"][cid] = rdiag
        diag.setdefault("fonte", {})[cid] = {
            "death": death,
            "stops": [{"ch": s["ch"], "at": s["at"]} for s in stops],
        }
        for d in rdiag:
            if d["kind"] in reuse_hits:
                reuse_hits[d["kind"]] += 1

    out = {k: v for k, v in v6.items() if k != "routes"}
    out["datasetId"] = "atlas-saga-v7"
    cplist = []
    for p in v6["controlPoints"]:
        p = dict(p)
        if p["id"] in RENAMES:
            p.update(RENAMES[p["id"]])
        cplist.append(p)
    out["controlPoints"] = cplist + [dict(p) for p in NEW_POINTS]
    out["routes"] = out_routes

    # ------------------------------------------------------------------
    # invariantes
    # ------------------------------------------------------------------
    erros = []
    for rt, (cid, ch) in zip(out_routes, mod.CHARACTERS.items()):
        stops = ch["stops"]
        death = ch.get("death")
        poss = rt["positions"]
        # cobertura: todo capitulo de firstCh..(death ou 343) tem 1 posicao
        limite = death if death is not None else 343
        seen = {}
        for p in poss:
            for c in range(p["startChapter"], p["endChapter"] + 1):
                seen[c] = seen.get(c, 0) + 1
        first = stops[0]["ch"]
        for c in range(first, limite + 1):
            if seen.get(c) != 1:
                erros.append("%s: capitulo %d com %d posicoes" %
                             (cid, c, seen.get(c, 0)))
        if seen and min(seen) != first:
            erros.append("%s: posicao antes da primeira parada" % cid)
        for i, seg in enumerate(rt["segments"]):
            prev = stops[i]
            stop = stops[i + 1]
            pa, pb = coord(prev["at"]), coord(stop["at"])
            if [round(v) for v in seg["points"][0]] != [round(v) for v in pa]:
                erros.append("%s seg %s: inicio != parada anterior" %
                             (cid, seg["id"]))
            if [round(v) for v in seg["points"][-1]] != [round(v) for v in pb]:
                erros.append("%s seg %s: fim != parada" % (cid, seg["id"]))
            if seg["startChapter"] != stop["ch"] or seg["endChapter"] != 343:
                erros.append("%s seg %s: capitulos" % (cid, seg["id"]))
            # perna terrestre nao atravessa mar aberto (rios/estreitos ok)
            if seg["travelMode"] == "land":
                wrun = water_runs(mask, seg["points"])
                if wrun > LAND_WATER_MAX:
                    erros.append("%s seg %s: %dpx seguidos de agua" %
                                 (cid, seg["id"], wrun))
            # perna maritima nao corre sobre terra fora das pontas/costa
            if seg["travelMode"] == "sea":
                hits = sea_land_hits(mask, wdist, seg["points"])
                if hits:
                    erros.append("%s seg %s: %d amostras em terra longe "
                                 "de agua, ex %s" % (cid, seg["id"],
                                                     len(hits), hits[0]))
        for i in range(1, len(stops)):
            if stops[i]["ch"] < stops[i - 1]["ch"]:
                erros.append("%s: capitulos nao monotonicos" % cid)
        # ids resolvem
        for s in stops:
            if s["at"].startswith("w:"):
                if s["at"] not in waypts:
                    erros.append("%s: waypoint desconhecido %s" %
                                 (cid, s["at"]))
            elif s["at"] not in cps:
                erros.append("%s: ponto desconhecido %s" % (cid, s["at"]))
            for v in s.get("via") or []:
                if v not in cps:
                    erros.append("%s: via desconhecida %s" % (cid, v))

    diag["invariantes"] = {"erros": erros,
                           "segments": sum(len(r["segments"])
                                           for r in out_routes),
                           "positions": sum(len(r["positions"])
                                            for r in out_routes),
                           "reuso": reuse_hits}
    print(json.dumps(diag["invariantes"], indent=2, ensure_ascii=False))
    print("waypoints:", len(wtable))
    if erros:
        print("ERROS:")
        for e in erros[:40]:
            print(" -", e)

    if args.write:
        tmp = (DATA / "atlas-percursos-v7.json")
        tmp.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n",
                       "utf-8")
        (DATA / "percursos-v7-diagnostico.json").write_text(
            json.dumps(diag, ensure_ascii=False, indent=2) + "\n", "utf-8")
        print("wrote", tmp)


if __name__ == "__main__":
    main()
