# Completed: Reference Names and Full-Width Map

Subsequent route revision is documented in `PERCURSOS-AGOT-V1.md`.
Its published artifact supersedes the digest below; locality coordinates
and identities remain unchanged. Do not restore the historical routes.

Published artifact SHA256:
605192a25ce5c49864ddc16a6e6ebcefe4c4789b9042067285acc3571540186f.
Final inventory: 182 points, 179 named, 3 anonymous; 64 newly named points,
13 additional O Oriente references, Storm's End/Bronzegate correction applied.
Physical coordinate set, all original32 anchors, routes/positions/chapters
unchanged. Frozen 115-entry book sidecar unchanged.

Lead data gates: new revision6/6 + current inventory regression8/8, passed.
Final browser gates: real v3 81/81, fixture45/45, validator38/38, passed.
No page errors/external/master-image requests, tile responses200.
Final full diff194lines reviewed; clarified README to distinguish64 NEW
Ocidente identifications from13 ADDITIONAL Oriente references.
Visual review: v3-final-1920.png and v3-final-390-fechado.png approved.
Current UI is full-width cover viewport with collapsible inside-map controls;
zoom/pan/fullscreen remain; three Enquadrar buttons removed.
Server left at localhost127.0.0.1:8080/atlas/.

The sections below are the implementation-time notebook, NOT pending work.

User asks: use O Ocidente and O Oriente to name missing points and references;
remove framing buttons. Then user prioritizes full-width map and an inside-map
floating, collapsible sidebar. Repo D:/marcus/projetos/gotmap (not a git repo).
Only localhost server 127.0.0.1:8080, previous f24812 PID15520; reuse/leave up.

## UI (Implemented, Reviewed, Final Gate Waiting for Data)

Sidekick removed btn-enquadrar, btn-norte, btn-fit-regiao plus JS dependencies.
Focar posicoes/zoom/pan/fullscreen/reset remain.
Map frame now full viewport width minus padding, no 1400px page cap.
Sidebar sibling of Leaflet-owned mapa inside mapa-quadro, absolute, desktop open
and <=700px initially collapsed. Header persistent, body scrollable; compact
129px Abrir painel button collapsed; aria correct, events don't move map.
Initial preview/native-without-preview now COVER using getBoundsZoom(bounds,true),
NOT contain. This is viewport cropping only; source/tiles unchanged. Zoom-out
shows whole map. Existing preview->native center/scale conversion untouched.
Top notice compact. All UI diffs fully reviewed/approved:
diff-remocao-enquadrar-e-painel.txt (824 lines),
diff-polish-layout.txt (208), diff-cover-inicial.txt (108).
Smoke 15/15 then 10/10 then cover 9/9 at 1920/1366/390/320. Final real-v3 suite
NOT run yet: waiting for lead data revision. Sidekick currently idle.
Screenshots v3-cover-1920.png, v3-cover-390.png, v3-layout-1920.png etc.
Need final screenshot visual review + final gates after data publish.

## Lead Cartography (All Identity Decisions Are Lead-Owned)

Current production atlas/data/atlas-inventario-v3.json is original published182
with115named67anonymous, SHA256:
816811e0d94b6a36e39bd14f37ea101ee57096f92c04f8ac61356bb2037e3cf3.
DO NOT rerun original v3 builder/detection/book/sheet extraction.
New authored patch input: identificacoes-ocidente-oriente-v1.json:
64 manual western identifications +3 still-anonymous island building contexts;
13 O Oriente references for already-named Eastern points. Not yet built/applied.
All 67 anonymous points happened to be Westeros/north. Coordinates must remain
physically unchanged, routes/positions/chapters EXACTLY unchanged.

Maps source hashes checked NOW, equal rename audit:
O Ocidente.jpg 4d5dfa437e8b63a706f7311d78d71d915cc8baebfa2612c4f9d1b6dbb9f34619
O Oriente.jpg 8372aa4de7c53f13f88589c455c8bc51319f1e1a67b13a79debcb3c99ec808d5
Read-only JPEG draft quarter-scale references, no master writes. Actual reference
PNGs BOTH are upright PORTRAIT, 3615x5418 and3621x5414, located under
atlas/test/evidencias/o-{ocidente,oriente}-referencia.png.
The later o-oriente-upright.png/visao was a WRONG extra rotation; DO NOT USE IT.
Correct Oriente crops already viewed: o-oriente-centro-grade.png and
o-oriente-sul-grade.png. All13 new reference crop boxes are authored in JSON.

Ocidente paired inspections:
ocidente-correspondencias-{0,12,24,36,48,60}.png ALL VIEWED.
ocidente-correspondencias-janelas.json maps pointId -> candidateIDs + cropDraft
and sheet name. Locating-only affine model/anchors captured in
ocidente-registro-localizacao.json. It NEVER assigns identity or changes pins.
Final associations authored manually in patch input. Some first visual reads
were corrected by large-label closeups:
- candidate133 Bosque Afundado = Sunkenwood, NOT Snakewood.
- candidate191 = Salinas / Saltpans, NOT Maidenpool.
- candidate206 = Lagoa da Donzela / Maidenpool, NOT Hollard Castle.
These corrected values ARE already in authored input. Do not restore earlier
guesses. Grafic closeups ocidente-grafias-adicionais.png confirm these.
- candidate169 Ferrobles, no accent; candidate381 Nocticantiga (Nightsong);
candidate182 Forte Desgraca, English intentionally empty rather than guess.

IMPORTANT EXISTING IDENTITY CORRECTION:
Old named Storm%27s_End at native[4818,7882], candidate282/281, is actually
PORTABRONZEA/Bronzegate, confirmed O Ocidente, not Storm's End.
Anonymous candidate296 [4978,8094] is the actual PONTA TEMPESTADE/Storm's End.
Patch input explicitly fixes this pair:
1 existing point Storm%27s_End -> id Bronzegate, label Portabronzea;
2 unknown296 -> id Storm%27s_End, label Ponta Tempestade.
Keep both physical coordinate pairs and all route data unchanged.
No current routes use this identity (v2 frozen source selected32 points didn't
include Storm's End); still assert this before publishing. Original named book
audit entry id Storm%27s_End stays valid at its correct pin, same label.
Do not keep the wrong "printed name in world map" provenance on Bronzegate;
replace that evidence label with unnamed-symbol/companion correspondence.
Extra direct correction view ocidente-correcao-bronzegate-282.png was generated
but NOT YET VIEWED (should view before publishing). Its source crop
[1857,2657,2057,2837] is in patch JSON.

Only3 anonymous should remain after64new identifications:
candidate86 castle on Bear Island, no individual building name in reference;
candidate624 and638 villages on Arbor, no individual names. Keep labels as
Simbolo sem nome and identificationStatus=unidentified-symbol; add the contextual
summaries/evidence from input, don't invent "Arbor Town" names.
Expected totals182,179named,3unidentified (compute/check yourself, lead only).
All new named points use companion-map-review and companion-scan evidence;
retain existing scan-site IDs except the explicit Storm/Bronzegate pair.
Preserve existing115 book-sidecar records byte-for-byte; no new book certification.

## Immediate Next Work

1 View Bronzegate282 closeup; inspect all13 Oriente reference crops if needed
   (full Oriente centre/south already directly read and boxes chosen from grid).
2 Lead author/run narrow patch builder:
   - freeze original published v3 bytes as atlas-inventario-v3-pre-referencias-v1.json,
     refuse if hash mismatches exact expected initial hash.
   - preserve original diagnostico separately too.
   - load patch + frozen comparison-window capture, validate every candidate
     refers to exactly one still-anonymous source point (64+3 cover67).
   - apply correction first, then64 IDs by original candidate provenance.
   - append named companion evidence with map path, actual source SHA and
     reference crop in native-source pixels (=draft bbox*4), paired sheet path.
   - add13 Oriente refs to existing named IDs, don't change their identities.
   - do not alter route geometry, position records, chapters, tile metadata or
     physical coordinate set; verify all32 original v2 anchors stay identical.
   - candidate output new file atlas-inventario-v3-referencias-candidato.json,
     updated metrics report candidate. No production writes until checked.
   - update inventory counts/notices/bookAuditNotice honestly; retain coverage
     non-exhaustive, approx route disclaimer. Runtime datasetId remains v3.
3 Lead meaningful consistency tests, check decoded captions/Storm pair, all
   name uniqueness, only3 anonymous, all115 existing book audit IDs match,
   input/master hashes. Run/check yourself (correctness critical).
4 Publish byte-for-byte candidate to production, preserve base and old diagnostics.
   Update current inventario-v3-diagnostico.json metrics (browser tests read it).
   Existing lead atlas/test/test_inventario_v3.py currently reads original
   atlas-inventario-v3-candidato.json; change it to CURRENT production so its
   report counts test stays meaningful; all other8 invariants should remain true.
5 Inform user current layout live + named expansion only after actual publish.
6 Handoff final UI gate to sidekick: new real-v3 suite + overlays fixture +
   pure validator, narrow native Catelyn preserved check as needed (one final gate).
   New floating panel may overlay map popups: focus/search/native assertions must
   exercise actual visible UI and not use hidden DOM cheats. New anonymous
   castle still exists (Bear Island) so existing anonCastle test valid.
   README counts/current references need update from frozen final report, no
   re-derivation or book audits by sidekick. Sidekick must not author cartography.
7 Review full final diff/test evidence/screenshots; then complete todo/final URL.

User-facing statements already sent: working on names; mapwidth/floatpanel
decision; layout now live; discovered Storm's End/Bronzegate correction (promised).
No commits. No original/master modifications. Tools rg unavailable; code_search
timed out at task start. Read known files directly/Python for local search.
