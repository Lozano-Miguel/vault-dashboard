(() => {
if (window.__vaultFx) return; window.__vaultFx = 1;
const TAU = Math.PI * 2;
const RM = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const hex = h => { h = (h || '').replace('#', ''); return h.length === 6 ? [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) : null; };
const COLD = [214, 226, 255], AMBER = [255, 170, 62], RED = [236, 52, 40];
const tempColor = t => t <= 50 ? COLD : t < 70 ? mix(COLD, AMBER, (t - 50) / 20) : t < 82 ? mix(AMBER, RED, (t - 70) / 12) : RED;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const SERVICES = ['obilhete', 'noticias-pt', 'obilhete-scraper', 'npm', 'postgres', 'obilhete.pt', 'noticias-pt.me'];
const FONT = "VT323, 'Courier New', monospace";
const LIVE = new Set();
if (document.fonts) document.fonts.addEventListener('loadingdone', () => LIVE.forEach(e => { e.dirty = true; }));
const downSet = s => new Set((s || '').split(',').map(x => x.trim()).filter(Boolean));
const PTR = { x: 0, y: 0, t: -1e9 };
addEventListener('pointermove', e => { PTR.x = e.clientX; PTR.y = e.clientY; PTR.t = performance.now(); LIVE.forEach(el => { if (el.follows) el.dirty = true; }); }, { passive: true });
const SCHED = new Set(); let rr = 0, schedOn = false;
const frame = now => {
  requestAnimationFrame(frame);
  const els = [...SCHED], n = els.length; if (!n) return;
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { els[(rr + i) % n].tick(now); if (performance.now() - t0 > 9) { rr = (rr + i + 1) % n; return; } }
  rr = (rr + 1) % n;
};
const startSched = () => { if (!schedOn) { schedOn = true; requestAnimationFrame(frame); } };
const setGlow = (el, c) => { const f = c ? `drop-shadow(0 0 3px ${c})` : ''; if (el._glow !== f) { el._glow = f; el.cv.style.filter = f; } };

class Fx extends HTMLElement {
  static get observedAttributes() { return ['variant', 'temp', 'cpu', 'down', 'labels', 'motion', 'color', 'days', 'rows', 'px']; }
  connectedCallback() {
    if (!this.cv) {
      Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%' });
      this.cv = document.createElement('canvas');
      this.cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block';
      this.appendChild(this.cv); this.ctx = this.cv.getContext('2d');
      this.ro = new ResizeObserver(() => this.resize());
      this.io = new IntersectionObserver(es => { this.vis = es[es.length - 1].isIntersecting; if (this.vis) this.dirty = true; }, { rootMargin: '300px' });
      this.vis = true; this.T = 0; this.last = 0;
    }
    LIVE.add(this); this.ro.observe(this); this.io.observe(this); this.resize(); this.dirty = true;
    SCHED.add(this); startSched();
  }
  disconnectedCallback() { LIVE.delete(this); SCHED.delete(this); this.ro.disconnect(); this.io.disconnect(); }
  attributeChangedCallback() { this.dirty = true; }
  a(n, d) { const v = this.getAttribute(n); return v == null || v === '' ? d : v; }
  n(n, d) { const v = parseFloat(this.getAttribute(n)); return isNaN(v) ? d : v; }
  get still() { return this.static || RM.matches || this.a('motion', 'full') === 'reduced'; }
  resize() {
    const w = this.clientWidth, h = this.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); this.dirty = true;
  }
  tick(now) {
    if (!this.w) return;
    if (this.still) { if (!this.dirty) return; this.dirty = false; this.draw(0, true); return; }
    const dt = (now - this.last) / 1000;
    if ((!this.vis && !this.dirty) || dt < 1 / (this.fps || 30)) return;
    this.last = now; const d = Math.min(dt, 0.1); this.T += d; this.dirty = false; this.draw(d, false);
  }
  offscreen(ow, oh) {
    if (!this.off) { this.off = document.createElement('canvas'); this.octx = this.off.getContext('2d', { willReadFrequently: true }); }
    if (this.off.width !== ow || this.off.height !== oh) { this.off.width = ow; this.off.height = oh; }
    this.octx.setTransform(1, 0, 0, 1, 0, 0); this.octx.clearRect(0, 0, ow, oh); return this.octx;
  }
  blit(ow, oh, px) {
    const c = this.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.imageSmoothingEnabled = false;
    c.drawImage(this.off, 0, 0, ow * px * this.dpr, oh * px * this.dpr);
  }
}

function dither(octx, ow, oh) {
  const im = octx.getImageData(0, 0, ow, oh), d = im.data;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i = (y * ow + x) * 4, mx = Math.max(d[i], d[i + 1], d[i + 2]);
    const f = clamp(mx * d[i + 3] / 65025 * 1.15, 0, 0.999) * 2, lo = Math.floor(f), lv = lo + (f - lo > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0);
    if (!lv) { d[i + 3] = 0; continue; }
    const k = (lv === 1 ? 0.48 : 1) * 255 / Math.max(1, mx); d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; d[i + 3] = 255;
  }
  octx.putImageData(im, 0, 0);
}

/* ---------- OPHANIM ---------- */
function proj(cx, cy, r, a, ax, ay) {
  const x0 = r * Math.cos(a), y0 = r * Math.sin(a);
  const y1 = y0 * Math.cos(ax), z1 = y0 * Math.sin(ax);
  return { x: cx + x0 * Math.cos(ay) + z1 * Math.sin(ay), y: cy + y1, z: -x0 * Math.sin(ay) + z1 * Math.cos(ay) };
}
function blink(seed, T, still) {
  if (still) return 1;
  const P = 4.5 + hash(seed) * 5, ph = (T + hash(seed * 9) * P) % P;
  return ph < 0.16 ? Math.abs(ph / 0.08 - 1) : 1;
}
function ophGeo(w, h, st) {
  const S = Math.min(w, h), R = S * (st.labels ? 0.34 : 0.43);
  let cx = w / 2, cy = h / 2;
  if (st.hot && !st.still) { cx += (hash(st.T * 91) - 0.5) * S * 0.006; cy += (hash(st.T * 57) - 0.5) * S * 0.006; }
  const [p0, p1, p2] = st.ph;
  const rings = [
    { r: R, ax: 0.48, ay: 0, band: R * 0.075, ticks: 63 },
    { r: R * 0.7, ax: 1.2 + 0.18 * Math.sin(p1 * 0.6), ay: p1, spin: p1 * 1.6, band: R * 0.035, n: 9 },
    { r: R * 0.7, ax: -1.2 + 0.18 * Math.cos(p2 * 0.5), ay: p2 + Math.PI / 2, spin: -p2 * 1.4, band: R * 0.035, n: 9 },
  ];
  const eyes = [];
  SERVICES.forEach((id, k) => {
    const a = -Math.PI / 2 + k * TAU / 7 + p0, p = proj(cx, cy, R, a, rings[0].ax, 0);
    eyes.push({ ...p, s: R * 0.2 * (1 + p.z / (R * 4)), svc: id, down: st.down.has(id), seed: k + 1, alpha: 1 });
  });
  rings.slice(1).forEach((rg, j) => {
    for (let k = 0; k < rg.n; k++) {
      const p = proj(cx, cy, rg.r, k * TAU / rg.n + rg.spin, rg.ax, rg.ay);
      eyes.push({ ...p, s: R * 0.085 * (1 + p.z / (R * 3)), small: true, seed: 20 + j * 10 + k, alpha: 0.35 + 0.65 * (p.z / rg.r + 1) / 2 });
    }
  });
  const g = { S, R, cx, cy, rings, eyes, p0 };
  const de = eyes.find(e => e.down), sc = st.k || 1;
  let tg;
  if (st.ptr) tg = { x: st.ptr.x / sc, y: st.ptr.y / sc };
  else if (de) tg = { x: de.x, y: de.y };
  else {
    const T = st.T, k = Math.floor(T / 2.4), b = Math.min(1, ((T / 2.4) % 1) / 0.07);
    const P = i => ({ x: cx + (hash(i * 3.1) - 0.5) * R * 2.2, y: cy + (hash(i * 7.7) - 0.5) * R * 1.6 });
    const A = P(k - 1), B = P(k); tg = { x: lerp(A.x, B.x, b), y: lerp(A.y, B.y, b) };
  }
  const gz = st.gz || {};
  if (gz.x == null || st.still) { gz.x = tg.x * sc; gz.y = tg.y * sc; }
  else { const f = st.ptr ? 0.35 : 0.22; gz.x = lerp(gz.x, tg.x * sc, f); gz.y = lerp(gz.y, tg.y * sc, f); }
  g.gaze = { x: gz.x / sc, y: gz.y / sc };
  return g;
}
function gazeOf(e, g) {
  const dx = g.gaze.x - e.x, dy = g.gaze.y - e.y, d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / (g.R * 0.5));
  return [dx / d * m, dy / d * m];
}
function drawEye(ctx, x, y, s, o, lw, glow) {
  const ph = s * 0.3 * o.open;
  const almond = () => { ctx.beginPath(); ctx.moveTo(x - s / 2, y); ctx.quadraticCurveTo(x, y - ph * 2, x + s / 2, y); ctx.quadraticCurveTo(x, y + ph * 2, x - s / 2, y); ctx.closePath(); };
  ctx.globalAlpha = o.alpha;
  if (o.open > 0.12) {
    almond(); ctx.fillStyle = '#040506'; ctx.fill();
    ctx.save(); almond(); ctx.clip();
    const ir = s * 0.22, ix = x + o.gx * s * 0.15, iy = y + o.gy * s * 0.08;
    if (o.blood > 0) {
      ctx.strokeStyle = rgba(RED, 0.95 * o.blood); ctx.lineWidth = Math.max(0.6, lw * 0.6); ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = hash(o.seed * 13 + k) * TAU, sx = x + Math.cos(a) * s * 0.5, sy = y + Math.sin(a) * s * 0.32;
        ctx.moveTo(sx, sy);
        for (let j = 1; j <= 3; j++) { const t = j / 3 * 0.75; ctx.lineTo(lerp(sx, ix, t) + (hash(o.seed + k * 7 + j) - 0.5) * s * 0.1, lerp(sy, iy, t) + (hash(o.seed * 3 + k + j * 5) - 0.5) * s * 0.1); }
      }
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fillStyle = rgba(o.iris, 0.22); ctx.fill();
    ctx.strokeStyle = rgba(o.iris, 1); ctx.lineWidth = lw; ctx.stroke();
    if (s > 22) { ctx.globalAlpha = o.alpha * 0.5; ctx.beginPath(); ctx.arc(ix, iy, ir * 0.7, 0, TAU); ctx.stroke(); ctx.globalAlpha = o.alpha; }
    ctx.beginPath(); ctx.arc(ix, iy, ir * o.dilate, 0, TAU); ctx.fillStyle = '#000'; ctx.fill();
    ctx.beginPath(); ctx.arc(ix - ir * 0.35, iy - ir * 0.35, Math.max(lw * 0.7, ir * 0.14), 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore(); ctx.globalAlpha = o.alpha;
    almond(); ctx.strokeStyle = rgba(o.edge, 1); ctx.lineWidth = lw; ctx.stroke();
    if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = lw * 5; ctx.strokeStyle = rgba(o.edge, 0.13 * o.alpha); almond(); ctx.stroke(); ctx.restore(); }
  } else {
    const lid = () => { ctx.beginPath(); ctx.moveTo(x - s / 2, y); ctx.quadraticCurveTo(x, y + s * 0.28, x + s / 2, y); };
    lid(); ctx.strokeStyle = rgba(o.edge, 1); ctx.lineWidth = lw * 1.2; ctx.stroke();
    ctx.beginPath();
    for (let k = 1; k <= 5; k++) {
      const t = k / 6, bx = lerp(lerp(x - s / 2, x, t), lerp(x, x + s / 2, t), t), by = lerp(lerp(y, y + s * 0.28, t), lerp(y + s * 0.28, y, t), t);
      ctx.moveTo(bx, by); ctx.lineTo(bx + (t - 0.5) * s * 0.2, by + s * 0.12);
    }
    ctx.lineWidth = lw; ctx.stroke();
    if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = lw * 7; ctx.strokeStyle = rgba(o.edge, 0.16); lid(); ctx.stroke(); ctx.restore(); }
  }
  if (o.tears) {
    ctx.fillStyle = rgba(RED, 1);
    for (let k = 0; k < 3; k++) {
      const p = o.still ? (k / 3 + 0.12) : ((o.T * 0.45 + k / 3 + o.seed * 0.13) % 1);
      const tx = x + (k - 1) * s * 0.17, ty = y + s * 0.2 + p * s * 1.1, tr = Math.max(1, s * 0.045) * (1 - p * 0.4);
      ctx.globalAlpha = o.alpha * (1 - p);
      ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI); ctx.lineTo(tx, ty - tr * 2.4); ctx.closePath(); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function ophScene(ctx, g, st, glow) {
  const col = st.col, lw = Math.max(1, g.S * 0.0042);
  const flick = st.hot && !st.still ? 0.65 + 0.35 * hash(Math.floor(st.T * 18)) : 1;
  ctx.lineCap = 'round';
  const rings = front => g.rings.forEach((rg, i) => {
    const N = i === 0 ? 150 : 100, B = [[], [], [], []];
    for (const o of [-rg.band, rg.band]) {
      let prev = proj(g.cx, g.cy, rg.r + o, 0, rg.ax, rg.ay);
      for (let k = 1; k <= N; k++) {
        const p = proj(g.cx, g.cy, rg.r + o, k / N * TAU, rg.ax, rg.ay), z = (p.z + prev.z) / 2;
        if ((z >= 0) === front) B[Math.floor(clamp((z / rg.r + 1) / 2, 0, 0.999) * 4)].push(prev.x, prev.y, p.x, p.y);
        prev = p;
      }
    }
    if (rg.ticks) for (let j = 0; j < rg.ticks; j++) {
      if ([0, 1, 8].includes(j % 9)) continue;
      const a = -Math.PI / 2 + j * TAU / rg.ticks + g.p0;
      const p = proj(g.cx, g.cy, rg.r - rg.band * 0.55, a, rg.ax, rg.ay), q = proj(g.cx, g.cy, rg.r + rg.band * 0.55, a, rg.ax, rg.ay);
      if ((p.z >= 0) === front) B[Math.floor(clamp((p.z / rg.r + 1) / 2, 0, 0.999) * 4)].push(p.x, p.y, q.x, q.y);
    }
    B.forEach((b, bi) => {
      if (!b.length) return;
      const a = (0.22 + 0.78 * (bi + 0.5) / 4) * flick;
      ctx.beginPath(); for (let j = 0; j < b.length; j += 4) { ctx.moveTo(b[j], b[j + 1]); ctx.lineTo(b[j + 2], b[j + 3]); }
      if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba(col, a * 0.1); ctx.lineWidth = lw * 6; ctx.stroke(); ctx.restore(); }
      ctx.strokeStyle = rgba(col, a); ctx.lineWidth = lw; ctx.stroke();
    });
  });
  const eyeOpts = e => {
    const [gx, gy] = gazeOf(e, g);
    if (e.down) return { open: 0, edge: RED, iris: RED, tears: true, alpha: 1, gx, gy, seed: e.seed, T: st.T, still: st.still };
    return { open: blink(e.seed, st.T, st.still), edge: col, iris: st.hot ? mix(col, RED, 0.4) : col, blood: st.hot ? (e.small ? 0.7 : 0.45) : 0, dilate: st.hot ? 0.58 : 0.42, alpha: e.alpha * (e.small ? flick : 1), gx, gy, seed: e.seed };
  };
  const eyes = side => g.eyes.filter(e => (e.z >= 0) === side).sort((a, b) => a.z - b.z).forEach(e => drawEye(ctx, e.x, e.y, e.s, eyeOpts(e), e.small ? Math.max(1, lw * 0.8) : lw, glow));
  rings(false); eyes(false);
  // halo + center eye (vault itself)
  const hr = g.R * 0.27, rot = -g.p0 * 0.5;
  ctx.beginPath(); ctx.arc(g.cx, g.cy, hr, 0, TAU);
  for (let k = 0; k < 36; k++) { const a = rot + k * TAU / 36, l = k % 2 ? 0.035 : 0.065; ctx.moveTo(g.cx + Math.cos(a) * hr * 1.04, g.cy + Math.sin(a) * hr * 1.04); ctx.lineTo(g.cx + Math.cos(a) * (hr + g.R * l), g.cy + Math.sin(a) * (hr + g.R * l)); }
  ctx.strokeStyle = rgba(col, 0.55 * flick); ctx.lineWidth = lw; ctx.stroke();
  if (glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.beginPath(); ctx.arc(g.cx, g.cy, hr * 0.9, 0, TAU); ctx.fillStyle = rgba(col, st.hot ? 0.12 : 0.05); ctx.fill(); ctx.restore(); }
  const ce = { x: g.cx, y: g.cy };
  const [cgx, cgy] = gazeOf(ce, g);
  drawEye(ctx, g.cx, g.cy, g.R * 0.36, { open: blink(99, st.T, st.still), edge: col, iris: st.hot ? RED : col, blood: st.hot ? 0.9 : st.down.size ? 0.3 : 0, dilate: st.hot ? 0.6 : 0.4, alpha: 1, gx: cgx, gy: cgy, seed: 99 }, lw * 1.3, glow);
  rings(true); eyes(true);
}
function ophLabels(g) {
  return g.eyes.filter(e => e.svc).map(e => {
    const dx = e.x - g.cx, dy = e.y - g.cy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, off = e.s * 0.62 + 6;
    return { x: e.x + ux * off, y: e.y + uy * off * 0.8, t: e.svc, down: e.down, align: ux > 0.35 ? 'left' : ux < -0.35 ? 'right' : 'center', base: uy < -0.35 ? 'bottom' : uy > 0.35 ? 'top' : 'middle' };
  });
}
class Ophanim extends Fx {
  constructor() { super(); this.ph = [0.3, 1.1, 2.2]; this.follows = true; this.gz = {}; }
  state(still) {
    const temp = this.n('temp', 55), cpu = this.n('cpu', 15);
    let ptr = null;
    if (performance.now() - PTR.t < 2500) { const r = this.getBoundingClientRect(); if (r.width) ptr = { x: (PTR.x - r.left) * this.w / r.width, y: (PTR.y - r.top) * this.h / r.height }; }
    return { T: still ? 3.2 : this.T, temp, cpu, down: downSet(this.a('down', '')), col: tempColor(temp), hot: temp >= 78, labels: this.a('labels', '0') === '1', ph: this.ph, still, ptr, gz: this.gz, k: 1 };
  }
  draw(dt, still) {
    const v = this.a('variant', 'glow'); this.fps = v === 'ascii' ? 15 : 30;
    const om = 0.08 + this.n('cpu', 15) / 100 * 1.4;
    this.ph[0] += dt * om; this.ph[1] += dt * om * 0.7; this.ph[2] += dt * om * 0.55;
    const st = this.state(still), ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (v === 'ascii') return this.ascii(st);
    setGlow(this, '');
    let g, k = 1;
    if (v === 'pixel' || v === 'crisp') {
      k = this.n('px', v === 'crisp' ? 2 : Math.max(2, Math.round(Math.min(this.w, this.h) / 160)));
      const ow = Math.ceil(this.w / k), oh = Math.ceil(this.h / k), o = this.offscreen(ow, oh);
      st.k = k; g = ophGeo(ow, oh, st); ophScene(o, g, st, true); if (v === 'pixel') dither(o, ow, oh); this.blit(ow, oh, k);
    } else {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g = ophGeo(this.w, this.h, st); ophScene(ctx, g, st, true);
    }
    if (st.labels) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const fs = clamp(Math.round(Math.min(this.w, this.h) / 30), 13, 22);
      ctx.font = `${fs}px ${FONT}`;
      ophLabels(g).forEach(l => {
        ctx.textAlign = l.align; ctx.textBaseline = l.base;
        ctx.fillStyle = l.down ? rgba(RED, 1) : rgba(st.col, 0.75);
        ctx.fillText(l.down ? l.t + ' ✕' : l.t, l.x * k, l.y * k);
      });
    }
  }
  ascii(st) {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const S = Math.min(w, h), fs = this.n('fs', clamp(Math.round(S / 44), 9, 22));
    ctx.font = `${fs}px ${FONT}`;
    const cw = ctx.measureText('M').width || fs * 0.5, chh = fs * 0.86;
    const cols = Math.floor(w / cw), rows = Math.floor(h / chh), N = cols * rows;
    if (cols < 8 || rows < 6) return;
    const chr = new Array(N).fill(''), zb = new Float32Array(N).fill(-1e9), cl = new Array(N);
    const put = (c, r, ch, z, color) => { if (c < 0 || r < 0 || c >= cols || r >= rows) return; const i = r * cols + c; if (z < zb[i]) return; zb[i] = z; chr[i] = ch; cl[i] = color; };
    const puts = (c, r, s, z, color) => { for (let i = 0; i < s.length; i++) put(c + i, r, s[i], z, color); };
    const cell = p => [Math.floor(p.x / cw), Math.floor(p.y / chh)];
    const dirc = (dx, dy) => { const A = ((Math.atan2(dy / chh, dx / cw) % Math.PI) + Math.PI) % Math.PI; return A < Math.PI / 8 || A > 7 * Math.PI / 8 ? '-' : A < 3 * Math.PI / 8 ? '\\' : A < 5 * Math.PI / 8 ? '|' : '/'; };
    const g = ophGeo(w, h, st), col = st.col, hot = st.hot, T = st.T;
    const flick = hot && !st.still ? 0.7 + 0.3 * hash(Math.floor(T * 15)) : 1;
    const C = a => rgba(col, Math.round(clamp(a * flick, 0, 1) * 20) / 20), RD = a => rgba(RED, Math.round(a * 20) / 20);
    const go = this.offscreen(cols, rows);
    go.setTransform(1 / cw, 0, 0, 1 / chh, 0, 0); go.globalCompositeOperation = 'lighter';
    let gr = go.createRadialGradient(g.cx, g.cy, g.R * 0.2, g.cx, g.cy, g.R * 1.35);
    gr.addColorStop(0, rgba(col, 0.26)); gr.addColorStop(1, rgba(col, 0)); go.fillStyle = gr; go.fillRect(0, 0, w, h);
    gr = go.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, g.R * 0.45);
    gr.addColorStop(0, rgba(col, hot ? 0.9 : 0.62)); gr.addColorStop(1, rgba(col, 0)); go.fillStyle = gr; go.fillRect(0, 0, w, h);
    go.lineWidth = cw * 2.4; go.strokeStyle = rgba(col, 0.3);
    g.rings.forEach(rg => { go.beginPath(); for (let k = 0; k <= 72; k++) { const p = proj(g.cx, g.cy, rg.r, k / 72 * TAU, rg.ax, rg.ay); k ? go.lineTo(p.x, p.y) : go.moveTo(p.x, p.y); } go.stroke(); });
    g.eyes.filter(e => e.down).forEach(e => { const q = go.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.s * 1.5); q.addColorStop(0, rgba(RED, 0.95)); q.addColorStop(1, rgba(RED, 0)); go.fillStyle = q; go.fillRect(e.x - e.s * 1.6, e.y - e.s * 1.6, e.s * 3.2, e.s * 3.2); });
    const gd = go.getImageData(0, 0, cols, rows).data;
    const hr = g.R * 0.27, hn = Math.ceil(TAU * hr / cw * 1.2), rot = -g.p0 * 0.5;
    for (let k = 0; k < hn; k++) { const a = k / hn * TAU, [c, r] = cell({ x: g.cx + Math.cos(a) * hr, y: g.cy + Math.sin(a) * hr }); put(c, r, '.', -g.R, C(0.6)); }
    for (let k = 0; k < 24; k++) { const a = rot + k * TAU / 24, l = k % 2 ? 0.05 : 0.1; for (let j = 0; j < 3; j++) { const q = hr * 1.1 + g.R * l * j / 2, [c, r] = cell({ x: g.cx + Math.cos(a) * q, y: g.cy + Math.sin(a) * q }); put(c, r, dirc(Math.cos(a), Math.sin(a)), -g.R * 0.9, C(0.5)); } }
    g.rings.forEach((rg, i) => {
      (i === 0 ? [-rg.band * 0.95, rg.band * 0.95] : [0]).forEach(o => {
        const r0 = rg.r + o, n = Math.ceil(TAU * r0 / cw * 1.8);
        for (let k = 0; k < n; k++) {
          const a = k / n * TAU, p = proj(g.cx, g.cy, r0, a, rg.ax, rg.ay), q = proj(g.cx, g.cy, r0, a + 0.01, rg.ax, rg.ay);
          const d = (p.z / rg.r + 1) / 2; let c = dirc(q.x - p.x, q.y - p.y);
          if (p.z < 0 && i > 0) c = d < 0.3 ? '.' : ':';
          if (i === 0 && c === '-') c = '=';
          const [cx, cy] = cell(p); put(cx, cy, c, p.z, C(0.28 + 0.67 * d));
        }
      });
      if (rg.ticks) for (let j = 0; j < rg.ticks; j++) { if ([0, 1, 8].includes(j % 9)) continue; const p = proj(g.cx, g.cy, rg.r, -Math.PI / 2 + j * TAU / rg.ticks + g.p0, rg.ax, rg.ay), [cx, cy] = cell(p); put(cx, cy, j % 3 ? ':' : '+', p.z, C(0.35 + 0.5 * (p.z / rg.r + 1) / 2)); }
    });
    g.eyes.slice().sort((a, b) => a.z - b.z).forEach(e => {
      const [c, r] = cell(e), [gx] = gazeOf(e, g), z = e.z + g.R * 2;
      if (e.small) {
        const b = blink(e.seed, T, st.still);
        if (e.z < 0) { put(c, r, b < 0.5 ? '-' : 'o', z, C(0.25 + e.alpha * 0.4)); return; }
        const p = b < 0.5 ? '-' : hot ? '*' : gx < -0.5 ? '<' : gx > 0.5 ? '>' : 'o';
        puts(c - 1, r, '(' + p + ')', z, hot ? rgba(mix(col, RED, 0.5), Math.round(e.alpha * 20) / 20) : C(0.4 + e.alpha * 0.6)); return;
      }
      const L = c - 3, a = e.z < 0 ? 0.75 : 1;
      if (e.down) {
        puts(L, r - 1, '       ', z, ''); puts(L, r, ' \\___/ ', z, RD(1)); puts(L, r + 1, "  ' '  ", z, RD(0.9));
        for (let k = 0; k < 3; k++) { const p = st.still ? (k / 3 + 0.15) : ((T * 0.55 + k / 3 + e.seed * 0.17) % 1); put(c - 1 + k, r + 2 + Math.floor(p * 4), k === 1 ? "'" : ',', z, RD(Math.max(0.2, 1 - p * 0.8))); }
      } else {
        const b = blink(e.seed, T, st.still), pi = clamp(Math.round(gx * 2), -2, 2);
        if (b < 0.5) { puts(L, r - 1, '       ', z, ''); puts(L, r, '(-----)', z, C(a)); puts(L, r + 1, '       ', z, ''); }
        else {
          puts(L, r - 1, ' .---. ', z, C(a)); puts(L, r, '(     )', z, C(a)); puts(L, r + 1, " '---' ", z, C(a));
          put(L + 3 + pi, r, hot ? '#' : '@', z + 1, hot ? RD(1) : C(1));
        }
      }
      if (st.labels) {
        const dx = e.x - g.cx, lab = e.down ? e.svc + ' x' : e.svc, lc = e.down ? RD(1) : C(0.72), zl = 1e6;
        if (dx > g.R * 0.3) puts(c + 5, r, ' ' + lab + ' ', zl, lc);
        else if (dx < -g.R * 0.3) puts(c - 6 - lab.length, r, ' ' + lab + ' ', zl, lc);
        else puts(c - Math.floor(lab.length / 2), r + (e.y < g.cy ? -2 : 2), lab, zl, lc);
      }
    });
    const [cc, cr] = cell({ x: g.cx, y: g.cy }), [cgx] = gazeOf({ x: g.cx, y: g.cy }, g), cb = blink(99, T, st.still), zc = g.R * 0.15;
    const ci = clamp(Math.round(cgx * 2.4), -2, 2), lid = hot ? rgba(mix(col, RED, 0.6), 1) : C(1);
    const iris = hot ? RD(1) : st.down.size ? rgba(mix(col, RED, 0.45), 1) : C(1);
    puts(cc - 6, cr - 2, '             ', zc, ''); puts(cc - 6, cr + 2, '             ', zc, '');
    if (cb < 0.5) { puts(cc - 6, cr - 1, '             ', zc, ''); puts(cc - 6, cr, ' <=========> ', zc, lid); puts(cc - 6, cr + 1, '             ', zc, ''); }
    else {
      puts(cc - 6, cr - 1, "   .-'''-.   ", zc, lid); puts(cc - 6, cr, ' <(       )> ', zc, lid); puts(cc - 6, cr + 1, "   '-...-'   ", zc, lid);
      puts(cc - 1 + ci, cr, hot ? '(#)' : '(@)', zc + 1, iris);
    }
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const RAMP = ' .,:;-=+*', layers = new Map(), haze = hot && !st.still;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (chr[i]) continue;
      const j = i * 4, b = Math.max(gd[j], gd[j + 1], gd[j + 2]) * gd[j + 3] / 65025;
      const ri = Math.min(RAMP.length - 1, Math.floor(clamp(b, 0, 0.999) * RAMP.length * 1.15)); if (ri < 1) continue;
      const red = !hot && gd[j] - gd[j + 1] > 70, lv = b > 0.5 ? 2 : b > 0.25 ? 1 : 0, key = (red ? 'r' : 'c') + lv;
      let Ly = layers.get(key); if (!Ly) layers.set(key, Ly = { color: red ? RD([0.35, 0.55, 0.8][lv]) : C([0.22, 0.36, 0.55][lv]), rows: {} });
      (Ly.rows[r] || (Ly.rows[r] = [])).push(c, RAMP[ri]);
    }
    layers.forEach(Ly => { ctx.fillStyle = Ly.color; for (const r in Ly.rows) { const a = Ly.rows[r], c0 = a[0], arr = new Array(a[a.length - 2] - c0 + 1).fill(' '); for (let k = 0; k < a.length; k += 2) arr[a[k] - c0] = a[k + 1]; const off = haze ? Math.round(Math.sin(r * 0.8 + T * 9) * 0.9) : 0; ctx.fillText(arr.join(''), (c0 + off) * cw, r * chh); } });
    const groups = new Map();
    for (let i = 0; i < N; i++) { const ch = chr[i]; if (ch && ch !== ' ') { let G = groups.get(cl[i]); if (!G) groups.set(cl[i], G = []); G.push(i); } }
    groups.forEach((idx, color) => { ctx.fillStyle = color; idx.forEach(i => ctx.fillText(chr[i], (i % cols) * cw, Math.floor(i / cols) * chh)); });
    setGlow(this, rgba(col, 0.6));
  }
}

/* ---------- THE WIRED (tree) ---------- */
const TREE = [['vault', null, 'vault', 0], ['docker', 'vault', 'docker', 0], ['homelab', 'docker', 'homelab net', 0],
  ['npm', 'homelab', 'npm', 12], ['obilhete', 'homelab', 'obilhete', 42], ['obilhete.pt', 'obilhete', 'obilhete.pt', 88],
  ['noticias-pt', 'homelab', 'noticias-pt', 51], ['noticias-pt.me', 'noticias-pt', 'noticias-pt.me', 94],
  ['obilhete-scraper', 'homelab', 'obilhete-scraper', 230], ['postgres', 'homelab', 'postgres', 3]];
function treeModel(down, hot) {
  const by = {};
  const nodes = TREE.map(([id, parent, label, ms]) => { const n = { id, label, ms: hot ? Math.round(ms * 2.3) : ms, p: parent ? by[parent] : null }; by[id] = n; return n; });
  nodes.forEach(n => { n.depth = n.p ? n.p.depth + 1 : 0; n.self = down.has(n.id); n.dead = n.self || !!(n.p && n.p.dead); n.kids = []; if (n.p) n.p.kids.push(n); });
  return nodes;
}
class Wired extends Fx {
  draw(dt, still) {
    const v = this.a('variant', 'cable'); this.fps = v === 'ascii' ? 15 : 30;
    const temp = this.n('temp', 55), hot = temp >= 78, T = still ? 1.7 : this.T;
    const nodes = treeModel(downSet(this.a('down', '')), hot);
    const ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    const base = hex(this.a('color', '')) || (v === 'ascii' ? AMBER : COLD);
    if (v === 'ascii') return this.ascii(nodes, base, T, still);
    const k = v === 'pixel' ? 2 : 1, W = Math.floor(this.w / k), H = Math.floor(this.h / k);
    const fs = clamp(Math.round(this.h / 13), 13, 19);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.font = `${fs}px ${FONT}`;
    const cw = ctx.measureText('M').width || fs * 0.5;
    const mL = Math.round(18 / k), mR = Math.round((Math.max(...nodes.filter(n => n.depth === 4).map(n => ctx.measureText(n.label + ' ' + (n.self ? 'DOWN' : n.dead ? 'unreachable' : n.ms + 'ms')).width)) + 16) / k), mT = Math.round(fs * 1.1 / k), mB = Math.round(fs * 0.6 / k);
    const fx = [0, 0.15, 0.3, 0.56, 1], uw = W - mL - mR, uh = H - mT - mB;
    const cont = nodes.filter(n => n.depth === 3);
    cont.forEach((n, i) => { n.y = mT + (i + 0.5) * uh / cont.length; });
    nodes.forEach(n => { n.x = mL + fx[n.depth] * uw; if (n.depth < 3) n.y = mT + uh / 2; if (n.depth === 4) n.y = n.p.y; if (k > 1) { n.x = Math.round(n.x) + 0.5; n.y = Math.round(n.y) + 0.5; } });
    let c = ctx;
    if (k > 1) c = this.offscreen(W, H);
    const edge = n => {
      const p = n.p, mx = k > 1 ? Math.round((p.x + n.x) / 2) + 0.5 : 0;
      if (k > 1) return { pts: [[p.x, p.y], [mx, p.y], [mx, n.y], [n.x, n.y]] };
      const sag = Math.abs(p.y - n.y) < 1 ? 7 : 0;
      return { bz: [p.x, p.y, p.x + (n.x - p.x) * 0.5, p.y + sag, p.x + (n.x - p.x) * 0.5, n.y + sag, n.x, n.y] };
    };
    const at = (e, t) => {
      if (e.bz) { const [x0, y0, x1, y1, x2, y2, x3, y3] = e.bz, u = 1 - t; return [u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3]; }
      const P = e.pts, L = []; let tot = 0; for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); L.push(l); tot += l; }
      let d = t * tot; for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const f = L[i] ? d / L[i] : 0; return [lerp(P[i][0], P[i + 1][0], f), lerp(P[i][1], P[i + 1][1], f)]; } d -= L[i]; }
    };
    const path = e => { c.beginPath(); if (e.bz) { c.moveTo(e.bz[0], e.bz[1]); c.bezierCurveTo(...e.bz.slice(2)); } else { c.moveTo(...e.pts[0]); e.pts.slice(1).forEach(p => c.lineTo(...p)); } };
    const kids = nodes.filter(n => n.p);
    kids.forEach(n => {
      const e = edge(n); n.e = e; path(e);
      if (n.dead) { c.setLineDash(k > 1 ? [1, 2] : [2, 5]); c.strokeStyle = n.self ? rgba(RED, 0.55) : 'rgba(110,112,120,0.45)'; c.lineWidth = 1; c.stroke(); c.setLineDash([]); return; }
      if (k === 1) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(base, 0.08); c.lineWidth = 6; c.stroke(); c.restore(); }
      c.strokeStyle = rgba(base, k > 1 ? 0.75 : 0.55); c.lineWidth = k > 1 ? 1 : 1.2; c.stroke();
    });
    kids.forEach(n => {
      if (n.dead) return;
      for (let j = 0; j < 2; j++) {
        const t = still ? (j * 0.5 + 0.3) : ((T * 0.55 - n.depth * 0.35 + j * 0.5) % 1 + 1) % 1, [x, y] = at(n.e, t);
        if (k > 1) { c.fillStyle = '#fff'; c.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
        else { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(base, 0.25); c.beginPath(); c.arc(x, y, 5, 0, TAU); c.fill(); c.restore(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill(); }
      }
    });
    nodes.forEach(n => {
      const red = n.self, dim = n.dead && !n.self;
      if (k > 1) {
        const s = n.depth === 0 ? 7 : 5, x0 = Math.round(n.x - s / 2), y0 = Math.round(n.y - s / 2);
        c.fillStyle = '#000'; c.fillRect(x0, y0, s, s);
        c.strokeStyle = red ? rgba(RED, 1) : dim ? 'rgba(110,112,120,0.8)' : rgba(base, 1); c.lineWidth = 1; c.strokeRect(x0 + 0.5, y0 + 0.5, s - 1, s - 1);
        if (red) { c.fillStyle = rgba(RED, 1); for (let i = 1; i < s - 1; i++) { c.fillRect(x0 + i, y0 + i, 1, 1); c.fillRect(x0 + s - 1 - i, y0 + i, 1, 1); } }
        else if (!dim) { c.fillStyle = n.depth === 0 ? '#fff' : rgba(base, 1); c.fillRect(x0 + 2, y0 + 2, s - 4, s - 4); }
        return;
      }
      if (n.depth === 0) { drawEye(c, n.x, n.y, 26, { open: blink(77, T, still), edge: base, iris: base, alpha: 1, gx: 0.6, gy: 0, dilate: 0.42, seed: 77 }, 1.2, true); return; }
      c.beginPath(); c.arc(n.x, n.y, 4.5, 0, TAU); c.fillStyle = '#050607'; c.fill();
      c.strokeStyle = red ? rgba(RED, 1) : dim ? 'rgba(110,112,120,0.7)' : rgba(base, 1); c.lineWidth = 1.2; c.stroke();
      if (red) { c.beginPath(); c.moveTo(n.x - 2.5, n.y - 2.5); c.lineTo(n.x + 2.5, n.y + 2.5); c.moveTo(n.x + 2.5, n.y - 2.5); c.lineTo(n.x - 2.5, n.y + 2.5); c.stroke(); c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(RED, 0.18); c.beginPath(); c.arc(n.x, n.y, 10, 0, TAU); c.fill(); c.restore(); }
      else if (!dim) { c.beginPath(); c.arc(n.x, n.y, 1.6, 0, TAU); c.fillStyle = rgba(base, 1); c.fill(); }
    });
    if (k > 1) this.blit(W, H, k);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.font = `${fs}px ${FONT}`;
    const txt = rgba(mix(base, [255, 255, 255], 0.3), 0.92), dimc = rgba(base, 0.5);
    nodes.forEach(n => {
      const x = n.x * k, y = n.y * k, val = n.self ? 'DOWN' : n.dead ? 'unreachable' : n.ms ? n.ms + 'ms' : '';
      const lc = n.self ? rgba(RED, 1) : n.dead ? 'rgba(120,122,130,0.8)' : txt;
      if (n.depth < 3) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = lc; ctx.fillText(n.label, x, y + (n.depth === 0 ? 16 : 9)); return; }
      ctx.textAlign = 'left'; ctx.textBaseline = n.depth === 3 ? 'bottom' : 'middle';
      const lx = x + (n.depth === 3 ? 4 : 10), ly = n.depth === 3 ? y - 4 : y;
      ctx.fillStyle = lc; ctx.fillText(n.label, lx, ly);
      if (val) { const lw = ctx.measureText(n.label + ' ').width; ctx.fillStyle = n.self ? rgba(RED, 1) : n.dead ? 'rgba(120,122,130,0.6)' : dimc; ctx.fillText(val, lx + lw, ly); }
    });
  }
  ascii(nodes, base, T, still) {
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const lines = [];
    const walk = (n, prefix, last, root) => {
      const conn = root ? '' : last ? '└── ' : '├── ';
      n.row = lines.length; n.c0 = root ? 0 : (n.depth - 1) * 4; lines.push({ n, pre: prefix + conn });
      n.kids.forEach((m, i) => walk(m, root ? '' : prefix + (last ? '    ' : '│   '), i === n.kids.length - 1, false));
    };
    walk(nodes[0], '', true, true);
    const fs = clamp(Math.floor(this.h / (lines.length + 1.2) / 0.92), 12, 24);
    ctx.font = `${fs}px ${FONT}`;
    const cw = ctx.measureText('M').width || fs * 0.5, chh = fs * 0.92, oy = (this.h - lines.length * chh) / 2;
    const V = Math.max(...lines.map(l => l.pre.length + l.n.label.length)) + 2;
    const pth = n => { if (!n.p) return [[0, 0]]; const P = pth(n.p).slice(); for (let r = n.p.row + 1; r <= n.row; r++) P.push([r, n.c0]); for (let c = 1; c <= 3; c++) P.push([n.row, n.c0 + c]); P.push([n.row, n.c0 + 4]); return P; };
    const hot = new Map();
    nodes.filter(n => !n.kids.length && !n.dead).forEach((n, i) => {
      const P = pth(n), L = P.length + 10, idx = still ? Math.floor(P.length * (0.3 + i * 0.12)) % P.length : Math.floor(T * 13 + hash(i + 3) * 40) % L;
      if (idx < P.length) hot.set(P[idx][0] + ':' + P[idx][1], 1);
    });
    const deadRows = new Set(nodes.filter(n => n.dead).map(n => n.row));
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    const ch = (s, c, r, color, inv) => {
      const x = c * cw, y = oy + r * chh;
      if (inv) { ctx.fillStyle = color; ctx.fillRect(x, y + chh * 0.05, cw, chh * 0.95); ctx.fillStyle = '#000'; ctx.fillText(s, x, y); return; }
      ctx.fillStyle = color; ctx.fillText(s, x, y);
    };
    setGlow(this, rgba(base, 0.55));
    const B = rgba(base, 1), D = rgba(base, 0.45), G = 'rgba(120,110,95,0.6)', R = rgba(RED, 1);
    lines.forEach(({ n, pre }, r) => {
      const dead = deadRows.has(r);
      for (let c = 0; c < pre.length; c++) { if (pre[c] === ' ') continue; const own = c >= n.c0; ch(pre[c], c, r, dead && own ? (n.self ? rgba(RED, 0.7) : G) : D, hot.has(r + ':' + c)); }
      const lab = n.label, lc = n.self ? R : dead ? G : B;
      for (let i = 0; i < lab.length; i++) ch(lab[i], pre.length + i, r, lc, hot.has(r + ':' + (pre.length + i)) && i === 0);
      const val = n.self ? 'FAILED' : n.dead ? 'unreach' : n.ms ? n.ms + 'ms' : '';
      if (!val) return;
      const start = pre.length + lab.length + 1, vc = V + 8 - val.length;
      for (let c = start; c < vc - 1; c++) ch('.', c, r, rgba(base, 0.22));
      for (let i = 0; i < val.length; i++) ch(val[i], vc + i, r, n.self ? R : dead ? G : D);
    });
    ctx.shadowBlur = 0;
  }
}

/* ---------- HEATMAP (memory) ---------- */
function heatVal(day, hour, days) {
  const doy = 282 - (days - 1 - day);
  const season = Math.cos((doy - 215) / 365 * TAU), wx = hash(day * 1.7 + 4) * 2 - 1;
  if ((day === days - 61 && hour >= 3 && hour <= 8) || (day === days - 97 && hour >= 13 && hour <= 15)) return null;
  const diurnal = Math.exp(-((hour - 16) ** 2) / 14), night = Math.exp(-((hour - 4) ** 2) / 10);
  return 47 + season * 9 + diurnal * (9 + season * 6 + wx * 4) - night * 2 + wx * 3 + (hash(day * 31 + hour * 7) - 0.5) * 2.5;
}
const HPAL = [[16, 18, 22], [38, 44, 58], [96, 108, 136], [200, 212, 240], [255, 170, 62], [236, 52, 40]];
class Heatmap extends Fx {
  constructor() { super(); this.static = true; }
  draw() {
    const v = this.a('variant', 'dither'), days = this.n('days', 182), ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    if (v === 'ascii') {
      const rows = this.n('rows', 8), base = hex(this.a('color', '')) || AMBER, ramp = ' .:-=+*#%@';
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const cw = this.w / days, chh = this.h / rows, fs = Math.floor(Math.min(chh * 1.1, cw / 0.48));
      ctx.font = `${fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.shadowBlur = fs * 0.4;
      for (let d = 0; d < days; d++) for (let r = 0; r < rows; r++) {
        let s = 0, n = 0; const hs = 24 / rows;
        for (let hh = Math.floor(r * hs); hh < (r + 1) * hs; hh++) { const t = heatVal(d, hh, days); if (t != null) { s += t; n++; } }
        if (!n) continue;
        const t = s / n, u = clamp((t - 42) / 40, 0, 0.999), c = t > 74 ? RED : mix(mix(base, [0, 0, 0], 0.55), base, u);
        ctx.fillStyle = ctx.shadowColor = rgba(c, 1); ctx.fillText(ramp[Math.floor(u * ramp.length)], d * cw + cw / 2, r * chh + chh / 2);
      }
      ctx.shadowBlur = 0; return;
    }
    const k = this.n('px', 2), ow = Math.ceil(this.w / k), oh = Math.ceil(this.h / k), o = this.offscreen(ow, oh);
    const im = o.createImageData(ow, oh), D = im.data;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const t = heatVal(Math.floor(x / ow * days), Math.floor(y / oh * 24), days), i = (y * ow + x) * 4;
      if (t == null) { D[i + 3] = 0; continue; }
      const f = clamp((t - 40) / 45, 0, 0.999) * (HPAL.length - 1), j = Math.floor(f), c = HPAL[Math.min(HPAL.length - 1, j + (f - j > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
      D[i] = c[0]; D[i + 1] = c[1]; D[i + 2] = c[2]; D[i + 3] = 255;
    }
    o.putImageData(im, 0, 0); this.blit(ow, oh, k);
  }
}

/* ---------- WALLPAPER (Navi desktop) ---------- */
class Wallpaper extends Fx {
  constructor() { super(); this.static = true; }
  draw() {
    const k = 2, ow = Math.ceil(this.w / k), oh = Math.ceil(this.h / k), o = this.offscreen(ow, oh);
    const gr = o.createLinearGradient(0, 0, 0, oh); gr.addColorStop(0, '#2a2f3a'); gr.addColorStop(0.55, '#14171c'); gr.addColorStop(1, '#07080a');
    o.fillStyle = gr; o.fillRect(0, 0, ow, oh);
    o.strokeStyle = '#3a404c'; o.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y0 = oh * (0.05 + i * 0.06), y1 = oh * (0.02 + i * 0.09), sag = oh * (0.12 + i * 0.03);
      o.beginPath(); o.moveTo(-10, y0); o.quadraticCurveTo(ow * 0.5, y0 + sag * 2, ow + 10, y1); o.stroke();
    }
    const im = o.getImageData(0, 0, ow, oh), d = im.data, L = [[8, 9, 11], [16, 18, 22], [26, 29, 35], [40, 44, 52], [58, 63, 74]];
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const i = (y * ow + x) * 4, l = clamp(d[i + 2] / 80, 0, 0.999) * (L.length - 1), j = Math.floor(l), c = L[Math.min(L.length - 1, j + (l - j > BAYER[(y & 3) * 4 + (x & 3)] ? 1 : 0))];
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    o.putImageData(im, 0, 0); this.blit(ow, oh, k);
    const ctx = this.ctx; ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.font = `22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('present day, present time', this.w - 290, this.h - 44);
  }
}

/* ---------- CRT overlay ---------- */
class Crt extends HTMLElement {
  connectedCallback() {
    if (this.band) return;
    const s = parseFloat(this.getAttribute('strength') || '1');
    Object.assign(this.style, { display: 'block', position: 'relative', width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none' });
    const mk = css => { const d = document.createElement('div'); d.style.cssText = 'position:absolute;left:0;right:0;' + css; this.appendChild(d); return d; };
    mk(`top:0;bottom:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,${0.26 * s}) 0 1px,transparent 1px 3px)`);
    mk(`top:0;bottom:0;background:radial-gradient(ellipse at 50% 50%,transparent 58%,rgba(0,0,0,${0.55 * s}) 100%)`);
    this.band = mk('height:22%;top:0;background:linear-gradient(transparent,rgba(255,255,255,0.03),transparent)');
    this.fl = mk('top:0;bottom:0;background:rgba(255,255,255,0.025)');
    let last = 0;
    const loop = now => {
      this.raf = requestAnimationFrame(loop);
      const still = RM.matches || this.getAttribute('motion') === 'reduced';
      if (still) { this.band.style.display = 'none'; this.fl.style.opacity = 0.3; return; }
      if (now - last < 66) return; last = now;
      this.band.style.display = ''; this.band.style.transform = `translateY(${((now / 9000) % 1) * 560 - 110}%)`;
      this.fl.style.opacity = (0.25 + Math.random() * 0.75).toFixed(2);
    };
    this.raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() { cancelAnimationFrame(this.raf); this.band = null; this.innerHTML = ''; }
}

/* ---------- CONSOLE ---------- */
const lis = (offsetMin = 0) => {
  const d = new Date(Date.now() - offsetMin * 60000);
  return d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Lisbon', hour12: false });
};
const R_ = a => a[Math.floor(Math.random() * a.length)], rn = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const SEEDS = {
  healthy: [[41, 'boot +23d · all eyes open', 'dim'], [26, 'obilhete.pt 200 OK 86ms'], [18, 'temp 52°C'], [9, 'wifi -56dBm'], [3, 'postgres ok 3ms']],
  degraded: [[38, 'temp 60°C · warm', 'amber'], [12, 'noticias-pt DOWN', 'red'], [12, 'noticias-pt.me DOWN', 'red'], [7, 'obilhete 200 OK 41ms'], [2, 'wifi -61dBm', 'amber']],
  overheating: [[52, 'temp 70°C · warn', 'amber'], [31, 'temp 80°C · DANGER', 'red'], [24, 'throttle #1 · cpu slowed itself', 'red'], [11, 'throttle #2', 'red'], [6, 'outside 38°C', 'amber'], [1, 'throttle #3', 'red']],
};
function genEvent(sc) {
  const ok = [() => `obilhete 200 OK ${rn(38, 48)}ms`, () => `obilhete.pt 200 OK ${rn(80, 96)}ms`, () => `npm 200 OK ${rn(9, 15)}ms`, () => `postgres ok ${rn(2, 5)}ms`,
    () => `obilhete-scraper run · ${rn(180, 260)} items`, () => `wifi ${rn(-61, -55)}dBm`, () => `rx ${(Math.random() * 1.6 + 0.4).toFixed(1)}MB/s tx ${rn(200, 420)}KB/s`];
  const news = [() => `noticias-pt 200 OK ${rn(46, 58)}ms`, () => `noticias-pt.me 200 OK ${rn(88, 99)}ms`];
  if (sc === 'degraded') {
    if (Math.random() < 0.25) return R_([['noticias-pt DOWN · no answer 5000ms', 'red'], ['noticias-pt.me 502 bad gateway', 'red'], ['noticias-pt still DOWN · retry', 'red']]);
    return Math.random() < 0.2 ? [`temp ${rn(60, 62)}°C`] : [R_(ok)()];
  }
  if (sc === 'overheating') {
    if (Math.random() < 0.35) return R_([[`temp ${rn(83, 86)}°C · DANGER`, 'red'], ['throttle · clock 2.4 -> 1.1 GHz', 'red'], [`outside ${rn(37, 39)}°C`, 'amber'], [`load ${(2.4 + Math.random() * 0.6).toFixed(2)}`, 'amber']]);
    return [R_(ok)().replace(/(\d+)ms/, (m, n) => Math.round(n * 2.3) + 'ms')];
  }
  return Math.random() < 0.2 ? [`temp ${rn(51, 53)}°C`] : [R_(ok.concat(news))()];
}
const CCOL = { red: '#ef3b2f', amber: '#f2a43a' };
class Console extends HTMLElement {
  static get observedAttributes() { return ['scenario']; }
  connectedCallback() {
    if (this.box) return;
    Object.assign(this.style, { display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', width: '100%', height: '100%', overflow: 'hidden' });
    this.box = this; this.reset();
    this.iv = setInterval(() => this.step(), 28);
    this.keys = '';
    this.onKey = e => { this.keys = (this.keys + (e.key || '')).slice(-4).toLowerCase(); if (this.keys === 'lain') this.egg(); };
    window.addEventListener('keydown', this.onKey);
  }
  disconnectedCallback() { clearInterval(this.iv); window.removeEventListener('keydown', this.onKey); this.box = null; }
  attributeChangedCallback() { if (this.box) this.reset(); }
  get still() { return RM.matches || this.getAttribute('motion') === 'reduced'; }
  reset() {
    this.innerHTML = ''; this.cur = null; this.queue = [];
    const sc = this.getAttribute('scenario') || 'degraded';
    (SEEDS[sc] || SEEDS.degraded).forEach(([m, t, c]) => this.line(lis(m), t, c, true));
    this.wait = 30;
  }
  line(time, text, color, instant) {
    const el = document.createElement('div');
    el.style.cssText = 'white-space:pre;overflow:hidden;text-overflow:ellipsis;flex:none';
    const ts = document.createElement('span'); ts.textContent = time + ' '; ts.style.opacity = '0.45';
    const pr = document.createElement('span'); pr.textContent = '> ';
    const tx = document.createElement('span'); if (color === 'dim') tx.style.opacity = '0.55'; else if (CCOL[color]) tx.style.color = CCOL[color];
    el.append(ts, pr, tx); this.appendChild(el);
    const max = parseInt(this.getAttribute('rows') || '14', 10);
    while (this.children.length > max) this.removeChild(this.firstChild);
    if (instant || this.still) { tx.textContent = text; return; }
    this.cur = { tx, text, i: 0 };
    if (!this.cursor) { this.cursor = document.createElement('span'); this.cursor.style.cssText = 'display:inline-block;width:0.5em;height:0.85em;background:currentColor;vertical-align:-0.08em;margin-left:1px'; }
    el.appendChild(this.cursor);
  }
  step() {
    if (!this.box) return;
    if (this.cur) {
      const c = this.cur; c.i += 2; c.tx.textContent = c.text.slice(0, c.i);
      if (c.i >= c.text.length) { this.cur = null; this.wait = rn(40, 95); }
      return;
    }
    if (this.cursor) this.cursor.style.opacity = (Date.now() % 1000) < 550 ? '1' : '0';
    if (--this.wait > 0) return;
    const q = this.queue.shift() || (this.getAttribute('feed') === 'live' ? null : genEvent(this.getAttribute('scenario') || 'degraded'));
    if (!q) { this.wait = 10; return; }
    this.line(lis(), q[0], q[1]);
    if (this.still) this.wait = rn(60, 120);
  }
  push(text, level) { this.queue.push([text, level === 'alarm' ? 'red' : level === 'warn' ? 'amber' : level === 'dim' ? 'dim' : undefined]); }
  egg() {
    this.queue.push(['present day, present time.', 'red'], ['ahahahaha', 'red']);
    this.style.filter = 'invert(1)'; setTimeout(() => { this.style.filter = ''; }, 140);
  }
}

/* ---------- CLOCK & MARQUEE ---------- */
const LOAD = Date.now();
class Clock extends HTMLElement {
  connectedCallback() { this.style.display = 'inline'; this.upd(); clearInterval(this.iv); this.iv = setInterval(() => this.upd(), 1000); }
  disconnectedCallback() { clearInterval(this.iv); }
  upd() {
    const f = this.getAttribute('format') || 'time';
    if (f === 'uptime') {
      const s = Math.floor((23 * 86400 + 4 * 3600 + 12 * 60) + (Date.now() - LOAD) / 1000);
      const p = n => String(n).padStart(2, '0');
      this.textContent = `${Math.floor(s / 86400)}d ${p(Math.floor(s % 86400 / 3600))}:${p(Math.floor(s % 3600 / 60))}:${p(s % 60)}`; return;
    }
    const P = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date()).forEach(x => { P[x.type] = x.value; });
    const t = `${P.hour}:${P.minute}:${P.second}`, d = `${P.year}.${P.month}.${P.day}`;
    this.textContent = f === 'date' ? d : f === 'hm' ? `${P.hour}:${P.minute}` : f === 'datetime' ? `${d} ${t}` : t;
  }
}
class Marquee extends HTMLElement {
  static get observedAttributes() { return ['text']; }
  connectedCallback() {
    Object.assign(this.style, { display: 'block', overflow: 'hidden', whiteSpace: 'nowrap', width: '100%' });
    if (!this.inner) { this.inner = document.createElement('div'); this.inner.style.cssText = 'display:inline-block;will-change:transform'; this.appendChild(this.inner); this.x = 0; }
    this.build(); let last = performance.now();
    const loop = now => {
      this.raf = requestAnimationFrame(loop);
      const dt = (now - last) / 1000; last = now;
      if (RM.matches || this.getAttribute('motion') === 'reduced' || !this.uw) { this.inner.style.transform = 'none'; return; }
      this.x = (this.x + dt * parseFloat(this.getAttribute('speed') || '40')) % this.uw;
      this.inner.style.transform = `translateX(${-this.x}px)`;
    };
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(loop);
  }
  disconnectedCallback() { cancelAnimationFrame(this.raf); }
  attributeChangedCallback() { if (this.inner) this.build(); }
  build() {
    const t = (this.getAttribute('text') || '') + (this.getAttribute('sep') || '   //   ');
    this.inner.innerHTML = ''; const u = document.createElement('span'); u.textContent = t; this.inner.appendChild(u);
    for (let i = 0; i < 4; i++) { const c = u.cloneNode(true); this.inner.appendChild(c); }
    requestAnimationFrame(() => { this.uw = u.offsetWidth; });
  }
}

const def = (n, c) => { if (!customElements.get(n)) customElements.define(n, c); };
def('vault-ophanim', Ophanim); def('vault-wired', Wired); def('vault-heatmap', Heatmap); def('vault-wallpaper', Wallpaper);
def('vault-crt', Crt); def('vault-console', Console); def('vault-clock', Clock); def('vault-marquee', Marquee);
})();
