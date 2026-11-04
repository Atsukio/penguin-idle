# 🐧 Penguin Idle

A cozy idle game. Pat the big penguin to catch fish, grow a little colony that fishes, knits and sips cocoa through the long Antarctic winter, then lead the Great Migration to earn permanent Emperor Feathers.

**▶ Play it: <https://atsukio.github.io/penguin-idle/>**

Plain HTML/CSS/JS. No build step and no dependencies (fonts come from Google Fonts, with system-font fallbacks).

## Play locally

Clone the repo and double-click `index.html`.

## Deploying

The site is served by GitHub Pages straight from the `main` branch root, so pushing to `main` updates the live game within a minute or two. `.nojekyll` tells Pages to serve the files as-is.

To host your own copy, fork the repo, then go to **Settings → Pages**, set **Source** to *Deploy from a branch* with `main` and `/ (root)`, and save.

## Mechanics

| System | What it does |
| --- | --- |
| Patting | Pat the penguin for fish. Mitten upgrades double it, then add a % of your fish per second. |
| Colony (12 tiers) | Sleepy Chicks, Scarf-Wrapped Fishers, Cocoa Igloos, Lantern Boats, Net-Knitting Circles and more. Costs grow 15% per purchase. Buy x1 / x10 / x100 / Max. |
| Milestones | At 10, 25, 50, 100, 150… owned, that colony member's output doubles. |
| Upgrades | Unlocked by ownership counts and fish caught. Each doubles output or adds a global %. |
| Golden fish | A rare fish swims by. Catching it gives a Lucky Catch, a Cocoa Rush (×7 production) or a Flipper Flurry (×777 pats). |
| Migration (prestige) | Reset for Emperor Feathers (√(lifetime fish ÷ 1B)). Each feather ever earned gives +2% production. |
| Heirlooms | Spend feathers on permanent perks such as chick helpers, better offline gains and head starts. |
| Memories | 64 achievements, each giving +1% production. |
| Colony scene | Huts, igloos, boats, balloons and the aurora appear as you build them. Penguins gather round the fire. |
| Offline progress | Earns 25% of normal production while you're away (upgradeable to 100%, capped at 24 h or 72 h). |

## Feel, accessibility and saves

Built following three skills in [.claude/skills](.claude/skills) (`game-feel`, `game-ui-ux` and `save-systems`):

- **Feedback tiers.** Pats are *small* (soft blip, number pop). Upgrades and milestones are *medium* (chime, sparkle burst, light sway). Golden fish and migrations are *large* (fanfare, glow ring, stronger sway). Screen shake fades on its own, only moves the visuals, and never flashes.
- **Sound.** Soft tones are synthesized with Web Audio, so there are no audio files. There's also an optional fireside ambience of wind and crackles, off by default.
- **Settings.** Volume, screen-shake strength, reduce motion (defaults to your OS setting), snowfall and floating numbers, scientific notation, and text size up to 150%.
- **Keyboard.** The penguin is focused on load, so Space and Enter pat it. Arrow keys switch tabs, and every button has a visible focus ring. Dialogs keep focus inside them, close with Esc, and make the rest of the page unclickable while open.
- **Saves.** Saves carry a version number (`SAVE_VERSION`) and are upgraded step by step through `MIGRATIONS` in `game.js`. A backup of the previous save is kept, exported saves carry a checksum, and every field is checked when loading. Saves from a newer version are refused rather than overwritten. If a save can't be read, the game says so and keeps a copy under `penguinIdleSave_v1_corrupt`.

**Changing the game later:** rename anything's display name freely, but never change an `id`, because IDs are what saves store. If you change the shape of the save, bump `SAVE_VERSION` and add a migration.

## Privacy

There are no accounts, analytics, cookies or ads. Progress is saved only in your own browser's `localStorage`. The one outside request is to Google Fonts for the two typefaces, which shares your IP address with Google, as any web font does.

## Tweaking balance

All numbers are in the data tables at the top of `game.js`: `BUILDINGS`, `TIER_REQS`/`TIER_COSTS`, `GLOBAL_UPS`, `HERITAGE`, `FEATHER_SCALE`. The browser console exposes `penguinIdle.state` for testing (for example `penguinIdle.state.fish = 1e12`, or `penguinIdle.spawnGolden()`).

## License

The game is released under the [MIT License](LICENSE). Fonts and the bundled Claude Code skills have their own licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
