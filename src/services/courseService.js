// Course CRUD over localStorage plus the built-in templates.
// Stored courses never persist hydrated votes — votes live in their own key.
import { readKey, writeKey } from './storage'
import { createEmptyGrid } from '../game/courseModel'
import { TEMPLATE_COURSES } from '../game/templates'

const COURSES_KEY = 'courses'
const VOTES_KEY = 'votes'

function readUserCourses() {
  return readKey(COURSES_KEY, [])
}

function findRawCourse(id) {
  return TEMPLATE_COURSES.find((course) => course.id === id)
    ?? readUserCourses().find((course) => course.id === id)
    ?? null
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

export function withHydratedVotes(course) {
  if (!course) return null
  const votes = readKey(VOTES_KEY, {})
  return { ...course, votes: (course.votes ?? 0) + (votes[course.id] ?? 0) }
}

export function listCourses() {
  return [...TEMPLATE_COURSES, ...readUserCourses()]
    .map(withHydratedVotes)
    .sort((a, b) => b.votes - a.votes)
}

/** Raw course with a deep-copied grid, safe to edit. Votes are NOT hydrated. */
export function getCourse(id) {
  const course = findRawCourse(id)
  return course ? { ...course, grid: cloneGrid(course.grid) } : null
}

export function saveCourse(course) {
  if (course.isTemplate) {
    throw new Error('Cannot overwrite a built-in template — Copy & Edit first.')
  }
  const toStore = { ...course, votes: 0, isTemplate: false }
  const others = readUserCourses().filter((existing) => existing.id !== course.id)
  writeKey(COURSES_KEY, [...others, toStore])
  return toStore
}

export function createDraftCourse() {
  return {
    id: `crs-${Date.now().toString(36)}`,
    name: 'Untitled Course',
    grid: createEmptyGrid(),
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
  })
}

export function voteForCourse(id) {
  if (!findRawCourse(id)) return
  const votes = readKey(VOTES_KEY, {})
  writeKey(VOTES_KEY, { ...votes, [id]: (votes[id] ?? 0) + 1 })
}
