const { test, expect } = require('@playwright/test');
const { config, events, scenarios } = require('./scenarios');

async function open(page, liveData, { failLive = () => false } = {}) {
  await page.route('**/api/config', r => r.fulfill({ json: config }));
  await page.route('**/api/events**', r => r.fulfill({ json: new URL(r.request().url()).searchParams.has('after') ? [] : events }));
  await page.route('**/api/live', r => failLive() ? r.abort() : r.fulfill({ json: liveData }));
  await page.goto('/');
  await expect(page.locator('#status-text')).not.toHaveText('connecting…');
}

test('healthy: numbers and status', async ({ page }) => {
  await open(page, scenarios.healthy);
  await expect(page.locator('#status-text')).toHaveText('all systems operational');
  await expect(page.locator('#lcd')).toHaveText('52°C');
  await expect(page.locator('#outside')).toHaveText('24°C · attic gap +28°');
  await expect(page.locator('#mem-text')).toHaveText('5.2 / 7.9 GB');
  await expect(page.locator('#disk-text')).toHaveText('90 / 235 GB');
  await expect(page.locator('#wifi-text')).toHaveText('-58 dBm · 72%');
  await expect(page.locator('#net-text')).toHaveText('↓ 1.2 MB/s   ↑ 340 KB/s');
  await expect(page.locator('#uptime')).toHaveText(/^23d \d\d:\d\d:\d\d$/);
  await expect(page.locator('#marquee')).toHaveAttribute('text', /hottest today 68°C at \d\d:\d\d   \/\/   99.8% up this week/);
});

test('degraded: eyes closed and console events', async ({ page }) => {
  await open(page, scenarios.degraded);
  await expect(page.locator('#status-text')).toHaveText('2 eyes closed · noticias-pt down');
  await expect(page.locator('#console')).toContainText('noticias-pt DOWN');
  expect(await page.locator('#angel').getAttribute('down')).toBe('noticias-pt,noticias-pt.me');
});

test('overheating: burning status and red LCD', async ({ page }) => {
  await open(page, scenarios.overheating);
  await expect(page.locator('#status-text')).toHaveText('the attic is burning · 84°C · throttling');
  await expect(page.locator('#lcd')).toHaveCSS('color', 'rgb(255, 74, 58)');
  await expect(page.locator('#throttled')).toHaveText('3 time(s) today');
});

test('sensors missing: n/a everywhere, page keeps working', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page, scenarios.sensors);
  for (const id of ['#lcd', '#outside', '#throttled', '#cpu-text', '#mem-text', '#disk-text', '#wifi-text', '#net-text', '#uptime'])
    await expect(page.locator(id)).toHaveText('n/a');
  await expect(page.locator('#status-text')).toHaveText('all systems operational');
  expect(errors).toEqual([]);
});

test('signal lost: keeps values, turns amber, recovers', async ({ page }) => {
  let failing = false;
  await open(page, scenarios.healthy, { failLive: () => failing });
  await expect(page.locator('#lcd')).toHaveText('52°C');
  failing = true;
  await expect(page.locator('#status-text')).toHaveText(/^signal lost · last seen \d\d:\d\d:\d\d$/, { timeout: 5000 });
  await expect(page.locator('#status')).toHaveCSS('color', 'rgb(242, 164, 58)');
  await expect(page.locator('#lcd')).toHaveText('52°C');
  failing = false;
  await expect(page.locator('#status-text')).toHaveText('all systems operational', { timeout: 5000 });
});

test('layout: no window covers the wheel or any label position', async ({ page }) => {
  await open(page, scenarios.alldown);
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const stage = document.getElementById('vault').getBoundingClientRect();
    const k = stage.width / 1280;
    const angel = document.getElementById('angel'), a = angel.getBoundingClientRect();
    const ox = (a.left - stage.left) / k, oy = (a.top - stage.top) / k;
    const boxes = angel.labelBoxes(72).map(b => ({ ...b, x: b.x + ox, y: b.y + oy }));
    const wins = [...document.querySelectorAll('.win')].map(w => {
      const r = w.getBoundingClientRect();
      return { name: w.dataset.win, x: (r.left - stage.left) / k, y: (r.top - stage.top) / k, w: r.width / k, h: r.height / k };
    });
    const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    const overlaps = [];
    for (const b of boxes) for (const w of wins) if (hit(b, w)) overlaps.push(`${b.kind} @${Math.round(b.x)},${Math.round(b.y)} under ${w.name}`);
    const outside = boxes.filter(b => b.y < 24 || b.y + b.h > 800 || b.x < 0 || b.x + b.w > 1280).length;
    return { overlaps: [...new Set(overlaps)].slice(0, 10), outside, count: boxes.length };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.overlaps).toEqual([]);
  expect(result.outside).toBe(0);
});

test('readme text fits its window', async ({ page }) => {
  await open(page, scenarios.healthy);
  const fits = await page.locator('#readme').evaluate(el => el.scrollHeight <= el.clientHeight);
  expect(fits).toBe(true);
});

for (const [w, h] of [[1280, 800], [1920, 1080], [1366, 768], [390, 844]]) {
  test(`scales crisply at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, scenarios.degraded);
    await page.waitForTimeout(800);
    const { cv, need } = await page.evaluate(() => {
      const c = document.querySelector('#angel canvas'), r = c.getBoundingClientRect();
      return { cv: c.width, need: Math.round(r.width * Math.min(2, devicePixelRatio)) };
    });
    expect(Math.abs(cv - need)).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `test-results/screens/degraded-${w}x${h}.png` });
  });
}
