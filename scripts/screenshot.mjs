import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2] || 'https://quartermaester.info/';
const OUT = process.argv[3] || 'reference/original-desktop.png';
const LOG = process.argv[4] || 'reference/original-desktop.log';

const consoleMsgs = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => pageErrors.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) =>
  failedRequests.push(`${r.url()} :: ${r.failure()?.errorText ?? 'unknown'}`)
);
page.on('response', (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
});

let navStatus = 'n/a';
try {
  const resp = await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  navStatus = resp ? String(resp.status()) : 'no-response';
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
    consoleMsgs.push('[capture] networkidle not reached within 30s');
  });
  await page.waitForTimeout(3000);
} catch (e) {
  pageErrors.push(`[navigation] ${e.message}`);
}

await page.screenshot({ path: OUT });
await browser.close();

const log = [
  `url: ${URL}`,
  `viewport: 1440x900`,
  `nav status: ${navStatus}`,
  `screenshot: ${OUT}`,
  '',
  '== console messages ==',
  ...(consoleMsgs.length ? consoleMsgs : ['(none)']),
  '',
  '== page errors ==',
  ...(pageErrors.length ? pageErrors : ['(none)']),
  '',
  '== failed requests ==',
  ...(failedRequests.length ? failedRequests : ['(none)']),
  '',
  '== responses >= 400 ==',
  ...(badResponses.length ? badResponses : ['(none)']),
  '',
].join('\n');

writeFileSync(LOG, log, 'utf-8');
console.log(log);
