// Central pt-BR dictionary for the localized Quartermaester clone.
// Sources, in descending precedence: Game of Thrones Wiki (pt-br)
// "Apêndice de traduções" (Suma 2019 - reference/translations.wiki);
// direct evidence from the user's local editions (docs/local-book-reference.json
// - Suma PDF vs LeYa EPUBs are marked per term); wiki.geloefogo.com articles
// (secondary, online-verified only). Not every entry is Suma-certified - see
// docs/TRANSLATION-COVERAGE.md. Terms with no verified source are preserved
// in English - never invented.
window.GOTI18N = (function () {
  'use strict';

  var ui = {
    pageTitle: 'Mapa de As Crônicas de Gelo e Fogo com controle de spoilers',
    aboutH1: 'Mapa de As Crônicas de Gelo e Fogo',
    aboutSubtitle: 'com controle de spoilers por capítulo',
    spoilersThrough: 'Spoilers até:',
    chapters: 'Livros',
    showRegions: 'Exibir regiões:',
    nobility: 'Nobreza de Westeros',
    nobilityTitle:
      'Casas sem castelos conhecidos são posicionadas aleatoriamente nas terras de seu suserano.',
    constituencies: 'Regiões de Westeros',
    showPaths: 'Exibir trajetos dos personagens:',
    selectAll: 'selecionar todos',
    hideAll: 'ocultar todos',
    currentOnly: 'somente posições atuais',
    fullPath: 'exibir trajeto completo',
    searchPlaceholder: 'Buscar localidades...',
    returnToMenu: 'Voltar ao menu',
    returnToMap: 'Voltar ao mapa',
    showCharacterPaths: 'Exibir trajetos',
    aboutThisSite: 'Sobre este site',
    showConstituencies: 'Exibir regiões',
    showNobility: 'Exibir brasões',
    closeButton: '×',
    filterTooltip:
      'Arraste o controle até o último capítulo lido. Detalhes posteriores ficam ocultos nesta página. Links podem levar a spoilers em outros sites.',
    mapFallback:
      'Se o mapa não aparecer em alguns segundos, o JavaScript pode estar desativado. Este site usa JavaScript para exibir informações ao clicar em uma localidade.',
    engineLeaflet: 'Mapa: Leaflet',
    engineGoogle: 'Mapa: Google Maps',
    engineFallback: 'Google Maps indisponível - usando Leaflet.',
    houseLabel: 'Casa: ',
    originalNameLabel: 'Nome original: ',
    wikiLinkLabel: 'wiki (externo, pode conter spoilers)',
    layers: { pt: 'Nomes em português', nat: 'Sem nomes', fsm: 'Original (inglês)' },
    fullscreen: 'Tela cheia',
    sliderPrev: 'Capítulo anterior',
    sliderNext: 'Próximo capítulo',
    legendShow: 'Legenda',
    legendSymbols: {
      city: 'Cidade',
      town: 'Vila',
      castle: 'Castelo',
      ruin: 'Ruína',
      other: 'Outro',
      confirmed: 'confirmado nos livros',
      speculative: 'especulativo do mapa',
      forest: 'Floresta',
      water: 'Mar / água',
      island: 'Ilha',
      mountain: 'Montanha / relevo',
      region: 'Região',
      note: 'Símbolos recortados da arte original de theMountainGoat (CC BY-NC-SA). Categorias e cores seguem o mapa-fonte.',
    },
    legend: {
      gift: 'A Dádiva (Patrulha da Noite)',
      north: 'O Norte (Casa Stark)',
      rivers: 'Terras Fluviais (Casa Tully)',
      vale: 'Vale de Arryn (Casa Arryn)',
      islands: 'Ilhas de Ferro (Casa Greyjoy)',
      west: 'Terras Ocidentais (C. Lannister)',
      crown: 'Terras da Coroa (C. Baratheon)',
      reach: 'Campina (Casa Tyrell)',
      storm: 'Terras da Tempestade (C. Baratheon)',
      dorne: 'Dorne (Casa Martell)',
    },
    about: null, // filled below
  };

  // ---- glossary: verified Suma-2019 terms (appendix + project list) ----
  var glossary = {
    'Casterly Rock': 'Rochedo Casterly',
    'Castle Black': 'Castelo Negro',
    'Eyrie': 'Ninho da Águia',
    "King's Landing": 'Porto Real',
    'Kingswood': 'Mata de Rei',
    "Night's Watch": 'Patrulha da Noite',
    'Red Keep': 'Fortaleza Vermelha',
    'Tower of the Hand': 'Torre da Mão',
    'Direwolf': 'Lobo gigante',
    'Doom of Valyria': 'Destruição de Valíria',
    'Dornish sand steed': 'Corcel de areia de Dorne',
    'Dusk rose': 'Rosa-penumbrosa',
    "Harpy's gold": 'Ouro de harpia',
    'Ironborn': 'Homens de ferro',
    'Hand of the King': 'Mão do Rei',
    "Lady's Lace": 'Renda-de-senhora',
    'Long Night': 'Longa Noite',
    'Old Gods of the Forest': 'Deuses Antigos da Floresta',
    'White Walkers': 'Caminhantes Brancos',
    'Unbowed, Unbent, Unbroken': 'Insubmissos, Imbatíveis, Inquebráveis',
    'First of His Name': 'Primeiro de Seu Nome',
    'King of the Andals and the First Men': 'Rei dos Ândalos, dos Roinares e dos Primeiros Homens',
    'Protector of the Realm': 'Protetor do Território',
  };

  // ---- towns: location key -> pt-BR name (curated; others stay original) ----
  var towns = {
    'Castle_Black': 'Castelo Negro',
    'Shadow_Tower': 'Torre Sombria',
    'Nightfort': 'Fortenoite',
    'Eastwatch-by-the-Sea': 'Atalaialeste do Mar',
    'Inn_of_the_Kneeling_Man': 'Estalagem do Homem Ajoelhado',
    'Fist_of_the_First_Men': 'Punho dos Primeiros Homens',
    'Craster%27s_Keep': 'Fortaleza de Craster',
    'Hardhome': 'Durolar',
    'Mole%27s_Town': 'Vila Toupeira',
    'Queenscrown': 'Coroa da Rainha',
    'Last_Hearth': 'Última Lareira',
    'Deepwood_Motte': 'Bosque Profundo',
    'Dreadfort': 'Forte do Pavor',
    'Barrowton': 'Vila Acidentada',
    'White_Harbor': 'Porto Branco',
    'Moat_Cailin': 'Fosso Cailin',
    'Greywater_Watch': 'Atalaia da Água Cinzenta',
    'Eyrie': 'Ninho da Águia',
    'Saltpans': 'Salinas',
    'Quiet_Isle': 'Ilha Quieta',
    'Maidenpool': 'Lagoa da Donzela',
    'Twins': 'As Gêmeas',
    'Seagard': 'Guardamar',
    'Oldstones': 'Pedravelhas',
    'Crossroads_Inn': 'Estalagem da Encruzilhada',
    'Riverrun': 'Correrrio',
    'Raventree_Hall': 'Solar de Corvarbor',
    'Stone_Mill': 'Moinho de Pedra',
    'High_Heart': 'Coração Alto',
    'Acorn_Hall': 'Solar de Bolotas',
    'Stoney_Sept': 'Septo de Pedra',
    'Banefort': 'Forte Desgraça',
    'The_Crag': 'Despenhadeiro',
    'Golden_Tooth': 'Dente Dourado',
    'Silverhill': 'Monte Prateado',
    'Deep_Den': 'Toca Funda',
    'Casterly_Rock': 'Rochedo Casterly',
    'Horn_Hill': 'Monte Chifre',
    'Dragonstone': 'Pedra do Dragão',
    'King%27s_Landing': 'Porto Real',
    'Red_Lake': 'Lago Vermelho',
    'Goldengrove': 'Bosquedouro',
    'Bitterbridge': 'Ponte Amarga',
    'Old_Oak': 'Carvalho Velho',
    'Highgarden': 'Jardim de Cima',
    'Brightwater_Keep': 'Fortaleza de Águas Claras',
    'Ashford': 'Vaufreixo',
    'Oldtown': 'Vilavelha',
    'Storm%27s_End': 'Ponta Tempestade',
    'Griffin%27s_Roost': 'Poleiro do Grifo',
    'Summerhall': 'Solarestival',
    'Nightsong': 'Nocticantiga',
    'Tower_of_Joy': 'Torre da Alegria',
    'Kingsgrave': 'Tumbarreal',
    'Blackmont': 'Monte Negro',
    'Starfall': 'Tombastela',
    'Sandstone': 'Arenito',
    'Skyreach': 'Alcanceleste',
    'Hellholt': 'Toca do Inferno',
    'Ghost_Hill': 'Monte Fantasma',
    'Lemonwood': 'Limoeiros',
    'Planky_Town': 'Vila Tabuleta',
    'Sunspear': 'Lançassolar',
    'Water_Gardens': 'Jardins de Água',
    'Port_of_Ibben': 'Porto de Ibben',
    'Old_Ghis': 'Velha Ghis',
    'New_Ghis': 'Nova Ghis',
    'Valyria': 'Valíria',
    'Sorrows': 'Tristezas',
    'Dead_City1': 'Cidade morta (oeste)',
    'Dead_City2': 'Cidade morta (leste)',
    // verified via wiki.geloefogo.com interlanguage links ([[en:..]]);
    // descriptive entries are label descriptions, not official toponyms.
    // evidence: docs/translation-sources.json
    "Antlers": "Hastes",
    "Ashemark": "Cinzamarca",
    "BWB_Hideout": "Esconderijo da Irmandade sem Bandeiras",
    "Blackcrown": "Coroanegra",
    "Blackhaven": "Portonegro",
    "Brindlewood": "Bosque Malhado",
    "Bronzegate": "Portabrônzea",
    "Castle_Cerwyn": "Castelo Cerwyn",
    "Castle_Goodbrother": "Castelo Goodbrother",
    "Cider_Hall": "Solar de Sidra",
    "Clegane%27s_Keep": "Fortaleza Clegane",
    "Coldwater_Burn": "Regato da Águafria",
    "Cornfield": "Campodemilho",
    "Crakehall": "Paço de Codorniz",
    "Crofters%27_village": "Vila de Arrendatários",
    "Crow%27s_Nest": "Ninho de Corvo",
    "Deep_Lake": "Lago Profundo",
    "Duskendale": "Valdocaso",
    "Dyre_Den": "Antro Terrível",
    "Elyria": "Elíria",
    "Evenfall_Hall": "Solar do Entardecer",
    "Execution_Holdfast": "Fortaleza da execução",
    "Faircastle": "Belcastro",
    "Fairmarket": "Feirajusta",
    "Feastfires": "Fogofestivo",
    "Felwood": "Bosque Cortado",
    "Flint%27s_Finger": "Dedo de Pederneira",
    "Ghaston_Grey": "Sinistres Gris",
    "Gods_Eye_Holdfast": "Fortaleza do Olho de Deus",
    "Gods_Eye_Village": "Vila do Olho de Deus",
    "Godsgrace": "Graçadivina",
    "Goodbrook_Village": "Vila de Lorde Goodbrook",
    "Grandview": "Belavista",
    "Grassy_Vale": "Vale d'Erva",
    "Greenguard": "Guardaverde",
    "Greenstone": "Pedraverde",
    "Greyguard": "Guardagris",
    "Gulltown": "Vila Gaivota",
    "Hammerhorn": "Cornartelo",
    "Harvest_Hall": "Solar de Colheitas",
    "Haystack_Hall": "Solar de Montefeno",
    "Heart%27s_Home": "Lar do Coração",
    "High_Hermitage": "Alto Ermitério",
    "Hoarfrost_Hill": "Colina de Geadalva",
    "Honeyholt": "Bosquemel",
    "Hornvale": "Valecorno",
    "House_Baelish": "Casa Baelish",
    "Icemark": "Marcagelo",
    "Ironoaks": "Ferrobles",
    "Ivy_Inn": "Estalagem da Hera",
    "Lady_of_the_Leaves": "A Senhora das Folhas",
    "Long_Barrow": "Monte Longo",
    "Longbow_Hall": "Solar de Longarco",
    "Longtable": "Mesalonga",
    "Lord_Harroway%27s_Town": "Vila de Lorde Harroway",
    "Lord_Hewett%27s_Town": "Vila de Lorde Hewett",
    "Lychester_Keep": "Fortaleza de Lorde Lychester",
    "Mistwood": "Matabruma",
    "Mummer%27s_Ford": "Vau do Saltimbanco",
    "Nagga%27s_Hill": "Monte de Nagga",
    "Nunn%27s_Deep": "Abismos de Nunn",
    "Oakenshield_(Wall)": "Escudo de Carvalho",
    "Old_Anchor": "Âncora Velha",
    "Old_Stone_Bridge": "Velha Ponte de Pedra",
    "Oldcastle": "Castelovelho",
    "Oxcross": "Cruzaboi",
    "Palisade_Village": "Vila da Paliçada",
    "Parchments": "Pergaminhos",
    "Pebbleton": "Seixeira",
    "Pendric_Hills": "Montes Pendric",
    "Pennytree": "Centarbor",
    "Pinkmaiden_Castle": "Donzelarrosa",
    "Queensgate": "Portão da Rainha",
    "Rain_House": "Casais de Chuva",
    "Ramsgate": "Aríete",
    "Redfort": "Forte Vermelho",
    "Rimegate": "Portão da Geada",
    "Robbed_Sept": "Septo saqueado",
    "Rook%27s_Rest": "Pouso de Gralhas",
    "Runestone": "Pedrarruna",
    "Rushing_Falls": "Cataratas Impetuosas",
    "Sable_Hall": "Solar das Trevas",
    "Sallydance": "Brotadança",
    "Salt_Shore": "Costa do Sal",
    "Sentinel_Stand": "Bosque de Sentinelas",
    "Shandystone": "Pedramarela",
    "Sharp_Point": "Ponta Afiada",
    "Sisterton": "Vilirmã",
    "Snakewood": "Mata de Cobras",
    "Sow%27s_Horn": "Berrante de Porca",
    "Stone_Hedge": "Barreira de Pedra",
    "Stonedance": "Bailepedra",
    "Stonedoor": "Portapedra",
    "Stonehelm": "Pedrelmo",
    "Stony_Shore": "Costa Pedregosa",
    "Strongsong": "Cantoforte",
    "Tall_Trees_Town": "Vila das Árvores Altas",
    "Tarbeck_Hall": "Salão Tarbeck",
    "Ten_Towers": "Dez Torres",
    "They_Lay_With_Lions": "Estalagem (Eles se deitam com leões)",
    "Three_Towers": "Três Torres",
    "Tor": "Penha",
    "Tumbledown_Tower": "Torre Arruinada",
    "Tumbler%27s_Falls": "Cascata do Acrobata",
    "Unnamed_Village": "Vilarejo sem nome",
    "Uplands": "Terraltas",
    "Vulture%27s_Roost": "Pouso do Abutre",
    "Wayfarer%27s_Rest": "Pouso do Viajante",
    "Wendish_Town": "Vila Vêneda",
    "Westwatch-by-the-Bridge": "Atalaioeste da Ponta",
    "Whispers": "Murmúrios",
    "Whitetree": "Brancarbor",
    "Wickenden": "Tocalar",
    "Woodswatch-by-the-Pool": "Atalaiabosque da Lagoa",
    "Yronwood": "Paloferro",
    // confident extra literary names (well-established Suma usage):
    'Bloody_Gate': 'Portão Sangrento',
    'Widow%27s_Watch': 'Atalaia da Viúva',
    'Torrhen%27s_Square': 'Praça de Torrhen',
    // resolved via online pt-BR wiki articles (secondary sources, not
    // Suma-edition verified) — evidence: docs/translation-sources.json
    'Torches': 'Archotes',
    'Hollow_Hill': 'Monte Oco',
    'Sunflower_Hall': 'Solar de Girassol',
    'Weeping_Tower': 'Torre dos Prantos',
    'Wyl_(Dorne)': 'Wyl',
    'Donella_Manderly': 'Donella Manderly',
  };

  // extra accepted search aliases (non-Suma spellings still resolve)
  var townAliases = {
    'Eyrie': ['Ninho da Águia'],
    'King%27s_Landing': ["King's Landing"],
    'Hollow_Hill': ['Colina Oca'],
    'Sunflower_Hall': ['Sunhouse', 'Casassolar', 'Cassolar', 'Solar de Girassol', 'Casasolar'],
    'Donella_Manderly': ['Donella Hornwood'],
    // previous labels retained as searchable aliases; new preferred forms are
    // book-evidenced - decisions: docs/local-book-reference.json
    'Griffin%27s_Roost': ['Ninho do Grifo'],
    'Deep_Den': ['Toca Profunda'],
    'The_Crag': ['Penhasco'],
    'Starfall': ['Queda da Estrela'],
    'Sharp_Point': ['Ponta Aguda'],
    'Acorn_Hall': ['Solar de Bolota'],
    'Nightsong': ['Canto Noturno'],
    'Quiet_Isle': ['Ilha Silenciosa'],
  };

  // ---- book prefixes / chapter word translations ----
  var books = {
    AGOT: 'A Guerra dos Tronos',
    ACOK: 'A Fúria dos Reis',
    ASOS: 'A Tormenta de Espadas',
    AFFC: 'O Festim dos Corvos',
    ADWD: 'A Dança dos Dragões',
    TWOW: 'Os Ventos do Inverno',
  };
  // exact raw POV epithet -> Suma chapter title.
  // verified against wiki.geloefogo.com chapter infoboxes (| título = ...),
  // which mirror the published pt-BR books; sources: docs/TRANSLATION-COVERAGE.md
  var chapterWords = {
    'Prologue': 'Prólogo',
    'Epilogue': 'Epílogo',
    'The Prophet': 'O Profeta',
    'The Captain Of Guards': 'O Capitão dos Guardas',
    "Kraken's Daughter": 'A Filha da Lula Gigante',
    'The Soiled Knight': 'O Cavaleiro Maculado',
    'The Iron Captain': 'O Capitão de Ferro',
    'The Drowned Man': 'O Afogado',
    'The Queenmaker': 'A Fazedora de Rainhas',
    'The Reaver': 'O Pirata',
    'Cat Of The Canals': 'Gata dos Canais',
    'Princess in the Tower': 'A Princesa na Torre',
    "The Merchant's Man": 'O Homem do Mercador',
    'The Lost Lord': 'O Senhor Perdido',
    'The Windblown': 'O Soprado pelo Vento',
    'The Wayward Bride': 'A Noiva Rebelde',
    'Prince of Winterfell': 'O Príncipe de Winterfell',
    'The Watcher': 'O Sentinela',
    'The Turncloak': 'O Vira-Casaca',
    "The King's Prize": 'O Prêmio do Rei',
    'The Blind Girl': 'A Garota Cega',
    'A Ghost In Winterfell': 'Um Fantasma em Winterfell',
    'The Queensguard': 'O Guarda da Rainha',
    'The Iron Suitor': 'O Pretendente de Ferro',
    'Discarded Knight': 'O Cavaleiro Descartado',
    'The Spurned Suitor': 'O Pretendente Rejeitado',
    'The Griffin Reborn': 'O Grifo Renascido',
    'The Sacrifice': 'O Sacrifício',
    'The Ugly Little Girl': 'A Garotinha Feia',
    'The Kingbreaker': 'O Derrubador de Reis',
    'The Dragontamer': 'O Domador de Dragões',
    "The Queen's Hand": 'A Mão da Rainha', // geloefogo typo "O Mão" corrected (gender)
    'Reek I': 'Fedor I',
    'Reek II': 'Fedor II',
    'Reek III': 'Fedor III',
  };

  // ---- houses ----
  function houseName(wikiKey) {
    if (!wikiKey) return '';
    var name = decodeURIComponent(String(wikiKey)).replace(/_/g, ' ');
    if (name === "Night's Watch") return 'Patrulha da Noite';
    var m = name.match(/^House (.+?) of (.+)$/);
    if (m) return 'Casa ' + m[1] + ' de ' + placeFragment(m[2]);
    m = name.match(/^House (.+)$/);
    if (m) return 'Casa ' + m[1];
    return name;
  }
  function placeFragment(name) {
    // translate place fragments only when the exact English name is a known town
    for (var key in towns) {
      var en = decodeURIComponent(key).replace(/_/g, ' ');
      if (en === name) return towns[key];
    }
    var specials = {
      "King's Landing": 'Porto Real',
      "Widow's Watch": 'Atalaia da Viúva',
      'Harrenhal': 'Harrenhal',
      'Dragonstone': 'Pedra do Dragão',
    };
    return specials[name] || name;
  }

  // ---- region (constituency) names: region key -> pt ----
  var regions = {
    'Gift': 'A Dádiva',
    'The_North': 'O Norte',
    'Riverlands': 'Terras Fluviais',
    'Vale_of_Arryn': 'Vale de Arryn',
    'Iron_Islands': 'Ilhas de Ferro',
    'Westerlands': 'Terras Ocidentais',
    'Crownlands': 'Terras da Coroa',
    'The_Reach': 'Campina',
    'Stormlands': 'Terras da Tempestade',
    'Dorne': 'Dorne',
  };

  // ---- character display names ----
  var chars = {
    eddard: 'Eddard Stark',
    catelyn: 'Catelyn Stark',
    robb: 'Robb Stark',
    sansa: 'Sansa Stark',
    bran: 'Bran Stark',
    arya: 'Arya Stark',
    rickon: 'Rickon Stark',
    jon: 'Jon Snow',
    daenerys: 'Daenerys Targaryen',
    aegon: 'Aegon Targaryen',
    tywin: 'Tywin Lannister',
    jaime: 'Jaime Lannister',
    cersei: 'Cersei Lannister',
    tyrion: 'Tyrion Lannister',
    joffrey: 'Joffrey Baratheon',
    myrcella: 'Myrcella Baratheon',
    robert: 'Robert Baratheon',
    stannis: 'Stannis Baratheon',
    renly: 'Renly Baratheon',
    theon: 'Theon Greyjoy',
    asha: 'Asha Greyjoy',
    victarion: 'Victarion Greyjoy',
    brienne: 'Brienne de Tarth',
    davos: 'Davos Seaworth',
    samwell: 'Samwell Tarly',
    arianne: 'Arianne Martell',
    littlefinger: 'Petyr Baelish (Mindinho)',
    duncan: 'Duncan, o Alto',
  };

  // ---- geographical labels for the pt vector layer (approximate positions) --
  // zoom range each label is allowed in; town labels are handled separately.
  var geoLabels = [
    { text: 'Westeros', lat: 38, lng: -122, minZ: 1, maxZ: 3, cls: 'geo-continent' },
    { text: 'Essos', lat: 8, lng: -8, minZ: 1, maxZ: 3, cls: 'geo-continent' },
    { text: 'O Norte', lat: 62, lng: -122, minZ: 2, maxZ: 4, cls: 'geo-region' },
    { text: 'Terras Fluviais', lat: 22, lng: -120, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Vale de Arryn', lat: 34, lng: -90, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Ilhas de Ferro', lat: 38, lng: -152, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Terras Ocidentais', lat: 18, lng: -142, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Terras da Coroa', lat: 6, lng: -104, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Campina', lat: -10, lng: -130, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Terras da Tempestade', lat: -20, lng: -96, minZ: 3, maxZ: 4, cls: 'geo-region' },
    { text: 'Dorne', lat: -42, lng: -100, minZ: 2, maxZ: 4, cls: 'geo-region' },
    { text: 'Mar Estreito', lat: 18, lng: -64, minZ: 2, maxZ: 4, cls: 'geo-sea' },
    { text: 'Mar do Poente', lat: 22, lng: -172, minZ: 2, maxZ: 4, cls: 'geo-sea' },
    { text: 'Mar de Dorne', lat: -30, lng: -80, minZ: 3, maxZ: 5, cls: 'geo-sea' },
    { text: 'Mar Dothraki', lat: 24, lng: 18, minZ: 2, maxZ: 4, cls: 'geo-sea' },
    { text: 'Baía dos Escravos', lat: -18, lng: 55, minZ: 2, maxZ: 4, cls: 'geo-sea' },
    { text: 'A Muralha', lat: 78.5, lng: -110, minZ: 2, maxZ: 5, cls: 'geo-landmark' },
    { text: 'Mata de Rei', lat: -4, lng: -98, minZ: 3, maxZ: 5, cls: 'geo-region' },
  ];

  // towns that deserve label priority at low zooms
  var majorTowns = [
    'King%27s_Landing', 'Winterfell', 'Casterly_Rock', 'Oldtown', 'Gulltown',
    'White_Harbor', 'Sunspear', 'Highgarden', 'Pyke', 'Riverrun',
    'Storm%27s_End', 'Dragonstone', 'Castle_Black', 'Braavos', 'Pentos',
    'Volantis', 'Meereen', 'Qarth', 'Vaes_Dothrak', 'Lannisport',
  ];

  function townName(key) {
    return towns[key] || decodeURIComponent(String(key)).replace(/_/g, ' ');
  }

  return {
    ui: ui,
    glossary: glossary,
    towns: towns,
    townAliases: townAliases,
    books: books,
    chapterWords: chapterWords,
    regions: regions,
    chars: chars,
    geoLabels: geoLabels,
    majorTowns: majorTowns,
    houseName: houseName,
    townName: townName,
    chapterTitle: function (rawTitle) {
      // "AGOT-0: Prologue" -> "A Guerra dos Tronos-0: Prólogo"
      // "TWOW-?: Theon I"    -> "Os Ventos do Inverno (capítulo de amostra): Theon I"
      var m = String(rawTitle).match(/^([A-Z]+)-(\d+|\?):\s*(.+)$/);
      if (!m) return rawTitle;
      var book = books[m[1]] || m[1];
      var pov = chapterWords[m[3]] || m[3];
      if (m[2] === '?') return book + ' (capítulo de amostra): ' + pov;
      return book + '-' + m[2] + ': ' + pov;
    },
  };
})();
