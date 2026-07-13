# Wisconsin Racer Web Project Review

**Reviewed:** July 12, 2026
**Branch:** `dev`
**Scope:** Source, runtime behavior, accessibility, performance, security,
maintainability, project documentation, and CS571 lecture alignment.

## Result

The project is clean, coherent, and appropriately scoped for a client-only
CS571 application. The review found no reason for a framework change, new
dependency, backend, TypeScript migration, or broad component rewrite. The
smallest shared fixes and deletions were applied, and all verified behavior
still works.

## Verification

- `npm test`: 23 tests passed, 0 failed.
- `npm run lint`: passed with no findings.
- `npm run build`: passed; Vite transformed 232 modules.
- Production output:
  - HTML: 0.98 kB / 0.52 kB gzip
  - CSS: 234.13 kB / 32.03 kB gzip
  - JavaScript: 351.12 kB / 112.17 kB gzip
- Headless browser smoke passed:
  - Home and course browsing render.
  - The four built-in courses render.
  - Escape opens and closes the pause modal.
  - Space activates the focused Resume button.
  - Changing race course remounts a fresh countdown.
  - Car Designer, Settings, and unknown-route recovery render without
    application console errors.
- No application API calls, frontend secrets, credential reads,
  `dangerouslySetInnerHTML`, or nondeterministic `Math.random` usage were found.

The browser environment blocked external font requests; the application uses
local fallback font stacks and continued normally.

## Simplifications and fixes applied

### Less code and duplication

- Removed the decorative, nonfunctional Car Designer menu and its data table.
- Removed the duplicate Browse Courses action; Play already opens Browse.
- Removed unused Vite/React/hero assets and unused module exports.
- Reused `createEmptyGrid` when clearing a course.
- Reused one `sameCell` comparison for builder hover and paint-drag checks.
- Replaced per-course vote-storage reads with one read per course listing.
- Replaced the starter Vite README with project-specific run, control, test,
  storage, mock-feature, and publishing instructions.

### Race behavior

- The shared keyboard handler now captures game keys only while racing, so
  native Space activation works in the pause modal.
- One window listener owns Escape; the modal's competing listener is disabled.
- Oil skid audio now uses the same speed threshold as visual skid marks.
- A race remounts when `courseId` changes, resetting countdown and pause state.
- The best-lap ghost remains visible consistently on paused frames.
- The sound button initializes audio from its user gesture.

### Performance, accessibility, and clarity

- Same-cell pointer movement no longer redraws the full builder canvas.
- Bootstrap secondary text now uses a darker, AA-readable theme value.
- Simulated courses, votes, rivals, invite codes, and lobby state are labeled
  as local or simulated instead of implying networked multiplayer.
- Unknown routes return to Home through React Router.
- Name-only course edits now trigger the unsaved-changes warning.
- Settings reports blocked storage writes instead of showing unsaved values.
- `AI.txt` names both AI tools used on the project.
- `docs/` was rebuilt from the reviewed source for GitHub Pages.

## Remaining work, in priority order

1. **Choose a mobile race policy.** The race still starts on narrow screens
   while explaining that a keyboard is required. Add simple touch controls or
   prevent the countdown and offer Browse/Main Menu actions.
2. **Improve canvas accessibility.** Announce Course Builder cursor position,
   cell contents, and edit results. The car templates provide a keyboard path,
   but freehand canvas drawing remains pointer-only.
3. **Profile before optimizing more.** Rival pace calibration and the 512 px
   paint history are measurable candidates, but neither justifies caching,
   workers, or new libraries without a slow-device trace.

The first countdown may be silent until a user gesture because browsers block
Web Audio autoplay. That is expected platform behavior, not a reason to bypass
the browser policy.

## Lecture alignment

- Lecture 5: removed false affordances and duplicate actions.
- Lecture 6: kept status feedback, confirmations, undo/redo, recovery, and
  minimalist design; storage remains behind one service gateway.
- Lecture 7: preserved labeled controls, keyboard operation, visible focus,
  reduced motion, sufficient secondary-text contrast, Vite publishing, and
  Bootstrap/React Router patterns.
- Publishing lecture: `HashRouter`, `/CS571WebProject/`, and committed `docs/`
  output remain aligned with GitHub Pages.

## Deliberately skipped

- No Redux or other state framework.
- No backend or live multiplayer; the instructor-approved scope is simulated.
- No TypeScript rewrite.
- No route-level lazy loading while the measured bundle remains modest.
- No Bootstrap replacement, service worker, Web Worker, or custom renderer
  without profiler evidence.
- No broad split of `CourseBuilder.jsx`; its reducer, canvas, and controls form
  one cohesive editor and current changes remain straightforward.
