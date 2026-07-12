// Built-in course grids (validated at module load) and vector car template
// drawers — smooth flat top-down cars rasterized to bitmaps, per the prototype.
import { createEmptyGrid, PIECES, validateCourse } from './courseModel'

export const CAR_CANVAS_SIZE = 512

export function stampCells(grid, cells) {
  for (const { row, col, piece, rotation = 0 } of cells) {
    grid[row][col] = { piece, rotation }
  }
  return grid
}

function courseFromCells(id, name, cells) {
  const grid = stampCells(createEmptyGrid(), cells)
  const check = validateCourse(grid)
  if (!check.ok) throw new Error(`Template ${id} invalid: ${check.error}`)
  return {
    id, name, grid, votes: 0,
    author: 'Wisconsin Racer', isTemplate: true, createdAt: 0,
  }
}

/** Rectangle loop rows 2–5, cols 3–12. Rot 90 = E–W corridor; rot 0 = N–S. */
const RING_CELLS = [
  { row: 2, col: 3, piece: PIECES.CURVE, rotation: 90 },
  ...[4, 5, 7, 9, 10, 11].map((col) => ({ row: 2, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 2, col: 6, piece: PIECES.START, rotation: 90 },
  { row: 2, col: 8, piece: PIECES.BOOST, rotation: 90 },
  { row: 2, col: 12, piece: PIECES.CURVE, rotation: 180 },
  ...[3, 4].map((row) => ({ row, col: 12, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 5, col: 12, piece: PIECES.CURVE, rotation: 270 },
  ...[11, 10, 9, 7, 6, 5, 4].map((col) => ({ row: 5, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 5, col: 8, piece: PIECES.PIT, rotation: 90 },
  { row: 5, col: 3, piece: PIECES.CURVE, rotation: 0 },
  ...[4, 3].map((row) => ({ row, col: 3, piece: PIECES.STRAIGHT, rotation: 0 })),
]

/** L-shaped loop around the isthmus. */
const CAPITOL_CELLS = [
  { row: 1, col: 2, piece: PIECES.CURVE, rotation: 90 },
  ...[3, 4, 6, 7].map((col) => ({ row: 1, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 1, col: 5, piece: PIECES.START, rotation: 90 },
  { row: 1, col: 8, piece: PIECES.CURVE, rotation: 180 },
  ...[2, 3, 4, 5].map((row) => ({ row, col: 8, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 6, col: 8, piece: PIECES.CURVE, rotation: 270 },
  ...[7, 6].map((col) => ({ row: 6, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 6, col: 5, piece: PIECES.CURVE, rotation: 0 },
  { row: 5, col: 5, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 4, col: 5, piece: PIECES.CURVE, rotation: 180 },
  ...[4, 3].map((col) => ({ row: 4, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 4, col: 2, piece: PIECES.CURVE, rotation: 0 },
  ...[3, 2].map((row) => ({ row, col: 2, piece: PIECES.STRAIGHT, rotation: 0 })),
]

/** Larger outer loop with interior obstacles (not on the path) and a boost run. */
const MAD_TOWN_CELLS = [
  { row: 1, col: 1, piece: PIECES.CURVE, rotation: 90 },
  ...[2, 3, 4, 6, 8, 9].map((col) => ({ row: 1, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 1, col: 7, piece: PIECES.RAMP, rotation: 90 },
  { row: 1, col: 5, piece: PIECES.START, rotation: 90 },
  { row: 1, col: 10, piece: PIECES.CURVE, rotation: 180 },
  ...[2, 3, 5, 6].map((row) => ({ row, col: 10, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 4, col: 10, piece: PIECES.BOOST, rotation: 0 },
  { row: 7, col: 10, piece: PIECES.CURVE, rotation: 270 },
  ...[9, 8, 6, 4, 3, 2].map((col) => ({ row: 7, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 7, col: 5, piece: PIECES.OIL, rotation: 90 },
  { row: 7, col: 7, piece: PIECES.BOOST, rotation: 90 },
  { row: 7, col: 1, piece: PIECES.CURVE, rotation: 0 },
  ...[6, 5, 3, 2].map((row) => ({ row, col: 1, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 4, col: 1, piece: PIECES.PIT, rotation: 0 },
  { row: 3, col: 4, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 3, col: 5, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 4, col: 6, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 5, col: 4, piece: PIECES.OBSTACLE, rotation: 0 },
]

/**
 * Circuit de Spa-Francorchamps (Belgium) adapted to the grid, run clockwise
 * like the real circuit: La Source hairpin (T1) at bottom-left, the
 * Eau Rouge/Raidillon uphill esses (S-bend + ramp), the flat-out Kemmel
 * straight (boost pads ≈ DRS zone), Les Combes (T5–7) at top-right, Malmedy
 * and Rivage (T8–9), the slippery Pouhon double-left (T10–11), Fagnes and
 * Campus (T12–14), Stavelot (T15), the Blanchimont blast (T16–17), and the
 * Bus Stop chicane (T18–19) onto the pit straight.
 */
const SPA_CELLS = [
  // Pit straight. The start rotation sets the race direction (its rotated
  // N edge): 270 launches west toward La Source, the real clockwise flow.
  { row: 9, col: 5, piece: PIECES.START, rotation: 270 },
  ...[4, 3, 2, 1].map((col) => ({ row: 9, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  // La Source hairpin (T1)
  { row: 9, col: 0, piece: PIECES.CURVE, rotation: 0 },
  { row: 8, col: 0, piece: PIECES.CURVE, rotation: 90 },
  { row: 8, col: 1, piece: PIECES.STRAIGHT, rotation: 90 },
  // Eau Rouge / Raidillon uphill esses (T2–4)
  { row: 8, col: 2, piece: PIECES.CURVE, rotation: 270 },
  { row: 7, col: 2, piece: PIECES.S_BEND, rotation: 0 },
  { row: 6, col: 2, piece: PIECES.RAMP, rotation: 0 },
  ...[5, 4, 3, 2].map((row) => ({ row, col: 2, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 1, col: 2, piece: PIECES.CURVE, rotation: 90 },
  // Kemmel straight — the flat-out DRS/speed-trap run
  ...[3, 6, 9].map((col) => ({ row: 1, col, piece: PIECES.BOOST, rotation: 90 })),
  ...[4, 5, 7, 8, 10].map((col) => ({ row: 1, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  // Les Combes chicane (T5–7)
  { row: 1, col: 11, piece: PIECES.CURVE, rotation: 270 },
  { row: 0, col: 11, piece: PIECES.CURVE, rotation: 90 },
  ...[12, 13].map((col) => ({ row: 0, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  // Malmedy (T8) into the downhill to Rivage
  { row: 0, col: 14, piece: PIECES.CURVE, rotation: 180 },
  ...[1, 2].map((row) => ({ row, col: 14, piece: PIECES.STRAIGHT, rotation: 0 })),
  // Rivage (T9)
  { row: 3, col: 14, piece: PIECES.CURVE, rotation: 270 },
  ...[13, 12].map((col) => ({ row: 3, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  // Pouhon double-left (T10–11)
  { row: 3, col: 11, piece: PIECES.CURVE, rotation: 90 },
  { row: 4, col: 11, piece: PIECES.STRAIGHT, rotation: 0 },
  // Fagnes into Campus (T12–14)
  { row: 5, col: 11, piece: PIECES.CURVE, rotation: 0 },
  ...[12, 13].map((col) => ({ row: 5, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 5, col: 14, piece: PIECES.CURVE, rotation: 180 },
  ...[6, 7].map((row) => ({ row, col: 14, piece: PIECES.STRAIGHT, rotation: 0 })),
  // Stavelot (T15) onto the Blanchimont blast (T16–17) — boosts point west
  // with travel; the oil slick sits mid-straight with room to brake after
  { row: 8, col: 14, piece: PIECES.CURVE, rotation: 270 },
  ...[13, 12].map((col) => ({ row: 8, col, piece: PIECES.BOOST, rotation: 270 })),
  { row: 8, col: 11, piece: PIECES.OIL, rotation: 90 },
  ...[10, 9, 8].map((col) => ({ row: 8, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  // Bus Stop chicane (T18–19) and the pit box before the line
  { row: 8, col: 7, piece: PIECES.CURVE, rotation: 90 },
  { row: 9, col: 7, piece: PIECES.CURVE, rotation: 270 },
  { row: 9, col: 6, piece: PIECES.PIT, rotation: 90 },
]

export const TEMPLATE_COURSES = [
  courseFromCells('tpl-ring-road', 'Ring Road', RING_CELLS),
  courseFromCells('tpl-capitol-loop', 'Capitol Loop', CAPITOL_CELLS),
  courseFromCells('tpl-mad-town-gp', 'Mad Town GP', MAD_TOWN_CELLS),
  courseFromCells('tpl-spa-francorchamps', 'Circuit de Spa-Francorchamps', SPA_CELLS),
]

/**
 * Flat top-down cars per the Figma prototype (smooth shapes, no pixel grid).
 * Each drawer paints centered in a size×size canvas with transparent background,
 * nose pointing up (north).
 */
function withCarSpace(ctx, size, drawBody) {
  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.scale(size / 512, size / 512)
  drawBody(ctx)
  ctx.restore()
}

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

function drawClassicRacer(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#1a1a1a'
    c.fillRect(-95, -95, 28, 55)
    c.fillRect(67, -95, 28, 55)
    c.fillRect(-95, 40, 28, 55)
    c.fillRect(67, 40, 28, 55)
    c.fillStyle = '#c0392b'
    fillRoundRect(c, -70, -120, 140, 240, 28)
    c.fillStyle = '#ffffff'
    c.fillRect(-12, -110, 24, 220)
    c.fillStyle = '#85c1e9'
    fillRoundRect(c, -40, -90, 80, 50, 12)
  })
}

function drawPickup(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#1a1a1a'
    c.fillRect(-100, -100, 30, 50)
    c.fillRect(70, -100, 30, 50)
    c.fillRect(-100, 60, 30, 50)
    c.fillRect(70, 60, 30, 50)
    c.fillStyle = '#2471a3'
    fillRoundRect(c, -75, -40, 150, 150, 16)
    c.fillStyle = '#1a5276'
    fillRoundRect(c, -75, -130, 150, 95, 16)
    c.fillStyle = '#85c1e9'
    fillRoundRect(c, -45, -115, 90, 45, 10)
    c.strokeStyle = '#154360'
    c.lineWidth = 6
    c.strokeRect(-60, -20, 120, 115)
  })
}

function drawF1(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#111111'
    c.fillRect(-95, -80, 55, 26)
    c.fillRect(40, -80, 55, 26)
    c.fillRect(-95, 50, 55, 26)
    c.fillRect(40, 50, 55, 26)
    c.fillStyle = '#e74c3c'
    fillRoundRect(c, -80, -150, 160, 24, 8)
    fillRoundRect(c, -80, 120, 160, 24, 8)
    c.fillStyle = '#1c1c1c'
    fillRoundRect(c, -35, -140, 70, 280, 12)
    c.fillStyle = '#e74c3c'
    c.fillRect(-12, -60, 24, 140)
    c.fillStyle = '#85c1e9'
    fillRoundRect(c, -25, -100, 50, 35, 8)
  })
}

function drawBug(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#1a1a1a'
    c.fillRect(-95, -60, 26, 45)
    c.fillRect(69, -60, 26, 45)
    c.fillRect(-95, 30, 26, 45)
    c.fillRect(69, 30, 26, 45)
    c.fillStyle = '#f4d03f'
    fillRoundRect(c, -80, -100, 160, 200, 70)
    c.fillStyle = '#85c1e9'
    fillRoundRect(c, -50, -70, 100, 45, 20)
    c.strokeStyle = '#d4ac0d'
    c.lineWidth = 5
    c.beginPath()
    c.moveTo(0, -15)
    c.lineTo(0, 95)
    c.stroke()
  })
}

function drawMonster(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#111111'
    c.fillRect(-115, -100, 40, 70)
    c.fillRect(75, -100, 40, 70)
    c.fillRect(-115, 30, 40, 70)
    c.fillRect(75, 30, 40, 70)
    c.fillStyle = '#1e8449'
    fillRoundRect(c, -85, -110, 170, 220, 20)
    c.fillStyle = '#145a32'
    fillRoundRect(c, -85, 40, 170, 70, 20)
    c.fillStyle = '#85c1e9'
    fillRoundRect(c, -50, -90, 100, 50, 12)
  })
}

export const CAR_TEMPLATES = [
  { id: 'car-blank', name: 'Blank Canvas', draw: null },
  { id: 'car-classic', name: 'Classic Racer', draw: drawClassicRacer },
  { id: 'car-pickup', name: 'Pickup Truck', draw: drawPickup },
  { id: 'car-f1', name: 'F1 Open-Wheel', draw: drawF1 },
  { id: 'car-bug', name: "Lil' Bug", draw: drawBug },
  { id: 'car-monster', name: 'Monster Truck', draw: drawMonster },
]

/** Rasterize a template (or blank) to a PNG data URL. */
export function renderCarTemplateToDataUrl(templateId) {
  const canvas = document.createElement('canvas')
  canvas.width = CAR_CANVAS_SIZE
  canvas.height = CAR_CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  const template = CAR_TEMPLATES.find((t) => t.id === templateId)
  if (template?.draw) template.draw(ctx, CAR_CANVAS_SIZE)
  return canvas.toDataURL('image/png')
}
