# AGENTS.md — Guidelines for AI Agents Working on Penguin Idle

This document outlines architectural principles, workflow requirements, testing mandates, and conventions for AI agents assisting with the Penguin Idle codebase.

---

## 1. Commit Conventions

- **Always use Conventional Commits**: `<type>(<scope>): <short description>`
  - `feat:` New gameplay features, buildings, upgrades, or mechanics
  - `fix:` Bug fixes or balance rectifications
  - `refactor:` Code restructuring or modularization without altering behavior
  - `perf:` Performance improvements
  - `docs:` Documentation, README, or AGENTS updates
  - `test:` Test and simulation additions or updates
  - `chore:` Tooling, dependency, or configuration changes
- Keep commit descriptions concise, imperative, and focused on the user or architectural intent.

---

## 2. Strict Testing Rules

- **NEVER run Playwright** (`npm test`, `npx playwright test`).
  - Playwright browser tests take excessive time and risk timeouts or hung processes in agent sandboxes.
- **Always verify changes using the two fast node tools**:
  1. `node tools/check-data.js`
     - Validates data schema, unique IDs and icons, heirloom tree integrity, version matching (`package.json`, `sw.js`, `src/data.js`), and ensures all loaded scripts are cached in `sw.js`.
  2. `node tools/simulate.js --hours 72 --ci`
     - Simulates an active 72-hour run to guarantee that pacing, milestones, migrations, capstones, and memory unlocks remain balanced and free of infinite loops or crashes.

---

## 3. Architecture & Design Principles

### Zero-Build Runtime
- The game runs directly in browser environments without any compilation, bundling, or transpilation (no Webpack, Vite, Rollup, or Babel).
- Hosted on GitHub Pages: files are loaded via plain `<script>` tags in `index.html`.
- Global namespace: everything attaches to `globalThis.PI = globalThis.PI || {}` (or `window.PI`).

### Preserving Backward Compatibility
- Modules frequently expose functions both under their domain sub-namespace (e.g. `PI.save`, `PI.helpers`, `PI.audio`, `PI.scene`, `PI.uiActivities`) and as delegation proxies on parent objects (`PI.engine`, `PI.fx`, `PI.ui`).
- When extracting code into new modules, **always maintain proxy/delegation methods on the parent objects** so existing callers and external tools never break.

### Offline & Service Worker (`sw.js`)
- Every script file added to `src/` must be:
  1. Included in `index.html` in proper dependency order.
  2. Registered in the `FILES` array in `sw.js`.
  - `node tools/check-data.js` enforces this and will fail CI if a script is missing from `sw.js`.

---

## 4. Codebase Layout

```text
index.html                  Page markup and script imports (dependency order)
style.css                   Cozy aesthetic theme, animations, layout, responsive styles
sw.js                       Service Worker with stale-while-revalidate offline caching
AGENTS.md                   Agent guidelines and engineering standards
README.md                   User-facing documentation and project overview

src/
├── data.js                     Declarative game tables: colony, upgrades, research,
│                               heirlooms, helpers, shores, seasons, wardrobe, memories
├── penguin.js                  Big penguin SVG rendering, outfits, emotions, petting
├── fx.js                       Canvas particle bursts, screen shake, and visual feedback
├── qr.js                       Self-contained compact QR code generator for saves
│
├── engine/                     Engine simulation and state management
│   ├── engine.js               Core state, event bus, clock, patting warmth, tick & offline gains
│   ├── math.js                 Production multipliers, recalculation, purchase costs & feather scaling
│   ├── actions.js              Colony purchases, research, heirlooms, helpers and migration
│   ├── save.js                 Persistence, localStorage, checksums, migrations & validation
│   ├── helpers.js              Automated helper AI algorithms (Pip, Barnaby, Marina)
│   ├── progress.js             Memory milestones progress and shore passport stamp checks
│   ├── events.js               Golden fish variants, daily mailbox letters, wardrobe & streaks
│   └── activities.js           Campfire kettle recipe costs & deep-sea diving calculations
│
├── ui/                         DOM presentation and user interaction
│   ├── ui.js                   Root UI coordinator, tab switching & domain delegation
│   ├── topbar.js               Topbar badges, rolling fish counter, buffs, warmth & frame tick
│   ├── interactions.js         Gesture interaction handling, hold/rub patting, event wiring
│   ├── dialogs.js              Accessible modals, toast notifications, tooltips & touch sheet
│   ├── panels.js               Colony store buildings, upgrades list & workshop research
│   ├── community.js            Shore migration, helpers hiring, passport stamps & wardrobe
│   ├── activities.js           Campfire Kettle cooking, Diving expeditions and relic display
│   ├── tree.js                 Heirloom SVG skill tree visualization and branch inspection
│   └── memories.js             Memories (101 achievements), stats, SVG graph, nap stars
│
├── scene/                      Visual canvas scenery
│   ├── scene.js                Canvas scenery, day/night weather cycles, aurora & golden fish
│   ├── props.js                Colony building props, animations, basket fish deliveries
│   └── waddlers.js             Resident waddlers wandering, paths, naming & speech bubbles
│
├── audio/                      Web Audio sound and music
│   ├── audio.js                Procedurally synthesized Web Audio SFX (clicks, chirps, sweeps)
│   └── music.js                Continuous procedural lofi electric piano, progressions & drums
│
└── main/                       Application lifecycle and bootstrap
    ├── main.js                 Settings binding, hotkeys, PWA service worker, frame loop & init
    ├── dialogs.js              Save import/export/reset, device move QR/link & What's new notes
    └── nap.js                  Nap mode screen, battery saver, bedtime timer & wind-down

tools/
├── check-data.js           Integrity checker for game data and offline assets
├── simulate.js             Headless game simulator for balance verification
└── serve.js                Zero-dependency local HTTP server
```

---

## 5. Development Environment Tips

- **Windows / OneDrive Git Locks**:
  - Sandboxed shells may encounter permission errors creating `.git/index.lock`.
  - When running git commands that write to `.git` (`git add`, `git commit`), run with elevated permission or outside the sandbox when needed.
