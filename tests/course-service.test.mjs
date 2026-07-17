import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATE_COURSES } from '../src/game/templates.js'
import { listCourses, voteForCourse } from '../src/services/courseService.js'
import { writeKey } from '../src/services/storage.js'

const values = new Map()
let blockWrites = false
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => {
    if (blockWrites) throw new Error('storage blocked')
    values.set(key, String(value))
  },
}

beforeEach(() => {
  values.clear()
  blockWrites = false
})

test('course listing ignores malformed and duplicate stored courses', () => {
  const base = {
    ...TEMPLATE_COURSES[0],
    id: 'crs-valid',
    name: 'Valid Course',
    author: 'You',
    isTemplate: false,
  }
  writeKey('courses', [
    base,
    { ...base, id: 'crs-corrupt', author: { not: 'renderable' } },
    { ...base, id: TEMPLATE_COURSES[0].id },
    { ...base, name: 'Duplicate Course' },
  ])

  const userCourses = listCourses().filter((course) => !course.isTemplate)
  assert.deepEqual(userCourses.map((course) => course.id), ['crs-valid'])
})

test('voting reports whether browser storage accepted the write', () => {
  const courseId = TEMPLATE_COURSES[0].id
  assert.equal(voteForCourse(courseId), true)
  assert.equal(listCourses().find((course) => course.id === courseId).votes, 1)

  blockWrites = true
  assert.equal(voteForCourse(courseId), false)
})
