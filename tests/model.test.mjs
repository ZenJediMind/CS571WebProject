import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { createEmptyGrid, PIECES, derivePath, validateCourse } = await loadGameModule('courseModel')
const { TEMPLATE_COURSES } = await loadGameModule('templates')

function rectangleGrid() {
  const grid = createEmptyGrid()
  const put = (row, col, piece, rotation) => { grid[row][col] = { piece, rotation } }
  put(2, 2, PIECES.CURVE, 90); put(2, 3, PIECES.STRAIGHT, 90); put(2, 4, PIECES.START, 90)
  put(2, 5, PIECES.STRAIGHT, 90); put(2, 6, PIECES.CURVE, 180); put(3, 6, PIECES.STRAIGHT, 0)
  put(4, 6, PIECES.CURVE, 270); put(4, 5, PIECES.STRAIGHT, 90); put(4, 4, PIECES.STRAIGHT, 90)
  put(4, 3, PIECES.STRAIGHT, 90); put(4, 2, PIECES.CURVE, 0); put(3, 2, PIECES.STRAIGHT, 0)
  return grid
}

test('closed rectangle derives a full path and validates', () => {
  const grid = rectangleGrid()
  assert.equal(derivePath(grid)?.length, 12)
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

test('oil and ramp behave as straight-family connectivity', async () => {
  const { openEdges, isDrivable, PIECES: P } = await loadGameModule('courseModel')
  for (const piece of [P.OIL, P.RAMP]) {
    assert.deepEqual([...openEdges(piece, 90)].sort(), ['E', 'W'])
    assert.equal(isDrivable(piece), true)
  }
})
