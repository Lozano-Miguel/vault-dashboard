const IDS = ['obilhete', 'noticias-pt', 'obilhete-scraper', 'npm', 'postgres', 'obilhete.pt', 'noticias-pt.me'];
const PARENT = { 'obilhete.pt': 'obilhete', 'noticias-pt.me': 'noticias-pt' };
const MS = [42, 51, 230, 12, 3, 88, 94];

const config = {
  host: 'vault', network: 'homelab', poll_ms: 400, tz: 'Europe/Lisbon',
  thresholds: { warn: 70, danger: 80 },
  services: IDS.map(id => ({ id, kind: PARENT[id] ? 'site' : 'container', parent: PARENT[id] || null })),
  system: { os: 'Debian 12 (bookworm)', host: 'ThinkCentre M710q', kernel: '6.1.0-28-amd64', cpu: 'i3-7100 (4) @ 3.90GHz' },
};

const now = Math.floor(Date.now() / 1000);

const TOP = [['node', 1, 25.0, 6.3], ['postgres', 6, 5.0, 2.4], ['python', 1, 3.2, 0.4], ['cloudflared', 1, 1.1, 0.5],
  ['dockerd', 1, 0.8, 1.1], ['containerd', 1, 0.4, 0.6], ['uvicorn', 1, 0.3, 1.0], ['nginx', 4, 0.1, 0.3]]
  .map(([name, count, cpu, mem]) => ({ name, count, cpu, mem }));

function live({ temp = 52, outside = 24, cpu = 12, down = [], throttle = 0, nulls = false } = {}) {
  return {
    ts: now, cpu_temp: nulls ? null : temp, outside_temp: nulls ? null : outside, throttle_today: nulls ? null : throttle,
    cpu_pct: nulls ? null : cpu, load: nulls ? null : [0.42, 0.51, 0.38],
    mem_mb: nulls ? null : [5300, 8090], disk_gb: nulls ? null : [90.1, 235.0],
    boot_time: nulls ? null : now - 23 * 86400, wifi: nulls ? null : { dbm: -58, quality: 72 },
    net: nulls ? null : { rx_bps: 1258291, tx_bps: 348160 },
    top: nulls ? null : TOP, procs: nulls ? null : 204,
    services: IDS.map((id, i) => down.includes(id)
      ? { id, up: false, ms: null, status: '502' } : { id, up: true, ms: MS[i], status: '200' }),
    ticker: { hottest_today: { c: 68, at: now - 3600 }, availability_7d: 99.8, last_outage: now - 3 * 86400, recording_since: now - 9 * 86400 },
  };
}

const events = [
  { id: 1, ts: now - 600, level: 'warn', text: 'temp 71°C · warm' },
  { id: 2, ts: now - 300, level: 'alarm', text: 'noticias-pt DOWN' },
];

// 24 h of 5-minute samples: an afternoon heat curve, outside temp lower, one 40-min outage of noticias-pt
function history({ empty = false } = {}) {
  const from = now - 24 * 3600, samples = [], services = Object.fromEntries(IDS.map(id => [id, []]));
  if (!empty) for (let ts = from + 300; ts <= now; ts += 300) {
    const h = ((ts / 3600) % 24 + 24) % 24, heat = Math.max(0, Math.sin((h - 9) / 24 * 2 * Math.PI));
    const cpu = 42 + 24 * heat, outside = 16 + 12 * heat;
    samples.push([ts, +cpu.toFixed(1), +(cpu + 2).toFixed(1), +outside.toFixed(1)]);
    const outage = ts > now - 6 * 3600 && ts <= now - 6 * 3600 + 2400;
    IDS.forEach(id => services[id].push([ts, id === 'noticias-pt' && outage ? 0 : 20, 20]));
  }
  return { interval: 300, from, to: now, samples, services };
}

module.exports = {
  IDS, config, events, history,
  scenarios: {
    healthy: live(),
    degraded: live({ temp: 61, outside: 27, cpu: 18, down: ['noticias-pt', 'noticias-pt.me'] }),
    overheating: live({ temp: 84, outside: 38, cpu: 71, throttle: 3 }),
    alldown: live({ down: IDS }),
    sensors: live({ nulls: true }),
  },
};
