// Canvas drawing for tracks and race frames. Piece art is flat vector:
// asphalt ribbon, red/white curbs, dashed centerline, checkered start,
// cheddar boost chevrons, barrier obstacles, blue pit box.
import { CELL_SIZE, GRID_COLS, GRID_ROWS, PIECES } from './courseModel'

export const COURSE_WIDTH = GRID_COLS * CELL_SIZE // 1024
export const COURSE_HEIGHT = GRID_ROWS * CELL_SIZE // 640

const COLORS = {
  grassLight: '#3a7d2c',
  grassDark: '#346f27',
  road: '#4a4d55',
  curbRed: '#c5050c',
  curbWhite: '#f2f2f2',
  dash: '#e8e8e8',
  boost: '#f7a600',
  obstacleSand: '#c8b273',
  barrierOrange: '#e67e22',
  barrierWhite: '#fdfefe',
  pitBlue: '#2471a3',
  checkpoint: '#f7a600',
}

const ROAD_WIDTH_RATIO = 0.72
const DASH_PATTERN_RATIO = [0.14, 0.12] // dash, gap — relative to cell size

/**
 * Build the piece's centerline as a path in local cell space
 * (origin at cell center, rotation already applied by the caller).
 * Rotation 0: STRAIGHT-family runs N–S, CURVE opens N+E.
 */
function tracePieceCenterline(ctx, piece, half) {
  ctx.beginPath()
  if (piece === PIECES.CURVE) {
    // Quarter arc around the NE corner, from the N edge to the E edge
    ctx.arc(half, -half, half, Math.PI / 2, Math.PI)
  } else if (piece === PIECES.S_BEND) {
    const sway = half * 0.55
    ctx.moveTo(0, -half)
    ctx.bezierCurveTo(-sway, -half * 0.4, sway, half * 0.4, 0, half)
  } else {
    ctx.moveTo(0, -half)
    ctx.lineTo(0, half)
  }
}

function drawCheckerBand(ctx, roadWidth, squares = 8, rows = 2) {
  const square = roadWidth / squares
  for (let row = 0; row < rows; row++) {
    for (let i = 0; i < squares; i++) {
      ctx.fillStyle = (i + row) % 2 === 0 ? '#111111' : '#ffffff'
      ctx.fillRect(-roadWidth / 2 + i * square, (row - rows / 2) * square, square, square)
    }
  }
}

function drawBoostChevrons(ctx, half) {
  ctx.strokeStyle = COLORS.boost
  ctx.lineWidth = half * 0.16
  ctx.lineCap = 'round'
  const width = half * 0.4
  for (const offset of [-0.3, 0.05, 0.4]) {
    const tipY = offset * half
    ctx.beginPath()
    ctx.moveTo(-width, tipY + width)
    ctx.lineTo(0, tipY)
    ctx.lineTo(width, tipY + width)
    ctx.stroke()
  }
}

function drawObstacleCell(ctx, half) {
  ctx.fillStyle = COLORS.obstacleSand
  ctx.fillRect(-half, -half, half * 2, half * 2)
  // Striped barrier board
  const barrierWidth = half * 1.4
  const barrierHeight = half * 0.5
  const stripes = 4
  const stripeWidth = barrierWidth / stripes
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? COLORS.barrierOrange : COLORS.barrierWhite
    ctx.fillRect(-barrierWidth / 2 + i * stripeWidth, -barrierHeight / 2, stripeWidth, barrierHeight)
  }
  ctx.strokeStyle = '#7e5109'
  ctx.lineWidth = 2
  ctx.strokeRect(-barrierWidth / 2, -barrierHeight / 2, barrierWidth, barrierHeight)
}

/**
 * Draw one oriented piece with its top-left corner at (x, y).
 * Works at any cellSize, so the builder and thumbnails reuse it.
 */
export function drawTrackPiece(ctx, piece, rotation, x, y, cellSize) {
  const half = cellSize / 2
  ctx.save()
  ctx.translate(x + half, y + half)
  ctx.rotate((rotation * Math.PI) / 180)

  if (piece === PIECES.OBSTACLE) {
    drawObstacleCell(ctx, half)
    ctx.restore()
    return
  }

  const roadWidth = cellSize * ROAD_WIDTH_RATIO

  // Curbs: a slightly wider red ribbon under the asphalt reads as edge striping
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = COLORS.curbRed
  ctx.lineWidth = roadWidth + cellSize * 0.1
  ctx.setLineDash([cellSize * 0.18, cellSize * 0.12])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = COLORS.curbWhite
  ctx.lineWidth = roadWidth + cellSize * 0.04
  ctx.stroke()

  // Asphalt
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = COLORS.road
  ctx.lineWidth = roadWidth
  ctx.stroke()

  // Dashed centerline (skip on specials that draw their own markings)
  if (piece !== PIECES.START && piece !== PIECES.BOOST) {
    tracePieceCenterline(ctx, piece, half)
    ctx.strokeStyle = COLORS.dash
    ctx.lineWidth = Math.max(2, cellSize * 0.04)
    ctx.setLineDash(DASH_PATTERN_RATIO.map((ratio) => ratio * cellSize))
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (piece === PIECES.START) drawCheckerBand(ctx, roadWidth)
  if (piece === PIECES.BOOST) drawBoostChevrons(ctx, half)
  if (piece === PIECES.PIT) {
    ctx.fillStyle = COLORS.pitBlue
    const box = half * 0.66
    ctx.fillRect(-box / 2, -box / 2, box, box)
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.round(half * 0.5)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('P', 0, 1)
  }

  ctx.restore()
}

export function drawGrass(ctx, width, height, cellSize) {
  ctx.fillStyle = COLORS.grassLight
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = COLORS.grassDark
  for (let row = 0; row < Math.ceil(height / cellSize); row += 2) {
    ctx.fillRect(0, row * cellSize, width, cellSize)
  }
}

export function drawCourseInto(ctx, grid, cellSize) {
  drawGrass(ctx, grid[0].length * cellSize, grid.length * cellSize, cellSize)
  grid.forEach((cells, row) => {
    cells.forEach((cell, col) => {
      if (cell) drawTrackPiece(ctx, cell.piece, cell.rotation, col * cellSize, row * cellSize, cellSize)
    })
  })
}

/** Pre-render the static course once; race frames just blit this bitmap. */
export function createCourseBackground(course) {
  const canvas = document.createElement('canvas')
  canvas.width = COURSE_WIDTH
  canvas.height = COURSE_HEIGHT
  drawCourseInto(canvas.getContext('2d'), course.grid, CELL_SIZE)
  return canvas
}

export function drawCourseThumbnail(canvas, course) {
  const cellSize = canvas.width / GRID_COLS
  canvas.height = cellSize * GRID_ROWS
  drawCourseInto(canvas.getContext('2d'), course.grid, cellSize)
}

const CAR_DRAW_SIZE = 48

function drawCheckpointHighlight(ctx, state) {
  const target = state.checkpoints[state.nextCheckpoint]
  if (!target) return
  // Deterministic pulse driven by race time, not wall-clock
  const pulse = 0.8 + 0.2 * Math.sin(state.elapsedMs / 180)
  const centerX = (target.col + 0.5) * CELL_SIZE
  const centerY = (target.row + 0.5) * CELL_SIZE
  ctx.save()
  ctx.strokeStyle = COLORS.checkpoint
  ctx.lineWidth = 4
  ctx.globalAlpha = pulse
  ctx.beginPath()
  ctx.arc(centerX, centerY, CELL_SIZE * 0.34, 0, Math.PI * 2)
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.font = 'bold 13px sans-serif'
  ctx.textAlign = 'center'
  // Dark outline keeps the label readable over any track color
  ctx.strokeStyle = '#23252b'
  ctx.lineWidth = 3
  ctx.strokeText('CHECK', centerX, centerY - CELL_SIZE * 0.42)
  ctx.fillStyle = COLORS.checkpoint
  ctx.fillText('CHECK', centerX, centerY - CELL_SIZE * 0.42)
  ctx.restore()
}

export function drawFrame(ctx, background, state, carImage) {
  ctx.drawImage(background, 0, 0)
  drawCheckpointHighlight(ctx, state)

  ctx.save()
  ctx.translate(state.x, state.y)
  // Car art points north; heading 0 points east
  ctx.rotate(state.heading + Math.PI / 2)
  if (carImage) {
    ctx.drawImage(carImage, -CAR_DRAW_SIZE / 2, -CAR_DRAW_SIZE / 2, CAR_DRAW_SIZE, CAR_DRAW_SIZE)
  }
  ctx.restore()
}
