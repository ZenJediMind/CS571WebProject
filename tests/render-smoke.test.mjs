// Headless smoke test for the themed renderer. render.js and themes.js are
// DOM-free at import; here we drive their draw paths with a recording stub
// 2D context to prove every theme's terrain and every piece render without
// throwing and paint their expected base color. Pixel aesthetics still need a
// human glance in the browser — this guards the code paths, not the art.
import test from 'node:test'
import assert from 'node:assert/strict'
import { THEMES } from '../src/game/themes.js'
import { drawTrackPiece, drawCourseInto } from '../src/game/render.js'
import { PIECES, createEmptyGrid } from '../src/game/courseModel.js'

/** No-op Canvas 2D stand-in that records every fillRect with its fillStyle. */
function makeCtx() {
  const noop = () => {}
  return {
    fills: [],
    fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1,
    lineCap: '', lineJoin: '', globalAlpha: 1, font: '',
    textAlign: '', textBaseline: '', globalCompositeOperation: '',
    fillRect(x, y, w, h) { this.fills.push({ style: this.fillStyle, x, y, w, h }) },
    strokeRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arc: noop,
    ellipse: noop, bezierCurveTo: noop, quadraticCurveTo: noop, closePath: noop,
    fill: noop, stroke: noop, save: noop, restore: noop, translate: noop,
    rotate: noop, scale: noop, setLineDash: noop, roundRect: noop,
    fillText: noop, strokeText: noop, clearRect: noop, drawImage: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
  }
}

const EXPECTED_BASE = {
  circuit: '#3a7d2c', rally: '#2f5233', desert: '#d9b678',
  motocross: '#a5622f', night: '#171a24',
}

test('every theme paints a full-canvas base in its own color', () => {
  const W = 320, H = 200
  const basesSeen = new Set()
  for (const theme of THEMES) {
    const ctx = makeCtx()
    assert.doesNotThrow(() => theme.drawTerrain(ctx, W, H, 40), `${theme.id} drawTerrain threw`)
    const fullFill = ctx.fills.find((f) => f.x === 0 && f.y === 0 && f.w === W && f.h === H)
    assert.ok(fullFill, `${theme.id} never filled the full canvas`)
    assert.equal(fullFill.style, EXPECTED_BASE[theme.id], `${theme.id} base color`)
    basesSeen.add(EXPECTED_BASE[theme.id])
  }
  assert.equal(basesSeen.size, THEMES.length, 'each theme has a distinct base color')
})

test('every piece renders under every theme without throwing', () => {
  for (const theme of THEMES) {
    for (const piece of Object.values(PIECES)) {
      const ctx = makeCtx()
      assert.doesNotThrow(
        () => drawTrackPiece(ctx, piece, 90, 0, 0, 64, theme),
        `${theme.id} / ${piece} threw`,
      )
    }
  }
})

test('drawCourseInto paints terrain then a mixed grid for a theme', () => {
  const grid = createEmptyGrid()
  grid[0][0] = { piece: PIECES.START, rotation: 0 }
  grid[0][1] = { piece: PIECES.CURVE, rotation: 90 }
  grid[1][0] = { piece: PIECES.BOOST, rotation: 0 }
  grid[1][1] = { piece: PIECES.OIL, rotation: 0 }
  grid[2][2] = { piece: PIECES.RAMP, rotation: 0 }
  const rally = THEMES.find((t) => t.id === 'rally')
  const ctx = makeCtx()
  assert.doesNotThrow(() => drawCourseInto(ctx, grid, 64, rally))
  const base = ctx.fills.find((f) => f.x === 0 && f.y === 0)
  assert.equal(base.style, EXPECTED_BASE.rally, 'terrain painted first with the theme base')
})
