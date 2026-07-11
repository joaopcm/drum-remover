# Socrash

Offline drum remover for macOS. Paste a YouTube link, Socrash downloads the
audio, separates the drums from the rest of the song entirely on your machine
(HT-Demucs via ONNX), and gives you a dual-track player with independent drum
and backing-track volume.

No account. No server. Your audio never leaves your computer.

## Status

Early development. This repository is being built slice-by-slice against the
issues in the tracker.

## Tech stack

- Electron + electron-vite (React + TypeScript)
- TypeScript 7 (`tsgo`) for type-checking
- Biome + Ultracite for lint/format
- Tailwind CSS v4 + shadcn/ui on Base UI
- Vitest for tests

## Development

```bash
pnpm install
pnpm dev          # launch the app with HMR
pnpm typecheck    # tsgo type-check (node + web projects)
pnpm lint         # biome check
pnpm test         # vitest
pnpm build:mac    # produce a macOS build
```

## Project layout

- `src/main` — Electron main process (windowing, settings, job queue)
- `src/preload` — typed `window.api` bridge (context-isolated)
- `src/renderer` — React UI
- `src/shared` — types and the IPC contract shared across processes
