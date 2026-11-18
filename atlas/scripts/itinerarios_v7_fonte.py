"""Itinerarios v7 (autoria do lead): paradas continuas por personagem.

ch   = capitulo global (ordem de publicacao, 0-343) em que o texto coloca o
       personagem naquele local; o trecho que chega ali aparece nesse capitulo.
at   = id de controlPoint de atlas-percursos-v6.json ou "w:<id>" (WAYPOINTS).
mode = land | sea | river | mixed  (como chegou desde a parada anterior)
rota = "conhecida" (estrada/mar/rio descrito ou inequivoco) | "deduzida"
       (o texto nao descreve o caminho; desenhar pontilhado).
via  = paradas intermediarias sem tempo proprio (ids), opcional.
modes = modo de cada sub-trecho quando ha via (len(via)+1).
points = vertices intermediarios fixados pelo lead (sem pathfinder).
death = ultimo capitulo em que a posicao aparece (morte), None = ate 343.
"""

WAYPOINTS = {
    # portalKey: chave em assets/js/data.js (projetar pelo westerosModel);
    # approx: estimativa nativa do lead quando nao ha chave no portal.
    "w:darry": {"label": "Darry", "english": "Darry", "portalKey": "Darry"},
    "w:whispering-wood": {"label": "Bosque dos Murmúrios", "english": "Whispering Wood", "approx": [3430, 6330], "note": "floresta a nordeste de Correrrio"},
    "w:skirling": {"label": "Passo dos Guinchos", "english": "Skirling Pass", "approx": [3420, 1720], "note": "Presas de Gelo, a noroeste do Punho"},
    "w:mance-camp": {"label": "Acampamento de Mance (Guadeleite)", "english": "Milkwater camp", "approx": [3560, 1960], "note": "vale do Guadeleite, a oeste do Punho"},
    "w:wall-climb": {"label": "Escalada da Muralha", "english": "Wall climb", "approx": [3960, 2440], "note": "trecho da Muralha entre a Torre Sombria e Castelo Negro"},
    "w:nightfort": {"label": "Fortenoite", "english": "Nightfort", "portalKey": "Nightfort"},
    "w:haunted-forest": {"label": "Floresta Assombrada", "english": "Haunted Forest", "approx": [4250, 1900]},
    "w:cave": {"label": "Caverna do corvo de três olhos", "english": "Cave of the three-eyed crow", "approx": [4150, 1450], "note": "muito ao norte da Muralha; local exato desconhecido"},
    "w:skagos": {"label": "Skagos", "english": "Skagos", "approx": [5150, 2650], "note": "ilha na Baia das Focas; ajustar ao contorno da ilha"},
    "w:stony-shore": {"label": "Costa Pedregosa", "english": "Stony Shore", "portalKey": "Stony_Shore"},
    "w:kingsroad-north": {"label": "Estrada do Rei, ao norte de Porto Real", "english": "Kingsroad", "approx": [4330, 7150]},
    "w:godseye-south": {"label": "Ao sul do Olho de Deus", "english": "South of the Gods Eye", "approx": [3990, 6960]},
    "w:lake-village": {"label": "Aldeia à margem do Olho de Deus", "english": "Lakeside village", "approx": [3890, 6800], "note": "margem ocidental"},
    "w:high-heart": {"label": "Coração Alto", "english": "High Heart", "portalKey": "High_Heart"},
    "w:hollow-hill": {"label": "Monte Oco", "english": "Hollow Hill", "portalKey": "Hollow_Hill"},
    "w:moon-foothills": {"label": "Sopé das Montanhas da Lua", "english": "Mountains of the Moon foothills", "approx": [4330, 6250]},
    "w:blackwater-bay": {"label": "Baía da Água Negra", "english": "Blackwater Bay", "approx": [4650, 7300]},
    "w:fingers": {"label": "Os Dedos", "english": "The Fingers", "approx": [5480, 5560], "note": "torre de Mindinho na costa dos Dedos"},
    "w:gates-moon": {"label": "Portões da Lua", "english": "Gates of the Moon", "approx": [4620, 6140], "note": "sopé do Ninho da Aguia"},
    "w:green-fork": {"label": "Ramo Verde (batalha)", "english": "Green Fork battlefield", "approx": [3800, 6250]},
    "w:red-fork": {"label": "Ramo Vermelho", "english": "Red Fork", "approx": [3560, 6480]},
    "w:raventree": {"label": "Solar de Corvarbor", "english": "Raventree Hall", "portalKey": "Raventree_Hall"},
    "w:whispers": {"label": "Murmúrios", "english": "Whispers", "portalKey": "Whispers"},
    "w:stoneheart": {"label": "Esconderijo da Irmandade", "english": "Brotherhood hideout", "approx": [3980, 6380], "note": "local nao identificado"},
    "w:lhazar-village": {"label": "Aldeia lhazarena", "english": "Lhazareen village", "approx": [12600, 9150]},
    "w:dothraki-hill": {"label": "Colina no Mar Dothraki", "english": "Dragonstone (Dothraki Sea hill)", "approx": [12000, 8550], "note": "colina de Drogon; local exato desconhecido"},
    "w:qohor-forest": {"label": "Floresta de Qohor", "english": "Forest of Qohor", "approx": [8700, 7000]},
    "w:ten-towers": {"label": "Dez Torres", "english": "Ten Towers", "portalKey": "Ten_Towers"},
    "w:old-wyk": {"label": "Velha Wyk", "english": "Old Wyk", "approx": [2560, 5940], "note": "ilha a nordeste de Pyke; ajustar ao contorno"},
    "w:shield-islands": {"label": "Ilhas Escudo", "english": "Shield Islands", "approx": [2230, 8150], "note": "foz do Vago; ajustar"},
    "w:cedars-strait": {"label": "Estreito da Ilha de Cedros", "english": "Isle of Cedars strait", "approx": [10850, 10150]},
    "w:cape-wrath": {"label": "Cabo da Fúria (desembarque)", "english": "Cape Wrath landing", "approx": [4900, 8300]},
    "w:crofters": {"label": "Aldeia dos camponeses", "english": "Crofters' village", "approx": [3720, 3560], "note": "a poucos dias de Winterfell, no caminho de Bosque Profundo"},
    "w:wolfswood-march": {"label": "Mata de Lobos (marcha de Stannis)", "english": "Wolfswood", "approx": [3300, 3550]},
    "w:greenblood": {"label": "Sangueverde", "english": "Greenblood", "approx": [4350, 9250]},
    "w:shandystone": {"label": "Pedramarela", "english": "Shandystone", "portalKey": "Shandystone"},
}

KL = "King%27s_Landing"
CI = "scan-site-4116-6426"   # Estalagem no Entroncamento
KN = "scan-site-3610-6356"   # Estalagem do Ajoelhado
BG = "scan-site-4542-6160"   # Passo Sangrento
BITTER = "scan-site-3550-7818"
OLDSTONES = "scan-site-3626-6042"
CRAG = "scan-site-2516-6554"
GOLDEN_TOOTH = "scan-site-2922-6742"
SEAGARD = "scan-site-3386-5862"
MAIDENPOOL = "scan-site-4584-6750"
DUSKENDALE = "scan-site-4656-7094"
ROSBY = "scan-site-4452-7282"
QUIET = "scan-site-4440-6670"
SALTPANS = "scan-site-4400-6552"
ACORN = "scan-site-3558-6710"
STONEY = "scan-site-3514-6972"
HARROWAY = "scan-site-4052-6476"
WHITE_TREE = "scan-v4-white-tree-glyph"
GRIFFIN = "scan-site-v4-300"
WATER_GARDENS = "scan-site-v4-587"

def L(ch, at, mode="land", rota="conhecida", via=None, modes=None, points=None):
    s = {"ch": ch, "at": at, "mode": mode, "rota": rota}
    if via: s["via"] = via
    if modes: s["modes"] = modes
    if points: s["points"] = points
    return s

def S(ch, at):
    return {"ch": ch, "at": at}

# Comitiva real: Porto Real -> Winterfell (4) -> Darry (15) -> Porto Real (20)
ROYAL = [S(0, KL), L(4, "Winterfell"), L(16, "w:darry"), L(20, KL)]
STARK_SOUTH = [S(0, "Winterfell"), L(16, "w:darry"), L(20, KL)]

CHARACTERS = {
    "jon": {"death": None, "stops": [
        S(0, "Winterfell"), L(19, "Castle_Black"),
        L(86, WHITE_TREE), L(96, "Craster%27s_Keep"), L(107, "Fist_of_the_First_Men"),
        L(124, "w:skirling", rota="deduzida"), L(150, "w:mance-camp", rota="deduzida"),
        L(169, "w:wall-climb", rota="deduzida"), L(184, "Queenscrown", rota="deduzida"),
        L(191, "Castle_Black")]},
    "samwell": {"death": None, "stops": [
        S(26, "Castle_Black"), L(86, WHITE_TREE), L(96, "Craster%27s_Keep"),
        L(107, "Fist_of_the_First_Men"), L(176, "Craster%27s_Keep"),
        L(189, WHITE_TREE, rota="deduzida"), L(199, "w:nightfort", rota="deduzida"),
        L(218, "Castle_Black"), L(240, "Eastwatch-by-the-Sea"),
        L(251, "Braavos", "sea"), L(270, "Oldtown", "sea")]},
    "bran": {"death": None, "stops": [
        S(0, "Winterfell"), L(167, "w:wolfswood-march", rota="deduzida"),
        L(183, "Queenscrown", rota="deduzida"), L(199, "w:nightfort", rota="deduzida"),
        L(275, "w:haunted-forest", rota="deduzida"), L(284, "w:cave", rota="deduzida")]},
    "rickon": {"death": None, "stops": [
        S(0, "Winterfell"), L(300, "w:skagos", "mixed", rota="deduzida")]},
    "robb": {"death": 194, "stops": [
        S(0, "Winterfell"), L(55, "Moat_Cailin"), L(59, "Twins"),
        L(63, "w:whispering-wood"), L(71, "Riverrun"),
        L(128, CRAG, rota="deduzida", via=[GOLDEN_TOOTH]), L(157, "Riverrun"),
        L(192, OLDSTONES), L(194, "Twins")]},
    "catelyn": {"death": 194, "stops": [
        S(0, "Winterfell"), L(18, KL, "mixed", via=["White_Harbor"], modes=["land", "sea"]),
        L(28, CI), L(34, "Eyrie", via=[BG]),
        L(55, "Moat_Cailin", "mixed", via=["Gulltown", "White_Harbor"], modes=["land", "sea", "land"]),
        L(59, "Twins"), L(63, "w:whispering-wood"), L(71, "Riverrun"),
        L(95, BITTER), L(104, "Storm%27s_End"), L(112, "Riverrun"),
        L(192, OLDSTONES), L(194, "Twins")]},
    "eddard": {"death": 65, "stops": STARK_SOUTH},
    "sansa": {"death": None, "stops": STARK_SOUTH + [
        L(204, "w:blackwater-bay", "river"), L(211, "w:fingers", "sea"),
        L(223, "Eyrie", rota="deduzida"), L(266, "w:gates-moon")]},
    "arya": {"death": None, "stops": STARK_SOUTH + [
        L(74, "w:kingsroad-north"), L(82, "w:godseye-south"),
        L(92, "w:lake-village", rota="deduzida",
          points=[[3955, 6966], [3926, 6932], [3914, 6882], [3900, 6836]]), L(99, "Harrenhal", rota="deduzida"),
        L(156, KN, rota="deduzida"), L(165, "w:high-heart", rota="deduzida"),
        L(165, ACORN), L(172, STONEY), L(177, "w:hollow-hill", rota="deduzida"),
        L(186, "w:high-heart", rota="deduzida"), L(190, HARROWAY, rota="deduzida"),
        L(193, "Twins"), L(208, "w:moon-foothills", rota="deduzida"),
        L(217, CI, rota="deduzida"), L(217, SALTPANS), L(231, "Braavos", "sea")]},
    "theon": {"death": None, "stops": [
        S(0, "Winterfell"), L(55, "Moat_Cailin"), L(59, "Twins"),
        L(63, "w:whispering-wood"), L(71, "Riverrun"),
        L(84, "Pyke", "mixed", via=[SEAGARD], modes=["land", "sea"]), L(110, "w:stony-shore", "sea"),
        L(123, "Winterfell"), L(283, "Dreadfort", rota="deduzida"),
        L(291, "Moat_Cailin"), L(303, "Barrowton"), L(308, "Winterfell")]},
    "asha": {"death": None, "stops": [
        S(97, "Pyke"), L(123, "Deepwood_Motte", "mixed", rota="deduzida"),
        L(129, "Winterfell"), L(139, "Deepwood_Motte", rota="deduzida"),
        L(236, "w:ten-towers", "mixed", rota="deduzida"), L(244, "w:old-wyk", "sea"),
        L(297, "Deepwood_Motte", "mixed", rota="deduzida"),
        L(313, "w:wolfswood-march"), L(333, "w:crofters")]},
    "victarion": {"death": None, "stops": [
        S(97, "Pyke"), L(123, "Moat_Cailin", "mixed"),
        L(243, "w:old-wyk", "mixed"), L(254, "w:shield-islands", "sea", rota="deduzida"),
        L(327, "Velos", "sea", rota="deduzida"), L(334, "w:cedars-strait", "sea")]},
    "daenerys": {"death": None, "stops": [
        S(3, "Pentos"), L(23, "w:qohor-forest"), L(36, "Vaes_Dothrak"),
        L(61, "w:lhazar-village", rota="deduzida"), L(85, "Vaes_Tolorro", rota="deduzida"),
        L(100, "Qarth"), L(166, "Astapor", "sea"),
        L(185, "Yunkai"), L(200, "Meereen"),
        L(342, "w:dothraki-hill", rota="deduzida")]},
    "tyrion": {"death": None, "stops": ROYAL[:2] + [
        L(19, "Castle_Black"), L(24, "Winterfell"), L(28, CI),
        L(34, "Eyrie", via=[BG]), L(42, BG), L(56, CI, rota="deduzida"),
        L(62, "w:green-fork"), L(69, CI), L(76, KL),
        L(272, "Pentos", "sea"), L(279, "Ghoyan_Drohe"), L(285, "Ny_Sar", "river"),
        L(289, "Sorrows", "river"), L(293, "Selhorys", "river"),
        L(298, "Volantis"), L(311, "Velos", "sea", rota="deduzida"),
        L(318, "Meereen", rota="deduzida")]},
    "aegon": {"death": None, "stops": [
        S(279, "Ghoyan_Drohe"), L(285, "Ny_Sar", "river"), L(289, "Sorrows", "river"),
        L(293, "Selhorys", "river"), L(295, "Volon_Therys", "river"),
        L(332, "w:cape-wrath", "sea", rota="deduzida"), L(332, GRIFFIN)]},
    "jaime": {"death": None, "stops": ROYAL + [
        L(40, "Casterly_Rock", rota="deduzida"), L(55, "Riverrun", via=[GOLDEN_TOOTH]),
        L(63, "w:whispering-wood"), L(71, "Riverrun"),
        L(144, "w:red-fork", "river"), L(154, KN, "river"),
        L(174, "Harrenhal", rota="deduzida"), L(205, KL),
        L(252, "Harrenhal"), L(255, "w:darry"), L(258, "Riverrun"),
        L(319, "w:raventree")]},
    "brienne": {"death": None, "stops": [
        S(95, BITTER), L(104, "Storm%27s_End"), L(112, "Riverrun", rota="deduzida"),
        L(144, "w:red-fork", "river"), L(154, KN, "river"),
        L(174, "Harrenhal", rota="deduzida"), L(205, KL),
        L(229, ROSBY), L(234, DUSKENDALE), L(239, MAIDENPOOL),
        L(245, "w:whispers"), L(250, MAIDENPOOL), L(256, QUIET),
        L(262, CI), L(267, "w:stoneheart", rota="deduzida"),
        L(319, "w:raventree", rota="deduzida")]},
    "cersei": {"death": None, "stops": ROYAL},
    "joffrey": {"death": 203, "stops": ROYAL},
    "myrcella": {"death": None, "stops": ROYAL + [
        L(114, "Sunspear", "sea", rota="deduzida"),
        L(238, "w:shandystone", rota="deduzida"), L(246, "w:greenblood"),
        L(265, "Sunspear", rota="deduzida")]},
    "robert": {"death": 48, "stops": ROYAL},
    "renly": {"death": 106, "stops": ROYAL + [
        L(95, BITTER, rota="deduzida", via=["Highgarden"]), L(104, "Storm%27s_End")]},
    "stannis": {"death": None, "stops": [
        S(73, "Dragonstone"), L(104, "Storm%27s_End", "sea"),
        L(131, KL), L(153, "Dragonstone", "sea"),
        L(219, "Castle_Black", "mixed", via=["Eastwatch-by-the-Sea"], modes=["sea", "land"]),
        L(297, "Deepwood_Motte", rota="deduzida"),
        L(313, "w:wolfswood-march"), L(333, "w:crofters")]},
    "davos": {"death": None, "stops": [
        S(83, "Dragonstone"), L(115, "Storm%27s_End", "sea"),
        L(131, "w:blackwater-bay", "sea"), L(153, "Dragonstone", "sea"),
        L(219, "Eastwatch-by-the-Sea", "sea", rota="deduzida"),
        L(280, "Sisterton", "sea"), L(286, "White_Harbor", "sea")]},
    "tywin": {"death": 220, "stops": [
        S(0, "Casterly_Rock"), L(56, CI, rota="deduzida", via=[GOLDEN_TOOTH]),
        L(62, "w:green-fork"), L(69, CI), L(99, "Harrenhal"),
        L(135, KL, rota="deduzida")]},
    "arianne": {"death": None, "stops": [
        S(238, "Sunspear"), L(238, "w:shandystone", rota="deduzida"),
        L(246, "w:greenblood"), L(265, "Sunspear", rota="deduzida")]},
    "littlefinger": {"death": None, "stops": [
        S(18, KL), L(117, BITTER, rota="deduzida"), L(138, KL),
        L(204, "w:blackwater-bay", "river"), L(211, "w:fingers", "sea"),
        L(223, "Eyrie", rota="deduzida"), L(266, "w:gates-moon")]},
}
