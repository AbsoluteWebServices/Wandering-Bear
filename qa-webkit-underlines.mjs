/**
 * Checks the account portal for underlines that WebKit paints transparent.
 *
 * The theme reveals link underlines on hover, via `a { text-decoration-color: transparent }`
 * in assets/base.css. Chrome's CSS3 `text-decoration` shorthand resets that colour; Safari's
 * legacy line-only reading of the same property does not. So a link can look underlined in
 * Chrome and render no underline at all on iOS — the line is drawn, in a transparent colour.
 * Chrome cannot catch this. WebKit 18.2 is the engine behind iOS 18.3.
 *
 * Setup (once):
 *   npm i playwright && npx playwright install webkit
 *
 * Run against a live `shopify theme dev`:
 *   node qa-webkit-underlines.mjs
 *   node qa-webkit-underlines.mjs https://wandering-bear.myshopify.com/account?preview_theme_id=136306262113
 *
 * Exits non-zero when something is invisible, so it can gate a commit.
 */
import { webkit, devices } from 'playwright';

const BASE = 'http://127.0.0.1:9292';
const pages = process.argv[2]
  ? [['custom', process.argv[2]]]
  : [
      ['dashboard', `${BASE}/search?view=account-preview`],
      ['order', `${BASE}/search?view=order-preview`],
    ];

const browser = await webkit.launch();
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
let failures = 0;

for (const [label, url] of pages) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);

  const { total, invisible } = await page.evaluate(() => {
    const invisible = [];
    let total = 0;
    for (const a of document.querySelectorAll('a')) {
      const cs = getComputedStyle(a);
      if (cs.textDecorationLine !== 'underline') continue;
      total++;
      // Any fully transparent decoration colour, whatever notation the engine reports.
      if (/,\s*0\)$/.test(cs.textDecorationColor)) {
        invisible.push(a.textContent.trim().slice(0, 40) || '(no text)');
      }
    }
    return { total, invisible };
  });

  const ok = invisible.length === 0;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${total} underlined, ${invisible.length} invisible`);
  for (const t of invisible) console.log(`        · ${t}`);

  await page.screenshot({ path: `qa-webkit-${label}.png`, fullPage: true });
}

await browser.close();
console.log(failures ? '\nInvisible underlines found — see the screenshots.' : '\nAll underlines visible in WebKit.');
process.exit(failures ? 1 : 0);
