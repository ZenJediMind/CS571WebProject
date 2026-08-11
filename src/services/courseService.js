import {
  GRID_COLS, GRID_ROWS, PIECES, ROTATIONS, createEmptyGrid,
} from '../game/courseModel.js'
import { TEMPLATE_COURSES } from '../game/templates.js'
import { DEFAULT_THEME_ID, THEMES } from '../game/themes.js'
import { ensureRacerSession } from './authService.js'
import { clearCourseGhost } from './ghostService.js'
import { profileAsync } from './performanceService.js'
import { requireSupabase } from './supabaseClient.js'

const VALID_PIECES = new Set(Object.values(PIECES))
const VALID_ROTATIONS = new Set(ROTATIONS)
const VALID_THEME_IDS = new Set(THEMES.map((theme) => theme.id))
const TEMPLATE_BY_ID = new Map(TEMPLATE_COURSES.map((course) => [course.id, course]))
const CATALOG_COLUMNS = [
  'id', 'name', 'author', 'grid', 'theme', 'is_public', 'revision',
  'created_at', 'updated_at', 'votes',
].join(', ')

let templateSeedPromise = null

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

function isValidCourse(course) {
  return Boolean(course)
    && typeof course.id === 'string'
    && course.id.length > 0
    && typeof course.name === 'string'
    && course.name.trim().length > 0
    && VALID_THEME_IDS.has(course.theme ?? DEFAULT_THEME_ID)
    && isValidGrid(course.grid)
}

function cloneGrid(grid) {
  return grid.map((row) => row.map((cell) => (cell ? { ...cell } : null)))
}

function mapCatalogCourse(row, racer) {
  if (!isValidCourse(row)) {
    throw new Error(`Supabase returned an invalid course record (${row?.id ?? 'unknown'}).`)
  }

  const template = TEMPLATE_BY_ID.get(row.id)
  const votes = Number(row.votes)
  return {
    id: row.id,
    name: row.name,
    author: template ? 'Wisconsin Racer' : row.author,
    grid: cloneGrid(row.grid),
    theme: row.theme ?? DEFAULT_THEME_ID,
    votes: Number.isFinite(votes) && votes >= 0 ? votes : 0,
    isTemplate: Boolean(template),
    isOwner: !template && row.author === racer.displayName,
    isPublic: Boolean(row.is_public),
    revision: row.revision,
    createdAt: Date.parse(row.created_at) || 0,
    updatedAt: Date.parse(row.updated_at) || 0,
  }
}

function newCourseId() {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `crs-${randomId}`
}

/**
 * The migration deliberately keeps built-in layouts in source control. Seed
 * their immutable IDs once so shared scores can satisfy race_scores.course_id.
 */
export function ensureBuiltInCourses() {
  if (!templateSeedPromise) {
    templateSeedPromise = profileAsync('backend.courses.seed_templates', async () => {
      const [client, racer] = [requireSupabase(), await ensureRacerSession()]
      const ids = TEMPLATE_COURSES.map((course) => course.id)
      const { data: existing, error: readError } = await client
        .from('courses')
        .select('id')
        .in('id', ids)
      if (readError) throw new Error(`Could not check built-in courses: ${readError.message}`)

      const existingIds = new Set(existing.map((course) => course.id))
      const missing = TEMPLATE_COURSES.filter((course) => !existingIds.has(course.id))
      if (missing.length === 0) return

      const { error: insertError } = await client
        .from('courses')
        .insert(missing.map((course) => ({
          id: course.id,
          author_id: racer.id,
          name: course.name,
          grid: course.grid,
          theme: course.theme ?? DEFAULT_THEME_ID,
          is_public: true,
        })))

      // Multiple first visitors can race to seed a template. A conflicting
      // primary key means another valid session completed the same work.
      if (insertError && insertError.code !== '23505') {
        throw new Error(`Could not seed built-in courses: ${insertError.message}`)
      }
    }).catch((error) => {
      templateSeedPromise = null
      throw error
    })
  }
  return templateSeedPromise
}

export async function listCourses() {
  return profileAsync('backend.courses.list', async () => {
    await ensureBuiltInCourses()
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    const { data, error } = await client
      .from('course_catalog')
      .select(CATALOG_COLUMNS)
      .order('votes', { ascending: false })
      .order('updated_at', { ascending: false })
    if (error) throw new Error(`Could not load courses: ${error.message}`)
    return data.map((course) => mapCatalogCourse(course, racer))
  })
}

export async function getCourse(id) {
  if (typeof id !== 'string' || id.trim().length === 0) return null

  return profileAsync('backend.courses.get', async () => {
    await ensureBuiltInCourses()
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    const { data, error } = await client
      .from('course_catalog')
      .select(CATALOG_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Could not load this course: ${error.message}`)
    }
    return data ? mapCatalogCourse(data, racer) : null
  })
}

export function createDraftCourse() {
  return {
    id: newCourseId(),
    name: 'Untitled Course',
    grid: createEmptyGrid(),
    theme: DEFAULT_THEME_ID,
    votes: 0,
    author: 'You',
    isTemplate: false,
    isOwner: true,
    isPublic: true,
  }
}

export async function saveCourse(course) {
  if (course?.isTemplate) {
    throw new Error('Built-in templates cannot be overwritten. Copy one before editing.')
  }
  if (!isValidCourse(course)) throw new Error('This course contains invalid data and cannot be saved.')

  return profileAsync('backend.courses.save', async () => {
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    const payload = {
      name: course.name.trim(),
      grid: course.grid,
      theme: course.theme ?? DEFAULT_THEME_ID,
      is_public: course.isPublic !== false,
    }

    if (Number.isInteger(course.revision)) {
      if (course.author !== racer.displayName) {
        throw new Error('Only the racer who created this course can edit it.')
      }
      const { data, error } = await client
        .from('courses')
        .update(payload)
        .eq('id', course.id)
        .select('id')
      if (error) throw new Error(`Could not update this course: ${error.message}`)
      if (data.length !== 1) throw new Error('Only the racer who created this course can edit it.')
    } else {
      const { error } = await client
        .from('courses')
        .insert({ id: course.id, author_id: racer.id, ...payload })
      if (error) throw new Error(`Could not save this course: ${error.message}`)
    }

    const saved = await getCourse(course.id)
    if (!saved) throw new Error('Supabase saved the course but could not return it.')
    return saved
  })
}

export async function copyCourse(id) {
  const source = await getCourse(id)
  if (!source) return null
  return saveCourse({
    ...createDraftCourse(),
    name: `${source.name} (Copy)`,
    grid: cloneGrid(source.grid),
    theme: source.theme,
  })
}

export async function deleteCourse(course) {
  if (!course?.id) throw new Error('No course was selected for deletion.')
  if (course.isTemplate) throw new Error('Built-in templates cannot be deleted.')

  return profileAsync('backend.courses.delete', async () => {
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    if (course.author !== racer.displayName) {
      throw new Error('Only the racer who created this course can delete it.')
    }
    const { data, error } = await client
      .from('courses')
      .delete()
      .eq('id', course.id)
      .select('id')
    if (error) throw new Error(`Could not delete this course: ${error.message}`)
    if (data.length !== 1) throw new Error('Only the racer who created this course can delete it.')
    clearCourseGhost(course.id)
    return true
  })
}

/** Returns true for a new vote and false when this guest already voted. */
export async function voteForCourse(courseId) {
  if (typeof courseId !== 'string' || courseId.trim().length === 0) {
    throw new Error('No course was selected for voting.')
  }

  return profileAsync('backend.courses.vote', async () => {
    await ensureBuiltInCourses()
    const [client, racer] = [requireSupabase(), await ensureRacerSession()]
    const { error } = await client
      .from('course_votes')
      .insert({ course_id: courseId, user_id: racer.id })
    if (error?.code === '23505') return false
    if (error) throw new Error(`Could not record your vote: ${error.message}`)
    return true
  })
}

export const courseInternals = { isValidGrid, mapCatalogCourse }
