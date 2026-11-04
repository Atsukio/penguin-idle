# Third-party notices

Penguin Idle's own code and artwork (the penguin and icon SVGs, CSS and game logic) are MIT-licensed. See [LICENSE](LICENSE).

The project also includes or uses the following third-party material.

## Fonts (bundled in `fonts/`)

| Font | Copyright | License |
| --- | --- | --- |
| [Fredoka](https://fonts.google.com/specimen/Fredoka) | Copyright 2016 The Fredoka Project Authors | [SIL Open Font License 1.1](fonts/OFL-Fredoka.txt) |
| [Nunito](https://fonts.google.com/specimen/Nunito) | Copyright 2014 The Nunito Project Authors | [SIL Open Font License 1.1](fonts/OFL-Nunito.txt) |

These are the Latin-subset WOFF2 files as served by Google Fonts, unmodified apart from being stored locally. The full licence texts are in the `fonts/` folder.

## Emoji

Emoji (🐧 🐟 🎣 and so on) are plain Unicode characters drawn by the player's own operating system font. No emoji images are bundled.

## Claude Code skills (`.claude/skills/`)

`game-feel`, `game-ui-ux` and `save-systems` are copied unmodified from
[gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills)
at commit `19d93f97c9c1ea0f8b306e77aa81e0d3e352d3e9`.

Copyright 2026 Abhishek Barali and the awesome-gamedev-agent-skills contributors.
They are licensed under the Apache License, Version 2.0. See [.claude/skills/LICENSE](.claude/skills/LICENSE) and [.claude/skills/NOTICE](.claude/skills/NOTICE).

These are development guides for the AI coding assistant. They aren't part of the game the player downloads.

## Development tools (not distributed)

[Playwright](https://playwright.dev) (`@playwright/test`, Apache License 2.0) is used to run the browser tests. It's a development dependency only and isn't part of the published game.
