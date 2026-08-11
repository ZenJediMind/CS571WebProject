import test from 'node:test'
import assert from 'node:assert/strict'
import { TEMPLATE_COURSES } from '../src/game/templates.js'
import { courseInternals, createDraftCourse } from '../src/services/courseService.js'

test('a new course draft has a collision-resistant ID and a valid blank grid', () => {
  const first = createDraftCourse()
  const second = createDraftCourse()

  assert.notEqual(first.id, second.id)
  assert.match(first.id, /^crs-/)
  assert.equal(courseInternals.isValidGrid(first.grid), true)
})

test('catalog mapping preserves valid shared courses and identifies built-ins', () => {
  const template = TEMPLATE_COURSES[0]
  const mapped = courseInternals.mapCatalogCourse({
    id: template.id,
    name: template.name,
    author: 'A seeded guest',
    grid: template.grid,
    theme: template.theme,
    is_public: true,
    revision: 1,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    votes: '3',
  }, { displayName: 'Racer-ABC123' })

  assert.equal(mapped.isTemplate, true)
  assert.equal(mapped.author, 'Wisconsin Racer')
  assert.equal(mapped.votes, 3)
  assert.equal(mapped.isOwner, false)
})

test('catalog mapping rejects malformed database grids before rendering them', () => {
  assert.throws(() => courseInternals.mapCatalogCourse({
    id: 'crs-invalid',
    name: 'Broken',
    author: 'Racer-ABC123',
    grid: [],
    theme: 'circuit',
    is_public: true,
    revision: 1,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    votes: 0,
  }, { displayName: 'Racer-ABC123' }))
})
