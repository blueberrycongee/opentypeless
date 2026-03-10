# OpenTypeless

OpenTypeless is a desktop-first open source AI dictation layer.
It is inspired by the workflow benchmark set by Typeless, but aims to be built in the open with a transparent product and architecture process.

## What OpenTypeless is

OpenTypeless is not only speech-to-text.
The target experience is:
- trigger dictation from anywhere on desktop
- capture audio with low friction
- transcribe speech into text
- clean and rewrite the transcript with AI
- insert the final text back into the active app
- remember history, dictionary terms, and user preferences locally

In short:

```text
capture -> transcribe -> rewrite -> insert -> remember -> improve
```

## Product scope

Current scope is desktop only:
- macOS first
- Windows second
- no mobile client in the first phase

## Why this project exists

Most voice input tools fall into one of two buckets:
- plain dictation tools that stop at transcription
- closed commercial assistants that do more, but are hard to inspect, extend, or self-host

OpenTypeless aims to explore a third path:
- open source by default
- desktop-first UX
- privacy-aware architecture
- clear product and technical documentation
- room for local, cloud, or hybrid AI backends later

## Current status

This repository now includes an initial runnable Electron desktop shell and a fully local macOS-first AI pipeline for capture, transcription, rewrite, and simulated send. The repository currently contains:
- product definition notes
- competitor research
- initial architecture framing
- an Electron desktop shell under `apps/desktop/`
- a local STT + rewrite pipeline using `whisper.cpp` and `MLX-LM`
- GitHub community and contribution files

## Initial feature benchmark

The first benchmark for OpenTypeless is a reliable desktop MVP with:
- global shortcut invocation
- microphone selection
- speech-to-text pipeline
- AI cleanup of transcript output
- insertion into the active desktop app
- local history
- personal dictionary
- basic settings and privacy controls

## Repository map

```text
.github/                      GitHub community files and templates
apps/desktop/                 desktop application workspace
assets/                       logos, icons, screenshots, and brand files
docs/architecture/            system and platform design notes
docs/product/                 PRDs, scope docs, and product decisions
docs/research/                competitor and technical research
scripts/                      repeatable development scripts
ROADMAP.md                    staged delivery plan
GOVERNANCE.md                 project decision and maintainer model
SUPPORT.md                    support and communication guidance
```

## Recommended reading order

If you are new to the project, start here:
1. `README.md`
2. `ROADMAP.md`
3. `docs/product/vision.md`
4. `docs/product/desktop-mvp.md`
5. `docs/architecture/desktop-system-overview.md`
6. `docs/research/competitors/2026-03-10-typeless-desktop-research.md`

## Contributing

Please read `CONTRIBUTING.md` before opening issues or pull requests.
If you are unsure where to start, open an issue describing the user problem you want to work on.

## License

OpenTypeless is released under the MIT License. See `LICENSE`.
