// Shared test setup: every test fails if the page throws, or if an ESPN request fails
// (for example because ESPN doesn't allow the request from a web page).
const { test: base, expect } = require('@playwright/test');

// ESPN data is fetched by the test runner (Node), which identifies itself honestly as this
// project's test tool, and handed to the browser. (ESPN rejects the headless browser itself on CI
// networks.) Browsers don't apply cross-origin checks to responses handed over this way, so the
// relay checks ESPN's header itself: any ESPN endpoint the app calls that web pages aren't allowed
// to read is reported as a problem, which fails the test, just as a phone's browser would block it.
const UA = 'cleveland-sports-tests/1.0 (+https://github.com/charliehartel/cleveland-sports)';
async function relay(page, problems = []) {
  await page.route(/site\.api\.espn\.com/, async route => {
    try {
      const r = await fetch(route.request().url(), { headers: { 'user-agent': UA, origin: 'http://127.0.0.1:4173' }, signal: AbortSignal.timeout(25000) });
      const headers = {};
      const acao = r.headers.get('access-control-allow-origin');
      if (acao === '*' || acao === 'http://127.0.0.1:4173') headers['access-control-allow-origin'] = acao;
      else problems.push(`ESPN doesn't allow web pages to read ${route.request().url()} (no Access-Control-Allow-Origin header)`);
      await route.fulfill({ status: r.status, contentType: r.headers.get('content-type') || 'application/json', headers, body: Buffer.from(await r.arrayBuffer()) });
    } catch { await route.abort(); }
  });
  // team logos and photos aren't needed for the tests
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
    await relay(page, problems);
    await use(page);
    expect(problems, 'browser errors during the test').toEqual([]);
  },
});

// Wait until the app has replaced its "Loading…" placeholder.
async function ready(page, selector) {
  await page.waitForSelector(selector, { timeout: 45_000 });
}

module.exports = { test, expect, ready, relay };
