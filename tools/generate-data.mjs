// Generates assets/js/data.js from reference/ASoIaF-overlays.js
// BOOK-ONLY dataset (books take precedence - no TV episode data at runtime).
// Steps, all mechanical:
//  1. new google.maps.LatLng(a,b) -> [a,b] (source stays engine-independent)
//  2. evaluate the transformed source in a VM sandbox
//  3. serialize ONLY chapters, novellas, locations, regions, nobility, paths
//  4. filters (exact rule, no timeline corrections):
//     - path segment kept iff it has an explicit `chapters` (number or
//       [start,end]) whose START <= last chapter index. Ranges kept
//       literally (end may legitimately be 999 = open-ended).
//     - nobility entry kept iff `chapters` is absent (always valid in the
//       original) or its START <= last chapter index.
//     - `episodes` properties are deleted everywhere they existed.
// Run: node tools/generate-data.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = 'reference/ASoIaF-overlays.js';
const OUT = 'assets/js/data.js';

const src = readFileSync(SRC, 'utf-8');
const latLngCalls = (src.match(/new google\.maps\.LatLng\(/g) || []).length;
const replaced = src.replace(/new google\.maps\.LatLng\(([^()]*)\)/g, '[$1]');
if (replaced.includes('google.maps')) {
  console.error('FAIL: residual google.maps reference remains');
  process.exit(1);
}

const ctx = vm.createContext({});
vm.runInContext(replaced, ctx, { filename: SRC });
const { chapters, novellas, locations, regions, nobility, paths } = ctx;
for (const [name, v] of Object.entries({ chapters, locations, regions, nobility, paths })) {
  if (!v) { console.error(`FAIL: source did not define ${name}`); process.exit(1); }
}

const lastChapter = chapters.length - 1;
const chapterStart = (v) => (Array.isArray(v) ? v[0] : v);
const stripEpisodes = (o) => {
  const { episodes, ...rest } = o; // eslint-disable-line no-unused-vars
  return rest;
};

// paths: drop episode-only segments (no `chapters`) and out-of-range starts
const cleanPaths = {};
let segKept = 0, segDropped = 0;
for (const [character, segs] of Object.entries(paths)) {
  cleanPaths[character] = [];
  for (const seg of segs) {
    if (seg.chapters === undefined || chapterStart(seg.chapters) > lastChapter) {
      segDropped++;
      continue;
    }
    segKept++;
    cleanPaths[character].push(stripEpisodes(seg));
  }
}

// nobility: absent `chapters` means always-valid (original semantics);
// explicit chapter start beyond the last chapter is dropped
let nobKept = 0, nobDropped = 0;
const cleanNobility = [];
for (const n of nobility) {
  if (n.chapters !== undefined && chapterStart(n.chapters) > lastChapter) {
    nobDropped++;
    continue;
  }
  nobKept++;
  cleanNobility.push(stripEpisodes(n));
}

const header =
  '// Overlay dataset from the original Quartermaester site\n' +
  '// (reference/ASoIaF-overlays.js), BOOK-ONLY serialization.\n' +
  '// Transform: new google.maps.LatLng(a,b) -> [a,b]; non-literary data\n' +
  '// filtered out (see tools/generate-data.mjs).\n' +
  '// Variables are intentionally global (chapters, novellas, locations,\n' +
  '// regions, nobility, paths).\n\n';

const ser = (name, value) => `${name} = ${JSON.stringify(value)};\n`;
const out =
  header +
  ser('chapters', chapters) +
  ser('novellas', novellas || []) +
  ser('locations', locations) +
  ser('regions', regions) +
  ser('nobility', cleanNobility) +
  ser('paths', cleanPaths);

writeFileSync(OUT, out, 'utf-8');
console.log(`OK: ${latLngCalls} LatLng() calls rewritten -> ${OUT}`);
console.log(`path segments: ${segKept} kept, ${segDropped} dropped (episode-only/no chapters)`);
console.log(`nobility: ${nobKept} kept, ${nobDropped} dropped (chapter start > ${lastChapter})`);
