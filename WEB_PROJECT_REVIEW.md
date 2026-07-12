# Wisconsin Racer Web Project Review

**Reviewed:** July 12, 2026  
**Branch:** `dev`  
**Scope:** Source code, proposal/prototype alignment, desktop and mobile runtime behavior, accessibility, performance, security, maintainability, and CS571 lecture alignment.

## Executive summary

Wisconsin Racer is already a strong, coherent course project. Its central build-paint-race loop works, its Wisconsin racing theme is distinctive, the React structure is sensible, and the project follows the class's GitHub Pages publishing approach correctly. The implementation is more complete than the approved frontend-only scope requires.

The highest-priority work is not a rewrite. Fix the race timer's low-frame-rate fairness bug, stop reporting saves as successful when browser storage fails, decide how mobile users should race, and close the clearest accessibility gaps. After those items, make the mocked community features explicit, replace the starter README, and add one small deterministic test layer for the game rules.

## Review evidence

- `npm.cmd run lint` passed with no findings.
- A clean Vite production build passed in 188 ms.
- Production output measured:
  - HTML: 0.98 kB / 0.52 kB gzip
  - CSS: 233.85 kB / 31.96 kB gzip
  - JavaScript: 337.11 kB / 107.62 kB gzip
- The app was exercised at approximately 1250×770 desktop and 390×844 mobile viewports. Home, course browsing, car design, course building, and racing rendered without console errors.
- A manual accessibility-tree review found useful labels, headings, and landmarks. A color calculation found Bootstrap's secondary gray text at about **4.04:1** against the custom page background, below the common 4.5:1 target for normal text.
- A direct engine check confirmed that passing a 100 ms frame to `stepRace` records only 50 ms of elapsed race time.
- No application API calls, frontend secrets, credentials, or dangerous HTML injection were found.
- No automated test files were found.

This was a targeted code/runtime audit, not a complete WAVE, Axe, screen-reader, Lighthouse, or multi-browser certification.

## What is already working well

### Product and design

- The implemented experience matches the proposal's strongest idea: users can assemble a course from templates, draw a car, race, and compare results.
- The approved mock approach for multiplayer/community behavior kept the project deliverable within a client-only GitHub Pages scope.
- Visual hierarchy is clear. The home title and primary Play action are obvious focal points, while the checkered ribbon, Badger red, cheddar, asphalt, and type choices form a consistent visual system.
- Bootstrap containers, rows, columns, cards, navigation, and breakpoints produce clean responsive page layouts.
- Destructive actions use confirmation, course validity is shown inline, and the builder supports undo/redo.

### React and code organization

- Components, pages, services, hooks, and pure game modules have clear responsibilities.
- `storage.js` centralizes browser storage access instead of scattering `localStorage` calls.
- Game simulation is kept outside React and DOM code, which improves determinism and testability.
- Course templates validate themselves at module load.
- `HashRouter`, the `/CS571WebProject/` Vite base, and `docs` output match the course's GitHub Pages guidance.

### Accessibility foundations

- Form controls have labels; meaningful images and canvases have accessible names; decorative graphics are hidden from assistive technology.
- Focus styling is deliberately visible, reduced-motion preferences are respected, and the builder has keyboard placement, rotation, and deletion controls.
- Countdown and validation feedback use live regions without making the rapidly changing race timer a live announcement.

### Performance foundations

- The race uses `requestAnimationFrame`.
- The static course background is pre-rendered once and reused each frame.
- Race state stays in refs, and HUD React updates are intentionally limited to about 10 Hz.
- The current compressed initial bundle is reasonable for a course project. It should be tuned with measurements, not replaced wholesale.

## Prioritized improvements

### P0 — Fix before treating race results as fair

#### 1. Separate physics stabilization from elapsed race time

**Evidence:** `src/game/engine.js:18` caps a frame at 0.05 seconds, then `src/game/engine.js:149-151` adds that capped value to `elapsedMs`. A 100 ms input frame therefore records 50 ms. On a device running below 20 FPS, both movement and the leaderboard clock slow down.

**Impact:** Slower devices can receive artificially faster scores. This is a correctness, performance, and fairness problem.

**Smallest sound fix:** Preserve real elapsed time while advancing physics in substeps no larger than 0.05 seconds. Add one deterministic regression check asserting that 100 ms of wall-clock input records 100 ms while physics remains stable.

#### 2. Do not silently lose saved work

**Evidence:** `src/services/storage.js:13-18` catches failed writes and reports nothing. Course and car save handlers then navigate away as if the save succeeded. The comment claiming an in-memory fallback is inaccurate; no fallback exists.

**Impact:** Storage quota, private browsing restrictions, or corrupted storage can make a user's course, car, score, or vote disappear without warning.

**Smallest sound fix:** Make `writeKey` return success/failure or throw a controlled error. Keep the user on the page and show a clear message if saving fails. Do not add a storage abstraction or state library.

This directly follows Lecture 6's visibility-of-system-status and error-recovery heuristics (`Lecture Transcripts/Lecture 6 - CS571 SU26_ Web Dev 3 & Expert Evaluation.txt:1818-1840, 1946-1966`).

### P1 — Important usability and accessibility work

#### 3. Make the mobile race decision explicit

**Evidence:** At 390 px wide, the race starts automatically while the page says a keyboard and bigger screen are required (`src/pages/Race.jsx:128-130`). The course builder also compresses a 16×10 grid into roughly 22 px cells, which is difficult to target accurately by touch.

**Recommendation:** Prefer simple on-screen steering controls with thumb-sized targets. If mobile racing is intentionally out of scope, block the countdown and provide clear Browse/Main Menu actions instead of starting an unwinnable timed race. Increase the builder's effective touch target through zoom/pan or a selected-cell editing mode; do not attempt a complete mobile-editor rewrite.

Lecture 7 emphasizes mobile target size and keyboard operability (`Lecture Transcripts/Lecture 7 - CS571 SU26_ Web Dev 4 & Accessibility.txt:1945-1951, 1997-2001`), while Lecture 4 calls for layouts that adapt across desktop, tablet, and mobile (`Lecture Transcripts/Lecture 4 - CS571 SU26_ Web Dev 1 & Web Design.txt:2338-2360`).

#### 4. Close the canvas accessibility gap

**Evidence:** The builder has keyboard editing, but its canvas does not announce the current cell contents or selected piece. The car canvas is exposed as an image and supports pointer drawing only. The race is keyboard-operable but has no meaningful nonvisual representation.

**Recommendation:**

1. Announce builder cursor position, cell contents, and edits in a polite status region.
2. Make car templates and color choices an explicitly complete keyboard-accessible alternative, or add a keyboard cursor for painting if freehand drawing is a required equal operation.
3. Screen-reader test the build → save → race flow instead of relying only on ARIA labels.

Lecture 7 specifically calls for text alternatives, associated labels, logical headings, keyboard operation, and automated plus manual auditing (`Lecture Transcripts/Lecture 7 - CS571 SU26_ Web Dev 4 & Accessibility.txt:1802-1807, 1968-2001, 2028-2053`).

#### 5. Correct secondary-text contrast and small targets

**Evidence:** `.text-secondary` and active outline-secondary text resolve to `#6c757d` on `#efeee9`, about 4.04:1. This affects back buttons, descriptions, result labels, card authors, and other normal-sized text. Several small buttons/swatches are 31–38 px tall on mobile.

**Smallest sound fix:** Override the Bootstrap secondary text color with a darker theme token and retest focus, disabled, hover, and active states. Increase the most frequently used mobile controls to comfortable thumb targets. Disabled decorative text does not need to be made prominent.

Lecture 3 warns against relying on color alone (`Lecture Transcripts/Lecture 3 - CS571 SU26_ Web Dev Basics 3 & Visual Design.txt:2393-2401`), and Lecture 7 calls out sufficient contrast and touch size.

#### 6. Remove false affordances and clarify duplicate actions

**Evidence:** The Car Designer renders disabled File/Edit/View/Image/Colors/Help controls that look like a functional application menu (`src/pages/CarDesigner.jsx:139-144`). On Home, Play and Browse Courses lead to the same place.

**Smallest sound fix:** Delete the fake menu. Either remove one duplicate home action or make Play a real quick-start action while Browse remains course selection.

Lecture 5 says visible controls without real functionality are false affordances and should be avoided (`Lecture Transcripts/Lecture 5 - CS571 SU26_ Web Dev 2 & Interaction Design.txt:1551-1594`). Lecture 6 also favors aesthetic, minimalist design (`Lecture Transcripts/Lecture 6 - CS571 SU26_ Web Dev 3 & Expert Evaluation.txt:1946-1949`).

#### 7. Label mocked social behavior honestly

**Evidence:** Community courses, votes, rivals, joined friends, and invite codes are local or deterministic mocks. The instructor explicitly allowed this scope, but the UI presents them as shared/live behavior.

**Smallest sound fix:** Add concise labels such as “Demo lobby,” “Simulated rivals,” and “Saved on this device.” Explain that invite codes do not connect different browsers. Do not build a backend unless the project requirements change.

This supports Lecture 6's match-between-system-and-real-world and system-status heuristics.

### P2 — Performance improvements, in measured order

#### 8. Stop redrawing an unchanged paused/countdown race

**Evidence:** `src/hooks/useRaceLoop.js:88-105` schedules frames and calls `drawFrame` continuously even when `racing` is false. During countdown and pause, the canvas state is unchanged.

**Fix:** Draw once while inactive and only run the animation loop while racing. This is a direct CPU/battery saving with a small code change.

#### 9. Avoid same-cell builder re-renders

**Evidence:** Every pointer move calls `setHoverCell` (`src/pages/CourseBuilder.jsx:258`), which can rerender React and redraw the full 1024×640 builder canvas even when the pointer remains in the same grid cell.

**Fix:** Update hover state only when row/column changes. Consider a separate overlay canvas only if profiling still shows a problem.

#### 10. Reduce initial-route work with route-level lazy loading

**Evidence:** `src/App.jsx:3-10` eagerly imports every page. The production JavaScript is 337.11 kB raw / 107.62 kB gzip, slightly above the lecture's illustrative sub-100-kB JavaScript bundle example. The full Bootstrap CSS is 233.85 kB raw / 31.96 kB gzip.

**Fix:** Lazy-load the larger builder, car designer, race, results, and leaderboard routes. Keep Bootstrap unless Lighthouse/network measurements show its CSS is a real constraint; replacing the design system would cost more complexity than it saves.

Lecture 7 notes that build assets should be small because mobile connections can be slow (`Lecture Transcripts/Lecture 7 - CS571 SU26_ Web Dev 4 & Accessibility.txt:1627-1642`) and warns about avoidable component re-renders (`Lecture Transcripts/Lecture 7 - CS571 SU26_ Web Dev 4 & Accessibility.txt:893-971`).

#### 11. Reconsider 512×512 car history only if interaction profiling confirms lag

**Evidence:** The car editor uses a 512×512 bitmap (`src/game/templates.js:5`) and synchronously encodes a PNG data URL after every committed stroke (`src/components/PaintCanvas.jsx:128`), while retaining up to 20 encoded history entries.

**Likely simple win:** Test a 256×256 drawing surface. It is four times fewer pixels and the race renders the car at only 48 px. Keep 512 if visual comparison shows a meaningful quality loss. Avoid workers, custom codecs, or a new drawing library unless a profiler proves they are needed.

### P2 — Reliability, documentation, and polish

#### 12. Add one small deterministic test layer

Prioritize tests for:

- elapsed-time fairness across long frames;
- course loop validation and checkpoint order;
- points/best-time idempotence;
- storage failure behavior.

Use the platform's built-in test runner if practical. Do not build a large fixture framework.

#### 13. Replace the starter Vite README

`README.md` still describes the Vite template rather than Wisconsin Racer. Replace it with project purpose, install/run/build commands, controls, storage behavior, mocked-feature limitations, GitHub Pages deployment, and the verified bundle/check commands.

#### 14. Fix the unsaved-name edge case and add a not-found route

- Builder dirty state tracks grid edits but not a course-name-only change (`src/pages/CourseBuilder.jsx:141, 368`), so Back can discard a renamed course without confirmation.
- `src/App.jsx:26-33` has no wildcard route, so an unknown hash can produce an empty layout instead of a useful recovery page.

Both fixes are small and align with user control, error prevention, and recovery.

#### 15. Remove unused starter assets

`src/assets/react.svg`, `src/assets/vite.svg`, and likely `src/assets/hero.png` have no source references. They do not enter the current Vite bundle, so deletion is repository cleanup rather than a runtime optimization.

## Lecture alignment summary

| Lecture principle | Current alignment | Remaining evidence/work |
|---|---|---|
| Lecture 1: empathize, prototype, test, iterate | Proposal and interactive prototype clearly informed the implementation. | No usability-test findings were found. Run a short think-aloud test with novice users on build → test drive → results and browse → copy/edit. Lecture 1 distinguishes technical debugging from testing whether users can succeed (`Lecture Transcripts/Lecture 1 - CS571.txt:1374-1410, 1992-2015`). |
| Lecture 3: focal point, contrast, consistent visual language | Strong home focal point and cohesive Wisconsin racing identity. | Correct secondary-gray contrast and verify color is never the only state cue. |
| Lecture 4: navigation and responsive grids | Consistent global navigation, back controls, and Bootstrap layouts. | Resolve the mobile race dead end and tiny builder cells. |
| Lecture 5: affordances and low-friction flows | Controls generally look and behave like controls; builder instructions are visible. | Remove the fake desktop menu and clarify duplicate/mocked actions. |
| Lecture 6: cognitive walkthrough and Nielsen heuristics | Undo/redo, confirmations, validation, familiar Bootstrap patterns, and status feedback are strong. | Test novice discoverability; surface storage failures; make mock state explicit; add recovery for unknown routes. |
| Lecture 7: React, build size, accessibility | Good component boundaries, refs for the hot race loop, labels/ARIA, responsive structure, and successful build. | Fix timer behavior under slow frames, canvas access, contrast, touch targets, paused-loop work, and initial route loading. |
| Project publishing lecture | Correct client-only React, HashRouter, base path, and `docs` build output. | Replace the generic README and confirm the deployed `dev` build before merging. |

## Recommended order of work

1. Fix and regression-check race timing.
2. Make save failures visible and non-destructive.
3. Add mobile race controls or prevent unsupported races from starting.
4. Fix contrast and canvas/status accessibility; perform WAVE/Axe plus screen-reader checks.
5. Remove false affordances and label local/mock behavior.
6. Replace README, add not-found handling, and track course-name dirtiness.
7. Apply the three small performance wins, then measure again before doing more.
8. Run a novice-user think-aloud session and use its findings to choose any further work.

## Changes that are not justified yet

- No backend or live multiplayer: the instructor approved a frontend mock.
- No Redux/global state framework: current state ownership is clear.
- No TypeScript rewrite: it would not address the identified user-facing risks.
- No Bootstrap replacement, service worker, Web Worker, or custom rendering framework without profiling evidence.
- No broad component split based only on file length; split `CourseBuilder.jsx` only when a concrete change becomes hard to maintain.

