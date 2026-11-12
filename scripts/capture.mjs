/**
 * Renders deterministic frames of the live WebGL scenes into static assets:
 *   public/og.jpg              1200×630 social card (black hole + name)
 *   public/poster.jpg          1600×1000 fallback for devices without WebGL2
 *   public/apple-touch-icon.png 180×180 from favicon.svg
 *
 * Usage: npm run capture   (uses the system Chrome locally; set PW_CHROMIUM=1 for Playwright's)
 */
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = (f) => path.join(root, 'public', f);

const server = await createServer({ root, server: { port: 5199, strictPort: true }, logLevel: 'error' });
await server.listen();
const base = 'http://localhost:5199';

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM ? {} : { channel: 'chrome' }),
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

async function frame(capture, width, height, file, decorate, route = '/') {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}?capture=${capture}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__captureReady === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1200);
  if (decorate) await page.evaluate(decorate);
  await page.waitForTimeout(300);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  await page.close();
  console.log('✓', path.relative(root, file));
}

// social cards: the hero frame with the name set in each page's display face
const card = (kicker, given, family) => async ([kicker, given, family]) => {
  await document.fonts.ready;
  const el = document.createElement('div');
  el.innerHTML = `<div style="position:fixed;left:64px;bottom:58px;z-index:99;color:#ede9e2;font-family:var(--font-display);line-height:.88">
      <div style="font:400 15px/1 'JetBrains Mono Variable',monospace;letter-spacing:.2em;text-transform:uppercase;color:rgba(237,233,226,.6);margin-bottom:22px">${kicker}</div>
      <div style="font-size:${document.documentElement.lang === 'ru' ? 96 : 118}px;letter-spacing:-.03em">${given} <i style="color:#f4d9bb">${family}</i></div>
    </div>`;
  document.body.appendChild(el.firstElementChild);
  // load the display face for these glyphs before the screenshot
  await document.fonts.load(`italic 96px ${getComputedStyle(document.documentElement).getPropertyValue('--font-display')}`, family);
  await document.fonts.load(`96px ${getComputedStyle(document.documentElement).getPropertyValue('--font-display')}`, given);
};
const cards = [
  ['/', out('og.jpg'), ['Software Engineer · Barcelona', 'Dmitrii', 'Malikov']],
  ['/ru/', out('og-ru.jpg'), ['Инженер-программист · Барселона', 'Дмитрий', 'Маликов']],
];
for (const [route, file, text] of cards) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`${base}${route}?capture=og`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__captureReady === true, null, { timeout: 120_000 });
  await page.waitForTimeout(1200);
  await page.evaluate(card(), text);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90 });
  await page.close();
  console.log('✓', path.relative(root, file));
}

// static fallback poster
await frame('hero', 1600, 1000, out('poster.jpg'));

// touch icon
{
  const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#05060a"><img src="${base}/favicon.svg" style="width:180px;height:180px;display:block"></body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: out('apple-touch-icon.png'), type: 'png' });
  await page.close();
  console.log('✓ public/apple-touch-icon.png');
}

await browser.close();
await server.close();
