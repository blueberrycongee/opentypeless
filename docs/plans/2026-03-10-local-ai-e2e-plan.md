# Local AI E2E Pipeline Implementation Plan

> **Execution note:** Execute in small verified steps with atomic commits.

**Goal:** Build a fully local dictation pipeline for OpenTypeless that stores raw audio, transcribes it with a local STT model, rewrites it with a local open-source LLM, and simulates sending the final message through a local outbox.

**Architecture:** Keep the Electron app as the orchestrator. Use a dependency-injected pipeline in the main process, shelling out to local runtimes for model inference so the app remains replaceable later. Persist every stage transition in the session manifest and verify the real end-to-end path with a generated audio sample.

**Tech Stack:** Electron, TypeScript, Node child_process, Homebrew, ffmpeg, whisper.cpp, Ollama, Node test runner
