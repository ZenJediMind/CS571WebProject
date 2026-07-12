# Wisconsin Racer Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the published barebones SPA into the full Wisconsin Racer game matching the Figma prototype: top-down time-trial racing on piece-built courses, an MS Paint–style car designer with vector templates, course browser + voting, leaderboards, and a mocked invite-friends flow — all persisted in `localStorage` (no backend).

**Architecture:** Client-only Vite React SPA. A thin `localStorage` service layer ("mock backend") is the single source of truth for courses, cars, scores, points, and votes. Courses are a fixed-size grid of **oriented track pieces** (straight / curve / S-bend / specials); the race engine derives a closed path from piece edge connectivity, runs a `requestAnimationFrame` loop on a `<canvas>`, and draws the player's **saved bitmap car** (not pixel-grid art). Every screen is a route under the existing `HashRouter`.

**Tech Stack:** Vite, React 19 (JavaScript), React Bootstrap, React Router DOM (HashRouter), HTML Canvas 2D, `localStorage`. No new runtime dependencies.

**Visual / UX source of truth:** `Web Project/prototype-design.md` (8 screens + full navigation map) plus the concrete specs embedded in this plan (car template drawers, piece palette, HUD format, tool lists — distilled from the Figma prototype). The original `Racer Prototype.pdf` export is **no longer on disk**; if it is restored to `Web Project/`, prefer its visuals for Tasks 8–9 fidelity. Until then, this plan's embedded specs are authoritative.

## Global Constraints

- Client-side only — no Next.js, no SSR, no real backend (instructor: mock it)
- JavaScript (not TypeScript)
- `HashRouter` only (not BrowserRouter)
- Vite `base: '/CS571WebProject/'`, `build.outDir: 'docs'`
- No secrets or credentials in frontend code
- Work happens on the `dev` branch; merge to `main` only at the deploy task
- Live URL: `https://ZenJediMind.github.io/CS571WebProject/`
- Code style per `AGENTS.md`: modular, DRY, self-documenting names, deterministic, reuse libraries
- Verification per task: `npm run lint` + `npm run build` + manual smoke test in `npm run dev` (no test framework in this course project)
- **No chunky pixel-art car editor.** Car Designer is freehand MS Paint on a high-res bitmap; templates are smooth flat top-down vector cars (per the Figma prototype).

### Lecture-alignment constraints (from CS571 lectures — follow these idioms)

- **Never mutate React state** (Setting State session). Copy → modify → return. Use the functional updater `setX(prev => …)` whenever the next state depends on the previous (builder grid edits, undo stack, HUD counters) — "it's never wrong to use the callback syntax." Watch shallow-copy pitfalls on the nested `grid[row][col]` arrays: copy the outer array *and* the row being changed.
- **localStorage never triggers re-renders** (Lecture 6). Components hold data in `useState` and write *through* the service layer; after any `saveCourse`/`voteForCourse`/`savePlayerCar`, re-read into state (or update state alongside the write). No component reads `localStorage` directly — only `storage.js`.
- **Derived state is a computed variable, not more state** (Lecture 5 anti-pattern warning). E.g. `validateCourse(grid)` result, sorted leaderboards, and display lap are computed on render — never mirrored into a second `useState` + `useEffect`.
- **React Router declarative mode only** (Publish session — data/framework modes are incompatible with GitHub Pages). Programmatic navigation via `useNavigate` (Lecture 6). Shared navbar via a layout route + `<Outlet>` (Lecture 6 pattern).
- **List keys are stable ids** (Lecture 5): course cards use `course.id`, leaderboard rows use entry ids — never array index for reorderable lists.
- **Forms:** controlled inputs (`value` + `onChange`) where the UI reacts live (course name, color pickers); `useRef` uncontrolled inputs are fine for submit-only fields (Lectures 5, 7). Prefer React Bootstrap `Form.Control` over raw `<input>`.
- **Effects:** initial data loads in `useEffect(fn, [])`; never fetch/load in component body (Lecture 4).
- **Functional components + hooks only**; declarative array ops (`map`/`filter`/`reduce`) over imperative loops where natural (Lectures 3–4).
- Never run `npm audit fix --force` (Lectures 4–5 warning).
- AI usage is allowed on the project but must be disclosed: maintain an **`AI.txt`** at repo root with approximate % AI-generated and the author's role (Publish session). Update it at the deploy task.

## Accepted deviations from prototype

Documented intentionally (not gaps):

| Prototype | This plan | Why |
|-----------|-----------|-----|
| Main Menu title "RACE CAR DRIVER" | Brand / navbar "Wisconsin Racer"; Main Menu hero can show both or "Wisconsin Racer" | Project / GitHub Pages name |
| File / Edit / View / Image / Colors / Help menus | Visual menu bar stubs (non-functional) except Colors may open palette focus | Scope; tools + palette cover real editing |
| Text tool (Aa) | Optional / stub (skip or simple fill-text) | Low value for racing sprite |
| Cross-user course share | localStorage votes + templates on every browser | Instructor approved mock |
| Live multiplayer lobby | Mocked friends list + invite code | Instructor approved mock |
| Demo "Finish Race" button | Real finish via checkpoints + 3 laps | Prototype button was for Figma demo only |

Screens, piece palette, MS Paint tool layout, templates, and nav-map edges match the prototype (`prototype-design.md` screens 1–8 and its navigation map).

## Course milestone context

| Milestone | Status |
|-----------|--------|
| Proposal (approved, backend may be mocked) | Done — `Proposal.md` |
| Low-fi Figma prototype + walkthrough video | Done — `prototype-design.md` |
| Initial publish (due Jul 14: hosted Vite React app, content not graded) | Done — live on GitHub Pages |
| Draft website (~end of July: working features) | **This plan, Tasks 1–12** |
| Final website + demo video + `AI.txt` disclosure | Task 13 + video after |
| Usability test (think-aloud, recruited participants) | After final — out of this plan's scope |

Grading is holistic (no autograder): interactive element required, hosted publicly, ~4 hrs justified per deliverable. The demo video should walk the two key flows from `prototype-design.md`: **build → test → race → results → leaderboard** and **browse → copy & edit / play**.

---

## File structure

| Path | Responsibility |
|------|----------------|
| `src/services/storage.js` | Versioned, namespaced localStorage read/write (only file that touches `localStorage`) |
| `src/services/courseService.js` | CRUD for courses, votes, copy-and-edit, merge built-in templates |
| `src/services/carService.js` | Save/load player car as PNG data URL |
| `src/services/scoreService.js` | Best times per course, points ledger, seeded rival times |
| `src/services/inviteService.js` | Deterministic invite code + mocked friend roster |
| `src/game/courseModel.js` | Grid constants, piece defs, openings by rotation, empty grid, validation, path derivation |
| `src/game/templates.js` | Built-in course grids + vector car template drawers |
| `src/game/engine.js` | Pure physics / lap simulation: `createRaceState`, `stepRace` |
| `src/game/render.js` | Canvas drawing: piece art, track, car bitmap, thumbnails |
| `src/hooks/useRaceLoop.js` | rAF loop + keyboard input |
| `src/components/AppNavbar.jsx` | (exists) navbar — extend links |
| `src/components/CourseCard.jsx` | Course card: thumbnail, name, votes, Play / Copy & Edit |
| `src/components/PaintCanvas.jsx` | MS Paint–style freehand bitmap editor |
| `src/pages/Home.jsx` | Main Menu hub |
| `src/pages/CourseBrowser.jsx` | Grid of course cards |
| `src/pages/CourseBuilder.jsx` | Piece palette + snap-to-grid editor |
| `src/pages/CarDesigner.jsx` | Paint tools + vector templates + save |
| `src/pages/Race.jsx` | Canvas gameplay + HUD + pause |
| `src/pages/Results.jsx` | Time vs best, points, next actions |
| `src/pages/Leaderboard.jsx` | Fastest times / overall points tabs |
| `src/pages/Invite.jsx` | Mocked invite + friends |
| `src/App.jsx` | All routes |

---

### Task 1: Storage service layer (mock backend)

**Files:**
- Create: `src/services/storage.js`

**Interfaces:**
- Produces: `readKey(key, fallback)`, `writeKey(key, value)`

- [ ] **Step 1: Implement the wrapper**

```js
// src/services/storage.js
const NAMESPACE = 'wisconsinRacer.v1'

export function readKey(key, fallback) {
  try {
    const raw = localStorage.getItem(`${NAMESPACE}.${key}`)
    return raw === null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function writeKey(key, value) {
  try {
    localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value))
  } catch {
    // QuotaExceeded / private mode — session continues with in-memory state
  }
}
```

- [ ] **Step 2: Lint**

`npm run lint`

- [ ] **Step 3: Commit**

```bash
git add src/services/storage.js
git commit -m "feat: add namespaced localStorage service (mock backend)"
```

---

### Task 2: Course model — oriented pieces, validation, path derivation

**Files:**
- Create: `src/game/courseModel.js`

**Interfaces:**
- Produces:
  - `GRID_COLS = 16`, `GRID_ROWS = 10`, `CELL_SIZE = 64`
  - `PIECES` = `{ STRAIGHT, CURVE, S_BEND, START, BOOST, OBSTACLE, PIT }`
  - `ROTATIONS = [0, 90, 180, 270]`
  - `createEmptyGrid()` → `grid[row][col]` = `null | { piece, rotation }`
  - `openEdges(piece, rotation)` → `Set` of `'N'|'E'|'S'|'W'`
  - `isDrivable(piece)` → boolean (everything except `OBSTACLE` and empty)
  - `isTrackCell(grid, row, col)` → boolean
  - `derivePath(grid)` → `[{ row, col }, …]` or `null`
  - `validateCourse(grid)` → `{ ok, error }`

**Piece openings (rotation 0°):**

| Piece | Opens |
|-------|--------|
| `STRAIGHT`, `START`, `BOOST`, `PIT` | N + S |
| `CURVE` | N + E (quarter turn) |
| `S_BEND` | N + S (visual offset only; same connectivity as straight) |
| `OBSTACLE` | none |

Rotate openings clockwise with `rotation` (90 → N→E, E→S, …). Two adjacent cells connect iff each opens toward the other.

- [ ] **Step 1: Implement the model**

```js
// src/game/courseModel.js
export const GRID_COLS = 16
export const GRID_ROWS = 10
export const CELL_SIZE = 64

export const PIECES = {
  STRAIGHT: 'straight',
  CURVE: 'curve',
  S_BEND: 's_bend',
  START: 'start',
  BOOST: 'boost',
  OBSTACLE: 'obstacle',
  PIT: 'pit',
}

const BASE_OPENINGS = {
  [PIECES.STRAIGHT]: ['N', 'S'],
  [PIECES.START]: ['N', 'S'],
  [PIECES.BOOST]: ['N', 'S'],
  [PIECES.PIT]: ['N', 'S'],
  [PIECES.CURVE]: ['N', 'E'],
  [PIECES.S_BEND]: ['N', 'S'],
  [PIECES.OBSTACLE]: [],
}

const EDGE_ORDER = ['N', 'E', 'S', 'W']
const DELTA = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] }
const OPPOSITE = { N: 'S', E: 'W', S: 'N', W: 'E' }

export function createEmptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(null))
}

export function isDrivable(piece) {
  return piece != null && piece !== PIECES.OBSTACLE
}

function rotateEdge(edge, rotation) {
  const turns = ((rotation % 360) + 360) % 360 / 90
  return EDGE_ORDER[(EDGE_ORDER.indexOf(edge) + turns) % 4]
}

export function openEdges(piece, rotation = 0) {
  return new Set((BASE_OPENINGS[piece] ?? []).map((e) => rotateEdge(e, rotation)))
}

export function isTrackCell(grid, row, col) {
  if (row < 0 || row >= GRID_ROWS || col < 0 || col >= GRID_COLS) return false
  const cell = grid[row][col]
  return cell !== null && isDrivable(cell.piece)
}

function connectedNeighbors(grid, row, col) {
  const cell = grid[row][col]
  if (!cell || !isDrivable(cell.piece)) return []
  const edges = openEdges(cell.piece, cell.rotation)
  const result = []
  for (const edge of edges) {
    const [dRow, dCol] = DELTA[edge]
    const nRow = row + dRow
    const nCol = col + dCol
    if (!isTrackCell(grid, nRow, nCol)) continue
    const neighbor = grid[nRow][nCol]
    const neighborEdges = openEdges(neighbor.piece, neighbor.rotation)
    if (neighborEdges.has(OPPOSITE[edge])) {
      result.push({ row: nRow, col: nCol })
    }
  }
  return result
}

function sameCell(a, b) {
  return a.row === b.row && a.col === b.col
}

/**
 * Closed loop walk from the single START cell.
 * Bootstrap: START must have exactly 2 connected neighbors — pick one to begin.
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

  const path = [start]
  let previous = start
  let current = startNeighbors[0]

  while (!sameCell(current, start)) {
    path.push(current)
    if (path.length > GRID_ROWS * GRID_COLS) return null
    const nextCandidates = connectedNeighbors(grid, current.row, current.col)
      .filter((n) => !sameCell(n, previous))
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
  if (path.length < 8) {
    return { ok: false, error: 'Track is too short — use at least 8 pieces.' }
  }
  return { ok: true, error: null }
}
```

- [ ] **Step 2: Scratch fixture**

Build a rectangle from `STRAIGHT` + `CURVE` pieces + one `START`; assert `derivePath(grid)?.length` equals cell count and `validateCourse` is ok. Break one connection → `null`. Then `npm run lint`.

- [ ] **Step 3: Commit**

```bash
git add src/game/courseModel.js
git commit -m "feat: oriented track piece model with edge-based path derivation"
```

---

### Task 3: Templates + course / car / score services

**Files:**
- Create: `src/game/templates.js`
- Create: `src/services/courseService.js`
- Create: `src/services/carService.js`
- Create: `src/services/scoreService.js`

**Interfaces:**
- `TEMPLATE_COURSES` with pinned ids `tpl-ring-road`, `tpl-capitol-loop`, `tpl-mad-town-gp` (cells are `{ piece, rotation }`)
- `CAR_CANVAS_SIZE = 512`
- `CAR_TEMPLATES = [{ id, name, draw(ctx, size) }]` — **vector drawers**, not pixel grids
- `courseService`: `listCourses`, `getCourse` (raw), `withHydratedVotes`, `saveCourse`, `copyCourse`, `voteForCourse`, `createDraftCourse`
- `carService`: `loadPlayerCar()` → `{ imageDataUrl }`, `savePlayerCar(imageDataUrl)`, `defaultCarDataUrl()`
- `scoreService`: same as before (`recordTime`, leaderboards, rivals, `hashString`)

Course object shape (stored — never persist hydrated votes):

```js
{
  id: 'tpl-ring-road',
  name: 'Ring Road',
  grid: [[null | { piece, rotation }, ...], ...],
  votes: 0,
  author: 'Wisconsin Racer',
  isTemplate: true,
  createdAt: 0,
}
```

Car object shape:

```js
{ imageDataUrl: 'data:image/png;base64,...' }
```

- [ ] **Step 1: Course templates + vector car drawers**

```js
// src/game/templates.js
import { createEmptyGrid, PIECES, validateCourse } from './courseModel'

export const CAR_CANVAS_SIZE = 512

export function stampCells(grid, cells) {
  for (const { row, col, piece, rotation = 0 } of cells) {
    grid[row][col] = { piece, rotation }
  }
  return grid
}

function courseFromCells(id, name, cells) {
  const grid = stampCells(createEmptyGrid(), cells)
  const check = validateCourse(grid)
  if (!check.ok) throw new Error(`Template ${id} invalid: ${check.error}`)
  return {
    id, name, grid, votes: 0,
    author: 'Wisconsin Racer', isTemplate: true, createdAt: 0,
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Rectangle loop rows 2–5, cols 3–12. Rot 90 = E–W corridor; rot 0 = N–S. Curves at corners. */
const RING_CELLS = [
  { row: 2, col: 3, piece: PIECES.CURVE, rotation: 90 },
  { row: 2, col: 4, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 5, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 6, piece: PIECES.START, rotation: 90 },
  { row: 2, col: 7, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 8, piece: PIECES.BOOST, rotation: 90 },
  { row: 2, col: 9, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 10, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 11, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 2, col: 12, piece: PIECES.CURVE, rotation: 180 },
  { row: 3, col: 12, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 4, col: 12, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 5, col: 12, piece: PIECES.CURVE, rotation: 270 },
  { row: 5, col: 11, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 10, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 9, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 8, piece: PIECES.PIT, rotation: 90 },
  { row: 5, col: 7, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 6, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 5, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 4, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 5, col: 3, piece: PIECES.CURVE, rotation: 0 },
  { row: 4, col: 3, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 3, col: 3, piece: PIECES.STRAIGHT, rotation: 0 },
]

/** L-shaped loop — explicit cells; must pass validateCourse at load. */
const CAPITOL_CELLS = [
  { row: 1, col: 2, piece: PIECES.CURVE, rotation: 90 },
  { row: 1, col: 3, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 1, col: 4, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 1, col: 5, piece: PIECES.START, rotation: 90 },
  { row: 1, col: 6, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 1, col: 7, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 1, col: 8, piece: PIECES.CURVE, rotation: 180 },
  { row: 2, col: 8, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 3, col: 8, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 4, col: 8, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 5, col: 8, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 6, col: 8, piece: PIECES.CURVE, rotation: 270 },
  { row: 6, col: 7, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 6, col: 6, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 6, col: 5, piece: PIECES.CURVE, rotation: 0 },
  { row: 5, col: 5, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 4, col: 5, piece: PIECES.CURVE, rotation: 180 },
  { row: 4, col: 4, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 4, col: 3, piece: PIECES.STRAIGHT, rotation: 90 },
  { row: 4, col: 2, piece: PIECES.CURVE, rotation: 0 },
  { row: 3, col: 2, piece: PIECES.STRAIGHT, rotation: 0 },
  { row: 2, col: 2, piece: PIECES.STRAIGHT, rotation: 0 },
]

/** Larger outer loop with interior obstacles (not on path). */
const MAD_TOWN_CELLS = [
  { row: 1, col: 1, piece: PIECES.CURVE, rotation: 90 },
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((col) => ({ row: 1, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 1, col: 5, piece: PIECES.START, rotation: 90 },
  { row: 1, col: 10, piece: PIECES.CURVE, rotation: 180 },
  ...[2, 3, 4, 5, 6].map((row) => ({ row, col: 10, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 7, col: 10, piece: PIECES.CURVE, rotation: 270 },
  ...[9, 8, 7, 6, 5, 4, 3, 2].map((col) => ({ row: 7, col, piece: PIECES.STRAIGHT, rotation: 90 })),
  { row: 7, col: 1, piece: PIECES.CURVE, rotation: 0 },
  ...[6, 5, 4, 3, 2].map((row) => ({ row, col: 1, piece: PIECES.STRAIGHT, rotation: 0 })),
  { row: 3, col: 4, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 3, col: 5, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 4, col: 6, piece: PIECES.OBSTACLE, rotation: 0 },
  { row: 5, col: 4, piece: PIECES.OBSTACLE, rotation: 0 },
]

export const TEMPLATE_COURSES = [
  courseFromCells('tpl-ring-road', 'Ring Road', RING_CELLS),
  courseFromCells('tpl-capitol-loop', 'Capitol Loop', CAPITOL_CELLS),
  courseFromCells('tpl-mad-town-gp', 'Mad Town GP', MAD_TOWN_CELLS),
]

/**
 * Flat top-down cars per the Figma prototype (smooth shapes, no pixel grid).
 * Each draw*(ctx, size) paints centered in a size×size canvas with transparent background.
 */
function withCarSpace(ctx, size, drawBody) {
  const s = size / 512
  ctx.save()
  ctx.translate(size / 2, size / 2)
  ctx.scale(s, s)
  drawBody(ctx)
  ctx.restore()
}

function drawClassicRacer(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#c0392b'
    roundRect(c, -70, -120, 140, 240, 28)
    c.fill()
    c.fillStyle = '#85c1e9'
    roundRect(c, -40, -90, 80, 50, 12)
    c.fill()
    c.fillStyle = '#ffffff'
    c.fillRect(-12, -100, 24, 200)
    c.fillStyle = '#1a1a1a'
    c.fillRect(-95, -95, 28, 55)
    c.fillRect(67, -95, 28, 55)
    c.fillRect(-95, 40, 28, 55)
    c.fillRect(67, 40, 28, 55)
  })
}

function drawPickup(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#2471a3'
    roundRect(c, -75, -40, 150, 150, 16)
    c.fill()
    c.fillStyle = '#1a5276'
    roundRect(c, -75, -130, 150, 95, 16)
    c.fill()
    c.fillStyle = '#85c1e9'
    roundRect(c, -45, -115, 90, 45, 10)
    c.fill()
    c.fillStyle = '#1a1a1a'
    c.fillRect(-100, -100, 30, 50)
    c.fillRect(70, -100, 30, 50)
    c.fillRect(-100, 60, 30, 50)
    c.fillRect(70, 60, 30, 50)
  })
}

function drawF1(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#1c1c1c'
    roundRect(c, -35, -140, 70, 280, 12)
    c.fill()
    c.fillStyle = '#e74c3c'
    c.fillRect(-12, -60, 24, 140)
    c.fillStyle = '#85c1e9'
    roundRect(c, -25, -100, 50, 35, 8)
    c.fill()
    c.fillStyle = '#111'
    c.fillRect(-95, -80, 55, 22)
    c.fillRect(40, -80, 55, 22)
    c.fillRect(-95, 50, 55, 22)
    c.fillRect(40, 50, 55, 22)
  })
}

function drawBug(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#f4d03f'
    roundRect(c, -80, -100, 160, 200, 70)
    c.fill()
    c.fillStyle = '#85c1e9'
    roundRect(c, -50, -70, 100, 45, 20)
    c.fill()
    c.fillStyle = '#1a1a1a'
    c.fillRect(-95, -60, 26, 45)
    c.fillRect(69, -60, 26, 45)
    c.fillRect(-95, 30, 26, 45)
    c.fillRect(69, 30, 26, 45)
  })
}

function drawMonster(ctx, size) {
  withCarSpace(ctx, size, (c) => {
    c.fillStyle = '#1e8449'
    roundRect(c, -85, -110, 170, 220, 20)
    c.fill()
    c.fillStyle = '#85c1e9'
    roundRect(c, -50, -90, 100, 50, 12)
    c.fill()
    c.fillStyle = '#111'
    c.fillRect(-115, -100, 40, 70)
    c.fillRect(75, -100, 40, 70)
    c.fillRect(-115, 30, 40, 70)
    c.fillRect(75, 30, 40, 70)
  })
}

export const CAR_TEMPLATES = [
  { id: 'car-blank', name: 'Blank Canvas', draw: null },
  { id: 'car-classic', name: 'Classic Racer', draw: drawClassicRacer },
  { id: 'car-pickup', name: 'Pickup Truck', draw: drawPickup },
  { id: 'car-f1', name: 'F1 Open-Wheel', draw: drawF1 },
  { id: 'car-bug', name: "Lil' Bug", draw: drawBug },
  { id: 'car-monster', name: 'Monster Truck', draw: drawMonster },
]

/** Rasterize a template (or blank) to a PNG data URL. */
export function renderCarTemplateToDataUrl(templateId) {
  const canvas = document.createElement('canvas')
  canvas.width = CAR_CANVAS_SIZE
  canvas.height = CAR_CANVAS_SIZE
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, CAR_CANVAS_SIZE, CAR_CANVAS_SIZE)
  const template = CAR_TEMPLATES.find((t) => t.id === templateId)
  if (template?.draw) template.draw(ctx, CAR_CANVAS_SIZE)
  return canvas.toDataURL('image/png')
}
```

Implement full `TEMPLATE_COURSES` cell lists and the remaining `draw*` functions in the same flat style as Classic Racer (the six template names and shapes above are the spec — smooth flat top-down cars, no pixel grids).

- [ ] **Step 2: Course service (raw getCourse — never persist hydrated votes)**

```js
// src/services/courseService.js
import { readKey, writeKey } from './storage'
import { createEmptyGrid } from '../game/courseModel'
import { TEMPLATE_COURSES } from '../game/templates'

const COURSES_KEY = 'courses'
const VOTES_KEY = 'votes'

function readUserCourses() { return readKey(COURSES_KEY, []) }

function findRawCourse(id) {
  return TEMPLATE_COURSES.find((c) => c.id === id)
    ?? readUserCourses().find((c) => c.id === id)
    ?? null
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

export function getCourse(id) {
  const course = findRawCourse(id)
  if (!course) return null
  return {
    ...course,
    grid: course.grid.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
  }
}

export function saveCourse(course) {
  if (course.isTemplate) throw new Error('Cannot overwrite a built-in template — Copy & Edit first.')
  const toStore = { ...course, votes: 0, isTemplate: false }
  const others = readUserCourses().filter((c) => c.id !== course.id)
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
    grid: source.grid.map((row) => row.map((cell) => (cell ? { ...cell } : null))),
  })
}

export function voteForCourse(id) {
  if (!findRawCourse(id)) return
  const votes = readKey(VOTES_KEY, {})
  writeKey(VOTES_KEY, { ...votes, [id]: (votes[id] ?? 0) + 1 })
}
```

- [ ] **Step 3: Car service (bitmap data URL)**

```js
// src/services/carService.js
import { readKey, writeKey } from './storage'
import { renderCarTemplateToDataUrl } from '../game/templates'

const CAR_KEY = 'playerCar'

export function defaultCarDataUrl() {
  return renderCarTemplateToDataUrl('car-classic')
}

export function loadPlayerCar() {
  return readKey(CAR_KEY, { imageDataUrl: defaultCarDataUrl() })
}

export function savePlayerCar(imageDataUrl) {
  writeKey(CAR_KEY, { imageDataUrl })
}
```

Note: `defaultCarDataUrl` needs `document` — call it lazily from UI / race mount, or guard with `typeof document !== 'undefined'`. For module-level default, prefer lazy init inside `loadPlayerCar` only when missing.

- [ ] **Step 4: Score service**

Same as previous plan: `hashString`, `getRivalTimes`, `getBestTime`, `recordTime` (+10 per rival beaten, +5 new best), `getCourseLeaderboard`, `getPointsRanking`. Export `hashString` for invite service.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/game/templates.js src/services/courseService.js src/services/carService.js src/services/scoreService.js
git commit -m "feat: piece templates, vector car drawers, and storage services"
```

---

### Task 4: Routes, Main Menu hub, navbar

**Files:**
- Modify: `src/App.jsx`, `src/components/AppNavbar.jsx`, `src/pages/Home.jsx`
- Create placeholders: `CourseBrowser`, `CourseBuilder`, `CarDesigner`, `Race`, `Results`, `Leaderboard`, `Invite`
- Delete: `src/pages/About.jsx`

**Routes:** `/` · `/browse` · `/build/:courseId` · `/car` · `/race/:courseId` · `/results/:courseId` · `/leaderboard` · `/invite`

- [ ] **Step 1: Wire `App.jsx` routes** — HashRouter, declarative mode, **layout route pattern** (Lecture 6): a parent route renders `AppNavbar` + `<Outlet>`; all pages are child routes. Programmatic navigation (draft-then-build, finish-race → results) uses `useNavigate`.

- [ ] **Step 2: Main Menu (`Home.jsx`)**

Match prototype layout: dark header label optional; centered title **Wisconsin Racer** (or "RACE CAR DRIVER"); vertical stack of 6 Bootstrap buttons:

- Play → `/browse`
- Build Course → `saveCourse(createDraftCourse())` then `/build/:id`
- Draw Car → `/car`
- Browse Courses → `/browse`
- Leaderboard → `/leaderboard`
- Invite Friends → `/invite`

**Navbar:** brand Wisconsin Racer; Browse; Build (draft-then-navigate); Car; Leaderboard. Never link bare `/build`.

- [ ] **Step 3: Smoke + commit**

```bash
git add -A src/
git commit -m "feat: full route table and Main Menu hub"
```

---

### Task 5: Race engine + renderer (piece art + car bitmap)

**Files:**
- Create: `src/game/engine.js`, `src/game/render.js`

**Interfaces:**
- `createRaceState(course)`, `stepRace(state, inputs, dt)`
- `drawFrame(ctx, course, state, carImage)` — `carImage` is an `HTMLImageElement` (or ImageBitmap) loaded from data URL
- `drawCourseThumbnail(canvas, course)`
- `drawTrackPiece(ctx, piece, rotation, x, y, cellSize)` — flat vector piece art (road gray, white dashes, red borders, checkered start, yellow boost arrows, orange obstacle, blue pit P) matching the prototype builder look

**Race rules:**
- `TOTAL_LAPS = 3` (prototype HUD shows `LAP 2 / 3`)
- Checkpoints: every 4th path cell after start
- After all checkpoints in a lap, re-enter start → `lap += 1`; when `lap` reaches `TOTAL_LAPS` after crossing start, `finished = true`
- Boost cell: multiply speed toward cap briefly (e.g. `state.speed = Math.min(MAX_SPEED * 1.25, state.speed + 80)`) when entering a BOOST cell
- Pit cell: optional mild slowdown; Obstacle: bounce + halve speed
- `elapsedMs` accumulates from `dt` only (no `performance.now` in engine)

Race state:

```js
{
  grid, x, y, heading, speed, path,
  checkpoints, nextCheckpoint,
  lap,           // 0-based completed laps; display lap = lap + 1 while racing
  totalLaps: 3,
  elapsedMs, finished,
}
```

- [ ] **Step 1: Full `engine.js`**

Port prior `createRaceState` / `stepRace` / bounds / obstacle bounce, but:

- Use `connectedNeighbors`-compatible path from `derivePath`
- Heading from path[0] → path[1]
- Lap logic as above
- On boost / pit: inspect `grid[row][col].piece`

Include complete helper implementations (no stub comments).

- [ ] **Step 2: `render.js`**

- Grass `#3a7d2c` / infield darker green as on the prototype race screen
- Draw each non-null cell via `drawTrackPiece`
- Highlight next checkpoint
- Draw car: `ctx.save(); translate; rotate(heading + Math.PI/2); drawImage(carImage, -w/2, -h/2, w, h); restore()` with `w,h ≈ 48`
- Logical canvas 1024×640; CSS `max-width: 100%`

- [ ] **Step 3: Commit**

```bash
npm run lint
git add src/game/engine.js src/game/render.js
git commit -m "feat: race engine and vector track/car renderer"
```

---

### Task 6: Race gameplay screen

**Files:**
- Create: `src/hooks/useRaceLoop.js`
- Modify: `src/pages/Race.jsx`

**Interfaces:**
- Consumes course + `loadPlayerCar().imageDataUrl` (preload into `Image`)
- On finish → `/results/:courseId` with `{ state: { ms, resultId } }`
- Smoke URL: `/#/race/tpl-ring-road`

- [ ] **Step 1: `useRaceLoop.js`**

Same structure as prior plan (`racing` flag for countdown, `finishSentRef`, WASD + arrows, HUD at ~10Hz) but pass `carImage` into `drawFrame`. HUD exposes `{ elapsedMs, speed, lap, totalLaps, nextCheckpoint, checkpointTotal }`.

- [ ] **Step 2: `Race.jsx`**

- HUD badges: TIME `mm:ss.t`, LAP `${lap}/${totalLaps}` (prototype), optional checkpoint hint
- Countdown 3-2-1-GO before `racing=true`
- Pause modal: Resume / Restart / Quit (Quit → Main Menu `/`, per prototype nav map)
- Keyboard hint: "Use ← ↑ → ↓ to steer"
- No demo "Finish Race" button

- [ ] **Step 3: Smoke + commit**

Open `/#/race/tpl-ring-road` — steer, boost if present, complete 3 laps → Results.

```bash
git add src/hooks/useRaceLoop.js src/pages/Race.jsx
git commit -m "feat: playable race screen with HUD, countdown, pause"
```

---

### Task 7: Race results

**Files:**
- Modify: `src/pages/Results.jsx`

- [ ] **Step 1: Implement**

- Require `location.state.ms`; redirect if missing
- Award once per `resultId` via `sessionStorage` (StrictMode-safe) calling `recordTime`
- Layout per prototype: FINISH!, course name, Your Time, Best Time, Points Earned, buttons Race Again / View Leaderboard / Main Menu

- [ ] **Step 2: Smoke + commit**

Refresh Results must not re-award points.

```bash
git add src/pages/Results.jsx
git commit -m "feat: race results with guarded points award"
```

---

### Task 8: Course Builder (piece palette, snap-to-grid)

**Files:**
- Modify: `src/pages/CourseBuilder.jsx`

**UX (match prototype Course Builder screen):**
- Left palette sections: STRAIGHTS (Straight), CURVES (Curve ↰, Curve ↱ as rotation presets, S-Bend), SPECIALS (Start/Finish, Boost Pad, Obstacle, Pit Stop)
- Center: grass grid canvas; click or drag-from-palette to place; ghost preview under cursor
- Top: Back, course name field, Save Course, Test Drive
- Edit toolbar: Undo, Redo, Rotate CW/CCW, Delete, Clear, Grid toggle, Zoom ± (zoom can be CSS scale; min viable = rotate + delete + clear + undo stack)
- How-to banner: drag/snap/test
- Live `validateCourse` alert

- [ ] **Step 1: Editor state + canvas**

- Load via **`getCourse` (raw)** only
- All grid edits are **immutable functional updates** (`setGrid(prev => …)` copying the outer array + the changed row) so the undo/redo stack holds independent snapshots — never `splice`/assign into the current grid (Setting State session)
- Selected palette item: `{ piece, rotation }`
- Pointer place/replace; placing START converts any existing START to STRAIGHT (same rotation)
- Rotate selected cell or rotate stamp before place
- Draw pieces with `drawTrackPiece`

- [ ] **Step 2: Test / Save / Back**

- Test: disabled until valid → `saveCourse` → `/race/:id`
- Save → `saveCourse` → `/`
- Back → confirm if dirty → `/`
- Templates cannot `saveCourse` in place

- [ ] **Step 3: Smoke + commit**

Build a loop with curves, Test Drive, Save, see in Browse.

```bash
git add src/pages/CourseBuilder.jsx
git commit -m "feat: snap-to-grid course builder with track piece palette"
```

---

### Task 9: Car Designer (MS Paint freehand — NOT pixel art)

**Files:**
- Create: `src/components/PaintCanvas.jsx`
- Modify: `src/pages/CarDesigner.jsx`

**UX (match prototype Car Designer screen):**
- Top bar: Back · Car Designer · Save Car
- Fake menu bar: File Edit View Image Colors Help (non-functional stubs OK)
- Left tools: pencil, brush, eraser, fill (bucket), line, rect, ellipse, eyedropper; brush size control (3 sizes)
- Center: large white canvas with light graph-paper grid (`CAR_CANVAS_SIZE`, display scaled to fit)
- Bottom: current color swatch + ~20 palette colors
- Right: "Start from a template" list — Blank, Classic Racer, Pickup Truck, F1 Open-Wheel, Lil' Bug, Monster Truck — each with mini preview + Use →
- Using a template: `renderCarTemplateToDataUrl` → replace canvas bitmap (confirm overwrite)

**Data model:** working surface is an offscreen / visible `<canvas>`; Save exports `canvas.toDataURL('image/png')` via `savePlayerCar`.

- [ ] **Step 1: `PaintCanvas.jsx`**

```js
// Props: width=512, height=512, tool, color, brushSize, imageDataUrl, onChange(dataUrl)
// Tools:
// - pencil / brush: freehand stroke (brush = thicker lineCap round)
// - eraser: destination-out or paint white/transparent
// - fill: flood-fill on pixel data
// - line / rect / ellipse: rubber-band on pointer down/move, commit on up
// - eyedropper: set color from pixel under cursor (via callback onPickColor)
// Preserve transparency; show graph-paper underlay beneath the drawing layer.
```

Implement flood fill with a typed stack/queue on `ImageData` (max canvas 512²).

- [ ] **Step 2: `CarDesigner.jsx`**

- Layout with React Bootstrap grid matching prototype regions
- Template panel: small canvases calling each `draw*` once for preview
- Load `loadPlayerCar()` on mount into PaintCanvas
- Save → `savePlayerCar` → navigate `/`
- Back → `/`

- [ ] **Step 3: Smoke + commit**

Use Classic Racer template, recolor with brush/fill, save, race `/#/race/tpl-ring-road` — smooth car sprite (not blocky pixels).

```bash
git add src/components/PaintCanvas.jsx src/pages/CarDesigner.jsx
git commit -m "feat: MS Paint car designer with vector templates"
```

---

### Task 10: Course Browser + voting

**Files:**
- Create: `src/components/CourseCard.jsx`
- Modify: `src/pages/CourseBrowser.jsx`

Match prototype: "Community Courses", subtitle about vote/copy, cards with thumbnail, name, ▲ votes, Play, Copy & Edit. Cards keyed by `course.id` (never index).

- [ ] **Step 1–3:** As prior plan (thumbnail via `drawCourseThumbnail`, vote refresh, copy → `/build/:id`). Voting re-reads `listCourses()` into state after `voteForCourse` (localStorage writes don't re-render — L6). Back button → Main Menu. Commit:

```bash
git add src/components/CourseCard.jsx src/pages/CourseBrowser.jsx
git commit -m "feat: course browser with thumbnails, voting, copy-and-edit"
```

---

### Task 11: Leaderboard

**Files:**
- Modify: `src/pages/Leaderboard.jsx`

Tabs: Fastest Times (course select + table) · Overall Points. Highlight "You". Optional car name column can show "My Ride" for the player (static label). Back button → Main Menu (prototype nav map). Rows keyed by stable ids.

```bash
git add src/pages/Leaderboard.jsx
git commit -m "feat: leaderboard with per-course times and points ranking"
```

---

### Task 12: Invite Friends (mocked)

**Files:**
- Create: `src/services/inviteService.js`
- Modify: `src/pages/Invite.jsx`

- [ ] **Step 1:** Deterministic code formatted like prototype `ABC-123` (3 + hyphen + 3) from `hashString('wisconsin-racer-invite')`; persist in storage.

```js
export function getInviteCode() {
  let code = readKey('inviteCode', null)
  if (!code) {
    let n = hashString('wisconsin-racer-invite')
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const chars = Array.from({ length: 6 }, () => {
      const ch = alphabet[n % alphabet.length]
      n = Math.imul(n, 31) >>> 0
      return ch
    })
    code = `${chars.slice(0, 3).join('')}-${chars.slice(3).join('')}`
    writeKey('inviteCode', code)
  }
  return code
}

export function getJoinedFriends() {
  return [
    { name: 'You', status: 'host' },
    { name: 'RacerJane', status: 'ready' },
  ]
}
```

- [ ] **Step 2:** UI — code + Copy, lobby list, waiting line, Start Race → `/browse`, Back → `/`

```bash
git add src/services/inviteService.js src/pages/Invite.jsx
git commit -m "feat: mocked invite-friends screen with persistent code"
```

---

### Task 13: Polish, accessibility, heuristic self-review, deploy

- [ ] **Step 1: Accessibility pass (Lecture 7 checklist)**
  - Keyboard: **all operations reachable by keyboard** (WCAG A) — palette, tools, voting, pause menu; visible focus styles
  - Canvas elements get `role="img"` + `aria-label`; meaningful `alt` on all images (empty `alt=""` only if purely decorative)
  - Every form input has an associated label (Bootstrap `Form.Label` / `aria-label`)
  - **No skipped heading levels**; exactly one `h1` per page
  - **Contrast at WCAG AA** for all text/UI (check HUD badges over track colors); never convey state by color alone (checkpoint highlight also pulses/labels)
  - No fast flashing/strobing effects — countdown and boost effects stay gentle (seizure guidance)
  - Fix `index.html`: title → "Wisconsin Racer", remove or replace the dead `/favicon.svg` reference
  - Small-screen keyboard `Alert` on Race
  - Verify with **WAVE or Axe** browser extension + a quick screen-reader spot check
- [ ] **Step 2: Nielsen heuristic self-evaluation (Lecture 6)** — walk every screen against the 10 heuristics; minimums already designed in: system status (HUD, countdown, save confirmations — #1), user control (pause/quit, back, undo, escape-hatch navbar brand → Main Menu — #3), consistency (Bootstrap everywhere — #4), error prevention (confirm dirty-back, confirm template overwrite — #5), plain-language errors (course validation message — #9). Fix any violation found; note top findings for the demo video.
- [ ] **Step 3: Full regression vs `prototype-design.md` flows** — every navigation-map edge works; clear site data still loads templates; votes don't double-count; Results don't double-award; car looks smooth in race
- [ ] **Step 4: `AI.txt` at repo root** — approximate % AI-generated code and author's role (course AI-disclosure requirement)
- [ ] **Step 5:** `npm run lint` + `npm run build` + commit on `dev` + push
- [ ] **Step 6:** Merge to `main` only with user approval; verify live HashRouter URLs; then record demo video walking the two key flows (build → race → leaderboard; browse → copy & edit)

---

## Self-review notes

- **Prototype coverage:** All 8 prototype screens. Car Designer is MS Paint freehand + vector templates (not 12×12 pixel art). Course Builder uses oriented pieces (straight/curve/S-bend/specials) per the prototype. Race uses 3-lap HUD.
- **Single-writer rules:** `storage.js` only for `localStorage`; `recordTime` only from Results with `sessionStorage`/`resultId` guard; votes only via `VOTES_KEY`; `getCourse` raw.
- **Type consistency:** cells are `{ piece, rotation }`; car is `{ imageDataUrl }`; engine consumes `HTMLImageElement`; template ids pinned (`tpl-ring-road`, …).
- **derivePath:** degree-2 start bootstrap + orphan rejection on edge-connected graph.
- **Source of truth:** `prototype-design.md` + the embedded specs in this plan. If `Racer Prototype.pdf` is restored to `Web Project/`, prefer its visuals where they conflict.
- **Lecture alignment:** immutable state with functional updaters (Setting State session); localStorage synced through state, never read directly by components (L6); derived values computed on render, not mirrored state (L5); declarative-mode HashRouter with layout route + `<Outlet>` + `useNavigate` (L6, Publish); stable list keys (L5); controlled forms via `Form.Control` (L5); a11y + Nielsen self-review before deploy (L6–L7); `AI.txt` disclosure (Publish).
