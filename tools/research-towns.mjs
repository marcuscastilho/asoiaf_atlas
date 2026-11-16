// Research-only tool: enumerate location categories on wiki.geloefogo.com
// (Portuguese literary wiki) and resolve each article's [[en:]] interlanguage
// link to build a verified English->Portuguese toponym map.
// Output: docs/translation-sources.json (evidence per term).
import { writeFileSync } from 'node:fs';

const API = 'https://wiki.geloefogo.com/api.php';
const CATS = [
  'Locais no Norte', 'Locais nas Terras Fluviais', 'Locais nas Terras Ocidentais',
  'Locais no Vale', 'Locais nas Ilhas de Ferro', 'Locais nas Terras da Coroa',
  'Locais na Campina', 'Locais nas Terras da Tempestade', 'Locais em Dorne',
  'Locais Para Lá da Muralha', 'Locais em Essos', 'Locais no continente oriental',
  'Locais na Baía dos Escravos', 'Locais além do Mar Estreito',
  'Locais em Westeros', 'Locais em Sothoryos', 'Castelos',
];

async function api(params) {
  const url = API + '?' + new URLSearchParams({ format: 'json', utf8: '1', ...params });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  return null;
}

async function categoryMembers(cat) {
  const out = [];
  let cont = {};
  for (;;) {
    const d = await api({
      action: 'query', list: 'categorymembers', cmtitle: 'Categoria:' + cat,
      cmlimit: '500', cmnamespace: '0', ...cont,
    });
    if (!d) return out;
    out.push(...(d.query?.categorymembers || []).map((m) => m.title));
    if (!d.continue) return out;
    cont = d.continue;
  }
}

// batch-resolve en langlinks for pt titles
async function enLinks(titles) {
  const map = {};
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const d = await api({
      action: 'query', prop: 'langlinks', lllang: 'en', lllimit: '500',
      titles: batch.join('|'),
    });
    if (!d?.query?.pages) continue;
    for (const p of Object.values(d.query.pages)) {
      const en = p.langlinks?.find((l) => l.lang === 'en');
      if (en) map[p.title] = en['*'];
    }
  }
  return map;
}

const allTitles = new Set();
for (const c of CATS) {
  const m = await categoryMembers(c);
  console.log(c, '->', m.length);
  m.forEach((t) => allTitles.add(t));
}
console.log('total unique articles:', allTitles.size);
const enMap = await enLinks([...allTitles]);
console.log('with en links:', Object.keys(enMap).length);
writeFileSync('docs/.geloefogo-enmap.json', JSON.stringify(enMap, null, 1), 'utf8');
console.log('wrote docs/.geloefogo-enmap.json');
