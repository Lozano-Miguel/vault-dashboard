(() => {
  const STAGE_W = 1280, STAGE_H = 800;
  const $ = id => document.getElementById(id);
  const S = { cfg: null, lastEventId: null, fails: 0, lastSeen: null, marquee: '', marqueeAt: 0 };
  const LAIN = ['present day, present time', "no matter where you go, everyone's connected", 'close the world, open the next'];
  const MARQUEE_MIN_MS = 60000; // rebuilding the marquee makes it jump; live counts change every poll

  // ---------- formatting ----------
  const na = v => v == null;
  const temp = t => na(t) ? 'n/a' : Math.round(t) + '°C';
  const bps = b => na(b) ? 'n/a' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB/s' : Math.round(b / 1024) + ' KB/s';
  const pct = (a, b) => na(a) || !b ? 0 : Math.max(0, Math.min(100, (a / b) * 100));
  const hhmm = ts => new Date(ts * 1000).toLocaleTimeString('en-GB', { timeZone: S.cfg.tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const hhmmss = ms => new Date(ms).toLocaleTimeString('en-GB', { timeZone: S.cfg.tz, hour12: false });
  const day = ts => new Date(ts * 1000).toLocaleDateString('en-CA', { timeZone: S.cfg.tz }).replace(/-/g, '.');
  const ago = s => s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 86400 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd';
  const setText = (id, text) => { const el = $(id); if (el.textContent !== text) el.textContent = text; };

  function tempColors(t) {
    const { warn, danger } = S.cfg.thresholds;
    if (na(t) || t < warn) return { lcd: '#e6ecff', bar: '#2c3550' };
    if (t < danger) return { lcd: '#ffb347', bar: '#c47a12' };
    return { lcd: '#ff4a3a', bar: '#b3201a' };
  }

  // ---------- data ----------
  async function getJSON(url) {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  const mergedServices = live => {
    const byId = Object.fromEntries(live.services.map(s => [s.id, s]));
    return S.cfg.services.map(s => ({ ...s, ...(byId[s.id] || { up: null, ms: null, status: '' }) }));
  };

  // ---------- rendering ----------
  function setStatus(text, color) {
    setText('status-text', text);
    $('status').style.color = color;
  }

  function renderStatus(live, services) {
    const down = services.filter(s => s.up === false), t = live.cpu_temp;
    if (!na(t) && t >= S.cfg.thresholds.danger - 2)
      return setStatus(`the attic is burning · ${Math.round(t)}°C` + (live.throttle_today > 0 ? ' · throttling' : ''), '#ef3b2f');
    if (down.length)
      return setStatus(`${down.length} eye${down.length > 1 ? 's' : ''} closed · ${down[0].id} down`, '#ef3b2f');
    setStatus('all systems operational', '#e9eef2');
  }

  function renderMarquee(live, services) {
    const t = live.ticker || {}, items = [];
    if (t.hottest_today) items.push(`hottest today ${t.hottest_today.c}°C at ${hhmm(t.hottest_today.at)}`);
    if (!na(t.availability_7d)) items.push(`${t.availability_7d}% up this week`);
    if (t.last_outage) items.push(`last outage ${ago(live.ts - t.last_outage)} ago`);
    else if (t.recording_since) items.push('no outages recorded');
    items.push(t.recording_since ? `recording since ${day(t.recording_since)}` : 'recording starts in a few minutes');
    if (!na(live.procs)) items.push(`${live.procs} processes`);
    items.push(`${services.length} eyes watching`);
    const mixed = [];  // a lain line after every other fact
    items.forEach((item, i) => { mixed.push(item); if (i % 2 === 1 && LAIN[(i - 1) / 2]) mixed.push(LAIN[(i - 1) / 2]); });
    LAIN.forEach(l => { if (!mixed.includes(l)) mixed.push(l); });
    const text = mixed.join('   //   '), now = Date.now();
    if (text !== S.marquee && (!S.marquee || now - S.marqueeAt >= MARQUEE_MIN_MS)) {
      S.marquee = text; S.marqueeAt = now; $('marquee').setAttribute('text', text);
    }
  }

  function renderThermal(live) {
    const t = live.cpu_temp, c = tempColors(t), lcd = $('lcd');
    setText('lcd', temp(t));
    lcd.style.color = c.lcd; lcd.style.textShadow = `0 0 10px ${c.lcd}`;
    const out = live.outside_temp;
    setText('outside', na(out) ? 'n/a' : `${Math.round(out)}°C` + (na(t) ? '' : ` · attic gap ${t - out >= 0 ? '+' : ''}${Math.round(t - out)}°`));
    setText('throttled', na(live.throttle_today) ? 'n/a' : `${live.throttle_today} time(s) today`);
    const bar = $('temp-bar');
    bar.style.width = (na(t) ? 0 : Math.max(0, Math.min(100, ((t - 30) / 60) * 100))) + '%';
    bar.style.setProperty('--tc', c.bar);
  }

  function renderSystem(live) {
    $('cpu-bar').style.width = (live.cpu_pct || 0) + '%';
    setText('cpu-text', na(live.cpu_pct) ? 'n/a' : `${Math.round(live.cpu_pct)}% · ${live.load ? live.load[0].toFixed(2) : 'n/a'}`);
    const m = live.mem_mb, d = live.disk_gb;
    $('mem-bar').style.width = (m ? pct(m[0], m[1]) : 0) + '%';
    setText('mem-text', m ? `${(m[0] / 1024).toFixed(1)} / ${(m[1] / 1024).toFixed(1)} GB` : 'n/a');
    $('disk-bar').style.width = (d ? pct(d[0], d[1]) : 0) + '%';
    setText('disk-text', d ? `${Math.round(d[0])} / ${Math.round(d[1])} GB` : 'n/a');
    setText('wifi-text', live.wifi ? `${live.wifi.dbm} dBm · ${live.wifi.quality}%` : 'n/a');
    setText('net-text', live.net ? `↓ ${bps(live.net.rx_bps)}   ↑ ${bps(live.net.tx_bps)}` : 'n/a');
    const up = $('uptime');
    if (na(live.boot_time)) up.removeAttribute('boot'); else up.setAttribute('boot', String(live.boot_time));
  }

  function renderTop(live) {
    const box = $('top-rows');
    if (!live.top) { if (box.textContent !== 'n/a') box.textContent = 'n/a'; return; }
    box.replaceChildren(...live.top.map(p => {
      const row = document.createElement('div'), name = document.createElement('span');
      row.className = 'list-row';
      name.textContent = p.name;
      if (p.count > 1) { const n = document.createElement('span'); n.className = 'dim'; n.textContent = ` ×${p.count}`; n.style.padding = '0'; name.append(n); }
      const cpu = document.createElement('span'), mem = document.createElement('span');
      cpu.className = mem.className = 'num';
      cpu.textContent = p.cpu.toFixed(1) + '%'; mem.textContent = p.mem.toFixed(1) + '%';
      row.append(name, cpu, mem);
      return row;
    }));
  }

  function renderNeofetch() {
    const sys = S.cfg.system || {};
    setText('nf-title', `root@${S.cfg.host}`);
    for (const key of ['os', 'host', 'kernel', 'cpu']) setText('nf-' + key, sys[key] || 'n/a');
    setText('nf-services', `${S.cfg.services.length} watched`);
  }

  function renderVisuals(live, services) {
    const angel = $('angel'), wired = $('wired');
    angel.data = { services };
    if (na(live.cpu_temp)) angel.removeAttribute('temp'); else angel.setAttribute('temp', String(live.cpu_temp));
    angel.setAttribute('cpu', String(live.cpu_pct || 0));
    wired.data = { host: S.cfg.host, network: S.cfg.network, services };
    if (na(live.cpu_temp)) wired.removeAttribute('temp'); else wired.setAttribute('temp', String(live.cpu_temp));
  }

  function render(live) {
    const services = mergedServices(live);
    renderStatus(live, services);
    renderMarquee(live, services);
    renderThermal(live);
    renderSystem(live);
    renderTop(live);
    renderVisuals(live, services);
  }

  function pushEvents(events) {
    const initial = S.lastEventId === null, con = $('console');
    events.forEach(e => con.pushAt(e.ts, e.text, e.level, initial));
    S.lastEventId = events.length ? events[events.length - 1].id : (S.lastEventId ?? 0);
  }

  // ---------- loop ----------
  async function poll() {
    try {
      const live = await getJSON('/api/live');
      S.fails = 0; S.lastSeen = Date.now();
      render(live);
      pushEvents(await getJSON('/api/events' + (S.lastEventId === null ? '' : '?after=' + S.lastEventId)));
    } catch (err) {
      S.fails += 1;
      if (S.fails >= 2) setStatus(S.lastSeen ? `signal lost · last seen ${hhmmss(S.lastSeen)}` : 'signal lost', '#f2a43a');
    } finally {
      setTimeout(poll, S.cfg.poll_ms);
    }
  }

  function fit() {
    const k = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H), st = $('vault').style;
    st.transform = `scale(${k})`;
    st.left = (innerWidth - STAGE_W * k) / 2 + 'px';
    st.top = (innerHeight - STAGE_H * k) / 2 + 'px';
    window.vaultFx.setScale(k);
  }

  async function boot() {
    fit();
    addEventListener('resize', fit);
    for (;;) {
      try { S.cfg = await getJSON('/api/config'); break; } catch (err) {
        setStatus('signal lost · waiting for vault', '#f2a43a');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    window.vaultFx.setTimezone(S.cfg.tz);
    renderNeofetch();
    setText('scale-mid', `warn ${S.cfg.thresholds.warn}° · danger ${S.cfg.thresholds.danger}°`);
    poll();
  }

  boot();
})();
