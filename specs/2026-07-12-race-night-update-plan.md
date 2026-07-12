# Race Night Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Fix the two P0 defects from `WEB_PROJECT_REVIEW.md` (race clock loses real time on slow devices; storage failures are silent), then add ghost racing (personal-best replay + live pace-matched rival ghosts), race feel (splits, skid marks, boost sparks, synthesized audio), handbrake drift, and oil-slick/ramp track pieces to Wisconsin Racer.

**Architecture:** The engine stays pure (no DOM/timers/randomness); `stepRace` preserves real elapsed time by advancing physics in ≤50ms substeps (Task 2 — a prerequisite, since ghosts/splits/pace-matching are all keyed on `elapsedMs`), and gains handbrake, oil, airborne, and split-tracking state. `writeKey` reports success/failure and save flows surface it (Task 3). Ghosts are pure game modules with injected data (no service imports) so they run in Node tests. Audio and particles live outside the engine, driven by observable state changes (`boostCount`, `drifting`). A committed Node test harness (`node --test tests/`) replaces the session-scratchpad fixtures. The race loop only animates while racing (review P2 #8).

**Tech Stack:** Vite, React 19 (JavaScript), React Bootstrap, Canvas 2D, WebAudio, `localStorage`, Node built-in test runner. No new dependencies.

**Design spec:** `specs/2026-07-12-race-night-update-design.md`

## Global Constraints

- Client-side only; JavaScript; HashRouter; work on `dev` branch; never merge to `main` without user approval
- Engine purity: no DOM, no timers, no `Math.random` in `src/game/engine.js` / `autopilot.js` / `ghosts.js`
- Ghosts are visual only: no collision, no effect on laps/checkpoints/scoring
- `storage.js` remains the only module touching `localStorage`
- Lecture idioms: immutable React state, derived values computed on render, controlled `Form.Control`s, initial loads in `useEffect(fn, [])`
- Verification per task: `npm test` + `npm run lint` + `npm run build` (+ manual smoke where stated)
- Do not name any commercial games in code, comments, docs, or commit messages

---

### Task 1: Committed Node test harness

**Files:**
- Create: `tests/helpers.mjs`
- Create: `tests/model.test.mjs`
- Create: `tests/engine.test.mjs`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Produces: `loadGameModule(name)` → imports `src/game/<name>.js` in Node by rewriting extensionless sibling imports into a temp dir. All later test tasks use it.
- Produces: `driveInputs(state, cursor)` test-local controller (replaced by `src/game/autopilot.js` in Task 4).

- [x] **Step 1: Write `tests/helpers.mjs`**

```js
// Loads src/game modules in Node by patching extensionless sibling imports.
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('../src/game/', import.meta.url))
const cache = new Map()
let outDir = null

export async function loadGameModule(name) {
  if (cache.has(name)) return cache.get(name)
  outDir ??= await mkdtemp(join(tmpdir(), 'wr-tests-'))
  let source = await readFile(join(SRC_DIR, `${name}.js`), 'utf8')
  const deps = [...source.matchAll(/from '\.\/(\w+)'/g)].map((m) => m[1])
  for (const dep of deps) {
    await loadGameModule(dep)
    source = source.replaceAll(`from './${dep}'`, `from '${pathToFileURL(join(outDir, `${dep}.mjs`)).href}'`)
  }
  const outPath = join(outDir, `${name}.mjs`)
  await writeFile(outPath, source)
  const mod = await import(pathToFileURL(outPath).href)
  cache.set(name, mod)
  return mod
}
```

- [x] **Step 2: Write `tests/model.test.mjs`** — port of the existing scratch fixture using `node:test`:

```js
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
```

- [x] **Step 3: Write `tests/engine.test.mjs`** — autopilot completion + determinism (controller inline for now; Task 4 moves it into `src/game/autopilot.js`):

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { CELL_SIZE } = await loadGameModule('courseModel')
const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')

const center = (cell) => ({ x: (cell.col + 0.5) * CELL_SIZE, y: (cell.row + 0.5) * CELL_SIZE })
const normalizeAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function driveInputs(state, cursor) {
  const target = center(state.path[cursor.targetIdx])
  if (Math.hypot(target.x - state.x, target.y - state.y) < CELL_SIZE * 0.45) {
    cursor.targetIdx = (cursor.targetIdx + 1) % state.path.length
  }
  const aim = center(state.path[cursor.targetIdx])
  const diff = normalizeAngle(Math.atan2(aim.y - state.y, aim.x - state.x) - state.heading)
  if (Math.abs(state.speed) < 8 && Math.abs(diff) > 2.0) {
    return { up: false, down: true, left: diff > 0, right: diff < 0 }
  }
  const cornering = Math.abs(diff) > 0.35
  return {
    up: state.speed < 80 || (Math.abs(diff) < 1.0 && (!cornering || state.speed < 150)),
    down: cornering && state.speed > 170,
    left: diff < -0.05,
    right: diff > 0.05,
  }
}

function runToFinish(course, maxSimSeconds = 180) {
  const state = createRaceState(course)
  const cursor = { targetIdx: 1 }
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, driveInputs(state, cursor), 1 / 60)
  }
  return state
}

for (const course of TEMPLATE_COURSES) {
  test(`autopilot finishes 3 laps on ${course.id}`, () => {
    const state = runToFinish(course)
    assert.equal(state.finished, true)
    assert.equal(state.lap, 3)
  })
}

test('engine is deterministic', () => {
  assert.equal(runToFinish(TEMPLATE_COURSES[0]).elapsedMs, runToFinish(TEMPLATE_COURSES[0]).elapsedMs)
})
```

- [x] **Step 4: Add the npm script** — in `package.json` scripts: `"test": "node --test tests/"`

- [x] **Step 5: Run and verify**

Run: `npm test` → all tests pass. `npm run lint` clean (add `tests/**` to `.oxlintrc.json` ignorePatterns ONLY if oxlint flags the .mjs files; otherwise leave config untouched).

- [x] **Step 6: Commit**

```bash
git add tests/ package.json
git commit -m "test: committed Node test harness for course model and engine"
```

---

### Task 2: P0 — real-time race clock (substepped physics)

**Review finding:** `src/game/engine.js:149-151` adds the *clamped* dt to `elapsedMs`, so a 100ms frame records only 50ms — slow devices get artificially fast leaderboard times. Every race-night feature (ghost recordings, splits, pace matching) keys on `elapsedMs`, so this must land first.

**Files:**
- Modify: `src/game/engine.js` (`stepRace` only)
- Modify: `tests/engine.test.mjs` (regression tests)

**Interfaces:**
- Produces: `stepRace(state, inputs, dtSeconds)` — same signature; now records the frame's full elapsed time (clamped at 0.25s) and advances physics in substeps of ≤ `MAX_STEP_SECONDS`. Task 7 preserves this structure when it adds airborne handling.

- [x] **Step 1: Replace `stepRace` in `src/game/engine.js`** (keep `MAX_STEP_SECONDS = 0.05`; add the new frame cap next to it):

```js
const MAX_FRAME_SECONDS = 0.25 // longer gaps (tab switch, debugger) are a stall, not race time
```

```js
export function stepRace(state, inputs, dtSeconds) {
  if (state.finished) return state
  // Keep real elapsed time but integrate physics in short, stable substeps
  let remaining = Math.min(dtSeconds, MAX_FRAME_SECONDS)
  while (remaining > 0 && !state.finished) {
    const dt = Math.min(remaining, MAX_STEP_SECONDS)
    remaining -= dt
    state.elapsedMs += dt * 1000
    applyThrottle(state, inputs, dt)
    applySteering(state, inputs, dt)
    moveWithCollisions(state, dt)
    applyCellEffects(state)
  }
  return state
}
```

- [x] **Step 2: Append regression tests to `tests/engine.test.mjs`**

```js
test('long frames record full elapsed time with identical physics', () => {
  const chopped = createRaceState(TEMPLATE_COURSES[0])
  const long = createRaceState(TEMPLATE_COURSES[0])
  for (let i = 0; i < 20; i++) stepRace(chopped, { up: true }, 0.05)
  for (let i = 0; i < 10; i++) stepRace(long, { up: true }, 0.1)
  assert.ok(Math.abs(long.elapsedMs - 1000) < 1e-6, `recorded ${long.elapsedMs}ms of 1000ms`)
  assert.equal(long.elapsedMs, chopped.elapsedMs)
  assert.equal(long.x, chopped.x)
  assert.equal(long.y, chopped.y)
  assert.equal(long.speed, chopped.speed)
})

test('a huge frame gap is clamped, not fast-forwarded', () => {
  const state = createRaceState(TEMPLATE_COURSES[0])
  stepRace(state, { up: true }, 5)
  assert.ok(Math.abs(state.elapsedMs - 250) < 1e-6)
})
```

- [x] **Step 3: Verify** — `npm test` (existing lap/determinism tests still pass — 1/60s steps are below the substep cap, so behavior is unchanged for normal frames) + `npm run lint` + `npm run build`.

- [x] **Step 4: Commit**

```bash
git add src/game/engine.js tests/engine.test.mjs
git commit -m "fix: race clock records real elapsed time via physics substeps"
```

---

### Task 3: P0 — visible save failures

**Review finding:** `src/services/storage.js:13-18` swallows failed writes (the comment claims an in-memory fallback that does not exist), and course/car save handlers navigate away as if the save succeeded. Quota or private-mode users lose work silently. Race night adds the largest values yet (~5KB ghost recordings), so writers must be able to see failure.

**Files:**
- Modify: `src/services/storage.js`, `src/services/courseService.js`, `src/services/carService.js`
- Modify: `src/pages/CourseBuilder.jsx`, `src/pages/CarDesigner.jsx`
- Create: `tests/storage.test.mjs`

**Interfaces:**
- Produces: `writeKey(key, value)` → `boolean`; `saveCourse(course)` → saved course `| null`; `savePlayerCar(imageDataUrl)` → `boolean`. Task 8's `saveGhostIfBest` returns the `writeKey` result. Low-stakes writers (votes, scores, invite code, settings) may still ignore the return value — reads fall back gracefully.

- [x] **Step 1: `storage.js`** — make `writeKey` report the outcome (and correct the misleading comment):

```js
/** Returns true when the value persisted; false when storage rejected it. */
export function writeKey(key, value) {
  try {
    localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value))
    return true
  } catch {
    return false // quota exceeded, private mode, or storage disabled
  }
}
```

- [x] **Step 2: `courseService.saveCourse`** — return `null` on a failed write:

```js
  const toStore = { ...course, votes: 0, isTemplate: false }
  const others = readUserCourses().filter((existing) => existing.id !== course.id)
  if (!writeKey(COURSES_KEY, [...others, toStore])) return null
  return toStore
```

(`copyCourse` now propagates `null` automatically; `CourseBrowser.jsx:26` already guards `if (copy)`.)

- [x] **Step 3: `carService.savePlayerCar`** — `return writeKey(CAR_KEY, { imageDataUrl })`.

- [x] **Step 4: `CourseBuilder.jsx`** — add `const [saveError, setSaveError] = useState(false)`; guard the save paths so a failed save stays on the page:

```js
  const persistCourse = () => {
    const saved = saveCourse({ ...course, name: name.trim() || 'Untitled Course', grid: editor.grid })
    if (!saved) {
      setSaveError(true)
      return null
    }
    setSaveError(false)
    dispatch({ type: 'saved' })
    return saved
  }

  const handleSave = () => {
    if (persistCourse()) navigate('/')
  }

  const handleTestDrive = () => {
    const saved = persistCourse()
    if (!saved) return
    // Swap the /build/new history entry for the saved id so Back returns here
    if (courseId === 'new') navigate(`/build/${saved.id}`, { replace: true })
    navigate(`/race/${saved.id}`)
  }
```

Also guard the Copy & Edit button (currently `navigate(\`/build/${copyCourse(course.id).id}\`)` — crashes on `null`):

```js
  onClick={() => {
    const copy = copyCourse(course.id)
    if (copy) navigate(`/build/${copy.id}`)
    else setSaveError(true)
  }}
```

Render near the top actions:

```jsx
  {saveError && (
    <Alert variant="danger" dismissible onClose={() => setSaveError(false)}>
      Couldn't save — browser storage is full or blocked. Your track is still here;
      free up space (or leave private browsing) and try again.
    </Alert>
  )}
```

- [x] **Step 5: `CarDesigner.jsx`** — same pattern: `saveError` state, `handleSave` only navigates when `savePlayerCar(paint.current)` returns true, matching dismissible Alert ("Your drawing is still here…").

- [x] **Step 6: Write `tests/storage.test.mjs`** — Node has no `localStorage`, which exercises the failure path directly (`storage.js` has no internal imports, so it loads as-is):

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readKey, writeKey } from '../src/services/storage.js'

test('writeKey reports failure when storage is unavailable', () => {
  assert.equal(writeKey('probe', { value: 1 }), false)
})

test('readKey falls back when storage is unavailable', () => {
  assert.equal(readKey('probe', 'fallback'), 'fallback')
})
```

- [x] **Step 7: Verify** — `npm test && npm run lint && npm run build`; manual smoke: saving a course and a car still works and navigates; DevTools → block storage (or fill quota) → save shows the alert and stays on the page.

- [x] **Step 8: Commit**

```bash
git add src/services/storage.js src/services/courseService.js src/services/carService.js src/pages/CourseBuilder.jsx src/pages/CarDesigner.jsx tests/storage.test.mjs
git commit -m "fix: surface storage write failures instead of silently losing work"
```

---

### Task 4: Autopilot module

**Files:**
- Create: `src/game/autopilot.js`
- Modify: `tests/engine.test.mjs` (use the module; delete the inline controller)

**Interfaces:**
- Produces: `createAutopilotCursor()` → `{ targetIdx: 1 }`; `autopilotInputs(state, cursor)` → `{ up, down, left, right, handbrake: false }`. Thresholds scale with `state.maxSpeedFactor` (defaults to 1 until Task 7 adds it — read with `?? 1`).

- [x] **Step 1: Write `src/game/autopilot.js`**

```js
// Steer-to-next-path-cell driver: throttles on straights, brakes into
// corners, reverses out when pinned. Drives rival ghosts and test runs.
import { CELL_SIZE } from './courseModel'
import { MAX_SPEED } from './engine'

const cellCenter = (cell) => ({ x: (cell.col + 0.5) * CELL_SIZE, y: (cell.row + 0.5) * CELL_SIZE })
const normalizeAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle))

export function createAutopilotCursor() {
  return { targetIdx: 1 }
}

export function autopilotInputs(state, cursor) {
  const reached = cellCenter(state.path[cursor.targetIdx])
  if (Math.hypot(reached.x - state.x, reached.y - state.y) < CELL_SIZE * 0.45) {
    cursor.targetIdx = (cursor.targetIdx + 1) % state.path.length
  }
  const target = cellCenter(state.path[cursor.targetIdx])
  const diff = normalizeAngle(Math.atan2(target.y - state.y, target.x - state.x) - state.heading)

  const stuck = Math.abs(state.speed) < 8 && Math.abs(diff) > 2.0
  if (stuck) {
    return { up: false, down: true, left: diff > 0, right: diff < 0, handbrake: false }
  }

  // Speed thresholds scale with the state's top-speed factor (rival pacing)
  const top = MAX_SPEED * (state.maxSpeedFactor ?? 1)
  const cornering = Math.abs(diff) > 0.35
  return {
    up: state.speed < top * 0.25 || (Math.abs(diff) < 1.0 && (!cornering || state.speed < top * 0.47)),
    down: cornering && state.speed > top * 0.53,
    left: diff < -0.05,
    right: diff > 0.05,
    handbrake: false,
  }
}
```

- [x] **Step 2: Refactor `tests/engine.test.mjs`** — delete `driveInputs`, `center`, `normalizeAngle`; instead:

```js
const { createAutopilotCursor, autopilotInputs } = await loadGameModule('autopilot')

function runToFinish(course, maxSimSeconds = 180) {
  const state = createRaceState(course)
  const cursor = createAutopilotCursor()
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
  }
  return state
}
```

- [x] **Step 3: Verify** — `npm test` all pass; `npm run lint`; `npm run build`.

- [x] **Step 4: Commit**

```bash
git add src/game/autopilot.js tests/engine.test.mjs
git commit -m "feat: shared autopilot driver module"
```

---

### Task 5: Settings service + Settings page

**Files:**
- Create: `src/services/settingsService.js`
- Create: `src/pages/Settings.jsx`
- Modify: `src/App.jsx` (route `/settings`), `src/pages/Home.jsx` (menu button)

**Interfaces:**
- Produces: `GHOST_MODES = { OFF: 'off', BEST: 'best', RIVALS: 'rivals', BOTH: 'both' }`; `getSettings()` → `{ ghosts, sound }`; `saveSettings(partial)` → merged settings. Task 11 consumes these in Race.

- [x] **Step 1: Write `src/services/settingsService.js`**

```js
import { readKey, writeKey } from './storage'

const SETTINGS_KEY = 'settings'

export const GHOST_MODES = { OFF: 'off', BEST: 'best', RIVALS: 'rivals', BOTH: 'both' }

const DEFAULT_SETTINGS = { ghosts: GHOST_MODES.BOTH, sound: true }

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readKey(SETTINGS_KEY, {}) }
}

export function saveSettings(partial) {
  const next = { ...getSettings(), ...partial }
  writeKey(SETTINGS_KEY, next)
  return next
}
```

- [x] **Step 2: Write `src/pages/Settings.jsx`**

```jsx
import { useState } from 'react'
import Card from 'react-bootstrap/Card'
import Container from 'react-bootstrap/Container'
import Form from 'react-bootstrap/Form'
import PageHeader from '../components/PageHeader'
import { GHOST_MODES, getSettings, saveSettings } from '../services/settingsService'

const GHOST_OPTIONS = [
  { value: GHOST_MODES.BOTH, label: 'Rivals + my best lap', help: 'Race everyone at once.' },
  { value: GHOST_MODES.RIVALS, label: 'Rivals only', help: 'Chase the leaderboard drivers on track.' },
  { value: GHOST_MODES.BEST, label: 'My best lap only', help: 'Classic time-trial ghost of your own record.' },
  { value: GHOST_MODES.OFF, label: 'No ghosts', help: 'Just you and the clock.' },
]

export default function Settings() {
  const [settings, setSettings] = useState(() => getSettings())
  const update = (partial) => setSettings(saveSettings(partial))

  return (
    <Container className="py-4">
      <PageHeader title="Settings" />
      <Card className="mb-3" style={{ maxWidth: '32rem' }}>
        <Card.Header className="text-uppercase small fw-bold">Ghost cars on track</Card.Header>
        <Card.Body>
          {GHOST_OPTIONS.map((option) => (
            <Form.Check
              key={option.value}
              type="radio"
              name="ghost-mode"
              id={`ghosts-${option.value}`}
              label={<>{option.label} <span className="text-secondary small">— {option.help}</span></>}
              checked={settings.ghosts === option.value}
              onChange={() => update({ ghosts: option.value })}
              className="mb-2"
            />
          ))}
        </Card.Body>
      </Card>
      <Card style={{ maxWidth: '32rem' }}>
        <Card.Header className="text-uppercase small fw-bold">Sound</Card.Header>
        <Card.Body>
          <Form.Check
            type="switch"
            id="sound-toggle"
            label="Engine, skid, and countdown sounds"
            checked={settings.sound}
            onChange={(event) => update({ sound: event.target.checked })}
          />
        </Card.Body>
      </Card>
    </Container>
  )
}
```

- [x] **Step 3: Wire route and menu** — `App.jsx`: `import Settings from './pages/Settings'` and add `<Route path="/settings" element={<Settings />} />` inside the layout route. `Home.jsx`: append `{ label: 'Settings', to: '/settings' }` to `SECONDARY_LINKS`.

- [x] **Step 4: Verify** — `npm run lint && npm run build`; smoke in `npm run dev`: toggle options, reload page, options persist.

- [x] **Step 5: Commit**

```bash
git add src/services/settingsService.js src/pages/Settings.jsx src/App.jsx src/pages/Home.jsx
git commit -m "feat: settings page for ghost mode and sound"
```

---

### Task 6: Oil slick + ramp pieces (model, art, palette, template)

**Files:**
- Modify: `src/game/courseModel.js` (pieces + openings)
- Modify: `src/game/render.js` (piece art)
- Modify: `src/pages/CourseBuilder.jsx` (palette)
- Modify: `src/game/templates.js` (Mad Town GP showcase)
- Modify: `tests/model.test.mjs` (template still validates; openings)

**Interfaces:**
- Produces: `PIECES.OIL = 'oil'`, `PIECES.RAMP = 'ramp'`, both drivable with N+S openings. Task 7 keys engine effects off these.

- [x] **Step 1: courseModel** — add to `PIECES`: `OIL: 'oil', RAMP: 'ramp'`; add to `BASE_OPENINGS`: `[PIECES.OIL]: ['N', 'S'], [PIECES.RAMP]: ['N', 'S'],`. (`isDrivable` already returns true for any non-obstacle piece.)

- [x] **Step 2: render.js piece art** — inside `drawTrackPiece` after the PIT block, add:

```js
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
```

Also extend the centerline-skip condition so ramp/oil markings stay readable: `if (piece !== PIECES.START && piece !== PIECES.BOOST && piece !== PIECES.RAMP)`.

- [x] **Step 3: Builder palette** — in `PALETTE_SECTIONS` Specials items, append:

```js
      { label: 'Oil Slick', piece: PIECES.OIL },
      { label: 'Ramp', piece: PIECES.RAMP },
```

- [x] **Step 4: Mad Town GP showcase** — in `templates.js` `MAD_TOWN_CELLS`: top row straights become `[2, 3, 4, 6, 8, 9]` plus `{ row: 1, col: 7, piece: PIECES.RAMP, rotation: 90 }`; bottom row straights become `[9, 8, 6, 4, 3, 2]` plus `{ row: 7, col: 5, piece: PIECES.OIL, rotation: 90 }` (keep the existing BOOST at row 7 col 7 and START at row 1 col 5).

- [x] **Step 5: Test additions** to `tests/model.test.mjs`:

```js
test('oil and ramp behave as straight-family connectivity', async () => {
  const { openEdges, isDrivable, PIECES: P } = await loadGameModule('courseModel')
  for (const piece of [P.OIL, P.RAMP]) {
    assert.deepEqual([...openEdges(piece, 90)].sort(), ['E', 'W'])
    assert.equal(isDrivable(piece), true)
  }
})
```

(The existing "templates derive" test now also covers Mad Town with oil + ramp.)

- [x] **Step 6: Verify + commit** — `npm test && npm run lint && npm run build`; smoke: new pieces appear in the palette, place/rotate/validate a loop through them.

```bash
git add src/game/courseModel.js src/game/render.js src/game/templates.js src/pages/CourseBuilder.jsx tests/model.test.mjs
git commit -m "feat: oil slick and ramp track pieces with builder palette and template showcase"
```

---

### Task 7: Engine — handbrake, oil, airborne, splits, pace factor

**Files:**
- Modify: `src/game/engine.js`
- Create: `tests/engine-features.test.mjs`

**Interfaces:**
- Consumes: `PIECES.OIL`, `PIECES.RAMP` (Task 6); the substepped `stepRace` frame loop (Task 2).
- Produces (new state fields on `createRaceState(course, { maxSpeedFactor = 1 } = {})`): `maxSpeedFactor`, `airborneMs: 0`, `lastSafe: {x, y}`, `boostCount: 0`, `splits: []` (elapsedMs pushed at every checkpoint AND lap-line crossing), `drifting: false`, `onOil: false`. New input: `handbrake`.

- [x] **Step 1: New constants** (near the existing ones):

```js
const HANDBRAKE_MIN_SPEED = 90 // px/s needed before the rear kicks out
const HANDBRAKE_TURN_MULTIPLIER = 1.6
const HANDBRAKE_SCRUB = 240 // px/s² extra speed loss while drifting
const OIL_STEER_FACTOR = 0.25
const OIL_FRICTION_FACTOR = 0.3
const RAMP_MIN_SPEED = MAX_SPEED * 0.4
const AIRBORNE_BASE_MS = 500
```

- [x] **Step 2: `createRaceState(course, options = {})`** — accept `{ maxSpeedFactor = 1 }`; add to the returned object:

```js
    maxSpeedFactor,
    airborneMs: 0,
    lastSafe: { x: startCenter.x, y: startCenter.y },
    boostCount: 0,
    splits: [],
    drifting: false,
    onOil: false,
```

- [x] **Step 3: Replace `applyThrottle` and `applySteering`**

```js
function applyThrottle(state, inputs, dt) {
  const topSpeed = MAX_SPEED * state.maxSpeedFactor
  if (inputs.up && !state.onOil) {
    if (state.speed > topSpeed) {
      // Boost pads push past top speed; the surplus bleeds off gradually
      state.speed = Math.max(state.speed - BOOST_DECAY * dt, topSpeed)
    } else {
      state.speed = Math.min(state.speed + ACCELERATION * dt, topSpeed)
    }
  } else if (inputs.down) {
    state.speed = Math.max(state.speed - BRAKE_DECELERATION * dt, REVERSE_MAX_SPEED)
  } else {
    // Oil carries speed: throttle is dead and friction drops way off
    const friction = COAST_FRICTION * (state.onOil ? OIL_FRICTION_FACTOR : 1)
    if (state.speed > 0) state.speed = Math.max(state.speed - friction * dt, 0)
    else if (state.speed < 0) state.speed = Math.min(state.speed + friction * dt, 0)
  }
  if (state.drifting) {
    state.speed = Math.max(state.speed - HANDBRAKE_SCRUB * dt, 0)
  }
}

function applySteering(state, inputs, dt) {
  state.drifting = Boolean(inputs.handbrake) && Math.abs(state.speed) > HANDBRAKE_MIN_SPEED
  const speedRatio = Math.min(Math.abs(state.speed) / (MAX_SPEED * 0.45), 1)
  if (speedRatio === 0) return
  const direction = (inputs.left ? -1 : 0) + (inputs.right ? 1 : 0)
  const reverseFactor = state.speed < 0 ? -1 : 1
  const authority = (state.onOil ? OIL_STEER_FACTOR : 1)
    * (state.drifting ? HANDBRAKE_TURN_MULTIPLIER : 1)
  state.heading += direction * reverseFactor * TURN_RATE * authority * speedRatio * dt
}
```

- [x] **Step 4: Airborne flow** — restructure `stepRace` around a per-substep `advanceSubstep` (keeping Task 2's real-time frame loop) and add `landCar`; also add the `lastSafe` update as the first line inside the successful-attempt branch of `moveWithCollisions` (before `return`): `state.lastSafe.x = attempt.x; state.lastSafe.y = attempt.y`.

```js
function landCar(state) {
  state.airborneMs = 0
  const { row, col } = gridCellAt(state.x, state.y)
  if (!isTrackCell(state.grid, row, col)) {
    // Missed the landing: back to the last on-track spot at half speed
    state.x = state.lastSafe.x
    state.y = state.lastSafe.y
    state.speed *= 0.5
  }
}

function advanceSubstep(state, inputs, dt) {
  state.elapsedMs += dt * 1000

  if (state.airborneMs > 0) {
    // Flying: no control, no cell effects, sails over non-track cells
    state.airborneMs -= dt * 1000
    state.x += Math.cos(state.heading) * state.speed * dt
    state.y += Math.sin(state.heading) * state.speed * dt
    state.drifting = false
    if (state.airborneMs <= 0) landCar(state)
    return
  }

  applyThrottle(state, inputs, dt)
  applySteering(state, inputs, dt)
  moveWithCollisions(state, dt)
  applyCellEffects(state)
}

export function stepRace(state, inputs, dtSeconds) {
  if (state.finished) return state
  // Keep real elapsed time but integrate physics in short, stable substeps
  let remaining = Math.min(dtSeconds, MAX_FRAME_SECONDS)
  while (remaining > 0 && !state.finished) {
    const dt = Math.min(remaining, MAX_STEP_SECONDS)
    remaining -= dt
    advanceSubstep(state, inputs, dt)
  }
  return state
}
```

- [x] **Step 5: `applyCellEffects` additions** — set `state.onOil = piece === PIECES.OIL` right after `piece` is computed; inside the BOOST branch add `state.boostCount += 1` and change the boost cap line to `Math.min(MAX_SPEED * state.maxSpeedFactor * 1.25, state.speed + BOOST_KICK)`; after the BOOST/PIT blocks (still inside `enteredNewCell` handling) add:

```js
  if (piece === PIECES.RAMP && enteredNewCell && Math.abs(state.speed) >= RAMP_MIN_SPEED) {
    const speedRatio = Math.min(Math.max(Math.abs(state.speed) / MAX_SPEED, 0.5), 1.25)
    state.airborneMs = AIRBORNE_BASE_MS * speedRatio
  }
```

In the checkpoint branch add `state.splits.push(state.elapsedMs)`; in the lap-line branch add `state.splits.push(state.elapsedMs)` before the lap increment.

- [x] **Step 6: Write `tests/engine-features.test.mjs`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { CELL_SIZE, PIECES, createEmptyGrid } = await loadGameModule('courseModel')
const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')

// Long straight corridor rows 1..8 at col 5 turned into a loop is overkill —
// use Mad Town GP (has oil + ramp on the loop) plus a synthetic strip where
// piece behavior is isolated.
function stripCourse(specialPiece, specialRow) {
  // Vertical loop: col 3 runs N-S rows 1..8, col 6 returns, curves join them.
  const grid = createEmptyGrid()
  const put = (row, col, piece, rotation) => { grid[row][col] = { piece, rotation } }
  put(1, 3, PIECES.CURVE, 90); put(1, 4, PIECES.STRAIGHT, 90); put(1, 5, PIECES.STRAIGHT, 90); put(1, 6, PIECES.CURVE, 180)
  for (let row = 2; row <= 7; row++) { put(row, 3, PIECES.STRAIGHT, 0); put(row, 6, PIECES.STRAIGHT, 0) }
  put(8, 3, PIECES.CURVE, 0); put(8, 4, PIECES.STRAIGHT, 90); put(8, 5, PIECES.STRAIGHT, 90); put(8, 6, PIECES.CURVE, 270)
  put(2, 3, PIECES.START, 0)
  if (specialPiece) put(specialRow, 3, specialPiece, 0)
  return { id: 'test-strip', name: 'Strip', grid }
}

function press(state, inputs, frames) {
  for (let i = 0; i < frames; i++) stepRace(state, inputs, 1 / 60)
}

test('handbrake tightens the turn', () => {
  const plain = createRaceState(stripCourse())
  const drift = createRaceState(stripCourse())
  press(plain, { up: true }, 90) // get to speed heading down the straight
  press(drift, { up: true }, 90)
  const headingBefore = plain.heading
  press(plain, { right: true }, 20)
  press(drift, { right: true, handbrake: true }, 20)
  assert.ok(
    Math.abs(drift.heading - headingBefore) > Math.abs(plain.heading - headingBefore) * 1.3,
    'handbrake must rotate noticeably faster',
  )
})

test('oil kills steering authority', () => {
  const onRoad = createRaceState(stripCourse())
  const onOil = createRaceState(stripCourse(PIECES.OIL, 5))
  press(onRoad, { up: true }, 120) // both cars are near row 5 by now
  press(onOil, { up: true }, 120)
  const roadHeading = onRoad.heading
  const oilHeading = onOil.heading
  press(onRoad, { right: true }, 12)
  press(onOil, { right: true }, 12)
  assert.ok(onOil.onOil, 'car must be on the slick')
  assert.ok(
    Math.abs(onOil.heading - oilHeading) < Math.abs(onRoad.heading - roadHeading) * 0.5,
    'steering on oil must be far weaker',
  )
})

test('ramp launches airborne and lands back on track', () => {
  const state = createRaceState(stripCourse(PIECES.RAMP, 5))
  press(state, { up: true }, 120)
  let flew = false
  for (let i = 0; i < 240 && !flew; i++) {
    stepRace(state, { up: true }, 1 / 60)
    if (state.airborneMs > 0) flew = true
  }
  assert.ok(flew, 'ramp at speed must launch the car')
  press(state, { up: true }, 120)
  assert.equal(state.airborneMs, 0)
  const col = Math.floor(state.x / CELL_SIZE)
  assert.ok([3, 4, 5, 6].includes(col), 'car must end up on/near the loop')
})

test('splits record at checkpoints and boostCount increments on Mad Town', async () => {
  const { createAutopilotCursor, autopilotInputs } = await loadGameModule('autopilot')
  const madTown = TEMPLATE_COURSES.find((c) => c.id === 'tpl-mad-town-gp')
  const state = createRaceState(madTown)
  const cursor = createAutopilotCursor()
  for (let i = 0; i < 180 * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
  }
  assert.equal(state.finished, true, 'autopilot survives oil + ramp on the loop')
  assert.ok(state.boostCount >= 1, 'boost pads counted')
  const expectedSplits = (state.checkpoints.length + 1) * state.totalLaps
  assert.equal(state.splits.length, expectedSplits)
  for (let i = 1; i < state.splits.length; i++) {
    assert.ok(state.splits[i] > state.splits[i - 1], 'splits strictly increase')
  }
})
```

**Note:** if the Mad Town autopilot test fails because the ramp launch overshoots the corner (bounce-loop), move the ramp from row 1 col 7 to row 1 col 3 in `templates.js` (lands mid-straight) and re-run — do NOT weaken the engine to pass the test.

- [x] **Step 7: Verify** — `npm test` (all files) + `npm run lint` + `npm run build`. Manual smoke: Space drifts audibly tighter on `/#/race/tpl-ring-road`; oil/ramp behave on Mad Town.

- [x] **Step 8: Commit**

```bash
git add src/game/engine.js tests/engine-features.test.mjs src/game/templates.js
git commit -m "feat: handbrake drift, oil and ramp physics, split tracking"
```

---

### Task 8: Ghost logic + ghost persistence

**Files:**
- Create: `src/game/ghosts.js`
- Create: `src/services/ghostService.js`
- Create: `tests/ghosts.test.mjs`

**Interfaces:**
- Consumes: `createRaceState(course, { maxSpeedFactor })`, `stepRace`, `autopilotInputs`, `createAutopilotCursor`.
- Produces:
  - `simulateRunMs(course, maxSpeedFactor = 1)` → finish `elapsedMs | null`
  - `createRivalGhosts(course, rivalTimes, count = 2)` → `[{ id, name, color, state, cursor, accumulator }]` (rivalTimes = `getRivalTimes(courseId)` shape `{ id, name, ms }` — injected, no service import)
  - `stepRivalGhosts(ghosts, dtSeconds)` — fixed 60Hz accumulator
  - `createGhostRecorder(sampleMs = 100)` → `{ sample(state), finish(state) }`; recording = `{ ms, sampleMs, samples: [[x, y, headingMilli]], splits: [] }`
  - `ghostPoseAt(recording, elapsedMs)` → `{ x, y, heading } | null`
  - `ghostService`: `loadGhost(courseId)` → recording | null; `saveGhostIfBest(courseId, recording)` → boolean (false when not a best OR when the write failed — Task 3's `writeKey` contract)

- [x] **Step 1: Write `src/game/ghosts.js`**

```js
// Ghost cars: live autopilot rivals pace-matched to leaderboard times, and
// recording/playback of the player's best run. Pure — data is injected.
import { createRaceState, stepRace, TOTAL_LAPS } from './engine'
import { autopilotInputs, createAutopilotCursor } from './autopilot'

export const RIVAL_GHOST_COLORS = ['#17a2b8', '#7d3c98']

const GHOST_STEP_SECONDS = 1 / 60
const PACE_FACTOR_MIN = 0.4
const PACE_FACTOR_MAX = 1.1

/** Fast-forward an autopilot run to measure its finish time on this course. */
export function simulateRunMs(course, maxSpeedFactor = 1, maxSimSeconds = 240) {
  const state = createRaceState(course, { maxSpeedFactor })
  const cursor = createAutopilotCursor()
  for (let i = 0; i < maxSimSeconds * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), GHOST_STEP_SECONDS)
  }
  return state.finished ? state.elapsedMs : null
}

/** Up to `count` fastest rivals as live-driven ghost race states. */
export function createRivalGhosts(course, rivalTimes, count = 2) {
  const naturalMs = simulateRunMs(course, 1)
  if (!naturalMs) return []
  return [...rivalTimes]
    .sort((a, b) => a.ms - b.ms)
    .slice(0, count)
    .map((rival, index) => ({
      id: rival.id,
      name: rival.name,
      color: RIVAL_GHOST_COLORS[index % RIVAL_GHOST_COLORS.length],
      state: createRaceState(course, {
        maxSpeedFactor: Math.min(PACE_FACTOR_MAX, Math.max(PACE_FACTOR_MIN, naturalMs / rival.ms)),
      }),
      cursor: createAutopilotCursor(),
      accumulator: 0,
    }))
}

/** Advance rival ghosts on a fixed timestep so their runs are deterministic. */
export function stepRivalGhosts(ghosts, dtSeconds) {
  for (const ghost of ghosts) {
    if (ghost.state.finished) continue
    ghost.accumulator += dtSeconds
    while (ghost.accumulator >= GHOST_STEP_SECONDS && !ghost.state.finished) {
      ghost.accumulator -= GHOST_STEP_SECONDS
      stepRace(ghost.state, autopilotInputs(ghost.state, ghost.cursor), GHOST_STEP_SECONDS)
    }
  }
}

/** Samples the player run at fixed sim-time intervals for later replay. */
export function createGhostRecorder(sampleMs = 100) {
  const samples = []
  return {
    sample(state) {
      while (state.elapsedMs >= samples.length * sampleMs) {
        samples.push([Math.round(state.x), Math.round(state.y), Math.round(state.heading * 1000)])
      }
    },
    finish(state) {
      return { ms: Math.round(state.elapsedMs), sampleMs, samples, splits: [...state.splits] }
    },
  }
}

const lerp = (a, b, t) => a + (b - a) * t

/** Interpolated ghost pose at race time, or null once the recording ends. */
export function ghostPoseAt(recording, elapsedMs) {
  if (!recording || elapsedMs > recording.ms) return null
  const exact = elapsedMs / recording.sampleMs
  const index = Math.min(Math.floor(exact), recording.samples.length - 1)
  const next = Math.min(index + 1, recording.samples.length - 1)
  const t = exact - index
  const [x0, y0, h0] = recording.samples[index]
  const [x1, y1, h1] = recording.samples[next]
  // Shortest-arc heading interpolation
  const delta = Math.atan2(Math.sin((h1 - h0) / 1000), Math.cos((h1 - h0) / 1000))
  return { x: lerp(x0, x1, t), y: lerp(y0, y1, t), heading: h0 / 1000 + delta * t }
}

export { TOTAL_LAPS }
```

- [x] **Step 2: Write `src/services/ghostService.js`**

```js
// Best-run ghost recordings, one per course.
import { readKey, writeKey } from './storage'

const GHOSTS_KEY = 'ghostLaps'

export function loadGhost(courseId) {
  return readKey(GHOSTS_KEY, {})[courseId] ?? null
}

/** Persist only when this run beats the stored recording; false if the write failed. */
export function saveGhostIfBest(courseId, recording) {
  if (!recording?.samples?.length) return false
  const all = readKey(GHOSTS_KEY, {})
  const existing = all[courseId]
  if (existing && existing.ms <= recording.ms) return false
  return writeKey(GHOSTS_KEY, { ...all, [courseId]: recording })
}
```

- [x] **Step 3: Write `tests/ghosts.test.mjs`**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { TEMPLATE_COURSES } = await loadGameModule('templates')
const { createRaceState, stepRace } = await loadGameModule('engine')
const { createAutopilotCursor, autopilotInputs } = await loadGameModule('autopilot')
const {
  simulateRunMs, createRivalGhosts, stepRivalGhosts, createGhostRecorder, ghostPoseAt,
} = await loadGameModule('ghosts')

const ring = TEMPLATE_COURSES[0]

test('pace factor lands rivals near their target times', () => {
  const natural = simulateRunMs(ring, 1)
  assert.ok(natural, 'natural run finishes')
  const target = natural * 1.5 // a mid-pack rival, inside the clamp range
  const ghosts = createRivalGhosts(ring, [{ id: 'r', name: 'R', ms: target }], 1)
  const paced = simulateRunMs(ring, ghosts[0].state.maxSpeedFactor)
  assert.ok(Math.abs(paced - target) / target < 0.15, `paced ${paced} vs target ${target}`)
})

test('stepRivalGhosts advances deterministically to a finish', () => {
  const run = () => {
    const ghosts = createRivalGhosts(ring, [{ id: 'r', name: 'R', ms: 40000 }], 1)
    for (let i = 0; i < 120 * 60 && !ghosts[0].state.finished; i++) stepRivalGhosts(ghosts, 1 / 60)
    return ghosts[0].state.elapsedMs
  }
  const first = run()
  assert.ok(first > 0)
  assert.equal(run(), first)
})

test('recorder + interpolation round-trip', () => {
  const state = createRaceState(ring)
  const cursor = createAutopilotCursor()
  const recorder = createGhostRecorder(100)
  for (let i = 0; i < 60 * 60 && !state.finished; i++) {
    stepRace(state, autopilotInputs(state, cursor), 1 / 60)
    recorder.sample(state)
  }
  const recording = recorder.finish(state)
  assert.ok(recording.samples.length > 50)
  assert.equal(recording.splits.length, (state.checkpoints.length + 1) * state.totalLaps)

  const sampleIndex = 40
  const pose = ghostPoseAt(recording, sampleIndex * 100)
  assert.equal(Math.round(pose.x), recording.samples[sampleIndex][0])
  assert.equal(Math.round(pose.y), recording.samples[sampleIndex][1])
  assert.equal(ghostPoseAt(recording, recording.ms + 1), null, 'ghost disappears after its run')
})
```

- [x] **Step 4: Verify + commit** — `npm test && npm run lint && npm run build`.

```bash
git add src/game/ghosts.js src/services/ghostService.js tests/ghosts.test.mjs
git commit -m "feat: ghost recording, playback, and pace-matched rival simulation"
```

---

### Task 9: Synthesized race audio

**Files:**
- Create: `src/game/audio.js`

**Interfaces:**
- Produces: `class RaceAudio` — `init()` (create/resume AudioContext; call from a user-gesture handler), `setEnabled(bool)`, `update(speedRatio, drifting)`, `boost()`, `countdownBeep(isGo)`, `stop()`. All methods are safe no-ops before `init()`.

- [x] **Step 1: Write `src/game/audio.js`**

```js
// Fully synthesized race audio — no asset files. Engine hum pitched by
// speed, noise-based skid, boost sweep, countdown beeps. The AudioContext
// is created in init(), which must be called from a user gesture.
const MASTER_GAIN = 0.4
const RAMP_SECONDS = 0.06

export class RaceAudio {
  #ctx = null
  #master = null
  #engineOsc = null
  #engineGain = null
  #skidGain = null
  #enabled = true

  init() {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') this.#ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.#ctx = ctx

    this.#master = ctx.createGain()
    this.#master.gain.value = this.#enabled ? MASTER_GAIN : 0
    this.#master.connect(ctx.destination)

    this.#engineOsc = ctx.createOscillator()
    this.#engineOsc.type = 'sawtooth'
    this.#engineOsc.frequency.value = 50
    const engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 420
    this.#engineGain = ctx.createGain()
    this.#engineGain.gain.value = 0
    this.#engineOsc.connect(engineFilter).connect(this.#engineGain).connect(this.#master)
    this.#engineOsc.start()

    // One second of looping white noise for the skid hiss
    const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    for (let i = 0; i < channel.length; i++) channel[i] = (((i * 1103515245 + 12345) >>> 16) % 2000) / 1000 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    noise.loop = true
    const skidFilter = ctx.createBiquadFilter()
    skidFilter.type = 'bandpass'
    skidFilter.frequency.value = 900
    this.#skidGain = ctx.createGain()
    this.#skidGain.gain.value = 0
    noise.connect(skidFilter).connect(this.#skidGain).connect(this.#master)
    noise.start()
  }

  setEnabled(enabled) {
    this.#enabled = enabled
    this.#master?.gain.setTargetAtTime(enabled ? MASTER_GAIN : 0, this.#ctx.currentTime, RAMP_SECONDS)
  }

  update(speedRatio, drifting) {
    if (!this.#ctx) return
    const now = this.#ctx.currentTime
    this.#engineOsc.frequency.setTargetAtTime(50 + 95 * speedRatio, now, RAMP_SECONDS)
    this.#engineGain.gain.setTargetAtTime(speedRatio > 0.02 ? 0.06 + 0.1 * speedRatio : 0, now, RAMP_SECONDS)
    this.#skidGain.gain.setTargetAtTime(drifting ? 0.12 : 0, now, RAMP_SECONDS)
  }

  #blip(frequencyFrom, frequencyTo, durationSeconds, type = 'square', gainPeak = 0.12) {
    if (!this.#ctx) return
    const ctx = this.#ctx
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(frequencyFrom, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(frequencyTo, ctx.currentTime + durationSeconds)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(gainPeak, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSeconds)
    osc.connect(gain).connect(this.#master)
    osc.start()
    osc.stop(ctx.currentTime + durationSeconds)
  }

  boost() { this.#blip(220, 660, 0.3) }

  countdownBeep(isGo) {
    if (isGo) this.#blip(880, 880, 0.5, 'sine')
    else this.#blip(660, 660, 0.12, 'sine')
  }

  stop() {
    this.#ctx?.close()
    this.#ctx = null
    this.#master = null
    this.#engineOsc = null
    this.#engineGain = null
    this.#skidGain = null
  }
}
```

- [x] **Step 2: Verify + commit** — `npm run lint && npm run build` (no Node test — WebAudio is browser-only; Task 11 smoke-tests it).

```bash
git add src/game/audio.js
git commit -m "feat: synthesized race audio module"
```

---

### Task 10: Render — scene frame, ghost cars, sparks, skid marks, airborne

**Files:**
- Modify: `src/game/render.js`

**Interfaces:**
- Consumes: `state.airborneMs`, `state.drifting`, ghost objects from Task 8.
- Produces (Task 11 consumes):
  - `drawFrame(ctx, scene)` — **signature change**; `scene = { background, marks, state, carImage, bestGhostPose, rivalGhosts, sparks }` (`marks`, poses, ghosts, sparks all optional)
  - `createMarksOverlay()` → canvas; `stampSkidMarks(marksCtx, state)`
  - `createSparkBurst(seed, x, y)` → particle array; `updateAndDrawSparks(ctx, sparks, dtMs)` → surviving particles
  - `drawGhostCar(ctx, pose, color, label)`

- [x] **Step 1: Replace the car/frame section at the bottom of `render.js`** (everything from `const CAR_DRAW_SIZE` down) with:

```js
const CAR_DRAW_SIZE = 48
const SKID_COLOR = 'rgba(18, 18, 24, 0.16)'
const SPARK_LIFE_MS = 420

function drawCheckpointHighlight(ctx, state) {
  /* keep the existing implementation of this function unchanged */
}

/** Deterministic PRNG so particle bursts never touch Math.random. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
```

**Note:** keep `drawCheckpointHighlight` exactly as it exists today (the comment above marks it as unchanged); spark aging happens in the loop via `updateAndDrawSparks(ctx, sparks, dtMs)` — the `drawFrame` call with `dtMs = 0` only paints leftovers when the sim is paused. Task 11 owns the aging call; to avoid double-drawing, Task 11 passes `sparks: []` into `drawFrame` and calls `updateAndDrawSparks` itself right after — see Task 11 Step 1.

- [x] **Step 2: Verify** — `npm run lint && npm run build` (call-site update happens in Task 11; the build will fail if `useRaceLoop` still uses the old signature — update the call there in the same commit if needed, or commit Tasks 10+11 together). **Preferred: implement Task 10 and Task 11 back-to-back, verifying the build after Task 11, with a single combined smoke test.**

- [x] **Step 3: Commit**

```bash
git add src/game/render.js
git commit -m "feat: ghost cars, spark particles, skid overlay, airborne rendering"
```

---

### Task 11: Race loop + Race screen integration

**Files:**
- Modify: `src/hooks/useRaceLoop.js`
- Modify: `src/pages/Race.jsx`
- Modify: `src/styles/theme.css` (split chip style)

**Interfaces:**
- Consumes: everything from Tasks 5–10.
- Produces: `useRaceLoop(canvasRef, course, carImage, { racing, onFinish, settings, audioRef })` → `{ hud, restart }`; `hud` gains `split: { deltaMs, id } | null`.

- [x] **Step 1: Rewrite `src/hooks/useRaceLoop.js`**

```js
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRaceState, stepRace, MAX_SPEED, TOTAL_LAPS } from '../game/engine'
import {
  createCourseBackground, createMarksOverlay, createSparkBurst, drawFrame,
  stampSkidMarks, updateAndDrawSparks,
} from '../game/render'
import {
  createGhostRecorder, createRivalGhosts, ghostPoseAt, stepRivalGhosts,
} from '../game/ghosts'
import { loadGhost, saveGhostIfBest } from '../services/ghostService'
import { getRivalTimes } from '../services/scoreService'
import { GHOST_MODES } from '../services/settingsService'

const KEY_BINDINGS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
}

const HUD_INTERVAL_MS = 100
const OIL_SKID_MIN_SPEED = 120

const hudSnapshot = (state, split) => ({
  elapsedMs: state.elapsedMs,
  speed: Math.abs(state.speed),
  lap: Math.min(state.lap + 1, state.totalLaps),
  totalLaps: state.totalLaps,
  nextCheckpoint: state.nextCheckpoint,
  checkpointTotal: state.checkpoints.length,
  split,
})

/**
 * Owns the requestAnimationFrame loop, keyboard input, race state, ghosts,
 * particles, skid marks, and audio updates. The animation loop only runs
 * while `racing`; countdown/pause render a single static frame.
 */
export function useRaceLoop(canvasRef, course, carImage, { racing, onFinish, settings, audioRef }) {
  const raceStateRef = useRef(null)
  const inputsRef = useRef({ up: false, down: false, left: false, right: false, handbrake: false })
  const finishSentRef = useRef(false)
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish

  const rivalGhostsRef = useRef([])
  const bestGhostRef = useRef(null)
  const recorderRef = useRef(null)
  const marksRef = useRef(null)
  const sparksRef = useRef([])
  const lastBoostCountRef = useRef(0)
  const splitRef = useRef(null)
  const lastSplitCountRef = useRef(0)
  const drawSceneRef = useRef(null) // lets restart() repaint while paused

  const [hud, setHud] = useState({
    elapsedMs: 0, speed: 0, lap: 1, totalLaps: TOTAL_LAPS,
    nextCheckpoint: 0, checkpointTotal: 0, split: null,
  })

  const background = useMemo(
    () => (course ? createCourseBackground(course) : null),
    [course],
  )

  const wantBest = settings.ghosts === GHOST_MODES.BEST || settings.ghosts === GHOST_MODES.BOTH
  const wantRivals = settings.ghosts === GHOST_MODES.RIVALS || settings.ghosts === GHOST_MODES.BOTH

  const restart = useCallback(() => {
    if (!course) return
    raceStateRef.current = createRaceState(course)
    finishSentRef.current = false
    recorderRef.current = createGhostRecorder()
    marksRef.current = createMarksOverlay()
    sparksRef.current = []
    lastBoostCountRef.current = 0
    splitRef.current = null
    lastSplitCountRef.current = 0
    bestGhostRef.current = wantBest ? loadGhost(course.id) : null
    rivalGhostsRef.current = wantRivals ? createRivalGhosts(course, getRivalTimes(course.id)) : []
    setHud(hudSnapshot(raceStateRef.current, null))
    drawSceneRef.current?.(0) // repaint immediately (Restart is reachable from the pause modal)
  }, [course, wantBest, wantRivals])

  useEffect(() => { restart() }, [restart])

  useEffect(() => {
    const setInput = (pressed) => (event) => {
      const control = KEY_BINDINGS[event.code]
      if (!control) return
      event.preventDefault()
      inputsRef.current[control] = pressed
      if (pressed) audioRef.current?.init() // user gesture: safe to start audio
    }
    const handleKeyDown = setInput(true)
    const handleKeyUp = setInput(false)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [audioRef])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !background) return undefined

    const ctx = canvas.getContext('2d')

    const drawScene = (dtMs) => {
      const state = raceStateRef.current
      if (!state) return
      drawFrame(ctx, {
        background,
        marks: marksRef.current,
        state,
        carImage,
        bestGhostPose: racing && bestGhostRef.current
          ? ghostPoseAt(bestGhostRef.current, state.elapsedMs)
          : null,
        rivalGhosts: rivalGhostsRef.current,
        sparks: [],
      })
      sparksRef.current = updateAndDrawSparks(ctx, sparksRef.current, dtMs)
    }
    drawSceneRef.current = drawScene

    if (!racing) {
      // Countdown/pause: one static frame, engine muted, no animation loop
      drawScene(0)
      audioRef.current?.update(0, false)
      return () => { drawSceneRef.current = null }
    }

    let frameId = 0
    let lastTimestamp = null
    let hudDueAt = 0

    const frame = (timestamp) => {
      const state = raceStateRef.current
      if (state) {
        const dt = lastTimestamp === null ? 0 : (timestamp - lastTimestamp) / 1000
        lastTimestamp = timestamp

        if (dt > 0) {
          stepRace(state, inputsRef.current, dt)
          stepRivalGhosts(rivalGhostsRef.current, dt)
          recorderRef.current.sample(state)

          audioRef.current?.update(
            Math.abs(state.speed) / (MAX_SPEED * 1.25),
            state.drifting || state.onOil,
          )

          if (state.boostCount !== lastBoostCountRef.current) {
            lastBoostCountRef.current = state.boostCount
            sparksRef.current.push(...createSparkBurst(state.boostCount, state.x, state.y))
            audioRef.current?.boost()
          }

          if (state.drifting || (state.onOil && Math.abs(state.speed) > OIL_SKID_MIN_SPEED)) {
            stampSkidMarks(marksRef.current.getContext('2d'), state)
          }

          if (state.splits.length !== lastSplitCountRef.current) {
            lastSplitCountRef.current = state.splits.length
            const index = state.splits.length - 1
            const bestSplit = bestGhostRef.current?.splits?.[index]
            if (bestSplit != null) {
              splitRef.current = { deltaMs: state.splits[index] - bestSplit, id: state.splits.length }
            }
          }
        }

        drawScene(dt * 1000)

        if (timestamp >= hudDueAt) {
          hudDueAt = timestamp + HUD_INTERVAL_MS
          setHud(hudSnapshot(state, splitRef.current))
        }

        if (state.finished && !finishSentRef.current) {
          finishSentRef.current = true
          saveGhostIfBest(course.id, recorderRef.current.finish(state))
          onFinishRef.current?.(state.elapsedMs)
        }
      }
      frameId = requestAnimationFrame(frame)
    }

    frameId = requestAnimationFrame(frame)
    return () => {
      drawSceneRef.current = null
      cancelAnimationFrame(frameId)
    }
  }, [canvasRef, background, carImage, racing, course, audioRef])

  return { hud, restart }
}
```

- [x] **Step 2: Update `src/pages/Race.jsx`** — changes only (rest of the file stays):

```jsx
// New imports
import { RaceAudio } from '../game/audio'
import { getSettings, saveSettings } from '../services/settingsService'

// Inside the component, before useRaceLoop:
const settings = useMemo(() => getSettings(), [])
const [soundOn, setSoundOn] = useState(settings.sound)
const audioRef = useRef(null)

useEffect(() => {
  audioRef.current = new RaceAudio()
  return () => audioRef.current?.stop()
}, [])

useEffect(() => {
  audioRef.current?.setEnabled(soundOn)
}, [soundOn])

const toggleSound = () => {
  setSoundOn((prev) => {
    saveSettings({ sound: !prev })
    return !prev
  })
}

// Pass settings + audioRef into the loop:
const { hud, restart } = useRaceLoop(canvasRef, courseCheck?.ok ? course : null, carImage, {
  racing,
  onFinish: handleFinish,
  settings,
  audioRef,
})

// Countdown beeps — extend the existing countdown effect:
//   when countdown > 0: audioRef.current?.countdownBeep(false)
//   when countdown === 0 (GO! flash): audioRef.current?.countdownBeep(true)

// Split chip state:
const [visibleSplit, setVisibleSplit] = useState(null)
useEffect(() => {
  if (!hud.split) return undefined
  setVisibleSplit(hud.split)
  const timer = setTimeout(() => setVisibleSplit(null), 1500)
  return () => clearTimeout(timer)
}, [hud.split?.id])

// In the HUD row, after the CHECK badge:
{visibleSplit && (
  <span
    className={`wr-split-chip ${visibleSplit.deltaMs <= 0 ? 'wr-split-ahead' : 'wr-split-behind'}`}
    role="status"
  >
    {visibleSplit.deltaMs <= 0 ? '−' : '+'}
    {(Math.abs(visibleSplit.deltaMs) / 1000).toFixed(1)}s
  </span>
)}

// Sound quick toggle button next to Pause:
<Button
  variant="outline-secondary"
  onClick={toggleSound}
  aria-pressed={soundOn}
  aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
>
  {soundOn ? '🔊' : '🔇'}
</Button>

// Update the keyboard hint Alert copy:
// "Steer with ← ↑ → ↓ (or WASD). Space = handbrake drift. Esc pauses.
//  Hit the glowing checkpoints in order — 3 laps to finish!"
```

**Effect-dep note:** the split-chip effect keys on `hud.split?.id` so repeat deltas re-trigger; oxlint may ask for `hud.split` — use `[hud.split]` if flagged (id changes identity anyway).

- [x] **Step 3: Split chip styles** in `theme.css`:

```css
.wr-split-chip {
  font-family: var(--wr-font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 1.05rem;
  font-weight: 700;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
  color: #ffffff;
}

.wr-split-ahead { background: var(--wr-turf); }
.wr-split-behind { background: var(--wr-red); }
```

- [x] **Step 4: Verify** — `npm test && npm run lint && npm run build`. Manual smoke on `/#/race/tpl-ring-road`:
  - Countdown beeps after first keypress; engine hum rises with speed; 🔇 silences instantly
  - Two rival silhouettes launch at GO and drive the course at different paces
  - Finish once → race again → translucent copy of your car replays your run; split chips appear at checkpoints (green when ahead)
  - Space at speed: car rotates faster, skid marks accumulate
  - Mad Town GP: ramp launches (bigger car + shadow), oil slides, boost sparks fire
  - Settings → "No ghosts" → race is clean of ghosts
  - Esc pause: frame freezes, engine hum stops, no continuous rAF work (check the Performance tab); Restart from the pause modal repaints the reset track before the countdown

- [x] **Step 5: Commit**

```bash
git add src/hooks/useRaceLoop.js src/pages/Race.jsx src/styles/theme.css
git commit -m "feat: ghosts, splits, drift marks, sparks, and audio in the race screen"
```

---

### Task 12: Final regression + push

- [x] **Step 1:** `npm test && npm run lint && npm run build` — all green.
- [x] **Step 2:** Full manual regression in `npm run dev`: every navigation edge still works; Builder places/rotates/validates oil + ramp; Browse thumbnails render the new pieces; Results/Leaderboard unaffected; Settings persists across reloads; clear site data → templates and defaults still load.
- [x] **Step 2b (P0 verification):** DevTools → Performance → 6× CPU throttle → race a lap: the HUD timer tracks wall-clock time (compare against a stopwatch). DevTools → Application → block storage (or fill quota): course and car saves show the error alert and stay on the page.
- [x] **Step 3:** Accessibility spot-check: Settings radios/switch labeled and keyboard-reachable; split chip readable by −/+ prefix; sound never plays before a keypress.
- [x] **Step 4:** Commit any tuning deltas, then `git push origin dev`. Do NOT merge to `main`.

---

## Self-review notes

- **Spec coverage:** review P0 timing fix (T2), review P0 save-failure fix (T3, plus T8's `saveGhostIfBest`), review P2 paused-loop fix (T11), Settings (T5), best ghost + rival ghosts + pace matching (T8, T11), splits (T7, T11), skid marks/sparks (T10, T11), audio (T9, T11), handbrake (T7), oil + ramp + palette + Mad Town (T6, T7), tests (T1, T2, T3, T7, T8). Spec's `totalCheckpointsPassed` is realized as `state.splits.length` — one field serves both needs.
- **Ordering rationale:** T2 must precede all ghost work — recordings, splits, and pace matching persist `elapsedMs`-derived data, so ghost laps recorded against the broken clock would be permanently unfair. T3 precedes T8 so `ghostService` is written against the boolean `writeKey` contract from the start.
- **Type consistency:** recording `{ ms, sampleMs, samples, splits }` shared by T8 recorder/service/`ghostPoseAt` and T11; ghost entry `{ id, name, color, state, cursor, accumulator }` shared by T8/T10/T11; `drawFrame(ctx, scene)` produced in T10, consumed in T11; `useRaceLoop` options `{ racing, onFinish, settings, audioRef }` produced T11, fed from Race.jsx.
- **Known coupling:** T10's `drawFrame` signature change breaks the build until T11 lands — execute T10+T11 back-to-back (noted in T10). T7 keeps T2's substep loop (`advanceSubstep` runs per substep, so airborne timing and splits stay real-time accurate).
- **No service imports in `src/game/`** — `ghosts.js` takes rival times as a parameter; `useRaceLoop` (a hook, not game code) does the injection.
- **Out of scope (tracked in `WEB_PROJECT_REVIEW.md`):** mobile race controls, secondary-text contrast token, canvas accessibility narration, README replacement, route-level lazy loading, not-found route, false-affordance cleanup. These do not touch race-night code paths and land as their own follow-up.
