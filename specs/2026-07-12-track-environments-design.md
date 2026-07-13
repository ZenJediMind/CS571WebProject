# Living Racing Environments — Design

**Date:** 2026-07-12
**Branch:** dev
**Status:** Approved (brainstorming), pending implementation plan

## Problem

The Course Builder and race screen paint every track over a flat green
`drawGrass()` — two-tone green stripes and nothing else. It reads as a
placeholder, not a racetrack. The goal: bring courses to life with
environments inspired by real motorsport (F1/F2/F3 circuits, rally, motocross,
desert raid, night street), and let each course pick its own setting.

## Decisions (from brainstorming)

1. **Selectable themes per course** — not one universal look. The builder gets
   a "Setting" picker; each course stores its theme; background, terrain, track
   accents, and thumbnail all follow it.
2. **Visual + light physics flavor** — loose-surface themes (rally, desert,
   motocross) drive with slightly reduced grip so the surface *feels* real.
   Physics change is one subtle knob, not a handling overhaul.
3. **Procedural rendering** — terrain is drawn on the canvas (no image assets),
   keeping the existing flat-vector art style, performance, and determinism.

## Architecture

A single new module, `src/game/themes.js`, is the source of truth for every
setting. Each theme is one object bundling its look, its track-accent tints,
and its grip. Every consumer (renderer, engine, builder, thumbnails) looks a
theme up by `course.theme` — no theme-specific branching scattered across files.

```
// src/game/themes.js
export const DEFAULT_THEME_ID = 'circuit'

// One theme object:
{
  id: 'rally',
  name: 'Rally Forest',
  emoji: '🌲',
  grip: 0.9,                     // steering-authority multiplier (1.0 = tarmac)
  drawTerrain(ctx, width, height, cellSize),   // replaces drawGrass
  track: {                       // optional per-theme track tints;
    curbRed, curbWhite,          // omitted fields fall back to circuit defaults
    road, dash,
  },
}

export const THEMES = [ /* circuit, rally, desert, motocross, night */ ]
export function getTheme(id)     // returns matching theme, or circuit for
                                 // unknown/missing id (back-compat)
```

### Theme roster

| id          | Name          | Emoji | Terrain (procedural)                                                        | grip |
|-------------|---------------|-------|-----------------------------------------------------------------------------|------|
| `circuit`   | Grand Prix    | 🏁    | Manicured turf, mowing stripes, tan gravel-trap margins, cool asphalt runoff | 1.0  |
| `rally`     | Rally Forest  | 🌲    | Deep evergreen ground, pine-canopy speckle, earthy dirt shoulders           | 0.9  |
| `desert`    | Desert Rally  | 🏜️    | Warm sand/ochre, wind-ripple banding, rocky speckle                         | 0.85 |
| `motocross` | Motocross     | 🏍️    | Churned orange-brown clay, berm-like tonal bands, tire-chew speckle         | 0.82 |
| `night`     | Night Street  | 🌃    | Dark asphalt-blue ground, neon magenta/cyan accents, floodlight vignette     | 1.0  |

`circuit` and `night` keep tarmac grip (`1.0`); `night` is a visual-only change.
Terrain speckle/patterns are generated with the deterministic `mulberry32` PRNG
already present in `render.js` (seeded by cell position) — no `Math.random`, so
redraws are stable and the build stays deterministic.

## Components & Changes

### `src/game/themes.js` (new)
- `THEMES`, `DEFAULT_THEME_ID`, `getTheme(id)`.
- Five `drawTerrain` implementations sharing small private helpers (base fill,
  horizontal banding, seeded speckle) to stay DRY.
- Grand Prix's `drawTerrain` reproduces (and enriches) the current grass so the
  default look is a strict upgrade, not a regression.

### `src/game/render.js`
- `drawGrass(...)` is removed/replaced; `drawCourseInto(ctx, grid, cellSize,
  theme)` calls `theme.drawTerrain(...)` for the ground, then draws pieces.
- `drawTrackPiece(ctx, piece, rotation, x, y, cellSize, theme)` reads kerb/road/
  dash colors from `theme.track` when present, else the module-level `COLORS`
  (circuit defaults). `theme` is optional and defaults to circuit, so
  `PiecePreview` and the builder's ghost-stamp preview are unaffected.
- `createCourseBackground(course)` and `drawCourseThumbnail(canvas, course)`
  resolve `getTheme(course.theme)` and pass it through.

### `src/game/engine.js`
- `createRaceState(course, opts)` resolves `getTheme(course.theme).grip` and
  stores it as `state.grip`.
- `applySteering` multiplies steering authority by `state.grip`. This is the
  only physics change. Default theme grip `1.0` ⇒ current behavior is byte-for-
  byte unchanged, so existing engine tests pass without edits.
- Ghost/rival simulations in `ghosts.js` already call `createRaceState(course,
  …)`, so they inherit the same grip automatically — player, best-ghost, and
  rival pace all agree. Deterministic and fair.

### `src/services/courseService.js`
- `createDraftCourse()` sets `theme: DEFAULT_THEME_ID`.
- No storage migration needed: `getTheme` treats missing `theme` as circuit.

### `src/game/templates.js`
- `courseFromCells` accepts a `theme`; each of the four built-ins gets a fitting
  setting for instant variety (e.g. Spa → circuit, Mad Town GP → motocross).

### `src/pages/CourseBuilder.jsx`
- Theme held in editor state (or alongside `name`); a **"Setting" picker** in
  the top toolbar sets it, marks the course dirty, and live-repaints the canvas.
- The canvas `useEffect` passes the current theme to `drawCourseInto`.
- `persistCourse` writes `theme` into the saved course.

### `src/components/CourseCard.jsx`
- No change needed beyond passing `course` (already does) — thumbnail follows
  `course.theme` through `drawCourseThumbnail`.

## Data Flow

```
course.theme (string id)
   └─ getTheme(id)  ──►  theme object
        ├─ render:  drawTerrain + track tints  → builder canvas, race background, thumbnail
        └─ engine:  grip  → createRaceState → applySteering (player, ghost, rival)
```

## Error Handling / Edge Cases

- **Unknown or missing `theme`** → `getTheme` returns circuit. Covers every
  pre-existing saved course and any future bad data.
- **Re-theming a saved course** shifts its grip, so previously recorded best
  times (keyed on `courseId` only) are no longer perfectly comparable — the same
  as editing the track pieces today. Documented, not guarded; out of scope.

## Testing

- `themes.test.mjs` (new): `getTheme` returns circuit for unknown/missing id;
  every theme has `id`, `name`, `emoji`, numeric `grip`, and a `drawTerrain`
  function; grip values are within a sane range (e.g. 0.7–1.0).
- `engine` tests: grip `< 1` measurably reduces turn-per-step vs grip `1.0`;
  the existing suite continues to pass unchanged (default course = circuit).
- Back-compat: a course object without `theme` renders and simulates as circuit.

## Non-Goals (YAGNI)

- No image/photo assets, no WebGL, no parallax or animated weather.
- No per-cell surface types (whole course shares one setting).
- No new grip mechanics beyond the single steering-authority multiplier.
- No leaderboard segregation by theme.

## Performance

Terrain is rendered once into the cached background canvas
(`createCourseBackground`); race frames blit that bitmap, so there is zero
per-frame terrain cost. The builder repaints only on edit/theme change.
Deterministic seeded speckle avoids allocation churn from `Math.random`.
