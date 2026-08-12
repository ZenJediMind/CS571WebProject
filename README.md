# Wisconsin Racer

Wisconsin Racer is a React racing game for CS571. Build a track, paint a car,
race three laps, and compare results with deterministic simulated rivals.
Supabase provides guest-authenticated shared courses, votes, race scores,
leaderboards, and race-night lobbies. Car drawings, settings, and ghost
replays remain device-local.

## Run locally

Use a current LTS release of Node.js and npm.

```powershell
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and add the Supabase Project URL and
publishable key before starting Vite. Vite prints the local URL. Clearing site
data resets the guest session, car, settings, and ghosts; shared courses,
votes, scores, and race-night lobbies remain in Supabase.

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

Rivals remain deterministic simulations. Race Night is a shared time-trial:
the host chooses a public course, friends join from a code or link, and each
racer's single lobby finish is visible to every participant. It uses short
polling for lobby updates; it does not simulate other players' cars live on the
track. Shared courses, votes, leaderboard scores, and lobby operations are
stored in Supabase under Row Level Security and membership-checked RPCs. The
`/performance` page reports bounded local measurements for backend requests and
the race-loop work. See `AI.txt` for the course-required AI usage disclosure.
