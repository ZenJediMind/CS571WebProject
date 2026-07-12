# Web Project Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a barebones Vite React (JS) app with React Bootstrap + HashRouter, build to `docs/`, and deploy via GitHub Pages.

**Architecture:** Client-only SPA. Vite outputs the production bundle into `docs/`. GitHub Pages serves that folder from `main`. `HashRouter` avoids refresh 404s on project Pages URLs.

**Tech Stack:** Vite, React (JavaScript), React Bootstrap, Bootstrap, React Router DOM (declarative / HashRouter)

## Global Constraints

- Client-side only — no Next.js, no SSR
- JavaScript (not TypeScript)
- HashRouter only (not BrowserRouter)
- Vite `base: '/CS571WebProject/'`, `build.outDir: 'docs'`
- No copilot-instructions.md
- No secrets in frontend
- Live URL: `https://ZenJediMind.github.io/CS571WebProject/`

---

## File structure

| Path | Responsibility |
|------|----------------|
| `package.json` | Dependencies and scripts |
| `vite.config.js` | base path + docs outDir |
| `index.html` | Vite HTML entry |
| `src/main.jsx` | React mount + Bootstrap CSS |
| `src/App.jsx` | HashRouter + routes |
| `src/components/AppNavbar.jsx` | Bootstrap navbar |
| `src/pages/Home.jsx` | Home placeholder |
| `src/pages/About.jsx` | About placeholder |
| `docs/` | Build output (generated) |
| `.gitignore` | node_modules, etc. (keep docs tracked) |

---

### Task 1: Scaffold Vite React app and dependencies

**Files:**
- Create: Vite React (JS) project files in repo root
- Create/Modify: `package.json`, `vite.config.js`, `.gitignore`

**Interfaces:**
- Produces: runnable `npm run dev` / `npm run build` project with deps installed

- [ ] **Step 1: Scaffold with Vite**

```bash
npm create vite@latest . -- --template react
```

If the directory is non-empty (specs/, .git/), create in a temp folder and move files up, or manually write the Vite React JS boilerplate.

- [ ] **Step 2: Install runtime deps**

```bash
npm install
npm install react-bootstrap bootstrap react-router-dom
```

- [ ] **Step 3: Configure Vite for GitHub Pages**

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/CS571WebProject/',
  build: {
    outDir: 'docs',
  },
})
```

- [ ] **Step 4: Ensure `.gitignore` does NOT ignore `docs/`**

Keep `node_modules`, `dist`, `.env*` ignored. Do **not** ignore `docs/`.

- [ ] **Step 5: Verify install**

```bash
npm run build
```

Expected: `docs/` created with `index.html` and assets (can overwrite with final app in Task 2).

---

### Task 2: Barebones pages (Navbar, Home, About)

**Files:**
- Create: `src/components/AppNavbar.jsx`
- Create: `src/pages/Home.jsx`
- Create: `src/pages/About.jsx`
- Modify: `src/App.jsx`, `src/main.jsx`
- Delete: unused Vite starter assets (logo, App.css fluff) as needed

**Interfaces:**
- Consumes: react-bootstrap, react-router-dom HashRouter
- Produces: routes `#/` and `#/about` with shared navbar

- [ ] **Step 1: Wire Bootstrap in `src/main.jsx`**

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: Create `AppNavbar.jsx`**

```jsx
import Container from 'react-bootstrap/Container'
import Nav from 'react-bootstrap/Nav'
import Navbar from 'react-bootstrap/Navbar'
import { Link } from 'react-router-dom'

export default function AppNavbar() {
  return (
    <Navbar bg="dark" data-bs-theme="dark" expand="lg">
      <Container>
        <Navbar.Brand as={Link} to="/">CS571 Web Project</Navbar.Brand>
        <Navbar.Toggle aria-controls="main-nav" />
        <Navbar.Collapse id="main-nav">
          <Nav className="me-auto">
            <Nav.Link as={Link} to="/">Home</Nav.Link>
            <Nav.Link as={Link} to="/about">About</Nav.Link>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  )
}
```

- [ ] **Step 3: Create Home and About pages**

`src/pages/Home.jsx`:

```jsx
import Container from 'react-bootstrap/Container'

export default function Home() {
  return (
    <Container className="mt-4">
      <h1>Home</h1>
      <p>Welcome to the CS571 web project.</p>
    </Container>
  )
}
```

`src/pages/About.jsx`:

```jsx
import Container from 'react-bootstrap/Container'

export default function About() {
  return (
    <Container className="mt-4">
      <h1>About</h1>
      <p>This is a placeholder About page for the initial GitHub Pages publish.</p>
    </Container>
  )
}
```

- [ ] **Step 4: Wire routes in `src/App.jsx`**

```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import AppNavbar from './components/AppNavbar'
import Home from './pages/Home'
import About from './pages/About'

export default function App() {
  return (
    <HashRouter>
      <AppNavbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </HashRouter>
  )
}
```

- [ ] **Step 5: Smoke-test locally**

```bash
npm run dev
```

Expected: Home and About render; nav links switch hash routes.

---

### Task 3: Build, commit, push, enable GitHub Pages

**Files:**
- Generate: `docs/**` via build
- Modify: git history on `main`

**Interfaces:**
- Consumes: working app from Task 2
- Produces: live site at `https://ZenJediMind.github.io/CS571WebProject/`

- [ ] **Step 1: Production build**

```bash
npm run build
```

Expected: `docs/index.html` references assets under `/CS571WebProject/`.

- [ ] **Step 2: Commit and push** (only when user has approved committing)

```bash
git add -A
git commit -m "Initial Vite React app with GitHub Pages docs deploy"
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**

```bash
gh api repos/ZenJediMind/CS571WebProject/pages -X POST -f build_type=legacy -f source[branch]=main -f source[path]=/docs
```

Or via UI: Settings → Pages → Deploy from branch → `main` / `/docs`.

- [ ] **Step 4: Verify live site**

Open `https://ZenJediMind.github.io/CS571WebProject/` after deploy (~1–5 min). Confirm Home/About and nav work.
