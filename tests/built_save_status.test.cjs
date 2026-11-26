// Serve the fixture and the actual built reader inside an isolated Chromium context.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright-core');

test('the Korean reader reports each requested save through normal DOM events', async t => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const origin = 'http://localhost';
  const dist = path.resolve(__dirname,'../dist');
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/tests/account-save-status.html')
      return route.fulfill({path:path.resolve(__dirname,'fixtures/account-save-status.html')});
    const file = path.resolve(dist,'.'+url.pathname);
    if (!file.startsWith(dist+path.sep)) return route.abort();
    return route.fulfill({path:file});
  });
  await page.goto(origin+'/tests/account-save-status.html');
  await page.locator('#results[data-failures]').waitFor();
  const results = page.locator('#results');
  const report = await results.innerText();
  t.diagnostic(report);
  assert.equal(await results.getAttribute('data-failures'),'0',report);
});
