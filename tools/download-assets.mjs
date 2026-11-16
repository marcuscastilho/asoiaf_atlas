// Downloads all binary assets needed by the site so it has no runtime
// dependency on the original domains.
//
//   - Map tiles: assets/tiles/{nat,fsm}/t<keyhole>.jpg  (zoom 1..5, ~2728 files)
//   - Heraldry:  assets/heraldry/<slug>  (every img: URL in assets/js/data.js
//     plus the house-icon URLs used by the CSS/character list)
//
// Resumable: existing verified files are skipped; per-URL results are kept in
// tools/.download-state.json. Bounded concurrency (4), retries with backoff.
// Writes assets/heraldry/manifest.js (window.HERALDRY_MANIFEST) and
// assets/tiles/manifest.json with provenance.

import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, statSync,
} from 'node:fs';
import { dirname, join, extname } from 'node:path';

const ORIGIN = 'https://quartermaester.info';
const CONCURRENCY = 4;
const RETRIES = 3;
const STATE_FILE = 'tools/.download-state.json';
const TILE_MANIFEST = 'assets/tiles/manifest.json';
const HERALDRY_MANIFEST_JS = 'assets/heraldry/manifest.js';

const state = existsSync(STATE_FILE)
  ? JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  : { tiles: {}, heraldry: {} };

function saveState() {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf-8');
}

function keyholeSuffix(x, y, z) {
  let s = 't';
  for (let i = z - 1; i >= 0; i--) {
    s += 'qrts'[((x >> i) & 1) + 2 * ((y >> i) & 1)];
  }
  return s;
}

function isJpeg(buf) {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}
function isImage(buf, ctype) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50) return true; // PNG
  if (isJpeg(buf)) return true;
  if (buf.length > 6 && buf.toString('ascii', 0, 4) === 'GIF8') return true;
  const head = buf.toString('utf-8', 0, 400).toLowerCase();
  if (head.includes('<svg')) return true;
  if ((ctype || '').startsWith('image/')) return true;
  return false;
}
function looksLikeHtml(buf) {
  const head = buf.toString('utf-8', 0, 400).toLowerCase();
  return head.includes('<html') || head.includes('<!doctype') || head.includes('cloudflare');
}

async function fetchBuf(url) {
  // awoiaf.westeros.org throttles/denies non-browser clients; send a normal
  // browser UA + Referer so the publicly downloadable files come through.
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  };
  try {
    if (new URL(url).host.endsWith('westeros.org')) headers['Referer'] = 'https://awoiaf.westeros.org/';
  } catch {}
  const res = await fetch(url, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ctype = res.headers.get('content-type') || '';
  return { buf: Buffer.from(await res.arrayBuffer()), ctype };
}

async function downloadOne(url, dest, validate) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const { buf, ctype } = await fetchBuf(url);
      if (looksLikeHtml(buf)) throw new Error('response looks like HTML');
      if (!validate(buf, ctype)) throw new Error(`unexpected content (${ctype}, ${buf.length}B)`);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      return { status: 'ok', bytes: buf.length };
    } catch (e) {
      if (attempt === RETRIES) return { status: 'failed', error: e.message };
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
}

async function runPool(items, worker) {
  let idx = 0, done = 0;
  const results = [];
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
      done++;
      if (done % 200 === 0) console.log(`  progress ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
  return results;
}

// ---------- tiles ----------
async function downloadTiles() {
  const jobs = [];
  for (const layer of ['nat', 'fsm']) {
    for (let z = 1; z <= 5; z++) {
      const n = 1 << z;
      for (let x = 0; x < n; x++) {
        for (let y = 0; y < n; y++) {
          const name = `t${keyholeSuffix(x, y, z).slice(1)}.jpg`; // suffix already has 't' root
          jobs.push({ url: `${ORIGIN}/${layer}/${name}`, dest: `assets/tiles/${layer}/${name}`, key: `${layer}/${name}` });
        }
      }
    }
  }
  console.log(`tiles: ${jobs.length} jobs`);
  let ok = 0, skipped = 0;
  const failed = [];
  await runPool(jobs, async (j) => {
    if (state.tiles[j.key]?.status === 'ok' && existsSync(j.dest) && statSync(j.dest).size > 0) {
      skipped++;
      return;
    }
    const r = await downloadOne(j.url, j.dest, isJpeg);
    state.tiles[j.key] = { url: j.url, ...r };
    if (r.status === 'ok') ok++; else failed.push({ key: j.key, error: r.error });
    if ((ok + failed.length) % 100 === 0) saveState();
    return r;
  });
  saveState();
  writeFileSync(TILE_MANIFEST, JSON.stringify({
    provenance: `${ORIGIN}/{nat,fsm}/t<keyhole>.jpg`,
    keyhole: "root 't'; quadrant letters q=NW r=NE t=SW s=SE, MSB->LSB",
    zooms: [1, 2, 3, 4, 5],
    layers: ['nat', 'fsm'],
    expected: jobs.length,
    ok, skipped, failed: failed.length,
    failures: failed,
    downloadedAt: new Date().toISOString(),
  }, null, 1));
  console.log(`tiles done: ok=${ok} skipped=${skipped} failed=${failed.length}`);
  return failed;
}

// ---------- heraldry ----------
function heraldrySlug(url) {
  let base = url.split('/').pop().split('?')[0];
  try { base = decodeURIComponent(base); } catch {}
  base = base.replace(/[^A-Za-z0-9._-]+/g, '_');
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8);
  const ext = extname(base) || '.img';
  return `${base.replace(ext, '')}-${hash}${ext.toLowerCase()}`;
}

function collectHeraldryUrls() {
  const urls = new Set();
  // 1) every img:"..." in the dataset
  const data = readFileSync('assets/js/data.js', 'utf-8');
  for (const m of data.matchAll(/img:\s*"([^"]+)"/g)) urls.add(m[1]);
  // 2) house icons referenced by the character-list CSS classes
  const css = readFileSync('reference/ASoIaF-default.css', 'utf-8');
  for (const m of css.matchAll(/url\((['"]?)(https?:[^)'"]+)\1\)/g)) urls.add(m[2]);
  // 3) seat sigil assigned in original events.js (Winterfell -> Stark)
  urls.add('https://awoiaf.westeros.org/images/thumb/5/51/House_Stark.PNG/90px-House_Stark.PNG');
  // local-only file (already shipped in assets/img) is not a remote URL
  urls.delete('black_flag.png');
  return [...urls];
}

async function downloadHeraldry() {
  const urls = collectHeraldryUrls();
  console.log(`heraldry: ${urls.length} unique urls`);
  const manifest = {};
  let ok = 0, skipped = 0;
  const failed = [];
  await runPool(urls, async (url) => {
    const slug = heraldrySlug(url);
    const dest = join('assets/heraldry', slug);
    if (state.heraldry[url]?.status === 'ok' && existsSync(dest)) {
      manifest[url] = { file: `assets/heraldry/${slug}`, status: 'ok' };
      skipped++;
      return;
    }
    const r = await downloadOne(url, dest, isImage);
    if (r.status === 'ok') {
      manifest[url] = { file: `assets/heraldry/${slug}`, status: 'ok' };
      ok++;
    } else {
      manifest[url] = { file: null, status: 'failed', error: r.error };
      failed.push({ url, error: r.error });
    }
    state.heraldry[url] = { file: `assets/heraldry/${slug}`, ...manifest[url] };
  });
  saveState();
  writeFileSync(HERALDRY_MANIFEST_JS,
    '// Generated by tools/download-assets.mjs - maps original image URLs to local files.\n' +
    '// status:"failed" entries could not be fetched; the UI falls back to a\n' +
    '// neutral initials placeholder (no invented coats of arms).\n' +
    'window.HERALDRY_MANIFEST = ' + JSON.stringify(manifest, null, 1) + ';\n', 'utf-8');
  console.log(`heraldry done: ok=${ok} skipped=${skipped} failed=${failed.length}`);
  for (const f of failed) console.log(`  FAILED ${f.url} :: ${f.error}`);
  return failed;
}

const which = process.argv[2] || 'all';
const tileFails = (which === 'all' || which === 'tiles') ? await downloadTiles() : [];
const herFails = (which === 'all' || which === 'heraldry') ? await downloadHeraldry() : [];
console.log(`DONE. tileFailures=${tileFails.length} heraldryFailures=${herFails.length}`);
// tiles are required for the site to run at all -> fail the command.
// heraldry failures are tolerated (neutral initials placeholder + docs).
if (tileFails.length) process.exitCode = 1;
