// Grid-of-oriented-pieces course model: piece definitions, edge connectivity,
// closed-loop path derivation, and course validation.
export const GRID_COLS = 16
export const GRID_ROWS = 10
export const CELL_SIZE = 64

/** Pixel center of a grid cell — shared by the engine, autopilot, and tests. */
export const cellCenter = ({ row, col }) => ({
  x: (col + 0.5) * CELL_SIZE,
  y: (row + 0.5) * CELL_SIZE,
})

export const PIECES = {
  STRAIGHT: 'straight',
  CURVE: 'curve',
  S_BEND: 's_bend',
  START: 'start',
  BOOST: 'boost',
  OBSTACLE: 'obstacle',
  PIT: 'pit',
  OIL: 'oil',
  RAMP: 'ramp',
}

const BASE_OPENINGS = {
  [PIECES.STRAIGHT]: ['N', 'S'],
  [PIECES.START]: ['N', 'S'],
  [PIECES.BOOST]: ['N', 'S'],
  [PIECES.PIT]: ['N', 'S'],
  [PIECES.CURVE]: ['N', 'E'],
  [PIECES.S_BEND]: ['N', 'S'],
  [PIECES.OBSTACLE]: [],
  [PIECES.OIL]: ['N', 'S'],
  [PIECES.RAMP]: ['N', 'S'],
}

const EDGE_ORDER = ['N', 'E', 'S', 'W']
export const DELTA = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] }
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' }

export const ROTATIONS = [0, 90, 180, 270]

export function createEmptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null))
}

export function isDrivable(piece) {
  return piece != null && piece !== PIECES.OBSTACLE
}

function rotateEdge(edge, rotation) {
  const turns = (((rotation % 360) + 360) % 360) / 90
  return EDGE_ORDER[(EDGE_ORDER.indexOf(edge) + turns) % 4]
}

export function openEdges(piece, rotation = 0) {
  return new Set((BASE_OPENINGS[piece] ?? []).map((edge) => rotateEdge(edge, rotation)))
}

export function isTrackCell(grid, row, col) {
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return false
  const cell = grid[row][col]
  return cell !== null && isDrivable(cell.piece)
}

export function connectedNeighbors(grid, row, col) {
  const cell = grid[row][col]
  if (!cell || !isDrivable(cell.piece)) return []
  const result = []
  for (const edge of openEdges(cell.piece, cell.rotation)) {
    const [dRow, dCol] = DELTA[edge]
    const nRow = row + dRow
    const nCol = col + dCol
    if (!isTrackCell(grid, nRow, nCol)) continue
    const neighbor = grid[nRow][nCol]
    if (openEdges(neighbor.piece, neighbor.rotation).has(OPPOSITE[edge])) {
      result.push({ row: nRow, col: nCol })
    }
  }
  return result
}

function sameCell(a, b) {
  return a.row === b.row && a.col === b.col
}

/**
 * The edge a start piece launches cars toward: its base N opening, rotated.
 * Rotation 0 → N, 90 → E, 180 → S, 270 → W — so rotating the start piece
 * sets the race direction around the loop.
 */
export function startLaunchEdge(rotation) {
  return rotateEdge('N', rotation)
}

/**
 * Closed loop walk from the single START cell, heading out of its launch
 * edge so the start rotation controls race direction.
 * Rejects branches, dead ends, and orphan drivable cells.
 */
export function derivePath(grid) {
  let start = null
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (grid[row][col]?.piece === PIECES.START) {
        if (start) return null
        start = { row, col }
      }
    }
  }
  if (!start) return null

  const startNeighbors = connectedNeighbors(grid, start.row, start.col)
  if (startNeighbors.length !== 2) return null

  const [dRow, dCol] = DELTA[startLaunchEdge(grid[start.row][start.col].rotation)]
  const launchNeighbor = startNeighbors.find(
    (neighbor) => neighbor.row === start.row + dRow && neighbor.col === start.col + dCol,
  )

  const path = [start]
  let previous = start
  let current = launchNeighbor ?? startNeighbors[0]

  while (!sameCell(current, start)) {
    path.push(current)
    if (path.length > GRID_ROWS * GRID_COLS) return null
    const nextCandidates = connectedNeighbors(grid, current.row, current.col)
      .filter((neighbor) => !sameCell(neighbor, previous))
    if (nextCandidates.length !== 1) return null
    previous = current
    current = nextCandidates[0]
  }

  let trackCount = 0
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (isTrackCell(grid, row, col)) trackCount++
    }
  }
  if (path.length !== trackCount) return null
  return path
}

export function validateCourse(grid) {
  const path = derivePath(grid)
  if (!path) {
    return {
      ok: false,
      error: 'Track must be one closed loop with exactly one Start/Finish, matching piece connections, and no orphan pieces.',
    }
  }
  return { ok: true, error: null }
}
