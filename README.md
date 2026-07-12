# Socrash

Offline drum remover for macOS. Paste a YouTube link — Socrash downloads the
audio, separates the drums from the rest of the song entirely on your machine
(HT-Demucs via ONNX), and gives you a dual-track player with independent drum
and backing-track volume so you can practice along.

No account. No server. Your audio never leaves your computer.

## Install

Download the latest `.dmg` from
[Releases](https://github.com/joaopcm/socrash/releases) and drag **Socrash** to
your Applications folder (Apple Silicon).

The app is ad-hoc signed but not notarized (no paid Apple Developer account), so
macOS quarantines the download and blocks the first launch. Clear the quarantine
once, then open it normally:

```bash
xattr -cr /Applications/Socrash.app
```

(Alternatively: double-click Socrash, let macOS block it, then go to **System
Settings → Privacy & Security** and click **Open Anyway**.)

## How it works

1. **Add a song** — paste a YouTube URL; Socrash shows the thumbnail + title and
   queues it.
2. **Download** — `yt-dlp` pulls the audio, `ffmpeg` converts it to a 44.1 kHz
   stereo WAV. (`yt-dlp` is fetched on first run; `ffmpeg` is bundled.)
3. **Separate** — an HT-Demucs ONNX model runs locally to split the track into a
   drums stem and a "rest" stem (bass + other + vocals). The original download is
   deleted afterward.
4. **Play** — a full-screen player shows both waveforms with per-track volume
   (0–100%), a draggable playhead, and a Spotify-style mini-player when minimized.

## Separation quality

Choose in Settings; each downloads on first use:

| Tier | Model | Size | Notes |
|------|-------|------|-------|
| Fast (default) | htdemucs (fp16 weights) | ~166 MB | Quickest; near-identical for practice |
| Balanced | htdemucs (fp32) | ~316 MB | Reference-exact single model |
| Best | htdemucs_ft bag (4 models) | ~1.26 GB | Cleanest isolation, ~4× slower |

## Data storage

Everything lives under one configurable data folder (Settings → Data folder;
changing it safely migrates existing data):

- `library.json` — the song index
- `songs/<id>/` — `drums.wav`, `rest.wav`, `peaks.json`
- `models/<quality>/` — downloaded ONNX models
- `bin/` — the `yt-dlp` binary

The pointer to this folder is stored in Electron's `userData` so it survives moves.

## Tech stack

- Electron + electron-vite (React + TypeScript)
- TypeScript 7 (`tsgo`) for type-checking
- Biome + Ultracite for lint/format
- Tailwind CSS v4 + shadcn/ui on Base UI
- `onnxruntime-node` for local inference; `ffmpeg-static` + `yt-dlp`
- Vitest for tests

## Development

```bash
pnpm install
pnpm dev          # launch the app with HMR
pnpm typecheck    # tsgo type-check (node + web projects)
pnpm lint         # biome check
pnpm test         # vitest
pnpm build:mac    # produce a macOS build (dmg + zip)
```

## Project layout

- `src/main` — Electron main process (windowing, settings, job queue, provisioning)
- `src/worker` — utility-process pipeline (download, convert, ONNX separation)
- `src/preload` — typed `window.api` bridge (context-isolated)
- `src/renderer` — React UI (library, player, settings)
- `src/shared` — types and the IPC contract shared across processes
