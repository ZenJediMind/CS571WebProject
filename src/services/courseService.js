// Course CRUD over localStorage plus the built-in templates.
// Stored courses never persist hydrated votes — votes live in their own key.
import { readArray, readObject, writeKey } from './storage.js'
import { clearCourseGhost } from './ghostService.js'
import { clearCourseBestTime } from './scoreService.js'
import {
  GRID_COLS, GRID_ROWS, PIECES, ROTATIONS, createEmptyGrid,
} from '../game/courseModel.js'
import { TEMPLATE_COURSES } from '../game/templates.js'
import { DEFAULT_THEME_ID, THEMES } from '../game/themes.js'

const COURSES_KEY = 'courses'
const VOTES_KEY = 'votes'

const VALID_PIECES = new Set(Object.values(PIECES))
const VALID_ROTATIONS = new Set(ROTATIONS)
const VALID_THEME_IDS = new Set(THEMES.map((theme) => theme.id))
const TEMPLATE_IDS = new Set(TEMPLATE_COURSES.map((course) => course.id))

function isValidCell(cell) {
  if (cell == null) return true
  return Boolean(cell)
    && VALID_PIECES.has(cell.piece)
    && VALID_ROTATIONS.has(cell.rotation)
}

function isValidGrid(grid) {
  return Array.isArray(grid)
    && grid.length === GRID_ROWS
    && grid.every((row) => (
      Array.isArray(row)
      && row.length === GRID_COLS
      && row.every(isValidCell)
    ))
}

function isValidStoredCourse(course) {
  return Boolean(course)
    && typeof course.id === 'string'
    && course.id.length > 0
    && typeof course.name === 'string'
    && course.name.trim().length > 0
    && typeof course.author === 'string'
    && course.isTemplate === false
    && (course.theme == null || VALID_THEME_IDS.has(course.theme))
    && (course.votes == null || (
      typeof course.votes === 'number'
      && Number.isFinite(course.votes)
      && course.votes >= 0
    ))
    && isValidGrid(course.grid)
}

function readUserCourses() {
  const seenIds = new Set(TEMPLATE_IDS)
  return readArray(COURSES_KEY, []).filter((course) => {
    if (!isValidStoredCourse(course) || seenIds.has(course.id)) return false
    seenIds.add(course.id)
    return true
  })
}

function readVotes() {
  const raw = readObject(VOTES_KEY, {})
  const votes = {}
  for (const [courseId, count] of Object.entries(raw)) {
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
      votes[courseId] = count
    }
  }
  return votes
}

function findRawCourse(id) {
  return TEMPLATE_COURSES.find((course) => course.id === id)
    ?? readUserCourses().find((course) => course.id === id)
    ?? null
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function listCourses() {
  const votes = readVotes()
  return [...TEMPLATE_COURSES, ...readUserCourses()]
    .map((course) => ({ ...course, votes: (course.votes ?? 0) + (votes[course.id] ?? 0) }))
    .sort((a, b) => b.votes - a.votes)
}

/** Raw course with a deep-copied grid, safe to edit. Votes are NOT hydrated. */
export function getCourse(id) {
  const course = findRawCourse(id)
  return course ? { ...course, grid: cloneGrid(course.grid) } : null
}

/** True when a save changes race-affecting data (layout or theme grip). */
function courseRaceDataChanged(previous, next) {
  if (!previous) return false
  const prevTheme = previous.theme ?? DEFAULT_THEME_ID
  const nextTheme = next.theme ?? DEFAULT_THEME_ID
  if (prevTheme !== nextTheme) return true
  return JSON.stringify(previous.grid) !== JSON.stringify(next.grid)
}

export function saveCourse(course) {
  if (course.isTemplate) {
    throw new Error('Cannot overwrite a built-in template — Copy & Edit first.')
  }
  if (!isValidStoredCourse(course) || TEMPLATE_IDS.has(course.id)) return null
  const previous = findRawCourse(course.id)
  const toStore = { ...course, votes: 0, isTemplate: false }
  const others = readUserCourses().filter((existing) => existing.id !== course.id)
  if (!writeKey(COURSES_KEY, [...others, toStore])) return null
  // Edited tracks invalidate times/ghosts recorded against the old layout.
  if (courseRaceDataChanged(previous, toStore)) {
    clearCourseBestTime(course.id)
    clearCourseGhost(course.id)
  }
  return toStore
}

export function createDraftCourse() {
  return {
    id: `crs-${Date.now().toString(36)}`,
    name: 'Untitled Course',
    grid: createEmptyGrid(),
    theme: DEFAULT_THEME_ID,
    votes: 0,
    author: 'You',
    isTemplate: false,
    createdAt: Date.now(),
  }
}

export function copyCourse(id) {
  const source = findRawCourse(id)
  if (!source) return null
  return saveCourse({
    ...createDraftCourse(),
    name: `${source.name} (Copy)`,
    grid: cloneGrid(source.grid),
    theme: source.theme ?? DEFAULT_THEME_ID,
  })
}

/** Remove a user course. Only clears related data if the courses write succeeds. */
export function deleteCourse(id) {
  const remaining = readUserCourses().filter((course) => course.id !== id)
  if (!writeKey(COURSES_KEY, remaining)) return false
  clearCourseBestTime(id)
  clearCourseGhost(id)
  const votes = readVotes()
  if (id in votes) {
    const { [id]: _removed, ...rest } = votes
    writeKey(VOTES_KEY, rest)
  }
  return true
}

export function voteForCourse(id) {
  if (!findRawCourse(id)) return false
  const votes = readVotes()
  return writeKey(VOTES_KEY, { ...votes, [id]: (votes[id] ?? 0) + 1 })
}
