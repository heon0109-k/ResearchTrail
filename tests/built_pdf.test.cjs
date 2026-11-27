// Step 2 browser smoke test. Serve the build under a subpath in an isolated browser context.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright-core');

test('a visitor can open and read a bundled PDF from the built Korean demo', async t => {
  const dist = path.resolve(__dirname, '../dist');
  const papers = JSON.parse(await fs.readFile(path.join(dist, 'assets/papers/manifest.json'), 'utf8'));
  const paper = papers.find(entry => entry.id === 's2');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const base = 'http://researchtrail.test/demo/';
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!url.href.startsWith(base)) return route.abort();
    const name = decodeURIComponent(url.pathname.slice('/demo/'.length)) || 'index.html';
    const file = path.resolve(dist, name);
    if (!file.startsWith(dist + path.sep)) return route.abort();
    await route.fulfill({ path: file });
  });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('button', { name: '예시 먼저 보기 →' }).click();
  await page.locator('#vList').click();
  const pdfResponse = page.waitForResponse(base + 'assets/papers/' + paper.file);
  await page.getByRole('button', { name: paper.title, exact: true }).click();
  assert.equal((await pdfResponse).status(), 200);
  await page.locator('#pvTot').waitFor();
  assert.equal(await page.locator('#pvTot').innerText(), String(paper.pages));
  const renderedPage = page.locator('.pgbox').filter({
    has: page.locator('.textLayer').filter({ hasText: 'BERT' }),
  }).first();
  await renderedPage.locator('canvas').waitFor();
});
