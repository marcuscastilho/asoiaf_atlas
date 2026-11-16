'use strict';
// Unit tests for pure logic (node:test). Run: node --test test/unit.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');

const CORE = require('../assets/js/core.js');
global.window = global;
require('../assets/js/i18n-pt.js');
const I18N = global.GOTI18N;

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/js/data.js', 'utf-8'), ctx);
const { locations, chapters, novellas, regions, paths, nobility } = ctx;

// the original source evaluated exactly like tools/generate-data.mjs does
// (mechanical LatLng replacement + VM) - used to verify the serialization
// preserves raw data and applies only the documented filter rule.
const refCtx = {};
vm.createContext(refCtx);
vm.runInContext(
  fs.readFileSync('reference/ASoIaF-overlays.js', 'utf-8')
    .replace(/new google\.maps\.LatLng\(([^()]*)\)/g, '[$1]'),
  refCtx
);
// VM-context objects have foreign prototypes; normalize before deepStrictEqual
const J = (o) => JSON.parse(JSON.stringify(o));

test('keyhole tile codes (z1 quadrants + root + deeper level)', () => {
  assert.strictEqual(CORE.getTileCode(0, 0, 0), 't');
  assert.strictEqual(CORE.getTileCode(0, 0, 1), 'tq');
  assert.strictEqual(CORE.getTileCode(1, 0, 1), 'tr');
  assert.strictEqual(CORE.getTileCode(0, 1, 1), 'tt');
  assert.strictEqual(CORE.getTileCode(1, 1, 1), 'ts');
  // x=5,y=5 at z3: MSB->LSB -> 's','q','s'
  assert.strictEqual(CORE.getTileCode(5, 5, 3), 'tsqs');
});

test('tile range bounds', () => {
  assert.strictEqual(CORE.isOutsideTileRange(0, 0, 1), false);
  assert.strictEqual(CORE.isOutsideTileRange(1, 1, 1), false);
  assert.strictEqual(CORE.isOutsideTileRange(2, 0, 1), true);
  assert.strictEqual(CORE.isOutsideTileRange(-1, 0, 1), true);
  assert.strictEqual(CORE.tileUrl('nat', 0, 0, 1), 'assets/tiles/nat/tq.jpg');
  assert.strictEqual(CORE.tileUrl('nat', 9, 9, 1), null);
});

test('spoiler ranges: scalar cumulative, pair inclusive, missing hidden', () => {
  assert.deepStrictEqual(CORE.spoilerRange(20, 999, 999), [20, 999]); // scalar -> cumulative
  assert.deepStrictEqual(CORE.spoilerRange([12, 14], 999, 999), [12, 14]);
  assert.deepStrictEqual(CORE.spoilerRange(undefined, 999, 999), [999, 999]);
  const r = CORE.pathRanges({ icon: 'x', chapters: [0, 17], episodes: [0, 1] });
  assert.deepStrictEqual(r.episodes, [0, 1]);
  // path item with chapters but NO episodes: hidden in episode mode
  const r2 = CORE.pathRanges({ line: '#808080', chapters: 22, path: ['Twins'] });
  assert.deepStrictEqual(r2.episodes, [99, 99]);
  assert.strictEqual(CORE.inRange(r2.episodes, 0), false);
  assert.strictEqual(CORE.inRange(r2.episodes, 62), false);
  // inclusive endpoints
  assert.strictEqual(CORE.inRange([12, 14], 12), true);
  assert.strictEqual(CORE.inRange([12, 14], 14), true);
  assert.strictEqual(CORE.inRange([12, 14], 15), false);
});

test('marker-only mode hides lines AND arrows but not markers', () => {
  const ranges = { chapters: [0, 999], episodes: [0, 99] };
  assert.strictEqual(CORE.pathOverlayVisible(ranges, 'marker', 'C', 10, true), true);
  assert.strictEqual(CORE.pathOverlayVisible(ranges, 'line', 'C', 10, true), false);
  assert.strictEqual(CORE.pathOverlayVisible(ranges, 'arrow', 'C', 10, true), false);
  assert.strictEqual(CORE.pathOverlayVisible(ranges, 'line', 'C', 10, false), true);
});

test('slider clamp', () => {
  assert.strictEqual(CORE.clamp(-1, 0, 344), 0);
  assert.strictEqual(CORE.clamp(345, 0, 344), 344);
  assert.strictEqual(CORE.clamp(62, 0, 62), 62);
});

test('accent-insensitive search matches pt names, originals, aliases', () => {
  const klFilter = CORE.normalizeText("Porto Real King's Landing Casa Baratheon");
  assert.strictEqual(CORE.searchMatches(klFilter, 'porto'), true);
  assert.strictEqual(CORE.searchMatches(klFilter, 'Porto Real'), true);
  assert.strictEqual(CORE.searchMatches(klFilter, "king's landing"), true);
  const eyrieFilter = CORE.normalizeText("Ninho da Águia Eyrie Casa Arryn");
  assert.strictEqual(CORE.searchMatches(eyrieFilter, 'aguia'), true);
  assert.strictEqual(CORE.searchMatches(eyrieFilter, 'ÁGUIA'), true);
  assert.strictEqual(CORE.searchMatches(eyrieFilter, 'eyrie'), true);
  assert.strictEqual(CORE.searchMatches(eyrieFilter, 'meereen'), false);
});

test('glossary exact mappings (appendix-verified)', () => {
  assert.strictEqual(I18N.glossary['Kingswood'], 'Mata de Rei');
  assert.strictEqual(I18N.towns['Castle_Black'], 'Castelo Negro');
  assert.strictEqual(I18N.towns['Eyrie'], 'Ninho da Águia');
  assert.strictEqual(I18N.towns['King%27s_Landing'], 'Porto Real');
  assert.strictEqual(I18N.glossary['Unbowed, Unbent, Unbroken'], 'Insubmissos, Imbatíveis, Inquebráveis');
  assert.strictEqual(I18N.glossary["Night's Watch"], 'Patrulha da Noite');
});

test('house name localization', () => {
  assert.strictEqual(I18N.houseName('House_Stark'), 'Casa Stark');
  assert.strictEqual(I18N.houseName('House_Tully'), 'Casa Tully');
  assert.strictEqual(I18N.houseName('Night%27s_Watch'), 'Patrulha da Noite');
  assert.strictEqual(
    I18N.houseName('House_Baratheon_of_King%27s_Landing'),
    'Casa Baratheon de Porto Real'
  );
  assert.strictEqual(
    I18N.houseName('House_Baratheon_of_Dragonstone'),
    'Casa Baratheon de Pedra do Dragão'
  );
});

test('hash parsing: valid keys/coords, malformed input never throws', () => {
  assert.deepStrictEqual(CORE.parseHash('http://x/#@Winterfell'), { kind: 'key', key: 'Winterfell' });
  assert.deepStrictEqual(
    CORE.parseHash('http://x/#@King%27s_Landing'),
    { kind: 'key', key: 'King%27s_Landing' }
  );
  assert.deepStrictEqual(CORE.parseHash('http://x/#@10.5,-80.3'), { kind: 'coords', lat: 10.5, lng: -80.3 });
  assert.strictEqual(CORE.parseHash('http://x/#@999,999').kind, 'none'); // out of bounds
  assert.strictEqual(CORE.parseHash('http://x/#@').kind, 'none');
  assert.strictEqual(CORE.parseHash('http://x/').kind, 'none');
  assert.strictEqual(CORE.parseHash('http://x/#section').kind, 'none');
  assert.strictEqual(CORE.parseHash('').kind, 'none');
  assert.strictEqual(CORE.parseHash(null).kind, 'none');
  assert.strictEqual(CORE.parseHash('#@..,..').kind, 'none');
  assert.strictEqual(CORE.parseHash('#@abc,def').kind, 'key'); // resolves later -> unknown key ignored
});

test('pin spec parsing', () => {
  assert.deepStrictEqual(CORE.parsePinSpec('_sleft|E|808080'), {
    kind: 'pin', side: 'left', letter: 'E', fill: '#808080', textColor: '#FFFFFF',
  });
  assert.deepStrictEqual(CORE.parsePinSpec('|D|000000|FFFFFF'), {
    kind: 'pin', side: null, letter: 'D', fill: '#000000', textColor: '#FFFFFF',
  });
  assert.strictEqual(CORE.parsePinSpec('skull').kind, 'skull');
  assert.strictEqual(CORE.parsePinSpec('lost').kind, 'lost');
});

test('localized slider titles', () => {
  assert.strictEqual(I18N.chapterTitle('AGOT-0: Prologue'), 'A Guerra dos Tronos-0: Prólogo');
  assert.strictEqual(I18N.chapterTitle('ADWD-4: Bran I'), 'A Dança dos Dragões-4: Bran I');
});

test('TWOW sample chapter title', () => {
  // dataset ends with "TWOW-?: Theon I" - must not fall back to raw English
  const last = chapters[chapters.length - 1];
  assert.strictEqual(last.title, 'TWOW-?: Theon I');
  assert.strictEqual(
    I18N.chapterTitle(last.title),
    'Os Ventos do Inverno (capítulo de amostra): Theon I'
  );
});

test('chapter epithets: exact raw keys -> verified pt titles', () => {
  const raw = [
    ['The Prophet', 'O Profeta'],
    ["Kraken's Daughter", 'A Filha da Lula Gigante'],
    ['The Reaver', 'O Pirata'],
    ['Princess in the Tower', 'A Princesa na Torre'],
    ['Discarded Knight', 'O Cavaleiro Descartado'],
    ['A Ghost In Winterfell', 'Um Fantasma em Winterfell'],
    ['The Windblown', 'O Soprado pelo Vento'],
    ['Reek I', 'Fedor I'],
    ["The Queen's Hand", 'A Mão da Rainha'],
  ];
  for (const [en, pt] of raw) assert.strictEqual(I18N.chapterWords[en], pt, en);
  // every epithet actually used by the dataset must resolve
  const namePov = /^(Bran|Catelyn|Daenerys|Eddard|Jon|Arya|Tyrion|Sansa|Davos|Theon|Jaime|Samwell|Cersei|Brienne|Alayne|Reek|Melisandre|Victarion|Prologue|Epilogue)/;
  for (const ch of chapters) {
    const m = ch.title.match(/^[A-Z]+-(\d+|\?):\s*(.+)$/);
    if (!m || namePov.test(m[2])) continue;
    assert.ok(I18N.chapterWords[m[2]], `epithet untranslated: ${m[2]}`);
  }
});

test('Night\'s Watch black flag resolves to local asset', () => {
  // nobility data uses the relative filename "black_flag.png" which is not a
  // downloadable URL - the app maps it to the local copy.
  const nw = nobility.find((n) => n.wikiKey === 'Night%27s_Watch');
  assert.strictEqual(nw.img, 'black_flag.png');
  assert.ok(fs.existsSync('assets/img/black_flag.png'));
});

test('dataset sanity (books-only, mirrored verbatim from the original)', () => {
  assert.strictEqual(Object.keys(locations).length, 245);
  assert.strictEqual(chapters.length, 345);
  // books-only runtime: no episodes variable, no episodes properties
  assert.strictEqual(ctx.episodes, undefined);
  assert.ok(!/episode/i.test(fs.readFileSync('assets/js/data.js', 'utf-8')));
  for (const segs of Object.values(paths)) {
    for (const seg of segs) assert.ok(!('episodes' in seg), 'residual episodes prop');
  }
  for (const n of nobility) assert.ok(!('episodes' in n), 'residual episodes prop');
  // every aegon overlay is chapter-289+ only (spoiler guard)
  for (const seg of paths.aegon) {
    const r = CORE.pathRanges(seg);
    assert.ok(r.chapters[0] >= 289, 'aegon overlay starts before 289');
  }
  // nobility entries without chapters still validate as always-valid [0,999]
  const great = nobility.find((n) => n.wikiKey === 'House_Arryn' && n.seatKey === 'Eyrie');
  const nr = CORE.nobilityRanges(great);
  assert.deepStrictEqual(nr.chapters, [0, 999]);
});

test('generated data equals reference VM under the exact filter rules', () => {
  const lastChapter = refCtx.chapters.length - 1;
  const start = (v) => (Array.isArray(v) ? v[0] : v);
  const strip = (o) => { const c = { ...o }; delete c.episodes; return c; };

  // raw mirrors are value-identical to the reference (keys, coords, urls, order)
  assert.deepStrictEqual(J(chapters), J(refCtx.chapters));
  assert.deepStrictEqual(J(novellas), J(refCtx.novellas));
  assert.deepStrictEqual(J(regions), J(refCtx.regions));
  assert.deepStrictEqual(J(locations), J(refCtx.locations));

  // every original location URL survives byte-exact (explicit or absent)
  for (const k of Object.keys(refCtx.locations)) {
    assert.strictEqual(locations[k].url, refCtx.locations[k].url, k);
    assert.deepStrictEqual(locations[k].lat, refCtx.locations[k].lat, k);
    assert.deepStrictEqual(locations[k].lng, refCtx.locations[k].lng, k);
  }

  // paths: kept iff explicit `chapters` (number or [start,end]) starts at or
  // before the last chapter; retained segment = reference minus `episodes`.
  let kept = 0;
  for (const ch of Object.keys(refCtx.paths)) {
    const expected = J(
      refCtx.paths[ch]
        .filter((s) => s.chapters !== undefined && start(s.chapters) <= lastChapter)
        .map(strip)
    );
    kept += expected.length;
    assert.deepStrictEqual(J(paths[ch] || []), expected, ch);
  }
  assert.strictEqual(kept, 546);
  // literal ranges preserved, including the future/open end value 999
  let saw999 = false;
  for (const segs of Object.values(paths)) {
    for (const s of segs) {
      if (Array.isArray(s.chapters) && s.chapters[1] === 999) saw999 = true;
      assert.ok(start(s.chapters) <= lastChapter);
    }
  }
  assert.ok(saw999, 'expected at least one literal end value 999');
  // dropped = episode-only or post-book segments (exact inverse of the rule)
  const dropped = Object.values(refCtx.paths).flat()
    .filter((s) => s.chapters === undefined || start(s.chapters) > lastChapter);
  assert.strictEqual(dropped.length, 273);

  // nobility: no `chapters` means always-valid; explicit start beyond the
  // last chapter is dropped; retained entry = reference minus `episodes`.
  const expectedNob = J(
    refCtx.nobility
      .filter((n) => n.chapters === undefined || start(n.chapters) <= lastChapter)
      .map(strip)
  );
  assert.deepStrictEqual(J(nobility), expectedNob);
  const droppedNob = refCtx.nobility
    .filter((n) => n.chapters !== undefined && start(n.chapters) > lastChapter);
  assert.strictEqual(droppedNob.length, 1);
  assert.ok(nobility.every((n) => n.wikiKey !== droppedNob[0].wikiKey ||
    n !== droppedNob[0]), 'out-of-range nobility record kept');
});

test('online-resolved towns: six secondary-source mappings + aliases', () => {
  // verified via wiki.geloefogo.com articles (secondary source, not
  // Suma-edition certified) — evidence: docs/translation-sources.json
  const expected = {
    'Torches': 'Archotes',
    'Hollow_Hill': 'Monte Oco',
    'Sunflower_Hall': 'Solar de Girassol',
    'Weeping_Tower': 'Torre dos Prantos',
    'Wyl_(Dorne)': 'Wyl',
    'Donella_Manderly': 'Donella Manderly',
  };
  for (const key of Object.keys(expected)) {
    // raw data key still exists verbatim and resolves to the pt name
    assert.ok(locations[key], `missing data key ${key}`);
    assert.strictEqual(I18N.townName(key), expected[key]);
  }
  // aliases resolve English/alternate spellings to the same keys
  assert.deepStrictEqual(I18N.townAliases['Hollow_Hill'], ['Colina Oca']);
  assert.deepStrictEqual(I18N.townAliases['Sunflower_Hall'], ['Sunhouse', 'Casassolar', 'Cassolar', 'Solar de Girassol', 'Casasolar']);
  assert.deepStrictEqual(I18N.townAliases['Donella_Manderly'], ['Donella Hornwood']);
  // 'Solar de Girassol' is genuine LeYa evidence (local-book-reference.json);
  // only the unsupported literal phrase must stay rejected
  const joined = JSON.stringify(I18N.towns) + JSON.stringify(I18N.townAliases);
  assert.ok(!/Solar dos Girass/i.test(joined), 'invented "Solar dos Girassóis" present');
  assert.ok(!/Vila[_ ]Chorosa/i.test(joined), 'town name wrongly assigned to tower');
});

test('cartography catalog invariants (real catalog only)', (t) => {
  const cctx = { window: {} };
  vm.createContext(cctx);
  vm.runInContext(fs.readFileSync('assets/js/cartography.js', 'utf-8'), cctx);
  const C = cctx.window.GOTMAP_CARTOGRAPHY;
  assert.ok(C && Array.isArray(C.features), 'GOTMAP_CARTOGRAPHY missing');
  if (!C.features.length) {
    t.skip('catalog still ships the empty placeholder');
    return;
  }
  const W = C.width || 4642, H = C.height || 4642;
  const KINDS = new Set(['city', 'town', 'castle', 'ruin', 'other', 'forest',
    'water', 'island', 'mountain', 'region', 'continent', 'road']);
  for (const f of C.features) {
    assert.ok(f.x >= 0 && f.x <= W && f.y >= 0 && f.y <= H,
      `out of bounds: ${f.id || f.english}`);
    assert.ok(KINDS.has(f.kind), `bad kind ${f.kind}: ${f.id || f.english}`);
    assert.ok((f.fontSize || 0) > 0, `missing fontSize: ${f.id || f.english}`);
    // source layer is canonical or speculative and the flag agrees
    if (f.sourceLayer != null) {
      assert.strictEqual(!!f.speculative, /spec/i.test(String(f.sourceLayer)),
        `sourceLayer/speculative mismatch: ${f.id || f.english}`);
    }
    if (f.key) {
      // keyed feature must reference a real raw location and carry the
      // EXACT original URL (or none - the app derives the same default)
      const loc = locations[f.key];
      assert.ok(loc, `catalog key not in raw locations: ${f.key}`);
      const expected = loc.url ||
        'https://awoiaf.westeros.org/index.php/' + f.key;
      assert.ok(f.url === undefined || f.url === expected,
        `keyed URL differs from raw: ${f.key}`);
    }
  }
  // no raw keys lost: every catalog key resolves, and all 245 raw
  // locations remain (covered verbatim by the data-equivalence test)
  assert.strictEqual(Object.keys(locations).length, 245);

  // bookSource only allowed on book-context-reviewed rows; unresolved ids
  // must retain the original English label and carry no bookSource
  for (const f of C.features) {
    if (f.bookSource) {
      assert.strictEqual(f.translationStatus, 'book-context-reviewed',
        `bookSource on unreviewed row: ${f.id || f.english}`);
    }
  }
  const covPath = 'docs/map-coverage.json';
  if (fs.existsSync(covPath)) {
    const cov = JSON.parse(fs.readFileSync(covPath, 'utf-8'));
    if (typeof cov.additionalBookReviewedReferences === 'number') {
      // coverage counts DISTINCT references; a repeated source label
      // instance shares one id
      assert.strictEqual(
        new Set(C.features.filter((f) => f.bookSource).map((f) => f.id)).size,
        cov.additionalBookReviewedReferences,
        'bookSource id count != coverage additionalBookReviewedReferences');
    }
    const unresolved = new Set((cov.unresolvedTranslations || []).map((u) => u.id));
    for (const f of C.features) {
      if (!unresolved.has(f.id)) continue;
      assert.ok(!f.bookSource, `unresolved id carries bookSource: ${f.id}`);
      assert.ok(!f.label || f.label === f.english,
        `unresolved id got a translation anyway: ${f.id}`);
    }
  }

  // evidence-driven literary labels (must exist in the frozen catalog)
  const byId = Object.fromEntries(C.features.map((f) => [f.id, f]));
  const expectLabel = {
    Mander: 'Vago', Kingswood: 'Mata de Rei', Tumblestone: 'Pedregoso',
    // frozen nomenclature review additions (lead-authored; see
    // docs/TRANSLATION-COVERAGE.md §3.3)
    Blacktyde: 'Pretamare', Saltcliffe: 'Salésia',
    Roseroad: 'Estrada das Rosas', Littlesister: 'Pequenairmã',
    Longsister: 'Longairmã', Broken_Branch: 'Ramo Partido',
    Isle_of_Cedars: 'Ilha de Cedros', Khyzai_Pass: 'Passo Khyzai',
    Ocean_Road: 'Estrada do Mar',
  };
  for (const [id, label] of Object.entries(expectLabel)) {
    assert.ok(byId[id], `expected catalog id missing: ${id}`);
    assert.strictEqual(byId[id].label, label, `wrong label for ${id}`);
  }
});

test('local-book decisions: 7 preferred corrections + aliases preserved', () => {
  // frozen decisions: docs/local-book-reference.json (5 Suma + 2 LeYa)
  const preferred = {
    'Griffin%27s_Roost': 'Poleiro do Grifo',
    'Deep_Den': 'Toca Funda',
    'The_Crag': 'Despenhadeiro',
    'Starfall': 'Tombastela',
    'Sharp_Point': 'Ponta Afiada',
    'Acorn_Hall': 'Solar de Bolotas',
    'Nightsong': 'Nocticantiga',
  };
  for (const key of Object.keys(preferred)) {
    assert.ok(locations[key], `missing data key ${key}`);
    assert.strictEqual(I18N.townName(key), preferred[key]);
  }
  // old labels retained as searchable aliases
  const oldLabels = {
    'Griffin%27s_Roost': 'Ninho do Grifo',
    'Deep_Den': 'Toca Profunda',
    'The_Crag': 'Penhasco',
    'Starfall': 'Queda da Estrela',
    'Sharp_Point': 'Ponta Aguda',
    'Acorn_Hall': 'Solar de Bolota',
    'Nightsong': 'Canto Noturno',
  };
  for (const key of Object.keys(oldLabels)) {
    assert.ok((I18N.townAliases[key] || []).includes(oldLabels[key]),
      `${key} lost old-label alias ${oldLabels[key]}`);
  }
  // new aliases with book evidence, preferred unchanged
  assert.strictEqual(I18N.townName('Sunflower_Hall'), 'Solar de Girassol');
  assert.ok(I18N.townAliases['Sunflower_Hall'].includes('Casasolar')); // prior label kept as alias
  assert.ok(I18N.townAliases['Sunflower_Hall'].includes('Sunhouse')); // old alias kept
  assert.strictEqual(I18N.townName('Quiet_Isle'), 'Ilha Quieta');
  assert.ok(I18N.townAliases['Quiet_Isle'].includes('Ilha Silenciosa'));
  // glossary precedence: Suma form kept, LeYa variant not adopted
  assert.strictEqual(I18N.glossary['Kingswood'], 'Mata de Rei');
});

test('label-layout: category font sizes and zoom caps', () => {
  const LAY = require('../assets/js/label-layout.js');
  const f = (k, z) => LAY.fontStyle(k, z).fontSize;
  // exact z4 bases
  assert.strictEqual(f('city', 4), 14);
  assert.strictEqual(f('town', 4), 12);
  assert.strictEqual(f('castle', 4), 12);
  assert.strictEqual(f('forest', 4), 13);
  assert.strictEqual(f('water', 4), 15);
  assert.strictEqual(f('island', 4), 12);
  assert.strictEqual(f('mountain', 4), 13);
  assert.strictEqual(f('region', 4), 14);
  assert.strictEqual(f('continent', 4), 22);
  assert.strictEqual(f('road', 4), 11);
  // zoom factor 2^((z-4)*0.25)
  const close = (a, b) => Math.abs(a - b) < 0.01;
  assert.ok(close(f('city', 3), 14 * Math.pow(2, -0.25)), 'z3 city');
  assert.ok(close(f('water', 5), 15 * Math.pow(2, 0.25)), 'z5 water');
  // clamps: minimum 9 at z1; caps at z5
  assert.ok(f('city', 1) >= 9 && f('city', 1) <= 9.01, 'z1 min clamp');
  assert.strictEqual(f('continent', 5), 26);
  assert.ok(f('water', 5) <= 18, 'water cap');
  assert.ok(f('city', 5) <= 17, 'city cap');
  assert.ok(f('road', 5) <= 16, 'default cap');
  // white outline clamp(font*.08,.7,1.4)
  const sw = (k, z) => LAY.fontStyle(k, z).strokeWidth;
  assert.ok(sw('continent', 5) <= 1.4 && sw('continent', 5) >= 0.7);
  assert.ok(Math.abs(sw('city', 1) - 0.72) < 0.01, 'stroke = font*0.08 clamped');
  assert.ok(Math.abs(sw('road', 4) - Math.min(1.4, Math.max(0.7, 11 * 0.08))) < 0.01);
});

test('label-layout: minZoomForLabel settled overview policy', () => {
  const LAY = require('../assets/js/label-layout.js');
  const mz = (k, major, ns) => LAY.minZoomForLabel(k, major, ns);
  assert.strictEqual(mz('continent', false, 30), 1, 'continent');
  assert.strictEqual(mz('water', false, 27), 1, 'large sea at z1');
  assert.strictEqual(mz('water', false, 17), 4, 'small river at z4');
  assert.strictEqual(mz('castle', true, 10), 2, 'major castle at z2');
  assert.strictEqual(mz('forest', false, 14), 2, 'forest at z2');
  assert.strictEqual(mz('region', false, 21), 2, 'big region at z2');
  assert.strictEqual(mz('city', false, 14), 3, 'city at z3');
  assert.strictEqual(mz('region', false, 18), 3, 'region at z3');
  assert.strictEqual(mz('water', false, 23), 3, 'mid water at z3');
  assert.strictEqual(mz('island', false, 20), 3, 'island>=20 at z3');
  assert.strictEqual(mz('island', false, 19), 4, 'island<20 at z4');
  assert.strictEqual(mz('mountain', false, 21), 3, 'mountain>=21 at z3');
  assert.strictEqual(mz('castle', false, 10), 4, 'minor castle at z4');
  assert.strictEqual(mz('town', false, 11), 4, 'town at z4');
});

test('label-layout: placeLabels deterministic, bounded, non-discarding', () => {
  const LAY = require('../assets/js/label-layout.js');
  const vp = { w: 400, h: 300 };
  const mk = (id, x, y, pr, optional) =>
    ({ id, anchor: { x, y }, width: 60, height: 14, priority: pr, optional });

  // same anchor: higher priority keeps anchor, lower one displaces
  let r = LAY.placeLabels([mk('a', 100, 100, 100), mk('b', 100, 100, 50)], vp, []);
  assert.deepStrictEqual([r.a.dx, r.a.dy], [0, 0]);
  assert.ok(r.b.dx !== 0 || r.b.dy !== 0, 'second label not displaced');

  // deterministic: identical input -> identical output
  const items = [mk('a', 100, 100, 100), mk('b', 100, 100, 50), mk('c', 105, 102, 60)];
  assert.deepStrictEqual(LAY.placeLabels(items, vp, []), LAY.placeLabels(items, vp, []));

  // viewport bounds: displaced box stays inside
  r = LAY.placeLabels([mk('edge', 390, 290, 100)], vp, []);
  assert.ok(r.edge.visible, 'edge required label dropped');
  const dx = r.edge.dx + 390 - 30, dy = r.edge.dy + 290 - 7;
  assert.ok(dx >= 0 && dy >= 0 && dx + 60 <= 400 && dy + 14 <= 300,
    'displaced box escapes viewport');

  // obstacle avoidance: anchor under a panel -> moves clear
  const panel = { x1: 50, y1: 50, x2: 200, y2: 200 };
  r = LAY.placeLabels([mk('obs', 100, 100, 100)], vp, [panel]);
  const bx1 = 100 + r.obs.dx - 30, by1 = 100 + r.obs.dy - 7;
  const hit = bx1 < panel.x2 && bx1 + 60 > panel.x1 && by1 < panel.y2 && by1 + 14 > panel.y1;
  assert.ok(!hit, 'label box overlaps obstacle');

  // grid reaches mixed non-compass offsets: 15 labels on one anchor in a
  // roomy viewport -> someone lands off the axis/diagonal slots
  r = LAY.placeLabels(
    Array.from({ length: 15 }, (_, i) => mk('g' + i, 200, 150, 100 - i)),
    vp, []);
  const mixed = Object.values(r).filter(
    (p) => p.dx !== 0 && p.dy !== 0 && Math.abs(p.dx) !== Math.abs(p.dy));
  assert.ok(mixed.length > 0, 'no label landed on a mixed dx/dy grid slot');
  assert.ok(Object.values(r).every((p) => p.visible), 'required label hidden');

  // optional fallback hides when nothing fits; required never discarded
  const wall = { x1: 0, y1: 0, x2: 400, y2: 300 };
  r = LAY.placeLabels([mk('req', 200, 150, 100), mk('opt', 200, 150, 10, true)], vp, [wall]);
  assert.ok(r.req.visible, 'required label discarded');
  assert.ok(!r.opt.visible, 'optional fallback not hidden');

  // no-candidate required label reserves its (clipped) source box:
  // 'wide' can never fit the 400px viewport, so it keeps its anchor - and
  // 'other' must not be allowed to stack on top of its visible sliver
  r = LAY.placeLabels([
    { id: 'wide', anchor: { x: 395, y: 150 }, width: 400, height: 14, priority: 100 },
    mk('other', 300, 150, 50),
  ], vp, []);
  assert.ok(r.wide.visible && r.wide.overlap, 'wide anchor not kept+flagged');
  assert.ok(r.other.dy !== 0, 'later label stacked onto reserved box');

  // hidden optional must NOT reserve its box: wide 'opt' is flagged+hidden
  // (every candidate clips 'req' or the wall), and the free portion of what
  // its flagged box WOULD have reserved is 'later's only slot
  const lane = { w: 200, h: 45 };
  const wallObs = [{ x1: 190, y1: 0, x2: 200, y2: 45 }];
  r = LAY.placeLabels([
    { id: 'req', anchor: { x: 80, y: 22 }, width: 60, height: 40, priority: 100 },
    { id: 'opt', anchor: { x: 168, y: 22 }, width: 120, height: 40, priority: 30, optional: true },
    { id: 'later', anchor: { x: 150, y: 22 }, width: 60, height: 40, priority: 20, optional: true },
  ], lane, wallObs);
  assert.ok(r.req.visible, 'required req dropped');
  assert.ok(!r.opt.visible, 'crowded optional not hidden');
  assert.ok(r.later.visible && !r.later.overlap,
    'hidden optional reserved its box and blocked a later label');

  // deterministic crowding -> exactly two flagged overlaps, none discarded
  const tiny = { w: 120, h: 80 };
  r = LAY.placeLabels(
    Array.from({ length: 6 }, (_, i) => mk('t' + i, 60, 40, 100 - i)),
    tiny, []);
  const flagged = Object.values(r).filter((p) => p.overlap).length;
  assert.strictEqual(flagged, 3, 'expected exactly 3 flagged overlaps');
  assert.ok(Object.values(r).every((p) => p.visible),
    'required label silently dropped');
});
