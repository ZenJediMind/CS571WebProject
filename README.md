# Wisconsin Racer

Wisconsin Racer is a client-only React racing game for CS571. Build a track,
paint a car, race three laps, and compare results with deterministic simulated
rivals. Courses, cars, settings, votes, ghosts, and scores persist in browser
storage; no credentials or backend are used.

## Run locally

Use a current LTS release of Node.js and npm.

```powershell
npm ci
npm run dev
```

Vite prints the local URL. Clearing site data resets local courses, cars,
settings, ghosts, scores, and votes; built-in templates remain available.

## Controls

- Arrow keys or WASD: steer, accelerate, and brake
- Space: handbrake drift
- Escape: pause
- Course Builder: pointer or arrow keys; Enter/Space places, Delete erases, R rotates

The car designer supports pointer drawing and keyboard-accessible car templates
and color controls.

## Verify and publish

```powershell
npm test
npm run lint
npm run build
```

`npm run build` writes the production site to `docs/` with the
`/CS571WebProject/` base path. GitHub Pages publishes that committed directory.

## Scope

Rivals, leaderboards, votes, invite codes, and the lobby are deterministic
single-browser simulations. They do not connect players or share data between
devices. See `AI.txt` for the course-required AI usage disclosure.
