// Canvas drawing for tracks and race frames. Piece art is flat vector:
// asphalt ribbon, red/white curbs, dashed centerline, checkered start,
// cheddar boost chevrons, barrier obstacles, blue pit box.
import { CELL_SIZE, GRID_COLS, GRID_ROWS, PIECES } from './courseModel'
import { mulberry32 } from './rng'
import { getTheme, DEFAULT_THEME_ID } from './themes'

export const COURSE_WIDTH = GRID_COLS * CELL_SIZE // 1024
export const COURSE_HEIGHT = GRID_ROWS * CELL_SIZE // 640

const COLORS = {
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

/** Arrow ahead of the start line pointing the race direction (local north). */
function drawStartArrow(ctx, half, track) {
  ctx.fillStyle = track.dash
  ctx.beginPath()
  ctx.moveTo(0, -half * 0.78)
  ctx.lineTo(-half * 0.22, -half * 0.46)
  ctx.lineTo(half * 0.22, -half * 0.46)
  ctx.closePath()
  ctx.fill()
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
export function drawTrackPiece(ctx, piece, rotation, x, y, cellSize, theme = getTheme(DEFAULT_THEME_ID)) {
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
  const track = theme.track

  // Run-off / shoulder ribbon (gravel trap, dirt margin, etc.) hugging the piece
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = track.margin
  ctx.lineWidth = roadWidth + cellSize * 0.28
  ctx.stroke()

  // Curbs: a slightly wider red ribbon under the asphalt reads as edge striping
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = track.curbRed
  ctx.lineWidth = roadWidth + cellSize * 0.1
  ctx.setLineDash([cellSize * 0.18, cellSize * 0.12])
  ctx.stroke()
  ctx.setLineDash([])
  ctx.strokeStyle = track.curbWhite
  ctx.lineWidth = roadWidth + cellSize * 0.04
  ctx.stroke()

  // Asphalt
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = track.road
  ctx.lineWidth = roadWidth
  ctx.stroke()

  // Dashed centerline (skip on specials that draw their own markings)
  if (piece !== PIECES.START && piece !== PIECES.BOOST && piece !== PIECES.RAMP) {
    tracePieceCenterline(ctx, piece, half)
    ctx.strokeStyle = track.dash
    ctx.lineWidth = Math.max(2, cellSize * 0.04)
    ctx.setLineDash(DASH_PATTERN_RATIO.map((ratio) => ratio * cellSize))
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (piece === PIECES.START) {
    drawCheckerBand(ctx, roadWidth)
    drawStartArrow(ctx, half, track)
  }
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
  if (piece === PIECES.OIL) {
    // Iridescent slick: dark puddle with faint sheen arcs
    ctx.fillStyle = 'rgba(22, 24, 34, 0.6)'
    ctx.beginPath()
    ctx.ellipse(0, 0, roadWidth * 0.34, half * 0.62, 0.35, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 2
    for (const [radius, tint] of [[half * 0.3, 'rgba(125, 60, 152, 0.5)'], [half * 0.18, 'rgba(23, 162, 184, 0.5)']]) {
      ctx.strokeStyle = tint
      ctx.beginPath()
      ctx.arc(0, 0, radius, 0.4, 2.4)
      ctx.stroke()
    }
  }
  if (piece === PIECES.RAMP) {
    // Bright launch wedge with hazard edge
    ctx.fillStyle = COLORS.boost
    ctx.beginPath()
    ctx.moveTo(-roadWidth * 0.3, half * 0.45)
    ctx.lineTo(roadWidth * 0.3, half * 0.45)
    ctx.lineTo(0, -half * 0.4)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#23252b'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  ctx.restore()
}

export function drawCourseInto(ctx, grid, cellSize, theme = getTheme(DEFAULT_THEME_ID)) {
  theme.drawTerrain(ctx, grid[0].length * cellSize, grid.length * cellSize, cellSize)
  grid.forEach((cells, row) => {
    cells.forEach((cell, col) => {
      if (cell) drawTrackPiece(ctx, cell.piece, cell.rotation, col * cellSize, row * cellSize, cellSize, theme)
    })
  })
}

/** Pre-render the static course once; race frames just blit this bitmap. */
export function createCourseBackground(course) {
  const canvas = document.createElement('canvas')
  canvas.width = COURSE_WIDTH
  canvas.height = COURSE_HEIGHT
  drawCourseInto(canvas.getContext('2d'), course.grid, CELL_SIZE, getTheme(course.theme))
  return canvas
}

export function drawCourseThumbnail(canvas, course) {
  const cellSize = canvas.width / GRID_COLS
  canvas.height = cellSize * GRID_ROWS
  drawCourseInto(canvas.getContext('2d'), course.grid, cellSize, getTheme(course.theme))
}

const CAR_DRAW_SIZE = 48
const SKID_COLOR = 'rgba(18, 18, 24, 0.16)'
const SPARK_LIFE_MS = 420

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

export function createSparkBurst(seed, x, y) {
  const rand = mulberry32(seed)
  return Array.from({ length: 14 }, () => {
    const angle = rand() * Math.PI * 2
    const speed = 90 + rand() * 160
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, lifeMs: SPARK_LIFE_MS }
  })
}

export function updateAndDrawSparks(ctx, sparks, dtMs) {
  const alive = []
  for (const spark of sparks) {
    spark.lifeMs -= dtMs
    if (spark.lifeMs <= 0) continue
    spark.x += (spark.vx * dtMs) / 1000
    spark.y += (spark.vy * dtMs) / 1000
    ctx.globalAlpha = spark.lifeMs / SPARK_LIFE_MS
    ctx.fillStyle = COLORS.boost
    ctx.fillRect(spark.x - 2, spark.y - 2, 4, 4)
    alive.push(spark)
  }
  ctx.globalAlpha = 1
  return alive
}

/** Transparent overlay the race loop stamps skid marks onto. */
export function createMarksOverlay() {
  const canvas = document.createElement('canvas')
  canvas.width = COURSE_WIDTH
  canvas.height = COURSE_HEIGHT
  return canvas
}

export function stampSkidMarks(marksCtx, state) {
  const rearX = state.x - Math.cos(state.heading) * 14
  const rearY = state.y - Math.sin(state.heading) * 14
  const sideX = -Math.sin(state.heading) * 10
  const sideY = Math.cos(state.heading) * 10
  marksCtx.fillStyle = SKID_COLOR
  for (const sign of [-1, 1]) {
    marksCtx.beginPath()
    marksCtx.arc(rearX + sign * sideX, rearY + sign * sideY, 3, 0, Math.PI * 2)
    marksCtx.fill()
  }
}

/** Flat tinted silhouette for rival ghosts, with a name tag. */
export function drawGhostCar(ctx, pose, color, label) {
  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.translate(pose.x, pose.y)
  ctx.rotate(pose.heading + Math.PI / 2)
  ctx.fillStyle = '#1a1a1a'
  ctx.fillRect(-12, -16, 5, 9); ctx.fillRect(7, -16, 5, 9)
  ctx.fillRect(-12, 7, 5, 9); ctx.fillRect(7, 7, 5, 9)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.roundRect(-10, -20, 20, 40, 7)
  ctx.fill()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.beginPath()
  ctx.roundRect(-6, -12, 12, 9, 3)
  ctx.fill()
  ctx.restore()
  if (label) {
    ctx.save()
    ctx.globalAlpha = 0.8
    ctx.font = 'bold 11px sans-serif'
    ctx.textAlign = 'center'
    ctx.strokeStyle = '#23252b'
    ctx.lineWidth = 3
    ctx.strokeText(label, pose.x, pose.y - 28)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(label, pose.x, pose.y - 28)
    ctx.restore()
  }
}

function drawCarImage(ctx, pose, carImage, { alpha = 1, scale = 1, shadow = false } = {}) {
  if (!carImage) return
  if (shadow) {
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.beginPath()
    ctx.ellipse(pose.x + 6, pose.y + 12, 20, 12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  const size = CAR_DRAW_SIZE * scale
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(pose.x, pose.y)
  // Car art points north; heading 0 points east
  ctx.rotate(pose.heading + Math.PI / 2)
  ctx.drawImage(carImage, -size / 2, -size / 2, size, size)
  ctx.restore()
}

export function drawFrame(ctx, scene) {
  const { background, marks, state, carImage, bestGhostPose, rivalGhosts = [], sparks = [] } = scene
  ctx.drawImage(background, 0, 0)
  if (marks) ctx.drawImage(marks, 0, 0)
  drawCheckpointHighlight(ctx, state)

  if (bestGhostPose) drawCarImage(ctx, bestGhostPose, carImage, { alpha: 0.35 })
  for (const ghost of rivalGhosts) drawGhostCar(ctx, ghost.state, ghost.color, ghost.name)

  const airborne = state.airborneMs > 0
  drawCarImage(ctx, state, carImage, { scale: airborne ? 1.25 : 1, shadow: airborne })

  if (sparks.length > 0) updateAndDrawSparks(ctx, sparks, 0) // draw-only; loop passes dt separately
}
