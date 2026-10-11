const IDS = ['obilhete', 'noticias-pt', 'obilhete-scraper', 'npm', 'postgres', 'obilhete.pt', 'noticias-pt.me'];
const PARENT = { 'obilhete.pt': 'obilhete', 'noticias-pt.me': 'noticias-pt' };
const MS = [42, 51, 230, 12, 3, 88, 94];

const config = {
  host: 'vault', network: 'homelab', poll_ms: 400, tz: 'Europe/Lisbon',
  thresholds: { warn: 70, danger: 80 },
  services: IDS.map(id => ({ id, kind: PARENT[id] ? 'site' : 'container', parent: PARENT[id] || null })),
  readme: 'vault\n=====\nold lenovo mini-pc in my attic, portugal.\nruns obilhete.pt and noticias-pt.me.\n\nthis page only watches it.\nit can\'t restart or touch anything.\n\nsummer afternoons are the bad part.',
};

const now = Math.floor(Date.now() / 1000);

function live({ temp = 52, outside = 24, cpu = 12, down = [], throttle = 0, nulls = false } = {}) {
  return {
    ts: now, cpu_temp: nulls ? null : temp, outside_temp: nulls ? null : outside, throttle_today: throttle,
    cpu_pct: nulls ? null : cpu, load: nulls ? null : [0.42, 0.51, 0.38],
    mem_mb: nulls ? null : [5300, 8090], disk_gb: nulls ? null : [90.1, 235.0],
    boot_time: nulls ? null : now - 23 * 86400, wifi: nulls ? null : { dbm: -58, quality: 72 },
    net: nulls ? null : { rx_bps: 1258291, tx_bps: 348160 },
    services: IDS.map((id, i) => down.includes(id)
      ? { id, up: false, ms: null, status: '502' } : { id, up: true, ms: MS[i], status: '200' }),
    ticker: { hottest_today: { c: 68, at: now - 3600 }, availability_7d: 99.8, last_outage: now - 3 * 86400, recording_since: now - 9 * 86400 },
  };
}

const events = [
  { id: 1, ts: now - 600, level: 'warn', text: 'temp 71°C · warm' },
  { id: 2, ts: now - 300, level: 'alarm', text: 'noticias-pt DOWN' },
];

module.exports = {
  IDS, config, events,
  scenarios: {
    healthy: live(),
    degraded: live({ temp: 61, outside: 27, cpu: 18, down: ['noticias-pt', 'noticias-pt.me'] }),
    overheating: live({ temp: 84, outside: 38, cpu: 71, throttle: 3 }),
    alldown: live({ down: IDS }),
    sensors: live({ nulls: true }),
  },
};
