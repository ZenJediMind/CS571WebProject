# Wisconsin Racer Web Project Review

**Reviewed:** July 16, 2026

**Branch:** `dev`

**Scope:** Functionality, maintainability, DRYness, performance, security,
accessibility, browser behavior, and CS571 lecture alignment.

## What the project does

Wisconsin Racer is a client-only React/Vite racing game. Players can build and
save grid-based tracks, paint a car, race three laps, compare deterministic
times and ghosts, and use simulated voting, leaderboards, and invite flows.
Browser storage is its mock backend; it has no API, credentials, or live
multiplayer.

## Result

The architecture remains appropriately small: React pages, reusable canvas/game
modules, and one storage-backed service layer. No framework, dependency, state
library, backend, or broad rewrite is warranted. This review fixed the confirmed
issues below at their shared boundaries.

## Fixes and simplifications

- Fixed rival-pace cache collisions. The old grid hash used only each piece's
  first letter, so moving a Start tile could reuse calibration from a different
  track. The cache now uses the native deterministic JSON grid representation.
- Hardened stored-course validation. Malformed authors, invalid metadata,
  duplicate ids, and template-id collisions are ignored before React sees them;
  a corrupt saved course can no longer crash Browse.
- Made vote and in-race sound writes report storage failures instead of looking
  successful. Browse now reuses one error state for copy, delete, and vote.
- Added screen-reader status for the Course Builder keyboard cursor and cell
  contents while preserving its existing keyboard editing controls.
- Removed the 25-line test-module rewriting helper. Source modules now use native
  ESM file extensions, and tests import the real files directly.
- Added focused regressions for stored-course filtering, vote write failures,
  and track-specific rival cache entries.

## Verification

- `npm.cmd test`: 43 passed, 0 failed.
- `npm.cmd run lint`: passed with no findings.
- `npm.cmd run build`: passed; Vite transformed 235 modules.
- Production output:
  - HTML: 0.98 kB / 0.52 kB gzip
  - CSS: 241.68 kB / 33.75 kB gzip
  - JavaScript: 418.32 kB / 133.57 kB gzip
- Headless Edge browser audit passed Home, Browse, Course Builder, Car Designer,
  Leaderboard, Invite, Settings, Race, narrow-screen race blocking, and unknown
  route recovery.
- Browser fault injection confirmed malformed courses are ignored and blocked
  vote/sound writes show feedback.
- Browser accessibility checks found no duplicate ids, unlabeled form controls,
  unlabeled buttons, horizontal overflow, or application console errors across
  the audited routes. Escape opens and closes the pause dialog.
- No application API calls, frontend secrets, credential reads,
  `dangerouslySetInnerHTML`, or nondeterministic `Math.random` usage were found.

## Performance and security

Static course backgrounds are pre-rendered, HUD state updates are throttled off
the animation hot path, race physics is capped and sub-stepped, and procedural
art/rivals use seeded deterministic data. The reviewed changes added 718 bytes
to the raw production JavaScript bundle (about 0.17%). There is no sensitive
frontend data or server surface; browser storage is treated as fallible and
shape-validated before display.

## Lecture alignment

- Lectures 5–6: state remains immutable, derived values stay derived, storage is
  behind services, navigation guards prevent data loss, and visible failure
  feedback replaces false success.
- Lecture 7: labeled controls, keyboard paths, live status, visible focus,
  reduced motion, and responsive race blocking are preserved.
- Publishing guidance: the hash-based router, `/CS571WebProject/` Vite base, and
  committed `docs/` output remain GitHub Pages compatible.

## Addendum — July 17, 2026

A follow-up review with a live Playwright audit confirmed the July 16 fixes
hold (Escape pause/resume, Space-key modal activation, keyboard course
building, Test Drive history replacement, deep-link and unknown-route
recovery, storage-failure feedback) and resolved three remaining issues:

- Muted race audio when the canvas unmounts mid-race. Resizing under the
  raceable breakpoint skipped the mute call, leaving the synthesized engine
  hum playing; the loop's no-canvas path now silences it. Verified by spying
  on gain automation before and after a narrow resize.
- Reset the GO! flash on restart. Restarting from the pause modal inside the
  700 ms flash window cleared the flash timer but left the green traffic lamp
  lit through the next countdown. Verified by restarting during the flash.
- Extracted the storage-full alert, which was pasted in three places, into
  `StorageFullAlert`, and hoisted the duplicated per-frame skid condition in
  the race loop.

Verification: 43/43 tests, lint clean, build clean (418.10 kB raw JavaScript,
slightly smaller than before the change).

## Deliberately not added

- No Redux, TypeScript migration, backend, live multiplayer, service worker,
  Web Worker, or new package.
- No route-level lazy loading or custom cache without profiler evidence.
- Freehand car painting remains pointer-driven; keyboard users retain the full
  template and color-control path. Add keyboard pixel editing only if usability
  testing shows that lower-level drawing is a required task.
