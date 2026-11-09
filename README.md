# 🐧 Penguin Idle

A cozy idle game. Pat the big penguin to catch fish, grow a little colony that fishes, knits and sips cocoa through the long Antarctic winter, then lead the Great Migration to new shores for permanent Emperor Feathers.

**▶ Play it: <https://atsukio.github.io/penguin-idle/>**

Plain HTML/CSS/JS with no build step and no runtime dependencies. It's installable as an app and plays offline.

## Play locally

Clone the repo and double-click `index.html`. Everything works from `file://` except the offline/install features, which need a web server:

```bash
npm run serve        # http://localhost:8080
```

## What's in the game

| System | What it does |
| --- | --- |
| Patting | Pat the penguin for fish: tap it, rub it side to side or up and down (with a softer stroking sound and a tilting mitten), or press and hold (can be switched off in Settings). Some pats are **Big Catches** (×10 or more). Fish fly up into the counter as you pat. A hint under the penguin shows what you're saving up for next and roughly how long it'll take. |
| The big penguin | It blinks, follows your cursor, squints happily when patted, gets excited if you pat quickly, sips cocoa and waves when idle, dozes off if left alone, and notices golden fish. It also talks now and then: greeting you, reacting to fast pats, Big Catches and golden fish, welcoming the first of each colony member, cheering milestones, remarking on the shore, season or night sky, and mumbling in its sleep. |
| Colony (12 tiers) | Sleepy Chicks, Scarf-Wrapped Fishers, Cocoa Igloos, Lantern Boats, Net-Knitting Circles and more. New arrivals waddle into the scene. Buy x1 / x10 / x100 / Max. With x10 or more selected, hovering a row shows its count and output after the purchase, highlighted. |
| Upgrades (123) | Seven themed tiers per colony member, plus patting, whole-colony, golden-fish, synergy and scrapbook upgrades. Each has its own icon. **Buy all** buys every affordable one. |
| Workshop | 12 levelled research projects bought with fish. They reset each migration. |
| Golden fish | A rare fish swims by: a Lucky Catch, a Cocoa Rush, a Flipper Flurry or (late game) an Aurora Blessing. |
| Migration (prestige) | Reset for Emperor Feathers (∛(lifetime fish ÷ 1T)). Each feather ever earned gives +2% production. |
| Shores | Each migration lands on a shore with a twist, like *Krill Bay* (Krill Gardens ×5) or *Blizzard Pass* (no golden fish, +50% feathers). Every shore has its own landscape and weather: gentle snow at Home Ice, sea bubbles at Krill Bay, sunshine sparkles at Sunny Cove, a whiteout at Blizzard Pass, glowing motes under the Aurora Fields, big soft flakes among the pines of Quiet Hollow, rain over the Busy Harbour and drifting feathers at the Elders' Rookery. Preview one with `?shore=harbour`. |
| Heirloom Tree | A permanent skill tree bought with feathers: 🏕️ Hearth, 🧤 Flipper and 🌙 Wanderer branches, with prerequisites, levels, capstones and free refunds. |
| Helpers | Hire penguins with feathers to auto-buy upgrades, colony members and research, catch golden fish, or migrate for you. Each can be switched off. |
| Mailbox | Three gentle daily goals from colony friends, with a care package for answering all three. No streaks to lose. |
| Wardrobe | Hats, scarves and held items for the big penguin, unlocked by memories, progress and seasonal events. |
| Seasons | Real-date events (Antarctic calendar): Sunlit Festival, Penguin Awareness Week, World Penguin Day and Midwinter Feast. Each has a bonus and a wardrobe gift. Preview one with `?season=midwinter`. |
| Memories | 85 achievements, each giving +1% production. |
| Scene | Huts, igloos, boats and balloons appear as you build, and the colony visibly works: residents fish at the ice hole, pop into huts and igloos, or catch fish thrown from the boats and the orca, then carry them to the basket by the fire (with a "+" for what the colony caught meanwhile). Each prop makes fish in its own way, and the busiest earners act most often. Hover a prop (or tap it on a phone) to see what it earns and its share of the catch. The basket's pile grows with your fish count. It's night in the colony when it's night for you, and penguins huddle by the fire. Every so often two residents meet up for a little chat in speech bubbles, about fish, the weather, the shore they're on, the night sky or the current season. |
| Colony friends | Name up to six residents in the Home tab. They wear little name tags in the scene, sign their lines in chats, get greeted by name, and the big penguin cheers them on when they bring in the catch. |
| Offline progress | Earns 25% of normal production while you're away (up to 150% with upgrades). This also covers the computer sleeping with the game still open. A tab left open in the background keeps earning at the full rate. When you come back, two colony friends (your named residents first) say what they got up to. |
| What's new | Settings → **What's new** lists every release in player-friendly words. After an update there's a gentle toast, a dot on the Settings tab and a word from the big penguin. New players start up to date. |

## Accessibility and comfort

- **Keyboard:** `Space`/`Enter` pats the focused penguin, `1`–`6` switch tabs, `B` buys all upgrades, `M` cycles the buy amount, `Shift+M` turns the music on or off and `P` focuses the penguin. Arrow keys move between tabs, and dialogs keep focus and close with `Esc`.
- **Touch:** on phones, the first tap on an upgrade or colony member shows its details. A second tap (or the Buy button) buys it.
- **Music:** calm lofi, synthesized live in the browser (no audio files): warm electric-piano chords with a little tape wobble, soft bass, a sparse melody with echo, gentle swung drums and vinyl crackle. It drifts between chord progressions and never loops exactly, and it follows the scene: each shore has its own flavour (sunny and bright at Sunny Cove, sparse and muffled in Blizzard Pass, a dreamy shimmer under the Aurora Fields, an old crackly record at the Elders' Rookery…), night-time slows it down and drops the hi-hats, and the Midwinter Feast adds sleigh bells. The 🎵 button in the top bar mutes or unmutes it, and its tooltip says what's playing. It starts on your first click or key press, since browsers don't allow sound before that.
- **Look and feel:** cozy cursors (an arrow, a knitted glove over anything clickable, a mitten for patting the penguin) and warm, rounded scrollbars throughout.
- **Settings:** volume, lofi music and its own volume, fireside ambience, cozy cursor, screen-shake strength, reduce motion (defaults to your OS setting), particles, hold-to-pat, scientific notation, and text size up to 150%.
- **Slower devices:** if the frame rate drops below about 35 fps, the weather thins out (down to a quarter) and comes back once things recover. Pats, purchases and golden fish keep their full feedback.
- **Effects:** feedback is scaled by importance, screen shake fades on its own, and nothing flashes.

## Saves

Saves live in your browser's `localStorage`, with a backup copy kept automatically. You can export them as text or a file and import them back.

**Move to another device** (Settings → Save) makes a link with a compressed copy of the save in its `#move=` fragment, plus a QR code when it fits (`src/qr.js`, a small built-in encoder). The fragment never reaches the server. Opening the link shows both colonies and asks before replacing anything, and keeps that device's own settings. The production graph is left out to keep the link short.

- Saves are versioned (`SAVE_VERSION` in `src/data.js`) and upgraded step by step through `MIGRATIONS` in `src/engine.js`. Every older save format still loads.
- Every field is checked on load, and derived values (like feathers spent) are recomputed rather than trusted. Exported text carries a checksum.
- Saves from a newer version are refused rather than overwritten. A damaged save is reported and kept under `penguinIdleSave_v1_corrupt`.
- Numbers are capped at 1e300 so they can never overflow.

**When changing the game:** rename anything's display name freely, but never change an `id`, because IDs are what saves store. If you change the save's shape, bump `SAVE_VERSION` and add a migration.

## Releasing

1. Add an entry at the top of `CHANGELOG` in `src/data.js`, written for players (a version, a date, a short title and a few notes).
2. Set `CACHE` in `sw.js` to `penguin-idle-v<version>` and `version` in `package.json` to match.
3. `npm run check` fails if these three disagree, or if a script the page loads isn't cached for offline play.

## Project layout

```text
index.html            page structure
style.css             all styling (cozy theme, animations, reduced-motion rules)
src/data.js           What's new and every table: colony, upgrades, research, tree, helpers, shores, seasons, wardrobe, letters, memories
src/engine.js         game state, maths, and actions (no DOM; also runs in Node)
src/engine-save.js    save/load persistence, migrations, export/import, and validation
src/engine-helpers.js automated helper AI (Pip, Barnaby, Marina) and decision logic
src/scene.js          colony scenery, weather, day/night cycle, waddlers, chatter, and props
src/audio.js          synthesized sound effects and live procedural lofi music
src/fx.js             canvas particles and snow, screen shake, visual feedback
src/penguin.js        the big penguin's drawing, outfits and personality
src/ui.js             root shell, tab switching, and 60fps frame loop
src/ui-dialogs.js     modals, toasts, tooltips and the touch info sheet
src/ui-memories.js    101 memories, statistics, SVG graph and nap stars
src/ui-panels.js      colony store, upgrades, workshop, migration and wardrobe
src/ui-activities.js  heirloom tree SVG, campfire cooking, diving & relics
src/qr.js             a small QR code encoder for moving a colony to another device (no DOM)
src/main.js           startup, game loop, settings, hotkeys, offline app
sw.js, manifest.webmanifest, icons/   installable offline app
fonts/                self-hosted Fredoka and Nunito (SIL OFL)
tools/                simulator, data checks and a local server
tests/                Playwright browser tests
```

## Development

```bash
npm install          # test tools only; the game itself has no dependencies
npm run check        # data integrity: unique ids and icons, valid tree links, ...
npm run simulate     # balance simulator: a bot plays 48h and reports pacing
npm run balance      # the simulator's CI check (72 simulated hours, fails on runaways or stalls)
npm test             # browser tests (desktop + phone). Locally: PW_CHANNEL=msedge npm test
```

GitHub Actions runs all of these on every push and pull request (`.github/workflows/ci.yml`).

**Tuning balance:** all numbers live in the tables in `src/data.js`. After changing them, run `npm run simulate -- --hours 120` (and `--profile idle`) to see how pacing shifts. Every bonus is folded into one modifier object in `recompute()` in `src/engine.js`.

**Releasing:** pushing to `main` updates the live site via GitHub Pages. When files are added or renamed, update the list in `sw.js` and bump its `CACHE` name so installed copies pick up the change.

## Privacy

There are no accounts, analytics, cookies, ads or third-party requests. Fonts are self-hosted, and progress is saved only in your own browser.

## License

The game is released under the [MIT License](LICENSE). The fonts and the bundled Claude Code skills have their own licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
