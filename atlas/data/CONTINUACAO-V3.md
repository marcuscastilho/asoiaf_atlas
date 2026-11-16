# Published V3 - Authoritative Closeout

The runtime now serves `atlas-inventario-v3.json`, not the v2 fallback.
Frozen production SHA256: `816811e0d94b6a36e39bd14f37ea101ee57096f92c04f8ac61356bb2037e3cf3`.
There are 182 entries: 115 named (including 10 `companion-map-review`) and
67 unidentified symbols. Six regions, 12 characters, AGOT chapters 0-72.
This is NOT an exhaustive inventory or certified route geometry.

Lead-authored inputs/build: `inventario-v3-revisao.json`,
`preparar-inventario-v3.py`, frozen candidates, sheet, and v2 snapshots.
Invalid draft western IDs and false terrain detections were removed after
large-label contact-sheet review. Tyria candidate 746 was visually checked.
Ten northern identities use the separately inspected `Westeros.jpg`.
Nineteen source-record route geometries were revised against printed roads
and coastline; Catelyn's chapter-18 journey was restored from its omitted
source record, with approximate land/embarkation/sea phases. Positions were
not interpolated; all unchanged v2 anchors and chapter ranges were checked.
Earlier tentative geometry below is historical and MUST NOT be reused.

`nomes-inventario-v3-evidencias.json` freezes 83 new exact-name searches and
reuses the 32 old records without rederivation. All 115 named IDs match;
anonymous symbols are excluded. Name occurrence is not entity/route proof.
Book-scene locators and frozen spreadsheet rows supply context, not precise
coordinates or official dates. Never rerun frozen extraction for rendering.

Final checks passed: data 8/8, real v3 browser 56/56, fixture 43/43,
validator 38/38, native Catelyn rendering 5/5 (28 exact projected vertices).
Evidence: `atlas/test/evidencias/v3-resultados.txt`, `v3-dados-testes.txt`,
`v3-mobile.png`, `v3-desktop-nativo.png`, `v3-catelyn-nativo.png`.
UI diffs and final visual evidence were reviewed. Popup orphan cleanup is
restricted to DOM nodes without a live popup layer; data fallback is 404-only.

Server remains localhost-only at `http://127.0.0.1:8080/atlas/`.
Original portal, master scans and frozen v2 data were not edited.
Tiles remain manual after the user's cartography-priority redirect.

## Historical Pre-Publication Notes (Superseded)

User redirected the task from popup cleanup/automatic tiles to nearly all visible map settlements and coherent character routes, using books, old portal, Google sheet and Viagens. Be honest: no claim of perfect/exhaustive/certified routes. Tiles remain MANUAL for this redirected task. Preserve portal and master scans.

## Ready

- UI sidekick implemented v3-ready renderer and filters, served from same localhost8080 server f24812/PID15520; v3 currently absent, falls back to unchanged v2.
- Primary expected `atlas/data/atlas-inventario-v3.json`, schemaVersion2, datasetId `atlas-inventario-v3`, same map metadata/cropped-native-pixels, same first-book chapter0..72.
- New optional point fields kind (`castle|city|village|ruin|settlement|unknown-settlement`), identificationStatus (`printed-name|portal-correspondence-review|unidentified-symbol`), summary. Unidentified symbols must not get invented names.
- UI implements combined region/kind/only-identified filters, hollow gray unidentified pins, collapsed technical evidence in popups with deduplicated English name. Still needs real v3 testing after data.
- Sidekick report: v2 through fallback64/64, fixture43/43, validator38/38. Latest UI code mostly reviewed: enum validation, combined filters, popup, list, CSS/index. Remaining review: full storage/filter additions and fetch fallback sections around lines1300..1700 and inventory fontess around1111. No diffs captured for this newest pass, no git repo. Existing prev2 backups are older.
- No new production v3 coordinates/data composed by sidekick. ALL inventory decisions, pipeline, route geometry, evidence authoring and verification stay with lead.

## Spreadsheet Now Accessible

User explicitly asked to use it again; direct read succeeded HTTP200. No MCP servers configured.

`atlas/scripts/congelar-planilha-v3.py` authored by lead, executed once. Frozen authoritative `atlas/data/planilha-v3-referencia.json` contains AGOT rows with exact sourceRow/chapterIndex/event/References/date allocation notes plus source CSV hash and URL. Do NOT query again or rederive snapshot.

Columns Day,Event,POV,Book,#,Title,References,Date allocation,Notes. Source is collaborative/fan chronology NOT coordinates or canonical dates. Can cite source row/chapter, not use allocated days as exact official chronology.

Notable frozen rows: 35 Jon2 ch10 leavingWF;39 Tyrion2 ch13 kingsroadnorth;43 Cat4 ch18 reachesKL;46 Ned3 ch16 Darry;49 Jon3 ch19 trainingcontext;50 Tyrion3 ch21 leavesWall;53 Bran4 ch24 TyrionWF;57 Cat5 ch28 capturesTyrion;76 Cat6 ch34 BloodyGate;94 Dany7 ch61 Lhazareenvillage;105 Cat8 ch55 MoatCailin;111 Cat9 ch59 Twins/RobbtoRiverrun;119 Cat10 ch63 WhisperingWood;121 Cat11 ch71 Robbking;123 Jon9 ch70 deserts.

## Inventory Work

- Existing v2 frozen data32 named points,12characters, AGOT0..72; v2 source snapshot only captures32 locations but all selected12 firstbook records. Preserve all v2 artifacts, never regenerate.
- `atlas/scripts/detectar-simbolos-v3.py` authored/run lead. Generates color component candidates from z4 existing tiles ONLY, not master. 897 CANDIDATES, many false terrain/letter components. Detection is locating aid only, not production inventory.
- Frozen `atlas/data/simbolos-v3-candidatos.json`, with candidateId/native x,y/box/componentPixels. Do NOT rerun detection; render from frozen capture.
- Detection script repeated run only renders from capture (assemble existing z4 tiles W5414xH3607,60MB). Modules `assemble()` / `render(image,points,name,bboxNative)` available.
- Visual artifacts `atlas/test/evidencias/inventario-v3-{norte,centro,sul,essos-oeste,essos-centro,oriente,sothoryos,essos-norte}.png`. All viewed at least once; do not blindly republish candidates. `essos-oeste` initially omitted by tool then viewed alone successfully.
- Magnified western component sheets `inventario-v3-west-contacto-{0,120,240}.png` were reviewed. Lots of red terrain false positives especially Dorne.
- Lead decisions already persisted `atlas/data/inventario-v3-revisao.json`: ~120 western true symbol candidateIds, ~39 new named candidate mappings,7 manually chosen Eastern ruin/city positions. THIS IS A DRAFT: not yet built/verified/published.
- West symbols mostly castle glyphs but unprinted names. Use unidentified-symbol, never guess from nearest old-portal place. Some small roof glyphs village/unknown; contact sheet confirms tower vs hollow ruin. Type can be known even when name unknown: tell sidekick popup text currently falsely says nature unknown for every unidentified; update to say symbol type if kind is known.
- Existing v2 points should win within75native px; merge reviewed duplicate component fragments within64native px. Preserve Lannisport candidate232 (about96px from existingCasterlyRock). Don't auto-add unreviewed components.
- Draft includes typo intentionally flagged: Sunspear candidate599 label `LancasSolar`; fix to actual printed Portuguese `Lancassolar` with cedilla (`Lançassolar`) before publication. Candidate599/600 split one large city/castle on coastal Dorne. Recheck type against legend; source castle seat can be castle though marker may be city style. English from oldportal if source exists.
- Candidate330 means VaesMeihah forEssos but westCandidateIds also330 is SAME point? Important: candidateIds global; printed thumb west330 at2644,8260 vs script print330=13320,8366! This indicates visual contact index reading ERROR: contact sheet labels include327? MUST RECHECK western candidate IDs vs coordinates! The manually transcribed long west IDs may confuse similarly spaced labels or candidates outside region. Generator MUST reject reviewedWest IDs whose x isn't1400..5600/y1600..10300, then visually reconcile IDs from sheets. Do not blindly publish. Read actual frozen candidate mapping.
- Similar index conflict295 means VaesEfe x13548,y8076; western contact points may be294,296 rather than295. Review using coordinate regions strictly.
- Region coverage east/oriente/Sothoryos grids viewed but named IDs not transcribed; pending further manual passes. Valyria itself, Summer Islands also pending. Avoid exhaustive claim.
- Printed map legend (seen on Viagens preview) categories city (round tower), village (roof), city ruins (hollowtower), castle (solid battlements), castle ruins (hollow battlements). Use this for classification, not inferred lore alone.

## Viagens Reference Actually Viewed

`mapas/relatorios/estudo-atlas/HPSC0329.png` upright2396x1600 preview contains named route line labels and full map. It was visually viewed by lead this turn. Same general geography but not same native coordinates; use as corridor/context reference, never copy coordinates directly.

## Planned Route Refinement (NOT Yet Approved/Implemented)

Need inspect detailed tile patches before freezing new geometry. Current v2 global-affine curves can cut over mountains. Prefer explicit manually traced printed road/sea corridors, status approximate, with original source record/chapter range preserved and provenance to scan/Viagens/book/spreadsheet. Do not interpolate current markers across gaps.

Likely first corridor:
- Jon/Tyrion Winterfell->CastleBlack manually trace Kingsroad rather than global affine. Tentative vertices [[3640,3720],[3660,3540],[3780,3330],[3930,3160],[4100,3030],[4260,2840],[4290,2610],[4260,2370]]. These are PLANNED, must verify scan road and Viagens before approval.
- Winterfell->MoatCailin road near x3670/3700 south to[3680,4780], not arbitrary direct line.
- MoatCailin->Twins viaNeck x3710,y5000/5300, then3535,5740. Kingsroad itself stays east ofTwins so use branch.
- Cat first WhiteHarbor->KL voyage should curve intoBite, eastaroundSisters/Valecoast, southpastDragonstone thenwestBlackwaterBay, never straight line overpeninsulas. Tentative sea points fromWhiteHarbor4100,4590: [4180,4730],[4300,4880],[4800,4870],[5300,4800],[5580,5100],[5650,5500],[5570,5900],[5600,6300],[5500,6650],[5450,7100],[5080,7350],[4800,7500],[4550,7490],[4350,7400]. Need visual coast review. Full Cat source record1 startsWinterfell and passesWhiteHarbor thenKL; preserve sourceIndex1/ch18..72, add fullsegment only after review and remove its omittedRecord/index.
- Existing Eddard/Arya/Sansa south progress first leg source12 throughnorthroad reachesapprox[3740,4500]; second source15 goes viaMoat/Neck thenCrossroads general area[4060,6380]. Exact printed road still needs review.
- Do NOT label road waypoint as a calibrated city if no symbol/name exists (Darry/Hayford/CrossroadsInn not yet independently identified). Whole route can be manually traced approximate with named source path preserved in provenance without inventing locality marker.
- Robb/Cat/Theon need Twins->WhisperingWood->Riverrun coherent westernbranch, evidence sheet ch59/63/71, not raw affine straightcuts.
- Dany unknown Lhazar is REGION notcity; do not place fake namedsettlement. New Hesh/Kosrak/Lhazosh are actual namedvillages in scan but not proof burnt-village identity. Can eventually improvePentos->VaesDothrak viaRhoyneruins andeasternDothrakiroad after book/Viagens review, not inventLhazarposition.

## Remaining

1. Complete manual inventory, reconcile candidate IDs critically, build frozen v3 data with data provenance/count report; independently validate no duplicate symbols, no terrain false positives, classification/status honesty, finite bounds.
2. Refine selected routes against detailed scan+Viagens and frozen sheet. Add same edition-identified book locators as prior audit, not fullbooktext. No perfection claims.
3. V3 sidecar: existing UI EVID_URL fixed `nomes-agot-v2-evidencias.json` datasetId-gated; either author v3 compatible frozen term metadata (reuse already frozen v2 entries, audit only new names) and tell sidekick URL, or honest optional unavailable untilnextpass.
4. Tell sidekick dataset ready + exact checks; it owns UI integration/browser tests, not data analysis. Server reuse. Review full diff/evidence at each handoff landing before further actions.
5. User final should say actual coverage and limits, no `all/perfect` unless independently established. Do not imply sheet still inaccessible: it IS captured.
