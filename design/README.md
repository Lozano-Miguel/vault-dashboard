# Handoff: vault dashboard, "Ophanim desktop" (direction 5a)

## Overview
A read-only live dashboard for **vault**, an old Lenovo mini-PC in a hot attic in Portugal that runs a few public websites. The look is a fake Win2000 / Lain "Navi" desktop. Its wallpaper is a giant pixel-art **ophanim**: concentric rotating wheels covered in eyes. The angel is the status display:

- **Each of the 7 outer eyes = one watched service.** Open means up. Shut, red and weeping means down.
- **Rotation speed = CPU load.**
- **Glow color = CPU temperature** (cold white → amber → red).
- The **center eye is vault itself**.

Real Win2000 windows float in front of the angel and hold the exact numbers. A ticker strip runs along the top.

**Read-only is a hard rule.** Nothing may look like an action: no close, minimize or maximize buttons, no restart or stop controls.

## About the design files
The files here are **design references built in HTML**. They show the intended look and behavior.

The brief says the production app is **plain HTML/CSS/JS with no framework and no build step**, so `vault-fx.js` is very close to production-ready. It holds every animated piece (angel, tree graph, console, ticker, clocks, CRT overlay, wallpaper) as vanilla custom elements. `vault-5a.html` is a static snapshot, with the values for the "degraded" scenario baked in. The real job is wiring live data into it (see **Data contract**) and building the views that aren't designed yet (phone, memory/history).

## Fidelity
**High-fidelity.** Colors, type, sizes, positions and motion are final for the desktop live view. Recreate them exactly.

**Not designed yet:** phone (portrait) layout, the history ("memory") view, and the angel and tree close-up sheets in this style. Earlier explorations of those pieces exist in other styles in the source design file.

---

## Screen: Live view (desktop)
**Canvas:** 1280 × 800, `#vault`, `overflow:hidden`, `position:relative`.
**Base font:** `Tahoma, Verdana, 'Segoe UI', sans-serif`, 11px, color `#000`. This is Win2000 chrome text.
**Stacking order, back to front:** wallpaper → angel → ticker → windows → CRT overlay.

### 1. Wallpaper (`<vault-wallpaper>`), full-bleed
- Drawn once at half resolution (2 CSS px per pixel) and scaled up with nearest-neighbour, so pixels stay crisp.
- Vertical gradient: `#2a2f3a` (0%) → `#14171c` (55%) → `#07080a` (100%).
- Five sagging "power line" cables, 1px `#3a404c`, quadratic curves across the top half.
- Everything is quantised to 5 grays with a 4×4 Bayer ordered dither: `#08090b #101216 #1a1d23 #282c34 #3a3f4a`.
- **Hidden easter egg:** the text "present day, present time" in VT323 22px at `rgba(255,255,255,0.035)`, right-aligned 290px from the right edge, baseline 44px from the bottom.

### 2. The angel (`<vault-ophanim variant="pixel" px="3" labels="1">`)
- Box: left 190, top 24, 900 × 776. The canvas is transparent and the wallpaper shows through.
- Attributes: `temp` (°C), `cpu` (%), `down` (comma-separated service ids), `motion` (`full` | `reduced`).
- Full geometry and behavior: see **Angel spec** below.

### 3. Ticker strip
- Position: top 0, left 0, right 0. Height 24. Background `rgba(0,0,0,0.82)`. Bottom border 1px `#2a2e36`.
- Layout: flex row, `align-items:center`, `gap:14px`, `padding:0 10px`. Font VT323 19px `#aab0ba`.
- Contents, left to right:
  1. **Status.** A 9×9 square plus the status text, both in the severity color (`#e9eef2` when OK, `#ef3b2f` when any service is down or temp ≥ 78°C).
  2. **Marquee** (`<vault-marquee speed="32">`). Takes the remaining space (`flex:1;min-width:0`), color `#6f7782`.
  3. `read-only · up <vault-clock format="uptime">`, color `#5f6771`.
  4. `<vault-clock format="datetime">` (`YYYY.MM.DD HH:MM:SS`, Europe/Lisbon), color `#aab0ba`.
- Status copy:
  - all up: `all systems operational`
  - N down: `{N} eyes closed · {first-down-id} down`
  - temp ≥ 78: `the attic is burning · {T}°C · throttling` (when throttle count > 0)
- Marquee copy: one item per service (`{id} 200 OK {ms}ms` or `{id} DOWN`), then `cpu {T}°C`, `outside {O}°C`, `wifi {dBm}dBm {q}%`, `load {l1} {l5} {l15}`, `↓ {rx} ↑ {tx}`, `7 eyes watching`. Items are joined with `   //   ` (3 spaces either side). The text loops seamlessly.

### 4. Windows
All windows use **Win2000 chrome** (see tokens). Absolute positions inside the 1280×800 canvas:

| Window | left | top | w × h | Title style |
|---|---|---|---|---|
| THERMAL.SYS | 16 | 38 | 262 × 214 | inactive |
| SYSTEM.EXE | 26 | 266 | 254 × 190 | inactive |
| WIRED.LNK | 16 | 590 | 440 × 196 | inactive |
| SERVICES.EXE | 994 | 38 | 270 × 246 | **alarm** if any service is down, otherwise inactive |
| README.TXT - Notepad | 1004 | 298 | 260 × 196 | inactive |
| cmd.exe · vault --tail | 900 | 540 | 364 × 246 | **active** |

The windows were placed to stay clear of the angel's outer wheel. Keep them clear if you resize anything: no window may cover the ring of service eyes.

**THERMAL.SYS** (gray dialog body, `padding:7px 6px 4px`, flex column, `gap:7px`)
- **Temperature readout:** VT323 84px, `line-height:0.8`, `padding:9px 10px 1px`, black background, sunken border. Text color and `text-shadow:0 0 10px <same>` follow **LCD temp color**. Content: `61°C`.
- **Two-column rows** (`grid-template-columns:62px 1fr`, `gap:2px 6px`): `Outside | 27°C · attic gap +34°` and `Throttled | 0 time(s) today`.
- **Progress bar:** height 13, padding 2, sunken. The fill width is `(T−30)/60` clamped to 0–100%. Fill is `repeating-linear-gradient(90deg, <bar temp color> 0 7px, transparent 7px 9px)`.
- **Scale line:** 10px `#404040`, spread to both edges: `30°` · `warn 70° · danger 80°` · `90°`.

**SYSTEM.EXE** (gray dialog body, grid `44px minmax(0,1fr) 66px`, `gap:6px`, `padding:8px 6px 4px`)
- CPU: bar (cpu %), then `18% · 0.42` (the 1-minute load)
- Memory: bar, then `5.2 / 7.9 GB`
- Disk: bar, then `90 / 235 GB`
- These bars are 11px tall with fill `repeating-linear-gradient(90deg,#2c3550 0 6px,transparent 6px 8px)`.
- Wi-Fi: `-58 dBm · 72% · only uplink` (spans 2 columns)
- Traffic: `↓ 1.2 MB/s   ↑ 340 KB/s`
- Uptime: `<vault-clock format="uptime">`, shown as `23d 04:12:07`, ticking every second.

**WIRED.LNK** (black sunken body)
- `<vault-wired variant="pixel" color="#c8ccd4">` with `inset:2px`. See **Wired spec**.

**SERVICES.EXE** (black sunken body, Win2000 list view)
- **Header row:** `Name | State | Resp.`. Columns are `minmax(0,1fr) 44px 50px`. Header cells use a raised bevel, `#d4d0c8` background, `padding:2px 5px`, and Resp. is right-aligned.
- **Rows:** VT323 17px, `line-height:1.3`. Each row has a 7×7 square icon (`#e8e8e8` up, `#d02a1e` down), the service id, `UP`/`DOWN`, then `{ms}ms` or `—`. Text is `#d0d0d0` when up and `#ff5a4a` when down.
- **Row order:** obilhete, noticias-pt, obilhete-scraper, npm, postgres, obilhete.pt, noticias-pt.me.

**README.TXT - Notepad** (white sunken body, VT323 17px, `line-height:1.1`, `white-space:pre-wrap`, `padding:4px 6px`, black text). The owner can change the copy:
```
vault
=====
old lenovo mini-pc in my attic, portugal.
runs obilhete.pt and noticias-pt.me.

this page only watches it.
it can't restart or touch anything.

summer afternoons are the bad part.
```
Don't give this window a Notepad menu bar (File/Edit…). It would suggest actions.

**cmd.exe · vault --tail** (black sunken body, `padding:4px 7px`, VT323 18px, `line-height:1.08`, `#c0c0c0`)
- First line: `C:\VAULT> tail -f events.log`, with 4px below it.
- Then `<vault-console rows="12">` fills the rest. See **Console spec**.

### 5. CRT overlay (`<vault-crt strength="0.45">`)
- Covers the canvas (`inset:0`) with `pointer-events:none` and `z-index:10`. Strength `s` = 0.45.
- **Scanlines:** `repeating-linear-gradient(0deg, rgba(0,0,0,.26·s) 0 1px, transparent 1px 3px)`
- **Vignette:** `radial-gradient(ellipse at 50% 50%, transparent 58%, rgba(0,0,0,.55·s) 100%)`
- **Roll band:** 22% of the height, `linear-gradient(transparent, rgba(255,255,255,.03), transparent)`. It travels top to bottom every 9 s.
- **Flicker:** a `rgba(255,255,255,.025)` layer whose opacity is randomised between 0.25 and 1 at about 15 fps.

---

## Win2000 chrome tokens
- **Frame:** `background:#d4d0c8; border:1px solid; border-color:#d4d0c8 #404040 #404040 #d4d0c8; box-shadow:inset 1px 1px 0 #fff, inset -1px -1px 0 #808080, 2px 2px 0 rgba(0,0,0,.4); padding:3px; box-sizing:border-box;` Laid out as a flex column.
- **Title bar:** height 18, `padding:0 3px`, `gap:5px`, Tahoma bold 11px. It starts with a 12×12 icon square (`#d4d0c8` with a 1px `#fff` border, or black for cmd.exe). **No caption buttons.**
  - Active: `linear-gradient(90deg,#23262f,#7d8396)`, text `#fff`
  - Inactive: `linear-gradient(90deg,#808080,#b5b5b5)`, text `#e6e3dc`
  - Alarm: `linear-gradient(90deg,#6e1010,#c0453c)`, text `#fff`
- **Sunken field:** `margin-top:3px; border:1px solid; border-color:#808080 #fff #fff #808080; box-shadow:inset 1px 1px 0 #404040;`
- **Raised (list view header):** `border:1px solid; border-color:#fff #808080 #808080 #fff;`

## Design tokens
**Signal colors.** These are the only colors that carry meaning. Red is reserved for alarms.
- Cold `#d6e2ff` / rgb(214,226,255): ≤ 50°C
- Amber `#ffaa3e` / rgb(255,170,62): 70°C
- Red `#ec3428` / rgb(236,52,40): ≥ 82°C
- Angel glow: linear interpolation cold→amber over 50–70°C, then amber→red over 70–82°C.
- Alarm text red `#ef3b2f` (ticker, console). Warn amber `#f2a43a` (console).

**Temperature mappings for the UI**
- LCD temp text: < 70 → `#e6ecff`; 70–79 → `#ffb347`; ≥ 80 → `#ff4a3a`
- Temp bar fill: < 70 → `#2c3550`; 70–79 → `#c47a12`; ≥ 80 → `#b3201a`
- Thresholds: warn 70°C, danger 80°C. The angel's "hot" effects start at 78°C.

**Neutrals:** canvas `#0b0c0e`; face `#d4d0c8`; shadow `#808080`; dark shadow `#404040`; highlight `#fff`; console text `#c0c0c0`; list text `#d0d0d0`; Wired lines `#c8ccd4`; ticker `#aab0ba` / `#6f7782` / `#5f6771`.

**Typography:** VT323 (Google Fonts) for all data, console and labels. System Tahoma/Verdana 11px for the chrome. No other fonts.

**Radii:** 0 everywhere. **Shadows:** only the 2px hard drop shadow on windows.

---

## Angel spec (`vault-ophanim`, in `vault-fx.js`)
- **Size.** `S = min(w,h)`. `R = 0.34·S` with labels on, or `0.43·S` without.
- **Outer wheel (services).** Radius R, tilted 0.48 rad about X. Drawn as a band of two lines at R ± 0.075R, with 63 radial ticks between them; ticks are skipped next to each eye.
  - It carries 7 eyes, each 0.2R wide, spaced evenly and starting at the top. Order: obilhete, noticias-pt, obilhete-scraper, npm, postgres, obilhete.pt, noticias-pt.me.
  - The whole wheel spins with phase `p0`.
- **Two inner wheels.**
  - Radius 0.7R. One is tilted +1.2 rad, the other −1.2 rad (each wobbles ±0.18). They precess about the Y axis (`p1`, and `p2 + π/2`).
  - Band of two lines at radius ±0.035R.
  - Each carries 9 small "watcher" eyes, 0.085R wide.
- **Center eye (vault).**
  - Width 0.36R.
  - Halo: a circle at 0.27R plus 36 rays, alternating 0.035R and 0.065R long. The halo rotates at −p0/2.
- **Depth.**
  - Orthographic projection. Eye size × (1 + z/4R).
  - Line alpha uses 4 depth buckets from 0.22 to 1.0.
  - Draw order: back half of the wheels, back eyes, halo and center eye, front half, front eyes.
- **Speed.** ω = 0.08 + (cpu/100)·1.4 rad/s. Then p0 += ω·dt, p1 += 0.7ω·dt, p2 += 0.55ω·dt.
- **Eye drawing.**
  - Almond made of two quadratic curves, half-height 0.3·w. It gets a dark fill (`#040506`) so it hides the lines behind it.
  - Iris: radius 0.22w, a 22% fill plus an outline, and an inner ring if w > 22px. Pupil radius is 0.42 of the iris (0.58 when hot). White glint at the upper-left.
  - Outline in the temperature color.
- **Blink.** Each eye blinks once per cycle of 4.5–9.5 s (seeded per eye). A blink lasts 160 ms and is V-shaped.
- **Down state.** Closed lid curve with 5 lashes, in red. Three red teardrops fall at about 0.45 cycles/s and fade as they drop.
- **Hot state (≥ 78°C).**
  - 8 jagged red veins in each eye. Iris tinted 40% toward red. Center eye fully bloodshot.
  - Glow alpha flickers between 0.65 and 1.0 at 18 Hz.
  - The whole angel trembles by ±0.3% of S.
- **Something down:** the center eye is 30% bloodshot.
- **Gaze priority.**
  1. The cursor, if it moved within the last 2.5 s. Track it anywhere on the page.
  2. The first failed eye, when anything is down. Every eye stares at it.
  3. Otherwise wander: a saccade jump every 2.4 s, completed in 70 ms.
  - The pupil offset is the direction to the target × min(1, distance / 0.5R), scaled to 0.15w horizontally and 0.08w vertically.
  - Smoothing: lerp 0.35 per frame toward the cursor, 0.22 otherwise.
- **Pixel rendering.**
  - Render the scene at 1/3 resolution into an offscreen canvas.
  - Apply a **two-level** 4×4 Bayer ordered dither on brightness. Each pixel becomes off, 48% of its hue, or 100% of its hue.
  - Upscale with `imageSmoothingEnabled=false`.
- **Labels.**
  - Drawn crisp on top of the upscaled image. VT323, size clamp(S/30, 13, 22) px.
  - Position: from each service eye, outward by 0.62w + 6. Text alignment follows the side of the wheel the eye is on.
  - Color: the temperature color at 75%. Down services are red and get a ` ✕` suffix.
- **Frame rate:** 30 fps. Shared scheduler, with a 9 ms per-frame budget across all canvases. Pauses offscreen (IntersectionObserver).

## Wired spec (`vault-wired variant="pixel"`)
- **Tree:** `vault → docker → homelab net → { npm, obilhete → obilhete.pt, noticias-pt → noticias-pt.me, obilhete-scraper, postgres }`
- **Columns.** Depths 0–4 sit at fractions `[0, .15, .30, .56, 1]` of the usable width.
- **Margins.** Left 18. Right = widest site label + 16. Top = 1.1 × font size. Bottom = 0.6 × font size.
- **Rows.** The 5 containers are spaced evenly. Each site sits at its parent's y. Depths 0–2 are centered vertically.
- **Rendering.**
  - Half resolution, nearest-neighbour upscale.
  - Elbow connectors (horizontal, vertical, horizontal), 1px in `#c8ccd4` at 75%.
  - Pulses: 2×2 white squares, 2 per edge, 0.55 cycles/s, phase-shifted by depth so they flow outward from vault.
- **Dead branches.** A down node, and everything below it, gets dotted `[1,2]` lines in `rgba(110,112,120,.45)`. The down node's own edge is red at 55%. Its box is a red ✕ and it gets no pulses.
- **Nodes.** 5×5 squares (vault is 7×7): outline and inner fill when alive, gray outline only when dead.
- **Labels.**
  - Font: VT323 at clamp(h/13, 13, 19) px.
  - Placement: depths 0–2 centered below the node, containers above-right, sites to the right.
  - Value after the label: `{ms}ms` dim, `DOWN` red, or `unreachable` gray.

## Console spec (`vault-console`)
- **Line format:** `HH:MM:SS > text`. Time is Europe/Lisbon at 45% opacity. Newest line at the bottom, at most 12 rows, older lines drop off.
- **Typing:** 2 characters every 28 ms (about 70 chars/s), with a blinking block cursor (0.5em wide).
- **Pace:** waits 1.1–2.7 s between events.
- **Levels:** `alarm` → `#ef3b2f`; `warn` → `#f2a43a`; `dim` → 55% opacity; otherwise the inherited color.
- **Production use:** set `feed="live"` to stop the fake generator, then call `el.push(text, level)` for each real event.
- **Event copy style:** `obilhete 200 OK 42ms`, `noticias-pt DOWN`, `noticias-pt.me 502 bad gateway`, `temp 61°C`, `temp 80°C · DANGER`, `throttle #2`, `wifi -61dBm`, `boot`.
- **Easter egg:** typing `lain` anywhere inverts the console for 140 ms. Then it prints `present day, present time.` and `ahahahaha` in red.

## Interactions & behavior
- **No clicks, no navigation, no actions.** The only interaction is the eyes following the cursor.
- **Refresh:** live values update every few seconds. Pass the new values as attributes and the elements redraw.
- **`prefers-reduced-motion`** (or `motion="reduced"`):
  - Everything renders one still frame. Eyes are open, the tree shows static pulses, the marquee stops, the CRT roll and flicker are off, and the console prints lines instantly with no typing.
  - The eyes still follow the cursor, because that motion is user-driven.
- **Clocks:** tick every second, in the Europe/Lisbon timezone.

## State / data contract
One JSON snapshot every few seconds is enough:
```json
{
  "cpu_temp": 61, "outside_temp": 27, "throttle_today": 0,
  "cpu_pct": 18, "load": [0.42, 0.51, 0.38],
  "ram_gb": [5.2, 7.9], "disk_gb": [90, 235], "boot_time": "2026-09-17T10:20:00Z",
  "wifi": { "dbm": -58, "quality": 72 }, "net": { "rx": "1.2 MB/s", "tx": "340 KB/s" },
  "services": [ { "id": "obilhete", "kind": "internal", "up": true, "ms": 42 }, "…7 total" ],
  "events": [ { "t": "14:20:44", "text": "noticias-pt DOWN", "level": "alarm" } ]
}
```
Where each field goes:
- `cpu_temp` → `vault-ophanim[temp]`, `vault-wired[temp]`, the LCD readout and bar, the tray colors, and the attic gap (`cpu_temp − outside_temp`)
- `cpu_pct` → `vault-ophanim[cpu]` and the CPU bar
- `services[].up === false` → added to `down="id1,id2"` on the angel and the Wired. Also drives the list rows, the SERVICES title bar (alarm) and the ticker status.
- `events` → `vault-console.push()`
- `boot_time` → uptime. `vault-clock format="uptime"` currently counts up from a hard-coded base; replace that base with `boot_time`.

**Reference scenarios** (switchable in the source design file):
- **healthy:** 52°C, outside 24, cpu 12%, everything up
- **degraded:** 61°C, outside 27, cpu 18%, noticias-pt and noticias-pt.me down. This is the snapshot in `vault-5a.html`.
- **overheating:** 84°C, outside 38, cpu 71%, throttled 3×, response times × 2.3

## Assets
No images. Everything is drawn in code (canvas and DOM). The only external asset is the VT323 font from Google Fonts. No icons. The tiny title-bar squares are CSS boxes.

## Files
- `vault-5a.html`: the static desktop reference at 1280×800. Open it directly in a browser, next to `vault-fx.js`.
- `vault-fx.js`: about 45 KB of vanilla JS with no dependencies. It defines `vault-ophanim`, `vault-wired`, `vault-console`, `vault-clock`, `vault-marquee`, `vault-crt`, `vault-wallpaper` and `vault-heatmap` (used later for the memory view).
- The source exploration, with all directions and the scenario/motion/CRT tweaks, is `Vault Dashboard Directions.dc.html` in the design project, option **5a**.

## Still to design
1. **Phone (portrait):** the angel and status must survive; windows probably become a vertical stack.
2. **Memory view:** dithered heatmap of CPU temperature (hour × date), timelines with day/week/month/6-month ranges, availability per service, and records.
3. **Close-up sheets** of the angel states and the tree in the 5a pixel style.
