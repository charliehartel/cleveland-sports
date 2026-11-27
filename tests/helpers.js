// Shared test setup: every test fails if the page throws, or if an ESPN request fails
// (for example because ESPN doesn't allow the request from a web page).
const { test: base, expect } = require('@playwright/test');
const { execFileSync } = require('child_process');

// In sandboxes where the browser can't reach ESPN directly, set ESPN_RELAY=1 to fetch through curl.
// Note: the relay can't reproduce browser cross-origin checks, so CI (direct access) is the real test.
async function relay(page) {
  await page.route(/site\.api\.espn\.com/, async route => {
    try {
      const raw = execFileSync('curl', ['-s', '--compressed', '-m', '20', '-D', '-', route.request().url()], { maxBuffer: 64e6 });
      const sep = Buffer.from('\r\n\r\n');
      let start = 0, head = '';
      for (;;) {
        const i = raw.indexOf(sep, start);
        if (i < 0) break;
        const block = raw.slice(start, i).toString('latin1');
        if (!/^HTTP\//.test(block)) break;
        head = block; start = i + 4;
      }
      const status = Number(head.split(' ')[1]) || 200;
      await route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: raw.slice(start) });
    } catch { await route.abort(); }
  });
  await page.route(/a\.espncdn\.com/, r => r.abort());
}

const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', e => problems.push(`Page error: ${e.message}`));
    page.on('console', m => {
      if (m.type() === 'error' && /CORS|Access-Control-Allow-Origin/i.test(m.text())) problems.push(`Blocked request: ${m.text()}`);
    });
    page.on('requestfailed', r => {
      const err = r.failure()?.errorText || '';
      if (/site\.api\.espn\.com/.test(r.url()) && !/ERR_ABORTED/.test(err)) problems.push(`ESPN request failed: ${r.url()} (${err})`);
    });
    if (process.env.ESPN_RELAY) await relay(page);
    await use(page);
    expect(problems, 'browser errors during the test').toEqual([]);
  },
});

// Wait until the app has replaced its "Loading…" placeholder.
async function ready(page, selector) {
  await page.waitForSelector(selector, { timeout: 45_000 });
}

module.exports = { test, expect, ready };
