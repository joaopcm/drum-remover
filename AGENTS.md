# AGENTS.md

## Cursor Cloud specific instructions

Socrash is a single-package Electron desktop app (main + worker + preload + renderer),
not a monorepo. There is no backend, database, or container to run. Standard dev
commands live in `README.md` and `package.json` (`pnpm dev`, `pnpm lint`,
`pnpm typecheck`, `pnpm test`, `pnpm build:mac`). Dependencies are installed by the
startup update script (`pnpm install`, which runs the `postinstall` native rebuild).

Non-obvious caveats for running/testing here:

- **This is a macOS-targeted app; the full pipeline cannot complete on the Linux VM.**
  Provisioning downloads and executes `yt-dlp_macos` (hardcoded in
  `src/main/provision/ytdlp.ts`), so the download + separation step always fails on
  Linux with a binary/exec error. This is a platform limitation, not a broken setup.
  What *does* work on Linux end-to-end: launching the app, adding a song (its title +
  thumbnail resolve via YouTube's public oEmbed endpoint — no yt-dlp needed), the
  library/queue UI, and settings. Use "add a song" as the smoke test.

- **Running the GUI needs a display.** Launch with `DISPLAY=:1` (the desktop the
  computer-use tooling controls), e.g. `DISPLAY=:1 pnpm dev`. The `dbus` "Failed to
  connect to the bus" and `viz`/GPU "Exiting GPU process" errors in the Electron log
  are expected/non-fatal in this container and do not prevent the window from showing.

- **`pnpm lint` currently fails on one pre-existing error** in `scripts/adhoc-sign.cjs`
  (Biome wants a top-level `"use strict"`). This is unrelated to environment setup.
  `pnpm typecheck` and `pnpm test` (Vitest, node env) both pass.

- Tests are pure Node/Vitest (`src/**/*.{test,spec}.ts`) and need no services or
  display; run them directly with `pnpm test`.
