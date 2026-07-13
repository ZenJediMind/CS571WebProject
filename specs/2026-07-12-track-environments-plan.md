# Living Racing Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every course a selectable racing "Setting" (Grand Prix, Rally Forest, Desert Rally, Motocross, Night Street) that repaints the environment and adds a subtle per-surface grip flavor.

**Architecture:** One new source-of-truth module `src/game/themes.js` holds every theme (look + track tints + grip). The renderer, engine, builder, and thumbnails all resolve a theme by `course.theme`. A tiny extracted `src/game/rng.js` shares the deterministic PRNG between renderer and themes. Grip is a single steering-authority multiplier applied in one place in the engine.

**Tech Stack:** React 19, react-bootstrap 2.10, Vite 8, plain ES modules, Canvas 2D. Tests: `node --test` on `tests/*.test.mjs` via the `loadGameModule` import-rewriter.

## Global Constraints

- **No `Math.random` in game logic** — all randomness is deterministic via `mulberry32(seed)`; races and redraws must replay identically. (verbatim project rule: "Try to be as deterministic as possible.")
- **`src/game/*` modules must import DOM-free at module load** — `loadGameModule` imports them in Node. Canvas calls are allowed only inside functions that receive a `ctx` at call time, never at import.
- **Sibling imports must use the extensionless `from './name'` form** — the test harness rewrites exactly that pattern (`/from '\.\/(\w+)'/g`).
- **Lint clean:** `npm run lint` (oxlint) must pass with no new warnings.
- **Existing test suite stays green:** `npm test` must pass unchanged; the default theme (`circuit`, grip `1.0`) keeps current physics byte-for-byte.
- **DRY / reuse:** share helpers; do not duplicate the PRNG or per-theme branching.

All paths below are relative to `Web Project/CS571WebProject/`.

---

### Task 1: Extract the deterministic PRNG into `rng.js`

Isolates `mulberry32` so both `render.js` and the new `themes.js` reuse it without a circular import (themes must not import render).

**Files:**
- Create: `src/game/rng.js`
- Modify: `src/game/render.js` (remove local `mulberry32`, import it)
- Test: `tests/rng.test.mjs`

**Interfaces:**
- Produces: `mulberry32(seed: number) => () => number` — returns a function yielding floats in `[0, 1)`, deterministic per seed.

- [ ] **Step 1: Write the failing test**

Create `tests/rng.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { mulberry32 } = await loadGameModule('rng')

test('mulberry32 is deterministic per seed', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  assert.equal(a(), b())
  assert.equal(a(), b())
})

test('mulberry32 yields floats in [0, 1)', () => {
  const rand = mulberry32(7)
  for (let i = 0; i < 100; i++) {
    const value = rand()
    assert.ok(value >= 0 && value < 1, `out of range: ${value}`)
  }
})

test('different seeds diverge', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)())
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `src/game/rng.js`.

- [ ] **Step 3: Create `src/game/rng.js`**

Move the exact algorithm currently in `render.js`:

```js
// Deterministic 32-bit PRNG (mulberry32). Seeded so particle bursts and
// terrain texture never touch Math.random and replay identically.
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

- [ ] **Step 4: Update `render.js` to import it**

In `src/game/render.js`, add to the import block near the top:

```js
import { mulberry32 } from './rng'
```

Then delete the local `mulberry32` definition (the `/** Deterministic PRNG so particle bursts never touch Math.random. */` block, currently `render.js:254-263`). Leave `createSparkBurst` unchanged — it now uses the imported `mulberry32`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — new rng tests pass and the existing suite is unchanged.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/game/rng.js src/game/render.js tests/rng.test.mjs
git commit -m "refactor: extract deterministic mulberry32 into rng module"
```

---

### Task 2: Create the `themes.js` source of truth

Defines the five themes (id, name, emoji, grip, `track` tints, `drawTerrain`) and the `getTheme` lookup with a safe default.

**Files:**
- Create: `src/game/themes.js`
- Test: `tests/themes.test.mjs`

**Interfaces:**
- Consumes: `mulberry32` from `./rng`.
- Produces:
  - `DEFAULT_THEME_ID: 'circuit'`
  - `THEMES: Array<Theme>` where `Theme = { id, name, emoji, grip: number, track: { road, curbRed, curbWhite, dash, margin }, drawTerrain(ctx, width, height, cellSize) }`
  - `getTheme(id: string) => Theme` — returns the matching theme, or the circuit theme for unknown/missing id.

- [ ] **Step 1: Write the failing test**

Create `tests/themes.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { loadGameModule } from './helpers.mjs'

const { THEMES, DEFAULT_THEME_ID, getTheme } = await loadGameModule('themes')

test('every theme has the required shape', () => {
  for (const theme of THEMES) {
    assert.equal(typeof theme.id, 'string')
    assert.equal(typeof theme.name, 'string')
    assert.equal(typeof theme.emoji, 'string')
    assert.equal(typeof theme.grip, 'number')
    assert.equal(typeof theme.drawTerrain, 'function')
    for (const key of ['road', 'curbRed', 'curbWhite', 'dash', 'margin']) {
      assert.match(theme.track[key], /^#[0-9a-fA-F]{6}$/, `${theme.id}.track.${key}`)
    }
  }
})

test('grip values stay in a sane range', () => {
  for (const theme of THEMES) {
    assert.ok(theme.grip >= 0.7 && theme.grip <= 1.0, `${theme.id} grip ${theme.grip}`)
  }
})

test('getTheme falls back to circuit for unknown or missing id', () => {
  assert.equal(getTheme('nope').id, DEFAULT_THEME_ID)
  assert.equal(getTheme(undefined).id, DEFAULT_THEME_ID)
  assert.equal(getTheme('circuit').id, 'circuit')
})

test('the default theme exists and is tarmac grip', () => {
  assert.equal(getTheme(DEFAULT_THEME_ID).grip, 1.0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `src/game/themes.js`.

- [ ] **Step 3: Create `src/game/themes.js`**

```js
// Single source of truth for a course's racing "Setting": its terrain look,
// track-accent tints, and grip. Every consumer (renderer, engine, builder,
// thumbnails) resolves a theme by course.theme via getTheme().
import { mulberry32 } from './rng'

export const DEFAULT_THEME_ID = 'circuit'

// Iconic red/white kerbs and asphalt are shared defaults; a theme overrides
// only what differs. `margin` is the run-off/shoulder ribbon drawn under the
// kerbs by drawTrackPiece, so it hugs every piece.
const BASE_TRACK = {
  road: '#4a4d55',
  curbRed: '#c5050c',
  curbWhite: '#f2f2f2',
  dash: '#e8e8e8',
  margin: '#cbb784',
}

/* ---------- shared terrain helpers (DRY across drawTerrain drawers) ---------- */

function fillBase(ctx, width, height, color) {
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
}

/** Horizontal bands every `period` cells — mowing stripes, ripples, berms. */
function stripeBands(ctx, width, height, cellSize, color, period = 2) {
  ctx.fillStyle = color
  for (let row = 0; row < Math.ceil(height / cellSize); row += period) {
    ctx.fillRect(0, row * cellSize, width, cellSize)
  }
}

/** Deterministic scattered flecks; seeded so redraws are identical. */
function speckle(ctx, width, height, { seed, count, colors, min, max }) {
  const rand = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const x = rand() * width
    const y = rand() * height
    const size = min + rand() * (max - min)
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)]
    ctx.fillRect(x, y, size, size)
  }
}

/* ---------- per-theme terrain drawers ---------- */

function drawCircuit(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#3a7d2c')
  stripeBands(ctx, width, height, cellSize, '#34702795' /* darker mow row */, 2)
  // Faint brighter highlight stripe offset by one row for a groomed look.
  ctx.globalAlpha = 0.5
  stripeBands(ctx, width, height, cellSize, '#40892f', 2)
  ctx.globalAlpha = 1
}

function drawRally(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#2f5233')
  stripeBands(ctx, width, height, cellSize, '#355a2e', 2)
  speckle(ctx, width, height, { seed: 0x2f52, count: 900, colors: ['#24401f', '#1c3218', '#3c5a2c'], min: 2, max: 6 })
}

function drawDesert(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#d9b678')
  ctx.globalAlpha = 0.6
  stripeBands(ctx, width, height, cellSize, '#cfa968', 1)
  ctx.globalAlpha = 1
  speckle(ctx, width, height, { seed: 0xde57, count: 700, colors: ['#b48a55', '#8a6a44', '#e6c893'], min: 1, max: 4 })
}

function drawMotocross(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#a5622f')
  stripeBands(ctx, width, height, cellSize, '#8f4f24', 2)
  speckle(ctx, width, height, { seed: 0x3c05, count: 1100, colors: ['#6e3c1c', '#4d2913', '#b87038'], min: 2, max: 5 })
}

function drawNight(ctx, width, height, cellSize) {
  fillBase(ctx, width, height, '#171a24')
  stripeBands(ctx, width, height, cellSize, '#1d2130', 2)
  // Sparse neon "lights" scattered around the environment.
  speckle(ctx, width, height, { seed: 0x1817, count: 90, colors: ['#ff3b8b', '#22d3ee', '#f7a600'], min: 2, max: 4 })
}

export const THEMES = [
  { id: 'circuit', name: 'Grand Prix', emoji: '🏁', grip: 1.0,
    track: { ...BASE_TRACK }, drawTerrain: drawCircuit },
  { id: 'rally', name: 'Rally Forest', emoji: '🌲', grip: 0.9,
    track: { ...BASE_TRACK, margin: '#5a4632' }, drawTerrain: drawRally },
  { id: 'desert', name: 'Desert Rally', emoji: '🏜️', grip: 0.85,
    track: { ...BASE_TRACK, margin: '#b8925a' }, drawTerrain: drawDesert },
  { id: 'motocross', name: 'Motocross', emoji: '🏍️', grip: 0.82,
    track: { ...BASE_TRACK, margin: '#5c3318' }, drawTerrain: drawMotocross },
  { id: 'night', name: 'Night Street', emoji: '🌃', grip: 1.0,
    track: { ...BASE_TRACK, road: '#2a2d3a', dash: '#22d3ee', margin: '#2a2f40' }, drawTerrain: drawNight },
]

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]))

export function getTheme(id) {
  return THEME_BY_ID.get(id) ?? THEME_BY_ID.get(DEFAULT_THEME_ID)
}
```

Note: `'#34702795'` is an 8-digit hex (RGBA) fill; the test only validates `theme.track.*` colors (all 6-digit), not fill literals used inside drawers, so this is fine.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all `themes.test.mjs` assertions pass.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/game/themes.js tests/themes.test.mjs
git commit -m "feat: add track theme registry (look, tints, grip)"
```

---

### Task 3: Apply per-theme grip in the engine

Reads the course theme's grip into race state and scales steering authority by it. Default `circuit` grip `1.0` keeps physics identical, so the existing suite stays green.

**Files:**
- Modify: `src/game/engine.js`
- Test: `tests/engine.test.mjs` (append cases)

**Interfaces:**
- Consumes: `getTheme` from `./themes`.
- Produces: `state.grip: number` on the object from `createRaceState`; steering scaled by it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/engine.test.mjs` (the file already imports `createRaceState`, `stepRace`, and `TEMPLATE_COURSES`; add the `themes` import at the top with the others):

```js
const { getTheme } = await loadGameModule('themes')

test('race state carries the theme grip (default circuit = 1.0)', () => {
  const state = createRaceState(TEMPLATE_COURSES[0])
  assert.equal(state.grip, getTheme(TEMPLATE_COURSES[0].theme).grip)
})

test('lower grip reduces steering authority', () => {
  const highGrip = createRaceState({ ...TEMPLATE_COURSES[0], theme: 'circuit' })   // 1.0
  const lowGrip = createRaceState({ ...TEMPLATE_COURSES[0], theme: 'motocross' })  // 0.82
  const startHeading = highGrip.heading
  const turn = { up: true, right: true }
  for (let i = 0; i < 30; i++) {
    stepRace(highGrip, turn, 1 / 60)
    stepRace(lowGrip, turn, 1 / 60)
  }
  const highTurned = Math.abs(highGrip.heading - startHeading)
  const lowTurned = Math.abs(lowGrip.heading - startHeading)
  assert.ok(highTurned > lowTurned, `expected ${highTurned} > ${lowTurned}`)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `state.grip` is `undefined`; the steering test fails because both turn equally.

- [ ] **Step 3: Implement the grip**

In `src/game/engine.js`:

1. Add the import beside the existing `courseModel` import at the top:

```js
import { getTheme } from './themes'
```

2. In `createRaceState`, read the grip once (near the top of the function body, after `const path = ...` and its guard):

```js
  const grip = getTheme(course.theme).grip
```

3. Add `grip` to the returned state object (place it next to `maxSpeedFactor`):

```js
    maxSpeedFactor,
    grip,
```

4. In `applySteering`, fold grip into the authority term:

```js
  const authority = state.grip
    * (state.onOil ? OIL_STEER_FACTOR : 1)
    * (state.drifting ? HANDBRAKE_TURN_MULTIPLIER : 1)
  state.heading += direction * reverseFactor * TURN_RATE * authority * speedRatio * dt
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — new grip tests pass; every pre-existing test (autopilot completion, determinism, frame-clamp) still passes because `TEMPLATE_COURSES` are untyped-theme → circuit → grip `1.0`.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/game/engine.js tests/engine.test.mjs
git commit -m "feat: scale steering authority by per-theme grip"
```

---

### Task 4: Make the renderer theme-aware

Threads a `theme` through terrain, piece drawing (adds the themed margin ribbon), the cached race background, and thumbnails.

**Files:**
- Modify: `src/game/render.js`
- Modify: `src/components/PiecePreview.jsx`
- Verify: `npm run build`, `npm run lint` (no Node test — this is DOM/canvas)

**Interfaces:**
- Consumes: `getTheme`, `DEFAULT_THEME_ID` from `./themes`.
- Produces (updated signatures):
  - `drawTrackPiece(ctx, piece, rotation, x, y, cellSize, theme = getTheme(DEFAULT_THEME_ID))`
  - `drawCourseInto(ctx, grid, cellSize, theme = getTheme(DEFAULT_THEME_ID))`
  - `createCourseBackground(course)` / `drawCourseThumbnail(canvas, course)` resolve `getTheme(course.theme)` internally.
  - `drawGrass` is removed.

- [ ] **Step 1: Import themes in `render.js`**

Add near the top of `src/game/render.js`:

```js
import { getTheme, DEFAULT_THEME_ID } from './themes'
```

- [ ] **Step 2: Replace `drawGrass` with themed terrain**

Delete the `drawGrass` function (`render.js:191-198`). The `COLORS.grassLight` / `COLORS.grassDark` keys are now unused — remove those two keys from the `COLORS` object.

- [ ] **Step 3: Add the themed margin ribbon to `drawTrackPiece`**

Change the signature and use theme tints. Replace the current color usages so pieces read from `theme.track` instead of the module `COLORS` for road/kerb/dash, and add a margin ribbon as the widest under-stroke.

New signature line:

```js
export function drawTrackPiece(ctx, piece, rotation, x, y, cellSize, theme = getTheme(DEFAULT_THEME_ID)) {
```

Inside, after `const roadWidth = cellSize * ROAD_WIDTH_RATIO`, draw the margin first (before the red curb ribbon):

```js
  const track = theme.track

  // Run-off / shoulder ribbon (gravel trap, dirt margin, etc.) hugging the piece
  tracePieceCenterline(ctx, piece, half)
  ctx.strokeStyle = track.margin
  ctx.lineWidth = roadWidth + cellSize * 0.28
  ctx.stroke()
```

Then update the existing curb/asphalt/dash strokes to use `track.*`:

```js
  // Curbs
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
```

And the centerline dash block uses `track.dash`:

```js
    ctx.strokeStyle = track.dash
```

Leave the `START` arrow (`COLORS.dash`) — change it to `track.dash` too for consistency — and leave boost/obstacle/pit/oil/ramp special colors as-is (they read from `COLORS`, which still holds those keys).

- [ ] **Step 4: Thread theme through `drawCourseInto`**

```js
export function drawCourseInto(ctx, grid, cellSize, theme = getTheme(DEFAULT_THEME_ID)) {
  theme.drawTerrain(ctx, grid[0].length * cellSize, grid.length * cellSize, cellSize)
  grid.forEach((cells, row) => {
    cells.forEach((cell, col) => {
      if (cell) drawTrackPiece(ctx, cell.piece, cell.rotation, col * cellSize, row * cellSize, cellSize, theme)
    })
  })
}
```

- [ ] **Step 5: Resolve theme in background + thumbnail helpers**

```js
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
```

- [ ] **Step 6: Update `PiecePreview.jsx`**

Palette swatches stay Grand Prix so piece icons read consistently. Replace its import and terrain call:

```js
import { useEffect, useRef } from 'react'
import { getTheme } from '../game/themes'
import { drawTrackPiece } from '../game/render'

/** Small canvas swatch of one oriented track piece, used by the palette. */
export default function PiecePreview({ piece, rotation = 0, size = 44, label }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const theme = getTheme('circuit')
    const ctx = canvasRef.current.getContext('2d')
    theme.drawTerrain(ctx, size, size, size)
    drawTrackPiece(ctx, piece, rotation, 0, 0, size, theme)
  }, [piece, rotation, size])
  // ...unchanged JSX...
```

- [ ] **Step 7: Verify build, lint, and existing tests**

Run: `npm run build`
Expected: builds with no errors.

Run: `npm run lint`
Expected: no new warnings (in particular, no "unused" for removed `COLORS.grass*`).

Run: `npm test`
Expected: PASS — game-logic tests still green (render isn't imported by tests).

- [ ] **Step 8: Commit**

```bash
git add src/game/render.js src/components/PiecePreview.jsx
git commit -m "feat: render themed terrain and per-theme track margins"
```

---

### Task 5: Default new courses + theme the built-in templates

New drafts default to `circuit`; the four templates each get a fitting Setting for instant variety — with a verification gate so no loose-grip template breaks the autopilot-completion tests.

**Files:**
- Modify: `src/services/courseService.js`
- Modify: `src/game/templates.js`
- Test: `tests/engine.test.mjs` already covers template completion; run the whole suite.

**Interfaces:**
- Consumes: `DEFAULT_THEME_ID` from `../game/themes`.
- Produces: every course object carries a `theme` string; `createDraftCourse().theme === 'circuit'`.

- [ ] **Step 1: Default the draft theme**

In `src/services/courseService.js`, import the default and set it in `createDraftCourse`:

```js
import { DEFAULT_THEME_ID } from '../game/themes'
```

```js
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
```

`copyCourse` spreads `createDraftCourse()` then overrides name/grid, so a copy inherits `circuit` by default; add `theme: source.theme ?? DEFAULT_THEME_ID` to preserve a copied course's setting:

```js
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
```

- [ ] **Step 2: Give `courseFromCells` a theme parameter**

In `src/game/templates.js`:

```js
function courseFromCells(id, name, cells, theme = 'circuit') {
  const grid = stampCells(createEmptyGrid(), cells)
  const check = validateCourse(grid)
  if (!check.ok) throw new Error(`Template ${id} invalid: ${check.error}`)
  return {
    id, name, grid, theme, votes: 0,
    author: 'Wisconsin Racer', isTemplate: true, createdAt: 0,
  }
}
```

- [ ] **Step 3: Assign themes to the four templates**

```js
export const TEMPLATE_COURSES = [
  courseFromCells('tpl-ring-road', 'Ring Road', RING_CELLS, 'rally'),
  courseFromCells('tpl-capitol-loop', 'Capitol Loop', CAPITOL_CELLS, 'night'),
  courseFromCells('tpl-mad-town-gp', 'Mad Town GP', MAD_TOWN_CELLS, 'motocross'),
  courseFromCells('tpl-spa-francorchamps', 'Circuit de Spa-Francorchamps', SPA_CELLS, 'circuit'),
]
```

- [ ] **Step 4: Run the full suite — autopilot must still finish every template**

Run: `npm test`
Expected: PASS — including `autopilot finishes 3 laps on tpl-ring-road` (rally, 0.9) and `... tpl-mad-town-gp` (motocross, 0.82).

**Deterministic fallback rule:** if any `autopilot finishes 3 laps on <id>` test FAILS, change that template's theme to `'night'` (grip `1.0`, tarmac handling, still a dramatic visual change) and re-run `npm test` until green. Do not lower any grip value to fix it.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/services/courseService.js src/game/templates.js
git commit -m "feat: default new courses to circuit and theme the built-in tracks"
```

---

### Task 6: Add the "Setting" picker to the Course Builder

Lets the builder choose a Setting; the choice repaints the canvas live, marks the course dirty, and persists on save/test-drive.

**Files:**
- Modify: `src/pages/CourseBuilder.jsx`
- Verify: `npm run build`, `npm run lint`, and a manual browser check.

**Interfaces:**
- Consumes: `THEMES`, `getTheme`, `DEFAULT_THEME_ID` from `../game/themes`; `drawCourseInto`/`drawTrackPiece` (theme-aware) from `../game/render`.

- [ ] **Step 1: Import theme APIs and Form is already imported**

Add to the imports in `src/pages/CourseBuilder.jsx`:

```js
import { THEMES, getTheme, DEFAULT_THEME_ID } from '../game/themes'
```

(`drawCourseInto` and `drawTrackPiece` are already imported; `Form` and `Col` are already imported.)

- [ ] **Step 2: Hold the selected theme in state**

Inside `CourseBuilderEditor`, alongside the other `useState` hooks:

```js
  const [themeId, setThemeId] = useState(course?.theme ?? DEFAULT_THEME_ID)
```

Extend the unsaved-changes check to include theme:

```js
  const hasUnsavedChanges = editor.dirty || name !== course?.name || themeId !== (course?.theme ?? DEFAULT_THEME_ID)
```

- [ ] **Step 3: Pass the theme into the canvas draw and ghost preview**

In the canvas-drawing `useEffect`, resolve the theme once and thread it through both the course draw and the hover ghost-stamp:

```js
    const theme = getTheme(themeId)
    drawCourseInto(ctx, editor.grid, BUILDER_CELL, theme)
```

and in the same effect, the ghost preview stamp:

```js
      drawTrackPiece(
        ctx, stamp.piece, stamp.rotation,
        hoverCell.col * BUILDER_CELL, hoverCell.row * BUILDER_CELL, BUILDER_CELL, theme,
      )
```

Add `themeId` to that effect's dependency array:

```js
  }, [editor.grid, stamp, hoverCell, cursorCell, showGridLines, themeId])
```

- [ ] **Step 4: Persist the theme on save**

In `persistCourse`, include the theme:

```js
    const saved = saveCourse({ ...course, name: name.trim() || 'Untitled Course', grid: editor.grid, theme: themeId })
```

- [ ] **Step 5: Add the Setting picker to the top toolbar**

In the top action `Row` (the one with Back / name / Test Drive / Save), add a new `Col` holding a labeled select, before the Test Drive button:

```jsx
        <Col xs={12} sm="auto">
          <Form.Label htmlFor="course-setting" visuallyHidden>Setting</Form.Label>
          <Form.Select
            id="course-setting"
            aria-label="Track setting"
            value={themeId}
            onChange={(event) => setThemeId(event.target.value)}
          >
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.emoji} {theme.name}
              </option>
            ))}
          </Form.Select>
        </Col>
```

- [ ] **Step 6: Verify build and lint**

Run: `npm run build`
Expected: builds cleanly.

Run: `npm run lint`
Expected: no new warnings.

- [ ] **Step 7: Manual browser verification**

Run: `npm run dev`, open the app, go to Build a course.
Confirm:
1. The "Setting" dropdown lists all five themes with emoji.
2. Selecting each theme instantly repaints the grid terrain and the track margins.
3. Placing pieces on a non-circuit theme shows the themed shoulder ribbon.
4. Save, return to Browse — the course card thumbnail matches the chosen setting.
5. Test Drive — the race background matches, and rally/desert/motocross feel slightly looser to steer.

- [ ] **Step 8: Commit**

```bash
git add src/pages/CourseBuilder.jsx
git commit -m "feat: course builder Setting picker with live themed preview"
```

---

### Task 7: Final verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS — rng, themes, engine (grip + regression), model, storage, ghosts all green.

- [ ] **Step 2: Lint + production build**

Run: `npm run lint && npm run build`
Expected: clean lint, successful build.

- [ ] **Step 3: Cross-screen visual smoke test**

Run: `npm run dev`. Verify each theme end-to-end on one course: Builder preview → Browse thumbnail → Race background all agree, and existing pieces (boost chevrons, oil slick, ramp, pit box, start checker) remain legible on every terrain, including Night.

- [ ] **Step 4: Commit any final touch-ups** (only if Step 3 required a tint tweak)

```bash
git add -A
git commit -m "polish: legibility tweaks for themed terrains"
```

---

## Self-Review

**Spec coverage:**
- Selectable themes per course → Tasks 2, 5, 6. ✓
- Visual + light physics flavor (grip) → Task 3. ✓
- Procedural terrain, no assets → Task 2 `drawTerrain`. ✓
- `themes.js` single source of truth → Task 2. ✓
- Render integration (terrain, tints, background, thumbnail) → Task 4. ✓
- Builder Setting picker + live repaint + persist → Task 6. ✓
- Data-model default + back-compat fallback → Tasks 2 (`getTheme` default), 5 (`createDraftCourse`). ✓
- Templates get variety → Task 5. ✓
- Testing (themes shape/default, grip behavior, regression, back-compat) → Tasks 1–3, 5. ✓
- Determinism / no `Math.random` → Task 1 rng + Task 2 seeded speckle. ✓
- Re-theming invalidation note → documented in design; no code needed. ✓

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `getTheme`, `DEFAULT_THEME_ID`, `THEMES`, `theme.track.{road,curbRed,curbWhite,dash,margin}`, `theme.grip`, `theme.drawTerrain(ctx,w,h,cellSize)`, `state.grip`, and the updated `drawCourseInto`/`drawTrackPiece` signatures are used identically across Tasks 2–6. ✓
