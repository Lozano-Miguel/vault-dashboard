const { test, expect } = require('@playwright/test');
const { config, events, history, scenarios } = require('./scenarios');

const withoutSystem = { ...config, system: { os: null, host: null, kernel: null, cpu: null } };

async function open(page, liveData, { failLive = () => false, cfg = config, hist = history() } = {}) {
  await page.route('**/api/config', r => r.fulfill({ json: cfg }));
  await page.route('**/api/history**', r => r.fulfill({ json: hist }));
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

test('degraded: eyes closed, latest event in the memory footer', async ({ page }) => {
  await open(page, scenarios.degraded);
  await expect(page.locator('#status-text')).toHaveText('2 eyes closed · noticias-pt down');
  await expect(page.locator('#mem-footer')).toHaveText(/^last \d\d:\d\d · noticias-pt DOWN$/);
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
  await open(page, scenarios.sensors, { cfg: withoutSystem });
  for (const id of ['#lcd', '#outside', '#throttled', '#cpu-text', '#mem-text', '#disk-text', '#wifi-text', '#net-text', '#uptime',
                    '#nf-os', '#nf-host', '#nf-kernel', '#nf-cpu', '#top-rows'])
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

for (const [w, h] of [[1280, 800], [1920, 1080], [2560, 1080]]) {
  test(`layout at ${w}x${h}: windows clear of the wheel, labels and each other`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page, scenarios.alldown);
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const stage = document.getElementById('vault').getBoundingClientRect();
      const k = stage.height / 800, W = stage.width / k;
      const angel = document.getElementById('angel'), a = angel.getBoundingClientRect();
      const ox = (a.left - stage.left) / k, oy = (a.top - stage.top) / k;
      const boxes = angel.labelBoxes(72).map(b => ({ ...b, x: b.x + ox, y: b.y + oy }));
      const wins = [...document.querySelectorAll('.win')].map(el => {
        const r = el.getBoundingClientRect();
        return { name: el.dataset.win, x: (r.left - stage.left) / k, y: (r.top - stage.top) / k, w: r.width / k, h: r.height / k };
      });
      const hit = (p, q) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
      const overlaps = [];
      for (const b of boxes) for (const win of wins) if (hit(b, win)) overlaps.push(`${b.kind} @${Math.round(b.x)},${Math.round(b.y)} under ${win.name}`);
      wins.forEach((p, i) => wins.slice(i + 1).forEach(q => { if (hit(p, q)) overlaps.push(`${p.name} overlaps ${q.name}`); }));
      const outside = [...boxes, ...wins].filter(b => b.y < 24 || b.y + b.h > 800 || b.x < 0 || b.x + b.w > W + 0.5).length;
      return { overlaps: [...new Set(overlaps)].slice(0, 10), outside, count: boxes.length };
    });
    expect(result.count).toBeGreaterThan(0);
    expect(result.overlaps).toEqual([]);
    expect(result.outside).toBe(0);
  });
}

test('very wide windows: layout stops at 16:9 and the wallpaper fills the sides', async ({ page }) => {
  await page.setViewportSize({ width: 1368, height: 633 });   // a short, wide browser window
  await open(page, scenarios.healthy);
  const { stageW, wiredW, bg } = await page.evaluate(() => {
    const st = document.getElementById('vault').getBoundingClientRect(), k = st.height / 800;
    const wired = document.querySelector('[data-win=wired]').getBoundingClientRect();
    return { stageW: st.width / k, wiredW: wired.width / k,
             bg: document.getElementById('backdrop').getBoundingClientRect().toJSON() };
  });
  expect(stageW).toBeLessThanOrEqual(1423);   // never wider than 16:9
  expect(wiredW).toBeLessThanOrEqual(1011);
  expect(bg.left).toBeLessThanOrEqual(0);      // wallpaper covers the whole window, not black bars
  expect(bg.width).toBeGreaterThanOrEqual(1368);
  expect(bg.height).toBeGreaterThanOrEqual(633);
  const strip = await page.evaluate(() => {
    const s = document.getElementById('ticker-bg').getBoundingClientRect(), t = document.getElementById('ticker').getBoundingClientRect();
    return { left: s.left, width: s.width, dTop: Math.abs(s.top - t.top), dH: Math.abs(s.height - t.height) };
  });
  expect(strip.left).toBeLessThanOrEqual(0);              // the ticker's dark strip spans the whole window
  expect(strip.width).toBeGreaterThanOrEqual(1368);
  expect(strip.dTop).toBeLessThanOrEqual(1);              // and lines up with the ticker text
  expect(strip.dH).toBeLessThanOrEqual(1.5);
});

test('fills a 1920x1080 screen edge to edge, no side bars', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, scenarios.healthy);
  const r = await page.locator('#vault').evaluate(el => el.getBoundingClientRect().toJSON());
  expect(r.width).toBeGreaterThanOrEqual(1915);
  expect(r.height).toBeGreaterThanOrEqual(1075);
});

test('MEMORY.DAT replaces the console: 24h chart plus a strip per service', async ({ page }) => {
  await open(page, scenarios.healthy);
  await expect(page.locator('[data-win=cmd]')).toHaveCount(0);
  await expect(page.locator('[data-win=memory] .title')).toContainText('MEMORY.DAT');
  await page.waitForTimeout(400);
  const px = await page.locator('#memory canvas').evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let on = 0, red = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0) { on++; if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) red++; }
    return { on, red };
  });
  expect(px.on).toBeGreaterThan(1500);  // curve, axes and strips are drawn
  expect(px.red).toBeGreaterThan(10);   // the noticias-pt outage shows as red in its strip
  await expect(page.locator('#mem-legend')).toContainText('cpu');
  await expect(page.locator('#mem-legend')).toContainText('outside');
});

test('MEMORY.DAT with no history yet says so instead of an empty box', async ({ page }) => {
  await open(page, scenarios.healthy, { hist: history({ empty: true }) });
  await expect(page.locator('#mem-empty')).toBeVisible();
  await expect(page.locator('#mem-empty')).toContainText('collecting');
});

test('typing lain still triggers the easter egg', async ({ page }) => {
  await open(page, scenarios.healthy);
  await page.keyboard.type('lain');
  await expect(page.locator('#mem-footer')).toHaveText('present day, present time.');
});

test('readme window is gone', async ({ page }) => {
  await open(page, scenarios.healthy);
  await expect(page.locator('[data-win=readme]')).toHaveCount(0);
});

test('neofetch panel: identity, no repeated live numbers, every line fits', async ({ page }) => {
  await open(page, scenarios.healthy);
  await expect(page.locator('#nf-title')).toHaveText('root@vault');
  await expect(page.locator('#nf-os')).toHaveText('Debian 12 (bookworm)');
  await expect(page.locator('#nf-host')).toHaveText('ThinkCentre M710q');
  await expect(page.locator('#nf-kernel')).toHaveText('6.1.0-28-amd64');
  await expect(page.locator('#nf-cpu')).toHaveText('i3-7100 (4) @ 3.90GHz');
  await expect(page.locator('#nf-services')).toHaveText('7 watched');
  const overflow = await page.locator('[data-win=neofetch] .nf-line').evaluateAll(
    els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
  expect(overflow).toEqual([]);
  const fitsHeight = await page.locator('[data-win=neofetch] .sunken').evaluate(el => el.scrollHeight <= el.clientHeight);
  expect(fitsHeight).toBe(true);
});

test('neofetch art is drawn as crisp pixels from the braille bitmap', async ({ page }) => {
  await open(page, scenarios.healthy);
  await page.waitForTimeout(300);
  const lit = await page.locator('#nf-art canvas').evaluate(c => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let on = 0, partial = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i] === 255) on++; else if (d[i] > 0) partial++; }
    return { on, partial, w: c.width, h: c.height };
  });
  expect(lit.w).toBeGreaterThan(110);   // big enough to read, not a thumbnail
  expect(lit.on).toBeGreaterThan(500);   // the drawing is there
  expect(lit.partial).toBe(0);          // no anti-aliased (blurry) edges
});

test('TOP.EXE lists the top processes', async ({ page }) => {
  await open(page, scenarios.healthy);
  const rows = page.locator('#top-rows > div');
  await expect(rows).toHaveCount(8);
  await expect(rows.nth(0)).toHaveText(/node\s*25\.0%\s*6\.3%/);
  await expect(rows.nth(1)).toHaveText(/postgres\s*×6\s*5\.0%\s*2\.4%/);
  const fits = await page.locator('#top-rows').evaluate(el => el.scrollHeight <= el.clientHeight);
  expect(fits).toBe(true);
});

test('ticker adds process count and lain lines', async ({ page }) => {
  await open(page, scenarios.healthy);
  await expect(page.locator('#marquee')).toHaveAttribute('text', /204 processes/);
  await expect(page.locator('#marquee')).toHaveAttribute('text', /present day, present time/);
  await expect(page.locator('#marquee')).toHaveAttribute('text', /close the world, open the next/);
});

for (const [w, h] of [[1280, 800], [1920, 1080], [1366, 768], [1368, 633], [390, 844]]) {
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
