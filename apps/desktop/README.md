# Desktop App

This workspace contains the first runnable Electron shell for OpenTypeless.

## Stack

- Electron Forge
- TypeScript
- Webpack
- secure preload bridge with typed IPC
- local `whisper.cpp` speech-to-text
- local `MLX-LM` rewrite model on Apple Silicon

## Current scope

The desktop shell now supports a full local verification path:
- microphone capture in the renderer via `MediaRecorder`
- raw audio persistence and session manifests under the app data directory
- audio normalization with `ffmpeg`
- local STT with `whisper.cpp`
- local cleanup/rewrite with `MLX-LM`
- simulated message delivery into a local outbox
- tested runtime-info and dictation-pipeline seams
- end-to-end verification with a generated local speech sample

System-wide insertion into arbitrary desktop apps is still pending.

## Commands

From this directory:

```bash
npm run ai:setup
npm run start
npm run test
npm run typecheck
npm run lint
npm run verify:e2e
```

## Initial structure

```text
src/main/                 Electron main process and desktop-only modules
src/main/ai/              local STT and rewrite runtime adapters
src/main/core/            app shell architecture seams and module state
src/main/pipeline/        local dictation pipeline and audio/session storage
src/renderer/             renderer entry, HTML, styles, and microphone capture UI
src/shared/               IPC contracts shared across processes
scripts/                  local AI setup and end-to-end verification helpers
```
