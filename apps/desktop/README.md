# Desktop App

This workspace contains the first runnable Electron shell for OpenTypeless.

## Stack

- Electron Forge
- TypeScript
- Webpack
- secure preload bridge with typed IPC

## Current scope

This skeleton intentionally stops short of model integration, but the local audio pipeline is live. It currently includes:
- Electron main process bootstrapping
- preload bridge setup
- renderer entry with a simple architecture dashboard
- microphone capture in the renderer via `MediaRecorder`
- raw audio persistence and session manifests under the app data directory
- pending pipeline states for transcription and rewrite
- tested runtime-info and local dictation-pipeline seams

It does not yet include actual speech-to-text or rewrite models.

## Commands

From this directory:

```bash
npm install
npm run start
npm run test
npm run lint
npm run typecheck
```

## Initial structure

```text
src/main/                 Electron main process and desktop-only modules
src/main/core/            app shell architecture seams and module state
src/main/pipeline/        local dictation pipeline and audio/session storage
src/renderer/             renderer entry, HTML, styles, and microphone capture UI
src/shared/               IPC contracts shared across processes
```
