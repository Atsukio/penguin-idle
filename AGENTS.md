# AGENTS.md: rules for AI agents working on Penguin Idle

For the file layout, see **Project layout** in README.md (kept there only, so it can't drift).

## Commits

Conventional Commits: `<type>(<scope>): <imperative summary>`, with types `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `ci`, `chore`.

## Checking your work

**Never run Playwright** (`npm test`, `npx playwright test`). It's slow and hangs in agent sandboxes; CI runs it.
Instead, run these fast Node checks after every change:

1. `npm run lint` (after `npm install`): ESLint fails on any name a script uses but nothing defines, such as a variable left behind when code moves between files.
2. `node tools/check-data.js`: data schema, unique ids and icons, tree links, matching versions in `package.json`, `sw.js` and `src/data.js`, every script cached in `sw.js`, and every class set from JS styled in `style.css` (or listed in `UNSTYLED_CLASSES`).
3. `node tools/engine-tests.js`: engine rules (saves, migrations, time away, feathers) in about a second. Add a test here for any new engine rule that doesn't need the page.
4. `node tools/simulate.js --hours 72 --ci`: a 72-hour balance run; fails on runaways, stalls or crashes.

## Refactors must not change behaviour

- Move code; don't rewrite it. Keep markup, CSS class names, `data-*` attributes and text exactly as they were.
- When a function moves out of a closure, only change how it reaches shared values (`S` becomes `S()`, `BUILDINGS` becomes `D.BUILDINGS`, and so on).
- Run `node tools/compare-functions.js` before committing: it compares every function with `HEAD` and must report no changes for a `refactor` commit. CI enforces this for every `refactor` commit (`tools/refactor-guard.js`).
- `compare-functions.js` treats `S` and `S()` as the same, so it can't catch a missed accessor; the lint and the simulator can.
- Keep old entry points working: when code moves to a new module (`PI.save`, `PI.helpers`, ...), leave delegating methods on the parent object (`PI.engine`, `PI.ui`, `PI.fx`).

## Architecture

- No build step: plain `<script>` tags in `index.html`, hosted on GitHub Pages straight from `main` (so a push to `main` is a release).
- Everything hangs off one global: `globalThis.PI = globalThis.PI || {}`.
- A new script in `src/` goes into `index.html` (in dependency order) and into `FILES` in `sw.js`; `check-data.js` fails if it's missing. Engine scripts are picked up by the Node tools automatically via `tools/load-engine.js`.

## Windows and OneDrive

Git commands that write to `.git` (`add`, `commit`) can fail in the sandbox with an `index.lock` permission error; rerun them outside the sandbox.
