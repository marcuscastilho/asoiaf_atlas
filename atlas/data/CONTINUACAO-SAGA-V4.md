# In progress: five books, 27 characters, missing map symbols

User latest request (after approving previous 54 AGOT corridors): add other
books, more characters/routes, always verify context. Mark ALL castle/city/
village/ruin symbols; unnamed genuine symbols must still get anonymous pins.
Never claim exhaustive coverage solely from a detector.

## Settled inputs and findings

- Working directory D:/marcus/projetos/gotmap, Windows Git Bash, NO git repo.
  rg is missing; use grep or Python. Python .venv-book-audit/Scripts/python.exe.
- Live server localhost127.0.0.1:8080, last PID15520. Reuse; leave running.
- Published v3 remains final prior output SHA:
  0a982e04f7a3ffd7a0d3923a059b5002f847bd131267b948a590d302d7718ef5.
  182 points/179 named/3 anonymous, 54 approximate AGOT segments, 12 characters.
  Do NOT regenerate/replace v3; v4 will be separate and preserve its provenance.
- Lead authored+ran `scripts/congelar-portal-saga-v4.cjs` (under atlas).
  Output `portal-saga-v4-referencia.json` exists, frozen, all245 original
  locations, all27 characters and546 records, supported344 chapters.
  Original data.js has345 chapters: index344 is an UNPUBLISHED TWOW preview;
  exclude that chapter and records starting>343 from v4, explicitly account.
- Bounds: AGOT0..72, ACOK73..142, ASOS143..224, AFFC225..270, ADWD271..343.
  Publication order, NOT synchronized AFFC/ADWD timeline.
- Characters: eddard,catelyn,robb,sansa,bran,arya,rickon,jon,daenerys,aegon,
  tywin,jaime,cersei,tyrion,joffrey,myrcella,robert,stannis,renly,theon,
  brienne,davos,samwell,asha,victarion,arianne,littlefinger.
- The 897 frozen red-component candidates in `simbolos-v3-candidatos.json`
  are locating aids only. 181 candidate IDs already consumed in182 pins;
  716 remain. Many are terrain/frame/text and MUST NOT become points blindly.

## Book edition/member investigation (lead, already done)

Library: D:/marcus/livros/cronicas-gelo-fogo/Livros/Epub.
Edition filenames/hashes/ISBN registry in docs/local-book-reference.json
and prior name-audit sidecars. Do not store full copyrighted text in repo.
All5 EPUB OPF paths are OEBPS/content.opf.
Exact chapter member numbering (local chapter index0=prologue):
- AGOT: OEBPS/Text/9788580442786_a_guerra_dos_tronos-{local+3}.html
- ACOK: OEBPS/Text/9788580442793_a_furia_dos_reis_cronicas_de_gelo_e_fogo-{local+3}.html
- ASOS: OEBPS/Text/9788580444650_a_tormenta_de_espadas-{local+5}.html
  (files3 chronology note,4 dedication,5 prologue; local1 Catelyn=file6)
- AFFC: OEBPS/Text/9788580445053_o_festim_dos_corvos_as_cronicas_de_gelo_e_fogo_vol4-{local+3}.xhtml
  (local1 The Prophet=file4)
- ADWD: OEBPS/Text/9788580445763_a_danca_dos_dragoes-{local+5}.xhtml
  (file4 chronology note,5 prologue,6 Tyrion)
These offsets were checked against first spine members/headings, not every
chapter; verify relevant chapters when authoring route scenes.
Parser TextOnly is importable via importlib.util from
atlas/scripts/auditar-nomes-agot-v2.py (hyphen prevents normal module import).
Use encoding 'utf-8-sig', NOT 'utf8-sig'. Use PurePosixPath for ZIP members
to avoid escaped backslash problems through shell.

## Symbol review aids generated, decisions NOT yet applied

Lead script atlas/scripts/inspecionar-cobertura-v4.py generated:
- atlas/test/evidencias/v4-candidatos-{000,096,192,288,384,480,576,672}.png
  Eight contact sheets,96 remaining candidates per page; cell header shows
  candidateId and distance to old pin; footer native x,y. 12cols x8rows.
- atlas/test/evidencias/v4-setor-{row0..5}-{col0..5}.png
  Map sectors3600x2400 native, rendered atzoom4 (900x600), green circles
  on old182 pins; blue numbers on detector candidates. All36 exist.
  BUG TO FIX: current helper skips tiny final edge strips (x21600..21654,
  y14400..14428); extend last real col/row tofull21654/14428 when rerendering.

VIEWING STATUS: first requests for contact sheets000 and096 were OMITTED by
image/context limit, so lead HAS NOT SEEN them. Must view them explicitly.
Sheets192 and288 WERE actually seen; all others and all sectors NOT YET seen.
Never re-view seen images unless details needed. Write review decisions as
frozen data rather than rederive for later presentation.

Tentative observations from SEEN sheets192/288 (NOT final accepted set):
- Clearly centered NEW glyph candidates:
  328castle5328,8356;368city15528,8532;375castle3850,8574;
  384castle2130,8620;393castle5274,8656;396castle4106,8674;
  412castle5016,8736;413castle2126,8746;
  439castle2442,8800;456castle3496,8854;470castle19420,8924;
  475castle4282,8942;478castle2624,8950;484city3262,8962;
  492castle3522,9014;493hollow-settlement10812,9022(type uncertain);
  494castle19490,9028;496castle2110,9076;501castle3314,9086;
  511castle3072,9122;521castle19698,9166.
- Old pin duplicate fragments:337Highgarden(d4),353Myr(d11),
  363Pedrelmo(d16),382Tyrosh(d6),385Clearwater(d19),
  485/487Meereen(d17/d10),524Valysar(d28).
- Partial/off-center glyphs need sector/closeup before decisions:
  349,358,370,414,429,483. Do not blindly add these; nearby center may
  belong to another already present or accepted candidate. 370/375 may
  be components of same castle. Many other cells terrain/frame only.
- Most new glyphs on these pages are in Dorne/Reach/eastern world.
  Do not guess identities from context; read sector printed names or
  companion references, otherwise anonymous pin.

## Implementation handoff currently running

Sidekick agent_id='sidekick' is working ONLY UI support (no data authorship):
- v4 future path atlas/data/atlas-inventario-v4.json, datasetId atlas-saga-v4,
  schemaVersion2; books[] optional {id,code,title,startChapter,endChapter},
  chapter includes bookId,localIndex; all existing route data shape reused.
- Try v4 then v3/v2/v1 ONLY404; invalid present v4 fails closed.
- #livro-select: selected book min/max on slider, dropdown only book chapters
  (GLOBAL option values). Choosing book jumps first chapter only if outside,
  never autoend. Previous/next confined; restored/hashcap derives book first.
- Book complete ends CURRENT book, not saga; cumulative routes throughcap.
- Legacy data no books keeps behavior; validator bounds derive declared
  chapter list rather than hardcode343 (fixture ends72 must reject73).
- Future optional sidecar nomes-inventario-v4-evidencias.json will be lead
  wrapper of frozen115 entries; no expanded name certification.
- Data missing now, focused fixture tests first; NO full gate before lead
  data ready + lead reviews full diff.
- Also test native Leaflet maxHeight option before popup.openOn and
  details popup.update instead of existing400ms panBy workaround IF simple
  replacement passes; this is a hypothesis, not confirmed root cause.
- Server reuse localhost8080; no commits.
Full handoff is in sidekick persistent context; don't re-explain or duplicate.

## Lead next work (not delegated)

LATEST CRITICAL UPDATE: `congelar-indice-livros-v4.py` was authored but
FAILED SAFELY before writing indice-livros-v4.json. The offsets above are
NOT VALID for entire books. Do NOT use constant member offsets!
Actual EPUB members combine/reorder chapters relative to portal:
- ACOK member71 is appendices; member70 Bran,69 Jon,68 Tyrion,67 Theon,
  66 Sansa,65 Arya,64 Daenerys. Portal local69Bran would map72 incorrectly.
  Need align actual spine headings by POV occurrence, not numeric offsets.
- ASOS member5 contains TWO headings ['PROLOGO','JAIME'], member6 Catelyn;
  member12 TWO headings ['DAENERYS','BRAN']; member85 appendices.
  This explains why simple local+5 fails; need capture paragraph/anchor
  spans per toc heading, not assume one chapter per HTML file.
- Generic Heading parser in new script captures p[id^toc_marker].
  Some ACOK chapters may use different heading IDs/classes or source
  chapter order differs; inspect spine / all first body headings carefully.
  No book index artifact was published. Source portal snapshot remains
  frozen and valid as legacy source, NOT proof of book sequencing.

Symbol progress since previous text: sheets000 and096 actually viewed.
Persistent `revisao-cobertura-v4.json` created with all4 reviewed page
decisions/glyph candidates, duplicate fragments/pairs and partials.
000 contains ONLY frames/legend and oldNewIbbish fragment115; 65-83
are legend example icons, never geographical points.
096 adds tentative glyph286/293/299/300/306, duplicate304=299;
oldpin fragments129/136/151/199/211/226/243/245/246/256/263.
Helper edge-strip BUG FIXED in code (last real col extends21654 and row14428),
but sector PNGs have NOT yet been rerendered. Still no sectors viewed.

1. Complete symbol sheet+full sector review, author frozen accept/reject/
   duplicate/missing-detector decisions with categories/coordinates/evidence.
   Preserve existing182points; genuine uncertain names get anonymous pins.
2. Author v4 data builder/source-ledger and hand-curated corridor library/
   assignments for additional books; never naïvely transform old raw coords
   or connect missing named vertices across unsupported gaps.
   Reuse frozen v3 manual54 paths; broaden sensible roads/sea/river corridors
   only with scene/reference context, no exact-route certification.
3. Restore directly named known positions with clear inherited/checked status;
   do not claim old source chronology perfectly correct. Omit raw-coordinate
   markers/endpoints not independently calibrated. Account every original
   record once; supplements separately like v3. Extend early cumulative
   segments to343 but don't extend a stationary position past death/departure.
4. Verify new book scenes/locators against EPUBs; optional spreadsheet capture
   can be frozen separately for other books (oldAGOT snapshot alone doesn't
   cover new chapters). Do not claim spreadsheet verified new books if not.
5. Lead authors/runs/checks data validation, freezes result/candidate before UI
   handoff. Sidekick runs UI/build tests only. Review complete UI diff at
   every landing; batch all findings. One final browser gate after data ready.
6. Final user answer must say actual coverage, additional books/characters,
   limits and URL; user strongly wants every visible symbol pinned, so don't
   call detector output exhaustive or certify completeness without sector audit.

## v4 published — final status (this session)

Published (mechanical byte-copy of lead-frozen candidates, hashes verified
before/after; destination absent/identical guard held):
- atlas/data/atlas-inventario-v4.json
  SHA256 1ce80c8a9024709381d4ca4b8cc352925453b01b6e8f81fe2e552e7a036b334b
- atlas/data/nomes-inventario-v4-evidencias.json
  SHA256 0b151dd9dc4ad892c8c9d5fafe1fbf835f693e7616c9ffade1323e40599b5c17
- atlas/data/saga-v4-diagnostico.json
  SHA256 185540076c2b4cd5cb603aca35ed69c0cd03ecdc690160f187c9e6f1851fc64b

Frozen totals (from published diagnostico, not rederived): dataset
atlas-saga-v4, schema2, 344 chapters (0..343; portal index344 TWOW excluded),
5 books exact bounds AGOT0..72/ACOK73..142/ASOS143..224/AFFC225..270/
ADWD271..343; 242 control points (186 named + 56 anonymous dark symbols),
27 selectable profiles, 115 segments (61 new beyond frozen54 AGOT paths),
152 positions. LeYa book index covers all344 chapters; 141 chapters carry
read-scene locators in the source ledger; name-audit sidecar keeps its115
historical records without expansion.

Honest coverage wording (diagnostico inventory notices + lead ruling):
- All36 map sectors were reviewed; manual+detector additions were applied.
  Still approximate; NOT certified as exhaustive/no-missing-symbol.
- Of the27 profiles, some are positions-only (verified localities, no
  supported line in gaps); all drawn lines are approximate corridors,
  not exact routes.
- Prior collaborative spreadsheet capture retained; NO all-books
  spreadsheet re-audit is claimed. New-book scene locators verified
  separately; unknown/uncalibrated movement is omitted, never interpolated.
- Chronology corrections recorded in diagnostico (Qarth100 not85; Tyrion
  Pentos272; Sam Oldtown270 AFFC; Robb return157; dead-POV markers end at
  death, not prolonged).

Final gate (all green, real published v4 unless noted):
- verificar-saga-v4.mjs (new live suite): 81/81 — real data, book nav,
  Dany/Tyrion/Sam/Robb/dead-POV chapter assertions, native river+sea
  vertex slices, 'fluvial' popup, 27@343 stress, tiles200, mobile390/320.
- verificar-livros-v4.mjs: 34/34 (synthetic fixture; v4 explicitly404'd
  for the legacy-fallback block so it stays deterministic post-publish).
- verificar-rotas-ui.mjs: 66/66 (v4->404 pinned).
- verificar-catelyn-nativo.mjs: 4/4 (pinned). verificar-inventario-v3.mjs:
  81/81 (pinned). verificar-overlays.mjs: 45/45 (pinned).
  verificar-validador.mjs: 55/55 (node, data-agnostic).
  verificar-foco-popup.mjs: 11/11 (pinned; one stale assertion fixed —
  popup renders english "Castle Black" not raw originalKey since prev3).
- Python unittest: test_dados_agot_v2 + test_inventario_v3 +
  test_percursos_v1 + test_referencias_cartograficas_v1 = 27 tests OK.
- Evidence: atlas/test/evidencias/saga-v4-resultados.txt (81 lines),
  gate-v4-{suite}.txt logs, saga-v4-{desktop,nativo,popup-fluvial,
  mobile-390,mobile-320}.png; zero pageerrors, zero external/master
  fetches, tiles served200 by local server.

Test-side notes for later review: two mechanical fixes were needed —
(a) waitForSelector('#livro-select:not([hidden])') now uses state:attached
because on mobile the sidebar starts collapsed (display:none parent makes
the select zero-size while the attribute IS removed); a diagnostic dump
(status text, inventario responses) was added on timeout. (b) suite now
prints each check immediately and writes partial results on abort, so a
crash never loses evidence. A mid-publish fetch race was suggested for an
earlier desktop timeout but was not established by discriminating evidence.
Subsequent live loads and the complete gate passed; the mobile timeout was
explained by the collapsed sidebar and corrected in the test wait.

Server: node http-server PID15520 on127.0.0.1:8080 reused and left running.
No commits (repo is not git). Portal root/master images untouched.
