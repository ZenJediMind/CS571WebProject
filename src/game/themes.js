// Single source of truth for a course's racing "Setting": its terrain look,
// track-accent tints, and grip. Every consumer (renderer, engine, builder,
// thumbnails) resolves a theme by course.theme via getTheme().
//
// Terrain is drawn as a small procedural *world* per biome — a groomed pitch,
// a pine forest, wind-rippled dunes, churned clay, a lit city — layered from
// cheap canvas primitives. Every random placement is seeded with mulberry32,
// so a course paints identically on every redraw and the build stays
// deterministic (no image assets, no Math.random).
import { mulberry32 } from './rng'

export const DEFAULT_THEME_ID = 'circuit'

// Iconic red/white kerbs and asphalt are shared defaults; a theme overrides
// only what differs. `margin` is the run-off/shoulder ribbon drawn under the
// kerbs by drawTrackPiece, so it hugs every piece.
const BASE_TRACK = {
  road: '#4a4d55',
  curbRed: '#c5050c',
  curbWhite: '#f2f2f2',
  dash: '#e8e8e8',
  margin: '#cbb784',
}

/* ---------- shared terrain primitives (DRY across the drawTerrain drawers) ---------- */

function fillBase(ctx, width, height, color) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
}

/** Soft radial darkening at the edges to frame the scene and add depth. */
function vignette(ctx, width, height, strength) {
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.34,
    width / 2, height / 2, Math.max(width, height) * 0.72,
  )
  grad.addColorStop(0, 'rgba(0,0,0,0)')
  grad.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)
}

/** Large translucent ellipses — low-frequency ground relief: cloud shadows,
 *  forest clearings, dune crests, clay berms. */
function valueBlobs(ctx, width, height, { seed, count, colors, rMin, rMax, alpha }) {
  const rand = mulberry32(seed)
  ctx.save()
  ctx.globalAlpha = alpha
  for (let i = 0; i < count; i++) {
    const rx = rMin + rand() * (rMax - rMin)
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.beginPath()
    ctx.ellipse(rand() * width, rand() * height, rx, rx * (0.45 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** Place props on a jittered grid — fuller, more even coverage than pure
 *  random, with organic gaps via `skip`. Calls draw(ctx, x, y, rand) each. */
function scatterProps(ctx, width, height, { seed, spacing, jitter = 0.7, skip = 0 }, draw) {
  const rand = mulberry32(seed)
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      if (rand() < skip) continue
      const px = x + (rand() - 0.5) * spacing * jitter
      const py = y + (rand() - 0.5) * spacing * jitter
      draw(ctx, px, py, rand)
    }
  }
}

/** Factory for tiny scatter-prop drawers (turf tufts, clay clods, gravel). */
function fleckDrawer(palette, maxSize) {
  return (ctx, x, y, rand) => {
    ctx.fillStyle = palette[Math.floor(rand() * palette.length)]
    const size = 1 + rand() * maxSize
    ctx.fillRect(x, y, size, size)
  }
}

/** Radial color bloom for floodlights / neon glow. */
function radialGlow(ctx, x, y, radius, color) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius)
  grad.addColorStop(0, color)
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
}

/* ---------- biome props ---------- */

/** Top-down conifer: soft ground shadow + three stacked canopy tiers. */
function drawPine(ctx, x, y, rand) {
  const r = 7 + rand() * 8
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath()
  ctx.ellipse(x + r * 0.35, y + r * 0.5, r * 0.95, r * 0.5, 0, 0, Math.PI * 2)
  ctx.fill()
  // Two tint families so a stand of pines varies dark base → lit crown.
  const greens = rand() < 0.5 ? ['#1f3d1a', '#2b5222', '#356a2b'] : ['#1d3a19', '#2f5a26', '#3d7530']
  for (let tier = 0; tier < 3; tier++) {
    const scale = 1 - tier * 0.24
    ctx.fillStyle = greens[tier]
    ctx.beginPath()
    ctx.moveTo(x, y - r * (0.6 + tier * 0.52))
    ctx.lineTo(x - r * scale, y - r * 0.1 + tier * 3)
    ctx.lineTo(x + r * scale, y - r * 0.1 + tier * 3)
    ctx.closePath()
    ctx.fill()
  }
}

/** Sun-lit boulder: drop shadow, rounded body, top highlight. */
function drawRock(ctx, x, y, rand) {
  const r = 3 + rand() * 6
  ctx.fillStyle = 'rgba(0,0,0,0.16)'
  ctx.beginPath()
  ctx.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.6, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = rand() < 0.5 ? '#8a7256' : '#9c8461'
  ctx.beginPath()
  ctx.ellipse(x, y, r, r * 0.72, rand() * Math.PI, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.18)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.25, y - r * 0.25, r * 0.42, r * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()
}

/* ---------- procedural night city (street grid → blocks → buildings) ---------- */

/** Road-center positions across an extent: semi-regular avenues with jitter,
 *  so the whole map shares one connected street grid. */
function avenues(extent, nominal, rand) {
  const centers = [0]
  let pos = 0
  while (pos < extent) {
    pos += nominal * (0.68 + rand() * 0.7)
    centers.push(Math.min(Math.round(pos), extent))
  }
  return centers
}

/** Recursively split a block along its longer side into packed building lots
 *  (binary space partition). A real city block subdivides into abutting plots;
 *  it does not scatter free-floating boxes. */
function subdivideLots(rect, rand, minSize, out) {
  const splitWidthwise = rect.w >= rect.h
  const longSide = splitWidthwise ? rect.w : rect.h
  if (longSide < minSize * 2 || (longSide < minSize * 3.2 && rand() < 0.4)) {
    out.push(rect)
    return
  }
  const cut = Math.round(longSide * (0.36 + rand() * 0.28))
  if (splitWidthwise) {
    subdivideLots({ x: rect.x, y: rect.y, w: cut, h: rect.h }, rand, minSize, out)
    subdivideLots({ x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }, rand, minSize, out)
  } else {
    subdivideLots({ x: rect.x, y: rect.y, w: rect.w, h: cut }, rand, minSize, out)
    subdivideLots({ x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut }, rand, minSize, out)
  }
}

/** One building footprint: rooftop toned by "height", a catch-light on its
 *  north edge, a crisp seam against neighbors/street, and a regular grid of
 *  lit windows in a single warm or cool cast. */
function drawBuilding(ctx, { x, y, w, h }, rand) {
  const iw = w - 3
  const ih = h - 3
  if (iw < 5 || ih < 5) return
  const bx = x + 1.5
  const by = y + 1.5
  const height = rand()
  ctx.fillStyle = height < 0.34 ? '#1e2438' : height < 0.68 ? '#262e46' : '#303c58'
  ctx.fillRect(bx, by, iw, ih)
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(bx, by, iw, 1.5)
  ctx.strokeStyle = 'rgba(9,11,17,0.9)'
  ctx.lineWidth = 1
  ctx.strokeRect(bx + 0.5, by + 0.5, iw - 1, ih - 1)
  // Per-building lit fraction: most windows dark, a few towers ablaze.
  const litChance = 0.12 + rand() * 0.4
  ctx.fillStyle = rand() < 0.6 ? 'rgba(247,201,122,0.85)' : 'rgba(126,214,240,0.78)'
  for (let wy = by + 3; wy < by + ih - 2; wy += 5) {
    for (let wx = bx + 3; wx < bx + iw - 2; wx += 5) {
      if (rand() < litChance) ctx.fillRect(wx, wy, 1.7, 1.7)
    }
  }
}

/** A dark park / plaza filling a whole block — negative space between the
 *  built-up blocks, with a few faint tree crowns. */
function drawParkBlock(ctx, { x, y, w, h }, rand) {
  ctx.fillStyle = '#16241a'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = 'rgba(120,180,120,0.22)'
  const trees = Math.floor((w * h) / 340)
  for (let i = 0; i < trees; i++) ctx.fillRect(x + rand() * w, y + rand() * h, 2, 2)
}

/* ---------- flowing line fields ---------- */

/** Sinuous wind ripples flowing across the sand (not straight rows). */
function windRipples(ctx, width, height, { seed, count, color, alpha }) {
  const rand = mulberry32(seed)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const baseY = rand() * height
    const amp = 5 + rand() * 13
    const wavelength = 90 + rand() * 130
    const phase = rand() * Math.PI * 2
    const startX = rand() * width * 0.5
    const len = width * (0.4 + rand() * 0.6)
    ctx.beginPath()
    for (let x = 0; x <= len; x += 8) {
      const y = baseY + Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp
      if (x === 0) ctx.moveTo(startX, y)
      else ctx.lineTo(startX + x, y)
    }
    ctx.stroke()
  }
  ctx.restore()
}

/** Short curved gouges — tire ruts churned into a dirt surface. */
function rutArcs(ctx, width, height, { seed, count, color, alpha }) {
  const rand = mulberry32(seed)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  for (let i = 0; i < count; i++) {
    const radius = 30 + rand() * 90
    const start = rand() * Math.PI * 2
    ctx.lineWidth = 2 + rand() * 3
    ctx.beginPath()
    ctx.arc(rand() * width, rand() * height, radius, start, start + 0.6 + rand() * 1.2)
    ctx.stroke()
  }
  ctx.restore()
}

/** Diagonal mown bands — a groomed pitch, cut at an angle like real turf. */
function mowingStripes(ctx, width, height, { angle, bandWidth, colorA, colorB, alpha }) {
  const diag = Math.hypot(width, height)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(width / 2, height / 2)
  ctx.rotate(angle)
  let band = 0
  for (let x = -diag; x < diag; x += bandWidth, band++) {
    ctx.fillStyle = band % 2 === 0 ? colorA : colorB
    ctx.fillRect(x, -diag, bandWidth, diag * 2)
  }
  ctx.restore()
}

/* ---------- per-theme terrain drawers ---------- */

function drawCircuit(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#3a7d2c')
  mowingStripes(ctx, width, height, {
    angle: -0.32, bandWidth: cellSize * 0.9, colorA: '#3f8830', colorB: '#347027', alpha: 0.55,
  })
  valueBlobs(ctx, width, height, { seed: 0x3a7d, count: 14, colors: ['#2f6a24', '#43902f'], rMin: 70, rMax: 150, alpha: 0.2 })
  scatterProps(ctx, width, height, { seed: 0x7d2c, spacing: cellSize * 0.85, skip: 0.55 },
    fleckDrawer(['rgba(31,74,26,0.5)', 'rgba(70,130,50,0.45)'], 2))
  vignette(ctx, width, height, 0.22)
}

function drawRally(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#2f5233')
  valueBlobs(ctx, width, height, { seed: 0x2f52, count: 22, colors: ['#365c30', '#294826', '#3f6a35'], rMin: 60, rMax: 150, alpha: 0.28 })
  scatterProps(ctx, width, height, { seed: 0xf07e, spacing: cellSize * 0.8, jitter: 0.85, skip: 0.14 }, drawPine)
  vignette(ctx, width, height, 0.3)
}

function drawDesert(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#d9b678')
  valueBlobs(ctx, width, height, { seed: 0xde57, count: 22, colors: ['#c9a566', '#e6cc92'], rMin: 80, rMax: 190, alpha: 0.32 })
  windRipples(ctx, width, height, { seed: 0x0d17, count: 90, color: '#b8945c', alpha: 0.4 })
  windRipples(ctx, width, height, { seed: 0x0d18, count: 55, color: '#e6d3a2', alpha: 0.3 })
  scatterProps(ctx, width, height, { seed: 0x0c04, spacing: cellSize * 1.4, skip: 0.5 }, drawRock)
  vignette(ctx, width, height, 0.24)
}

function drawMotocross(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#a5622f')
  valueBlobs(ctx, width, height, { seed: 0x3c05, count: 34, colors: ['#8f4f24', '#b8703a', '#743d1c'], rMin: 65, rMax: 175, alpha: 0.32 })
  rutArcs(ctx, width, height, { seed: 0x3c06, count: 80, color: '#5c3318', alpha: 0.32 })
  scatterProps(ctx, width, height, { seed: 0x3c07, spacing: cellSize * 0.7, skip: 0.45 },
    fleckDrawer(['#6e3c1c', '#4d2913', '#5c3318'], 4))
  vignette(ctx, width, height, 0.26)
}

function drawNight(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#171a24')
  const rand = mulberry32(0x1817)
  const roadWidth = Math.max(6, Math.round(cellSize * 0.3))
  const xs = avenues(width, cellSize * 2.1, rand)
  const ys = avenues(height, cellSize * 2.0, rand)
  // Asphalt street grid connecting across the whole map.
  ctx.fillStyle = '#1b2030'
  for (const cx of xs) ctx.fillRect(cx - roadWidth / 2, 0, roadWidth, height)
  for (const cy of ys) ctx.fillRect(0, cy - roadWidth / 2, width, roadWidth)
  // Each block between avenues subdivides into packed, connected buildings.
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const block = {
        x: xs[i] + roadWidth / 2,
        y: ys[j] + roadWidth / 2,
        w: xs[i + 1] - xs[i] - roadWidth,
        h: ys[j + 1] - ys[j] - roadWidth,
      }
      if (block.w < 8 || block.h < 8) continue
      if (rand() < 0.12) {
        drawParkBlock(ctx, block, rand)
        continue
      }
      const lots = []
      subdivideLots(block, rand, cellSize * 0.5, lots)
      for (const lot of lots) drawBuilding(ctx, lot, rand)
    }
  }
  // Streetlights strung along the avenues.
  ctx.fillStyle = 'rgba(255,214,140,0.55)'
  for (const cx of xs) for (let y = roadWidth; y < height; y += cellSize) ctx.fillRect(cx - 1, y - 1, 2, 2)
  for (const cy of ys) for (let x = roadWidth; x < width; x += cellSize) ctx.fillRect(x - 1, cy - 1, 2, 2)
  // Neon / stadium glow accents over the skyline.
  const glow = mulberry32(0xf10d)
  for (const color of ['rgba(255,59,139,0.15)', 'rgba(34,211,238,0.15)', 'rgba(247,166,0,0.13)']) {
    radialGlow(ctx, glow() * width, glow() * height, 120 + glow() * 90, color)
  }
  vignette(ctx, width, height, 0.52)
}

export const THEMES = [
  { id: 'circuit', name: 'Grand Prix', emoji: '🏁', grip: 1.0,
    track: { ...BASE_TRACK }, drawTerrain: drawCircuit },
  { id: 'rally', name: 'Rally Forest', emoji: '🌲', grip: 0.9,
    track: { ...BASE_TRACK, margin: '#5a4632' }, drawTerrain: drawRally },
  { id: 'desert', name: 'Desert Rally', emoji: '🏜️', grip: 0.85,
    track: { ...BASE_TRACK, margin: '#b8925a' }, drawTerrain: drawDesert },
  { id: 'motocross', name: 'Motocross', emoji: '🏍️', grip: 0.82,
    track: { ...BASE_TRACK, margin: '#5c3318' }, drawTerrain: drawMotocross },
  { id: 'night', name: 'Night Street', emoji: '🌃', grip: 1.0,
    track: { ...BASE_TRACK, road: '#2a2d3a', dash: '#22d3ee', margin: '#2a2f40' }, drawTerrain: drawNight },
]

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))

export function getTheme(id) {
  return THEME_BY_ID.get(id) ?? THEME_BY_ID.get(DEFAULT_THEME_ID)
}
