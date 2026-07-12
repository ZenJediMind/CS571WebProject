# Race Night Update — Design

**Goal:** Deepen Wisconsin Racer's core loop with visible opponents (ghost cars), stronger race feel (splits, skid marks, particles, sound), and more expressive handling and course pieces — all client-only, on the `dev` branch, within the existing localStorage architecture.

**Motivation:** Time trials against a static number are abstract; racing a visible car is visceral. Creation tools get more expressive with hazard/stunt pieces. These are proven patterns from successful arcade racers and sandbox builders, adapted to this project's no-backend constraints.

## Scope

In: Settings page, ghost racing (personal-best replay + live rival ghosts), live checkpoint splits, skid marks, boost particles, synthesized audio, handbrake drift, oil slick piece, ramp piece with airborne state, template showcase (Mad Town GP), Node fixture coverage.

Out: ghost collisions, unlockables/progression, course share codes, any backend, changes to `main`.

## 1. Settings

- New route `/settings`, linked from the Main Menu (7th button) — an accepted extension of the 6-button prototype menu.
- `src/services/settingsService.js`: `getSettings()` / `saveSettings(partial)` over `storage.js` key `settings`.
- Options:
  - `ghosts`: `'off' | 'best' | 'rivals' | 'both'` (default `'both'`)
  - `sound`: boolean (default `true`)
- Bootstrap radios/switches with proper labels; changes persist immediately.

## 2. Ghost racing

Ghosts are **purely visual**: no collision, no effect on checkpoints, laps, or scoring.

### Personal-best ghost (`'best'` / `'both'`)
- **Recording:** during a race the loop samples `{x, y, heading}` every 100ms of *simulation* time (not wall clock), plus a cumulative checkpoint-split array (`elapsedMs` at each checkpoint crossing and lap line).
- **Persistence:** `src/services/ghostService.js` stores one recording per course (key `ghostLaps`), replaced only when the run is a new personal best. Coordinates rounded to integers; ~5KB per course.
- **Playback:** interpolate position/heading between samples at the current race `elapsedMs`. Rendered as the player's own car bitmap at reduced alpha.
- Chosen over input-replay: position samples survive engine tuning changes; input replay would silently desync.

### Rival ghosts (`'rivals'` / `'both'`)
- Up to 2 rivals — the two with the fastest leaderboard times on this course — appear as flat tinted car silhouettes (distinct colors, reduced alpha, name label).
- Each rival is a full race state driven **live** by an autopilot (`src/game/autopilot.js`, promoted from the test harness controller: steer-to-next-path-cell with corner braking and stuck-reverse).
- **Pace matching:** at race mount, fast-simulate the rival's run once (deterministic, milliseconds of CPU) to measure the autopilot's natural time on this course, then set a per-rival top-speed scale `naturalTime / rivalLeaderboardTime` (clamped ~0.4–1.1) so the ghost's on-track pace approximates its leaderboard time. Works on user-built courses, which pre-baked recordings could not.
- **Determinism:** rival states step on a fixed-timestep accumulator (60Hz) fed by frame dt.
- Ghosts hold at the start line during the countdown and launch with the player.

## 3. Race feel & feedback

### Live splits
- Engine tracks cumulative checkpoints passed (`totalCheckpointsPassed`) and records split times.
- When the player crosses a checkpoint and a best-run recording exists, the HUD shows a delta chip ("−0.4" / "+1.2", green/red, also readable by shape: −/+ prefix), fading after ~1.5s.

### Skid marks
- A per-race overlay canvas sits between the static track background and the cars.
- While drifting (handbrake at speed), steering hard near top speed, or crossing oil, dark low-alpha marks are stamped at rear-wheel offsets.
- The overlay accumulates for the whole race and resets on restart.

### Boost particles
- Engine increments `boostCount` on boost-pad entry; the render layer detects the change and spawns a short spark burst at the car.
- Particle randomness comes from a small seeded PRNG (seeded by `boostCount`), keeping runs deterministic — no `Math.random` in the game path.

### Audio (`src/game/audio.js`)
- Fully synthesized via WebAudio — no audio assets: engine hum (oscillator pitched by speed), skid (filtered noise gate), boost sweep, countdown beeps (3 short, 1 long).
- AudioContext is created/resumed on the first user gesture (keydown) per autoplay policy.
- Master gain honors the Settings sound flag; the race screen also gets a quick mute toggle. All audio stops on unmount/pause.

## 4. Handling & pieces

### Handbrake (Space)
- New input `handbrake`. At speed: turn rate ×~1.6 and extra speed scrub while held.
- A render-only drift angle (car sprite rotated a few tenths of a radian beyond heading while drifting) sells the slide without slip-angle physics.
- Race screen hint text updated (Space = handbrake).

### Oil slick piece (`PIECES.OIL`)
- Connectivity: N+S (straight family); drivable; counts toward the loop like any road piece.
- Effect while on the cell: steering authority ~25%, throttle ineffective, reduced friction (the car carries its speed).
- Art: asphalt with a dark iridescent sheen.

### Ramp piece (`PIECES.RAMP`)
- Connectivity: N+S; drivable.
- Entering above ~40% top speed sets an airborne timer (speed-scaled, ~0.5s). While airborne: no steering, no throttle/brake, no cell effects or checkpoint registration, and the car passes over non-drivable cells (grass, obstacles).
- Landing on a non-drivable cell bounces the car back to the last safe on-track position at half speed (engine tracks `lastSafe`).
- Anti-cut: skipped checkpoints must still be collected in order, so jump shortcuts that miss one cost more than they save.
- Art: road with a bright wedge/arrow; airborne car renders enlarged with a drop shadow.

### Builder & templates
- Both pieces join the Course Builder palette under Specials.
- Mad Town GP gains one oil slick and one ramp on its loop so the demo shows both without building. (Rival leaderboard times hash on course id only, so they are unaffected.)

## 5. Data & interfaces

| Unit | Provides | Depends on |
|------|----------|------------|
| `settingsService` | `getSettings`, `saveSettings` | `storage` |
| `ghostService` | `loadGhost(courseId)`, `saveGhostIfBest(courseId, recording)` | `storage` |
| `game/autopilot` | `autopilotInputs(state, cursor)` pure controller | `courseModel` |
| `game/ghosts` | rival sim setup/step, best-ghost interpolation | `engine`, `autopilot`, `ghostService` |
| `game/audio` | `RaceAudio` (start/stop/update/boost/beep, gain) | — |
| `engine` (extended) | handbrake, oil, airborne, `boostCount`, cumulative checkpoints, `lastSafe`, top-speed scale | `courseModel` |
| `render` (extended) | oil/ramp art, ghost/particle/skid/airborne drawing | `courseModel` |

Engine stays pure (no DOM, no timers, no `Math.random`); audio and particles live outside it, driven by state changes.

## 6. Testing (Node fixtures, deterministic)

- Autopilot still completes 3 laps on all templates, including Mad Town GP with oil + ramp on the loop.
- Handbrake: measurably smaller turn radius vs. no handbrake at the same speed.
- Oil: heading change under steering drops while on an oil cell.
- Ramp: airborne car crosses an obstacle cell and lands on track; landing off-track restores last safe position at half speed.
- Pace matching: scaled rival sim finishes within ~10% of the target leaderboard time.
- Ghost recording: sample + splits round-trip through interpolation (position at a sample time equals the sample).

## 7. Accessibility & quality bar

- Settings inputs labeled; split chips readable by prefix (not color alone); no flashing effects beyond the existing gentle pulse; reduced-motion users see no new animation (particles are canvas-internal and brief; CSS additions gated as before).
- Sound is opt-out via Settings and never auto-plays before a user gesture.
- Verification per task: `npm run lint`, `npm run build`, Node fixtures, manual smoke in `npm run dev`.
