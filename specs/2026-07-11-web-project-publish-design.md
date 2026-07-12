# Web Project Initial Publish — Design

**Date:** 2026-07-11  
**Repo:** https://github.com/ZenJediMind/CS571WebProject  
**Goal:** Barebones React app published to GitHub Pages (CS571 first publish).

## Scope

Minimal client-only Vite React app so the live site and source repo can be submitted. No game features, no custom theming beyond Bootstrap defaults.

**Out of scope:** copilot-instructions.md, TypeScript, Next.js/SSR, BrowserRouter, Tailwind, game UI, backend.

## Stack

| Piece | Choice |
|--------|--------|
| Scaffold | Vite + React (JavaScript) |
| UI | React Bootstrap + Bootstrap CSS |
| Routing | React Router declarative mode with `HashRouter` |
| Build output | `docs/` via Vite `build.outDir` |
| Base path | `/CS571WebProject/` (GitHub Pages project site) |

## App structure

- **Navbar** — brand + Home / About links
- **Home (`/`)** — short placeholder welcome text
- **About (`/about`)** — short placeholder about text
- Shared layout with navbar wrapping routes

## Deploy

1. `npm run build` writes the production bundle to `docs/`
2. Commit source + `docs/` and push to `main`
3. GitHub Pages: deploy from branch `main`, folder `/docs`
4. Live URL: `https://ZenJediMind.github.io/CS571WebProject/`

## Constraints

- Client-side only (GitHub Pages cannot run SSR)
- No secrets in frontend code
- HashRouter avoids refresh 404s on GitHub Pages
