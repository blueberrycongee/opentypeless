# Desktop System Overview

## Goal

Describe the minimum architecture needed for a Typeless-style desktop product.

## Product workflow

```text
global hotkey
  -> capture audio
  -> transcribe speech
  -> rewrite transcript
  -> insert into active app
  -> save local history
  -> learn from corrections
```

## Core subsystems

### 1. Desktop shell
Responsibilities:
- app lifecycle
- tray or menu-bar presence
- settings window
- first-run onboarding and permissions
- update checks later

### 2. Shortcut and input control
Responsibilities:
- register global shortcuts
- start and stop recording
- support push-to-talk first
- support additional trigger modes later

### 3. Audio capture
Responsibilities:
- enumerate microphones
- select active input device
- record audio buffers safely
- expose recording state to UI

### 4. Context bridge
Responsibilities:
- identify the foreground desktop app
- detect whether insertion is possible
- read selected text when supported
- pass minimal context to downstream processing

### 5. Transcription service
Responsibilities:
- convert speech to raw transcript
- detect language when possible
- expose timing and failure states

### 6. Rewrite service
Responsibilities:
- remove filler words and repetition
- normalize punctuation and formatting
- apply tone or style rules
- support translation and selected-text edits later

### 7. Insertion service
Responsibilities:
- insert text at the focused cursor
- replace selected text when requested
- handle insertion failures explicitly

### 8. Local data layer
Responsibilities:
- store history locally
- store dictionary terms locally
- store settings and privacy controls
- preserve both raw transcript and final output

## Recommended early boundaries

Keep these boundaries explicit from the start:
- raw transcript versus final rewritten output
- desktop context collection versus AI processing
- local storage versus optional cloud processing
- dictation mode versus future edit and ask modes

## Early risk areas

- system permissions and onboarding friction
- cross-app insertion reliability
- hotkey responsiveness
- microphone startup latency
- privacy expectations around context capture
- platform differences between macOS and Windows
