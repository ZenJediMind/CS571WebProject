// Single source of truth for a course's racing "Setting": its terrain look,
// track-accent tints, and grip. Every consumer (renderer, engine, builder,
// thumbnails) resolves a theme by course.theme via getTheme().
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

/* ---------- shared terrain helpers (DRY across drawTerrain drawers) ---------- */

function fillBase(ctx, width, height, color) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
}

/** Horizontal bands every `period` cells — mowing stripes, ripples, berms. */
function stripeBands(ctx, width, height, cellSize, color, period = 2) {
  ctx.fillStyle = color
  for (let row = 0; row < Math.ceil(height / cellSize); row += period) {
    ctx.fillRect(0, row * cellSize, width, cellSize)
  }
}

/** Deterministic scattered flecks; seeded so redraws are identical. */
function speckle(ctx, width, height, { seed, count, colors, min, max }) {
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const x = rand() * width
    const y = rand() * height
    const size = min + rand() * (max - min)
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.fillRect(x, y, size, size)
  }
}

/* ---------- per-theme terrain drawers ---------- */

function drawCircuit(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#3a7d2c')
  stripeBands(ctx, width, height, cellSize, '#34702795' /* darker mow row */, 2)
  // Faint brighter highlight stripe offset by one row for a groomed look.
  ctx.globalAlpha = 0.5
  stripeBands(ctx, width, height, cellSize, '#40892f', 2)
  ctx.globalAlpha = 1
}

function drawRally(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#2f5233')
  stripeBands(ctx, width, height, cellSize, '#355a2e', 2)
  speckle(ctx, width, height, { seed: 0x2f52, count: 900, colors: ['#24401f', '#1c3218', '#3c5a2c'], min: 2, max: 6 })
}

function drawDesert(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#d9b678')
  ctx.globalAlpha = 0.6
  stripeBands(ctx, width, height, cellSize, '#cfa968', 1)
  ctx.globalAlpha = 1
  speckle(ctx, width, height, { seed: 0xde57, count: 700, colors: ['#b48a55', '#8a6a44', '#e6c893'], min: 1, max: 4 })
}

function drawMotocross(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#a5622f')
  stripeBands(ctx, width, height, cellSize, '#8f4f24', 2)
  speckle(ctx, width, height, { seed: 0x3c05, count: 1100, colors: ['#6e3c1c', '#4d2913', '#b87038'], min: 2, max: 5 })
}

function drawNight(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#171a24')
  stripeBands(ctx, width, height, cellSize, '#1d2130', 2)
  // Sparse neon "lights" scattered around the environment.
  speckle(ctx, width, height, { seed: 0x1817, count: 90, colors: ['#ff3b8b', '#22d3ee', '#f7a600'], min: 2, max: 4 })
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
