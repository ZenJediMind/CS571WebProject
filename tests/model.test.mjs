import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyGrid, PIECES, derivePath, isDrivable, openEdges, validateCourse,
} from '../src/game/courseModel.js'
import { TEMPLATE_COURSES } from '../src/game/templates.js'

function rectangleGrid() {
  const grid = createEmptyGrid()
  const put = (row, col, piece, rotation) => { grid[row][col] = { piece, rotation } }
  put(2, 2, PIECES.CURVE, 90); put(2, 3, PIECES.STRAIGHT, 90); put(2, 4, PIECES.START, 90)
  put(2, 5, PIECES.STRAIGHT, 90); put(2, 6, PIECES.CURVE, 180); put(3, 6, PIECES.STRAIGHT, 0)
  put(4, 6, PIECES.CURVE, 270); put(4, 5, PIECES.STRAIGHT, 90); put(4, 4, PIECES.STRAIGHT, 90)
  put(4, 3, PIECES.STRAIGHT, 90); put(4, 2, PIECES.CURVE, 0); put(3, 2, PIECES.STRAIGHT, 0)
  return grid
}

function compactLoopGrid() {
  const grid = createEmptyGrid()
  const put = (row, col, piece, rotation) => { grid[row][col] = { piece, rotation } }
  // The Start/Finish is a straight, so this 2×3 perimeter is the smallest
  // structurally valid loop rather than an arbitrary game-design minimum.
  put(2, 2, PIECES.CURVE, 90); put(2, 3, PIECES.START, 90); put(2, 4, PIECES.CURVE, 180)
  put(3, 4, PIECES.CURVE, 270); put(3, 3, PIECES.STRAIGHT, 90); put(3, 2, PIECES.CURVE, 0)
  return grid
}

test('closed rectangle derives a full path and validates', () => {
  const grid = rectangleGrid()
  assert.equal(derivePath(grid)?.length, 12)
  assert.equal(validateCourse(grid).ok, true)
})

test('a structurally valid compact loop has no arbitrary piece-count requirement', () => {
  const grid = compactLoopGrid()
  assert.equal(derivePath(grid)?.length, 6)
  assert.equal(validateCourse(grid).ok, true)
})

test('broken connection, orphan piece, and double start are rejected', () => {
  const broken = rectangleGrid()
  broken[2][3] = { piece: PIECES.STRAIGHT, rotation: 0 }
  assert.equal(derivePath(broken), null)

  const orphaned = rectangleGrid()
  orphaned[7][7] = { piece: PIECES.STRAIGHT, rotation: 0 }
  assert.equal(derivePath(orphaned), null)

  const twoStarts = rectangleGrid()
  twoStarts[4][4] = { piece: PIECES.START, rotation: 90 }
  assert.equal(derivePath(twoStarts), null)
})

test('all built-in templates derive closed loops', () => {
  for (const course of TEMPLATE_COURSES) {
    assert.ok(derivePath(course.grid), `${course.id} must derive`)
  }
})

test('start rotation selects the race direction', () => {
  // Rotation 90 launches east (toward its rotated N edge); 270 launches west.
  const eastward = rectangleGrid()
  assert.deepEqual(derivePath(eastward)[1], { row: 2, col: 5 })

  const westward = rectangleGrid()
  westward[2][4] = { piece: PIECES.START, rotation: 270 }
  assert.deepEqual(derivePath(westward)[1], { row: 2, col: 3 })
})

test('oil and ramp behave as straight-family connectivity', () => {
  for (const piece of [PIECES.OIL, PIECES.RAMP]) {
    assert.deepEqual([...openEdges(piece, 90)].sort(), ['E', 'W'])
    assert.equal(isDrivable(piece), true)
  }
})
