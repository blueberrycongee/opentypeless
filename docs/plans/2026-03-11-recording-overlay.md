# Recording Overlay Implementation Plan

> **Execution note:** Execute in small verified steps with atomic commits. Make medium/small design decisions autonomously. Only escalate major architectural changes that would be expensive to reverse.

**Goal:** When the user presses the global dictation shortcut, a small floating overlay window appears on screen. The overlay shows the user that recording is in progress, provides cancel and stop controls, and displays a step-by-step progress indicator during the transcription/rewrite/insertion pipeline. The overlay auto-closes on success.

**Architecture:** A second frameless, always-on-top BrowserWindow managed by the main process. The overlay has its own HTML entry point, preload script, and renderer. The main process controls the overlay lifecycle and pushes state updates to it via IPC. The shortcut becomes a toggle: first press starts recording and opens the overlay, second press stops recording.

**Tech Stack:** Electron BrowserWindow, TypeScript, Webpack (new Forge entry point), own dark-theme CSS (independent of hub window's light theme).

---

## 1. Product Requirements

### 1.1 User flow

```
User is in any desktop app (e.g. Notes, Slack, Chrome)
  │
  ├─ Presses ⌘⇧;
  │   → Overlay appears at top-center of screen
  │   → Recording starts
  │   → Overlay shows: breathing coral dot, live timer, esc badge, and [■ Stop] button
  │
  ├─ User speaks into microphone
  │
  ├─ User ends recording (any of these):
  │   ├─ Presses ⌘⇧; again (toggle)
  │   ├─ Presses ⌘⇧' (dedicated stop shortcut)
  │   └─ Clicks [■ Stop] on the overlay
  │
  ├─ Overlay switches to processing mode
  │   → Shows current step label (Transcribing → Rewriting → Inserting) with progress bar
  │   → Label crossfades smoothly as each step begins
  │
  ├─ On success:
  │   → Overlay shows "✓ Done" for 1.2 seconds
  │   → Overlay auto-closes
  │   → Text has been pasted into the original target app
  │
  ├─ On error:
  │   → Overlay shows error message with [Dismiss] button
  │   → User clicks Dismiss → overlay closes
  │
  └─ On cancel (user clicks [Cancel] during recording):
      → Recording is discarded
      → Overlay closes immediately
      → No processing happens
```

### 1.2 Overlay behavior rules

- The overlay must NOT steal keyboard focus from the target app when it first appears. The user's cursor must remain in the app they were typing in. On macOS, use `focusable: false` at creation time; temporarily enable focusable only if the user explicitly clicks a button on the overlay.
- The overlay is always on top of all other windows.
- The overlay does not appear in the Dock or taskbar.
- Only one overlay instance can exist at a time.
- If the hub window's local "Start recording" button is used, the overlay also appears (the overlay is the universal recording UI).
- The hub window's recording card should show a reduced state ("Recording in overlay...") when the overlay is active, not duplicate the recording UI.

### 1.3 Shortcut behavior change

| Current behavior                     | New behavior                                    |
| ------------------------------------ | ----------------------------------------------- |
| `⌘⇧;` always means "start recording" | `⌘⇧;` toggles: start if idle, stop if recording |
| `⌘⇧'` always means "stop recording"  | `⌘⇧'` still means "stop recording" (unchanged)  |

When recording is not active, `⌘⇧;` starts recording and opens the overlay.
When recording is active, `⌘⇧;` stops recording (same as clicking Stop).

---

## 2. Visual Design Spec

### 2.0 Design philosophy

The overlay is a **system-level instrument**, not an application window. Three principles govern every visual decision:

1. **Near-monochrome** — Dark frosted glass with exactly one accent color (soft coral, used only for the recording indicator dot). Everything else is white at varying opacities.
2. **Typography-driven** — Status is conveyed through clean text, font weight, and opacity — not emoji, colored badges, or decorative icons. The only non-text element is the SVG checkmark in the success state.
3. **Quiet animation** — Smooth, slow transitions. Breathing (not blinking) for the recording dot. Crossfades for state changes. Spring physics for the success checkmark.

The overlay uses a **dark color scheme** independent of the hub window's warm light theme. Dark floating panels feel native on macOS (cf. Now Playing widget, Do Not Disturb indicator, Stage Manager labels) and reduce visual weight against any desktop background.

### 2.1 Color tokens

Defined in `src/renderer/overlay/styles.css` as `:root` variables. These are **separate** from the hub window's light-theme variables — the overlay has its own isolated design surface.

```css
:root {
  /* ── Surface ─────────────────────────────────── */
  --ov-bg: rgba(28, 28, 30, 0.82); /* macOS systemGray6 */
  --ov-border: rgba(255, 255, 255, 0.08);
  --ov-shadow: 0 8px 32px rgba(0, 0, 0, 0.32), 0 2px 8px rgba(0, 0, 0, 0.2);
  --ov-blur: blur(40px) saturate(180%);

  /* ── Text ────────────────────────────────────── */
  --ov-text-primary: rgba(255, 255, 255, 0.92);
  --ov-text-secondary: rgba(255, 255, 255, 0.55);
  --ov-text-tertiary: rgba(255, 255, 255, 0.3);

  /* ── Accent — recording indicator dot ONLY ──── */
  --ov-accent: #ff6363;

  /* ── Glass button ──────────────────────────── */
  --ov-btn-bg: rgba(255, 255, 255, 0.1);
  --ov-btn-bg-hover: rgba(255, 255, 255, 0.16);
  --ov-btn-bg-active: rgba(255, 255, 255, 0.08);
  --ov-btn-text: rgba(255, 255, 255, 0.88);

  /* ── Progress bar ──────────────────────────── */
  --ov-progress-track: rgba(255, 255, 255, 0.08);
  --ov-progress-fill: rgba(255, 255, 255, 0.28);

  /* ── Keyboard hint badge ───────────────────── */
  --ov-kbd-bg: rgba(255, 255, 255, 0.06);
  --ov-kbd-text: rgba(255, 255, 255, 0.3);
  --ov-kbd-border: rgba(255, 255, 255, 0.08);
}
```

**Why these values:**

- `rgba(28, 28, 30, …)` is the macOS system dark gray (`systemGray6` in Apple HIG).
- `0.82` opacity + `saturate(180%)` creates the characteristic vibrancy/frosted-glass effect.
- Text uses white at 3 opacity tiers (92% / 55% / 30%) matching Apple's dark-mode text hierarchy.
- The accent `#FF6363` is a soft coral — warmer and less alarming than pure red, but universally reads as "recording."

### 2.2 Typography

Font stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif`

| Element                              | Size | Weight | Color                 | Notes                                                        |
| ------------------------------------ | ---- | ------ | --------------------- | ------------------------------------------------------------ |
| Timer (`0:04`)                       | 13px | 500    | `--ov-text-secondary` | `font-variant-numeric: tabular-nums` to prevent layout shift |
| Status label (`Transcribing…`)       | 13px | 400    | `--ov-text-secondary` | Crossfade animation on step change                           |
| Completion label (`Done` / `Copied`) | 13px | 500    | `--ov-text-primary`   |                                                              |
| Error title                          | 13px | 500    | `--ov-text-primary`   |                                                              |
| Error detail                         | 12px | 400    | `--ov-text-tertiary`  | Single line, `text-overflow: ellipsis`                       |
| Button label (`Stop` / `Dismiss`)    | 12px | 500    | `--ov-btn-text`       |                                                              |
| Keyboard hint (`esc`)                | 11px | 500    | `--ov-kbd-text`       | Monospace: `'SF Mono', ui-monospace, monospace`              |

### 2.3 Dimensions and position

| Property        | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Width           | 280px (fixed)                                                                          |
| Height          | Dynamic: **44px** recording · **56px** processing · **44px** success · **~80px** error |
| Position        | Top-center of primary display, **64px** below top edge                                 |
| Border-radius   | 16px (reads as pill-like at 44px height, rounded-rect when taller)                     |
| Background      | `var(--ov-bg)`                                                                         |
| Backdrop filter | `var(--ov-blur)` — `blur(40px) saturate(180%)`                                         |
| Border          | `1px solid var(--ov-border)`                                                           |
| Box shadow      | `var(--ov-shadow)`                                                                     |

### 2.4 Reusable components

These components are referenced by the state layouts in §2.5. Implement each as a CSS class + renderer helper function.

#### 2.4.1 Recording indicator dot

The **only colored element** in the entire overlay.

| Property  | Value                                                               |
| --------- | ------------------------------------------------------------------- |
| Size      | 8 × 8 px                                                            |
| Shape     | Circle (`border-radius: 50%`)                                       |
| Color     | `var(--ov-accent)` (`#FF6363`)                                      |
| Animation | Opacity oscillates 0.35 → 1.0 → 0.35, period **2 s**, `ease-in-out` |

A slow **breathing** rhythm, not a fast blink. The gentle pulse signals "alive" without urgency.

```css
@keyframes breathe {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
.rec-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ov-accent);
  animation: breathe 2s ease-in-out infinite;
}
```

#### 2.4.2 Glass button

Shared by Stop and Dismiss. Blends into the frosted surface with a subtle lighter fill.

| Property      | Value                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| Background    | `var(--ov-btn-bg)` → hover: `var(--ov-btn-bg-hover)` → active: `var(--ov-btn-bg-active)` |
| Border        | none                                                                                     |
| Border-radius | 8px                                                                                      |
| Padding       | 5px 14px                                                                                 |
| Font          | 12px, weight 500, `var(--ov-btn-text)`                                                   |
| Transition    | `background 120ms ease`                                                                  |
| Cursor        | `pointer`                                                                                |

The **Stop** variant prepends a small filled square icon (8 × 8 px, `var(--ov-btn-text)`, `border-radius: 1.5px`) with a 6px gap before the text:

```
[ ■ Stop ]
```

#### 2.4.3 Keyboard hint badge

Displays a shortcut key (e.g. `esc`) as a subtle physical-key-shaped label. **The badge is also clickable** — it triggers the same action as the shortcut it represents.

| Property      | Value                                             |
| ------------- | ------------------------------------------------- |
| Background    | `var(--ov-kbd-bg)`                                |
| Border        | `1px solid var(--ov-kbd-border)`                  |
| Border-radius | 4px                                               |
| Padding       | 2px 6px                                           |
| Font          | 11px, monospace, weight 500, `var(--ov-kbd-text)` |
| Hover         | text brightens to `rgba(255, 255, 255, 0.5)`      |
| Cursor        | `pointer`                                         |

#### 2.4.4 Progress bar

A thin indeterminate shimmer bar. Conveys "processing" without committing to a percentage.

| Property              | Value                                                |
| --------------------- | ---------------------------------------------------- |
| Track height          | 3px                                                  |
| Track color           | `var(--ov-progress-track)`                           |
| Track border-radius   | 1.5px                                                |
| Shimmer width         | 40% of track                                         |
| Shimmer color         | `var(--ov-progress-fill)`                            |
| Shimmer border-radius | 1.5px                                                |
| Animation             | Translate left → right, 1.5 s `ease-in-out` infinite |

```css
.progress-bar {
  height: 3px;
  border-radius: 1.5px;
  background: var(--ov-progress-track);
  overflow: hidden;
}
.progress-shimmer {
  height: 100%;
  width: 40%;
  border-radius: 1.5px;
  background: var(--ov-progress-fill);
  animation: shimmer 1.5s ease-in-out infinite;
}
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}
```

#### 2.4.5 SVG checkmark

A stroke-drawn check for the success state. Not an emoji — a precise vector path.

| Property         | Value                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------- |
| ViewBox          | `0 0 16 16`                                                                            |
| Path             | `M4 8.5 L7 11.5 L12 5`                                                                 |
| Stroke           | `var(--ov-text-primary)`, width 2px, `stroke-linecap: round`, `stroke-linejoin: round` |
| Appear animation | Stroke draws on via `stroke-dashoffset` (300 ms) + scale 0.5 → 1.1 → 1.0 (spring)      |

```css
@keyframes check-draw {
  from {
    stroke-dashoffset: 20;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes check-appear {
  0% {
    transform: scale(0.5);
    opacity: 0;
  }
  60% {
    transform: scale(1.1);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
.checkmark {
  animation: check-appear 300ms ease-out forwards;
}
.checkmark path {
  stroke-dasharray: 20;
  animation: check-draw 300ms ease-out 50ms forwards;
}
```

### 2.5 State layouts

#### 2.5.1 Recording (height: 44px)

A compact single-row pill. The user's peripheral vision registers "recording in progress" without demanding attention.

```
┌───────────────────────────────────────┐
│  ◉  0:04            esc   [ ■ Stop ] │
└───────────────────────────────────────┘
```

Layout: `display: flex; align-items: center; height: 44px; padding: 0 16px;`

| #   | Element       | Flex                            | Details                                            |
| --- | ------------- | ------------------------------- | -------------------------------------------------- |
| 1   | Recording dot | `flex: none`                    | §2.4.1 — 8px coral dot, breathing animation        |
| 2   | Timer         | `flex: none; margin-left: 10px` | `0:00` format, `--ov-text-secondary`, tabular-nums |
| 3   | _(spacer)_    | `flex: 1`                       |                                                    |
| 4   | `esc` badge   | `flex: none`                    | §2.4.3 — click or press Escape to cancel           |
| 5   | Stop button   | `flex: none; margin-left: 8px`  | §2.4.2 — `[ ■ Stop ]` glass button                 |

**No "Recording" label.** The breathing coral dot + running timer is universally understood as "recording in progress." Omitting the label keeps the pill compact and restrained.

Behavior:

- Timer starts at `0:00`, renderer's `setInterval(100ms)` computes elapsed from `startedAtIso`.
- Click `esc` badge or press `Escape` → sends `{ kind: 'cancel' }`.
- Click Stop → sends `{ kind: 'stop' }`.

#### 2.5.2 Processing (height: 56px)

A single rotating label replaces the old 3-step list. The user doesn't need to see future steps — just what's happening now.

```
┌───────────────────────────────────────┐
│  Transcribing…                        │
│  ━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░   │
└───────────────────────────────────────┘
```

Layout: `display: flex; flex-direction: column; padding: 14px 16px; gap: 10px;`

| Row | Element      | Details                                                    |
| --- | ------------ | ---------------------------------------------------------- |
| 1   | Status label | Current step + `…`, 13px weight 400, `--ov-text-secondary` |
| 2   | Progress bar | §2.4.4 — indeterminate shimmer                             |

Step label mapping:

| Pipeline step  | Display text    |
| -------------- | --------------- |
| `transcribing` | `Transcribing…` |
| `rewriting`    | `Rewriting…`    |
| `inserting`    | `Inserting…`    |

**Crossfade** when step changes: outgoing label fades to `opacity: 0` over 150 ms, incoming label fades from `opacity: 0` to `1` over 150 ms (simultaneous, `position: absolute` stacking during transition).

No cancel button — pipeline is already running and cannot be interrupted.

#### 2.5.3 Success (height: 44px)

Ultra-brief confirmation. The checkmark draw-on animation provides a satisfying micro-moment.

```
┌───────────────────────────────────────┐
│  ✓  Done                              │
└───────────────────────────────────────┘
```

Layout: `display: flex; align-items: center; height: 44px; padding: 0 16px;`

| #   | Element   | Details                                                                   |
| --- | --------- | ------------------------------------------------------------------------- |
| 1   | Checkmark | §2.4.5 — 16px SVG stroke, `--ov-text-primary`, draw-on + spring animation |
| 2   | Label     | `margin-left: 10px`, 13px weight 500, `--ov-text-primary`                 |

Label logic:

- Text was pasted into target app → **`Done`**
- No target app detected (copied to clipboard only) → **`Copied`**

**Do not show the target app name.** `Done` is sufficient and keeps the overlay minimal.

Auto-closes after **1.2 seconds**.

#### 2.5.4 Error (height: ~80px)

Informative but visually restrained. **No red color anywhere** — the dark surface and white text provide sufficient signal that something went wrong.

```
┌───────────────────────────────────────┐
│  Pipeline failed                      │
│  Whisper exited with code 1           │
│                            [ Dismiss ] │
└───────────────────────────────────────┘
```

Layout: `display: flex; flex-direction: column; padding: 14px 16px;`

| Row | Element        | Details                                                                                          |
| --- | -------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Error title    | 13px weight 500, `--ov-text-primary`                                                             |
| 2   | Error detail   | 12px weight 400, `--ov-text-tertiary`, single line, `text-overflow: ellipsis`, `margin-top: 4px` |
| 3   | Dismiss button | §2.4.2, `align-self: flex-end`, `margin-top: 10px`                                               |

Does **not** auto-close. User must click Dismiss.

#### 2.5.5 Cancelled

No visual state. The overlay runs the exit animation (§2.6) and closes.

### 2.6 Transitions and animations

#### 2.6.1 Overlay appear / disappear

| Trigger   | Properties                               | Duration | Easing     |
| --------- | ---------------------------------------- | -------- | ---------- |
| Appear    | `opacity: 0 → 1`, `translateY: −4px → 0` | 180 ms   | `ease-out` |
| Disappear | `opacity: 1 → 0`, `translateY: 0 → −4px` | 150 ms   | `ease-in`  |

```css
.overlay-container {
  transition:
    opacity 180ms ease-out,
    transform 180ms ease-out;
}
.overlay-container.entering {
  opacity: 0;
  transform: translateY(-4px);
}
.overlay-container.visible {
  opacity: 1;
  transform: translateY(0);
}
.overlay-container.exiting {
  opacity: 0;
  transform: translateY(-4px);
  transition-duration: 150ms;
  transition-timing-function: ease-in;
}
```

#### 2.6.2 State transitions (content changes)

| From → To              | Animation                          | Duration | Easing |
| ---------------------- | ---------------------------------- | -------- | ------ |
| Recording → Processing | Content crossfade + height morph   | 200 ms   | `ease` |
| Processing → Success   | Content crossfade + height morph   | 200 ms   | `ease` |
| Processing → Error     | Content crossfade + height morph   | 200 ms   | `ease` |
| Step label change      | Simultaneous old-out / new-in fade | 150 ms   | `ease` |

**Height morph:** `transition: height 200ms ease` on the outer container with `overflow: hidden` during resize to prevent content flash.

**Content crossfade:** Both old and new content render `position: absolute` inside a wrapper; old fades out while new fades in simultaneously.

---

## 3. Technical Architecture

### 3.1 Window configuration

```typescript
const overlayWindow = new BrowserWindow({
  width: 280,
  height: 44,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false, // shadow via CSS for better control
  focusable: false, // do not steal focus on creation
  show: false, // show manually after positioning
  webPreferences: {
    preload: OVERLAY_PRELOAD_WEBPACK_ENTRY,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
  },
});
```

**macOS-specific:** Set `overlayWindow.setVisibleOnAllWorkspaces(true)` so the overlay appears even if the user switches Spaces. Set `overlayWindow.setAlwaysOnTop(true, 'floating')` for the correct window level.

**Positioning:** On creation, read the primary display bounds via `screen.getPrimaryDisplay().workArea` and center the window horizontally, 64px below the top.

**Focus handling:** The window starts as `focusable: false` so it does not steal focus when shown. When the user explicitly clicks on the overlay (detected by a `mousedown` listener in the renderer), the renderer sends an IPC message and the main process calls `overlayWindow.setFocusable(true)` then `overlayWindow.focus()`. After the click is handled (stop/cancel), the main process sets `focusable` back to `false`.

### 3.2 File structure

```
src/
  main/
    overlay/
      overlay-manager.ts          # create, show, hide, destroy, push state
      overlay-manager.test.ts     # unit tests for state management
    preload-overlay.ts            # overlay preload script (minimal bridge)
  renderer/
    overlay/
      index.html                  # overlay HTML shell
      index.ts                    # overlay renderer logic + rendering
      styles.css                  # overlay-specific styles
  shared/
    ipc.ts                        # add overlay channel definitions
```

### 3.3 Webpack entry point

Add a second entry to `forge.config.ts` → `WebpackPlugin` → `renderer.entryPoints`:

```typescript
{
  html: './src/renderer/overlay/index.html',
  js: './src/renderer/overlay/index.ts',
  name: 'overlay',
  preload: {
    js: './src/main/preload-overlay.ts'
  }
}
```

This generates `OVERLAY_WEBPACK_ENTRY` and `OVERLAY_PRELOAD_WEBPACK_ENTRY` constants available in the main process.

### 3.4 State machine

The overlay has one linear state machine controlled by the main process:

```
          ┌───────────────────────────┐
          │         IDLE              │  (overlay not visible)
          └─────────┬─────────────────┘
                    │ shortcut pressed / start recording
                    ▼
          ┌───────────────────────────┐
          │       RECORDING           │
          │  • timer counting         │
          │  • cancel → IDLE          │
          │  • stop → PROCESSING      │
          └─────────┬─────────────────┘
                    │ stop triggered
                    ▼
          ┌───────────────────────────┐
          │      PROCESSING           │
          │  • step: transcribing     │
          │  • step: rewriting        │
          │  • step: inserting        │
          │  • error → ERROR          │
          └─────────┬─────────────────┘
                    │ all steps done
                    ▼
          ┌───────────────────────────┐
          │       SUCCESS             │
          │  • auto-close after 1.5s  │
          └─────────┬─────────────────┘
                    │
                    ▼
                  IDLE

          ┌───────────────────────────┐
          │        ERROR              │
          │  • dismiss → IDLE         │
          └───────────────────────────┘
```

State is owned by the main process (`overlay-manager.ts`). The overlay renderer is a pure projection of this state — it receives state snapshots via IPC and renders them. The overlay renderer never decides what state to transition to; it only sends user actions (stop, cancel, dismiss) back to the main process.

### 3.5 IPC protocol

#### New channels (add to `shared/ipc.ts`)

```typescript
// Main → Overlay (push state)
overlayState: 'overlay:state';

// Overlay → Main (user actions)
overlayAction: 'overlay:action';
```

#### State payload (Main → Overlay)

```typescript
type OverlayStep = 'transcribing' | 'rewriting' | 'inserting';
type OverlayStepStatus = 'pending' | 'active' | 'done';

interface OverlayStateRecording {
  kind: 'recording';
  elapsedMs: number; // updated by overlay renderer's own timer
  startedAtIso: string; // ISO timestamp so renderer can compute elapsed
}

interface OverlayStateProcessing {
  kind: 'processing';
  steps: Array<{ id: OverlayStep; status: OverlayStepStatus }>;
}

interface OverlayStateSuccess {
  kind: 'success';
  targetAppName: string | null;
}

interface OverlayStateError {
  kind: 'error';
  message: string;
}

interface OverlayStateHidden {
  kind: 'hidden';
}

type OverlayState =
  | OverlayStateRecording
  | OverlayStateProcessing
  | OverlayStateSuccess
  | OverlayStateError
  | OverlayStateHidden;
```

#### Action payload (Overlay → Main)

```typescript
type OverlayAction =
  | { kind: 'stop' }
  | { kind: 'cancel' }
  | { kind: 'dismiss' }
  | { kind: 'request-focus' };
```

### 3.6 Pipeline progress integration

Currently, `processSession` in `dictation-pipeline.ts` runs all three steps sequentially but does not emit progress. Add an optional progress callback:

```typescript
export interface DictationPipelineDeps {
  // ... existing deps ...
  onProgress?: (step: 'transcribing' | 'rewriting' | 'inserting') => void;
}
```

Inside `processSession`, call `deps.onProgress?.('transcribing')` before starting transcription, `deps.onProgress?.('rewriting')` before rewrite, etc.

The `overlay-manager` passes a progress callback that pushes updated `OverlayStateProcessing` snapshots to the overlay window.

### 3.7 Interaction with hub window

When the overlay is active (recording or processing), the hub window should know about it. Add a new field to the state sent via the existing `desktop:get-status` channel:

```typescript
interface DesktopStatus {
  // ... existing fields ...
  overlayActive: boolean;
}
```

The hub renderer checks `overlayActive` and, if true, shows a simplified message in the recording card instead of the full recording UI (e.g. "Recording in progress — use the floating overlay or press ⌘⇧; to stop.").

### 3.8 Overlay preload bridge

The overlay preload is minimal — it only needs:

```typescript
interface OverlayBridge {
  onState: (callback: (state: OverlayState) => void) => () => void;
  sendAction: (action: OverlayAction) => void;
}
```

Exposed as `window.overlayBridge`.

---

## 4. Implementation Tasks

### Task 1: Add overlay IPC types and channels

**Goal:** Define the overlay communication protocol in shared types so both processes can import them.

**Files:**

- Modify: `src/shared/ipc.ts` — add overlay state types, action types, and channel names.

**Steps:**

1. Add `OverlayStep`, `OverlayStepStatus`, `OverlayState`, `OverlayAction`, and `OverlayBridge` type definitions.
2. Add channel constants: `overlayState: 'overlay:state'` and `overlayAction: 'overlay:action'`.
3. Add `overlayActive: boolean` to the existing `DesktopStatus` interface.
4. Run `npm run typecheck` to verify no regressions.

**Commit message:** `feat: add overlay IPC types and channel definitions`

---

### Task 2: Create overlay HTML, CSS, and renderer

**Goal:** Build the overlay's frontend: a standalone renderer that receives state via IPC and renders the appropriate visual state.

**Files:**

- Create: `src/renderer/overlay/index.html`
- Create: `src/renderer/overlay/styles.css`
- Create: `src/renderer/overlay/index.ts`

**Design decisions (do not ask):**

- The overlay uses its own dark color tokens (see §2.1), **not** the hub window's light `:root` variables.
- The overlay body has `background: transparent` and a single container div with the dark frosted-glass style.
- The overlay renderer maintains its own 100ms interval timer during the recording state to update elapsed time (it receives `startedAtIso` from main and computes elapsed locally to avoid high-frequency IPC).
- The SVG checkmark icon is defined inline in the renderer; no external icon library or `icons.ts` import needed.
- The overlay HTML has a minimal CSP matching the hub window.

**Steps:**

1. Create `index.html` with `<div id="overlay"></div>`, matching CSP.
2. Create `styles.css` with all overlay styles: dark frosted surface, color tokens (§2.1), recording pill layout, processing label + progress bar, success/error states, all reusable components (§2.4), and animations (§2.6).
3. Create `index.ts`:
   - Listen for `overlayBridge.onState()` and re-render on every state change.
   - Render functions for each state: `renderRecording`, `renderProcessing`, `renderSuccess`, `renderError`.
   - Timer logic for recording elapsed display.
   - Button handlers that call `overlayBridge.sendAction(...)`.
   - A `mousedown` listener on the overlay container that sends `{ kind: 'request-focus' }` so the main process can temporarily make the window focusable.
4. Verify the files parse correctly with `npm run typecheck`.

**Commit message:** `feat: create overlay window renderer with all visual states`

---

### Task 3: Create overlay preload script

**Goal:** Expose the minimal IPC bridge for the overlay renderer.

**Files:**

- Create: `src/main/preload-overlay.ts`

**Steps:**

1. Import `contextBridge` and `ipcRenderer` from Electron.
2. Import the overlay channel constants and types from `shared/ipc.ts`.
3. Expose `window.overlayBridge` with:
   - `onState`: registers an `ipcRenderer.on` listener for the overlay state channel, returns a cleanup function.
   - `sendAction`: calls `ipcRenderer.send` on the overlay action channel.
4. Create a `src/renderer/overlay/window.d.ts` with the global `OverlayBridge` type declaration.
5. Run `npm run typecheck`.

**Commit message:** `feat: add overlay preload bridge`

---

### Task 4: Register overlay as a Webpack entry point

**Goal:** Make Electron Forge aware of the overlay so it generates the entry URL and preload path constants.

**Files:**

- Modify: `forge.config.ts` — add overlay entry to `renderer.entryPoints`.

**Steps:**

1. Add the overlay entry point object (html, js, name `'overlay'`, preload pointing to `preload-overlay.ts`).
2. Run `npm run start` briefly to confirm the build succeeds and both `MAIN_WINDOW_WEBPACK_ENTRY` and `OVERLAY_WEBPACK_ENTRY` are available. Kill the process after confirming the build output.
3. If the build fails due to missing entry URL declarations, add `declare const OVERLAY_WEBPACK_ENTRY: string;` and `declare const OVERLAY_PRELOAD_WEBPACK_ENTRY: string;` to the main process file that will use them.

**Commit message:** `build: register overlay as second Webpack renderer entry`

---

### Task 5: Implement overlay-manager in main process

**Goal:** Create the module that manages the overlay window lifecycle and state machine.

**Files:**

- Create: `src/main/overlay/overlay-manager.ts`
- Create: `src/main/overlay/overlay-manager.test.ts`

**Interface:**

```typescript
interface OverlayManager {
  /** Show the overlay in recording state. Creates the window if needed. */
  showRecording: () => void;

  /** Transition to processing state with initial step statuses. */
  transitionToProcessing: () => void;

  /** Update a processing step's status. */
  updateProcessingStep: (step: OverlayStep, status: OverlayStepStatus) => void;

  /** Transition to success state. Auto-closes after delay. */
  transitionToSuccess: (targetAppName: string | null) => void;

  /** Transition to error state. */
  transitionToError: (message: string) => void;

  /** Hide and reset the overlay. */
  hide: () => void;

  /** Whether the overlay is currently visible (recording or processing). */
  isActive: () => boolean;

  /** Register handler for overlay user actions. */
  onAction: (handler: (action: OverlayAction) => void) => void;

  /** Clean up (called on app quit). */
  destroy: () => void;
}
```

**Steps:**

1. Write unit tests first (test-driven):
   - `isActive()` returns false initially.
   - `showRecording()` sets active to true and pushes recording state.
   - `transitionToProcessing()` pushes processing state with all steps pending except first.
   - `updateProcessingStep()` pushes updated step status.
   - `transitionToSuccess()` pushes success state; after delay, calls hide.
   - `transitionToError()` pushes error state; stays active until `hide()`.
   - `hide()` sets active to false.
   - Test that `onAction` handler receives forwarded actions.
     Tests should mock the BrowserWindow (pass a `createWindow` factory or test the state logic separately from the Electron window).
2. Implement `overlay-manager.ts`:
   - Lazy-create the BrowserWindow on first `showRecording()`.
   - Position the window at top-center of primary display.
   - Push state updates via `webContents.send(overlayStateChannel, state)`.
   - Listen for action IPC from the overlay renderer via `ipcMain.on`.
   - On `request-focus` action: `setFocusable(true)` + `focus()`, then after a short delay reset `setFocusable(false)`.
   - On `hide()`: send hidden state, then `window.hide()`. Do not destroy — reuse for next recording.
   - On `transitionToSuccess()`: start a 1.2s timeout that calls `hide()`.
   - On `destroy()`: close and nullify the window.
3. Run tests: `npm run test`.
4. Run typecheck.

**Commit message:** `feat: implement overlay manager with state machine and lifecycle`

---

### Task 6: Add progress callback to dictation pipeline

**Goal:** Let the pipeline report which step is currently running so the overlay can show progress.

**Files:**

- Modify: `src/main/pipeline/dictation-pipeline.ts`
- Modify: `src/main/pipeline/dictation-pipeline.test.ts`

**Steps:**

1. Add `onProgress?: (step: 'transcribing' | 'rewriting' | 'inserting') => void` to `DictationPipelineDeps`.
2. In `processSession`, call `deps.onProgress?.('transcribing')` before the transcription call, `deps.onProgress?.('rewriting')` before the rewrite call, and `deps.onProgress?.('inserting')` before the send call.
3. Add a test that verifies the progress callback is called in the correct order during `processSession`.
4. Run existing tests to ensure no regressions.

**Commit message:** `feat: add progress callback to dictation pipeline`

---

### Task 7: Wire overlay into the main process orchestration

**Goal:** Connect the overlay manager, shortcut handling, and pipeline so the full flow works end-to-end.

**Files:**

- Modify: `src/main/index.ts`

**Changes:**

1. **Import and create** the overlay manager in `registerIpcHandlers()`.

2. **Change shortcut behavior** to toggle:

   ```
   ⌘⇧; handler:
     if overlayManager.isActive():
       → stop recording (same as current stop logic)
     else:
       → check permissions (existing logic)
       → workflow.beginCapture()
       → overlayManager.showRecording()
       → send 'start' to hub renderer
   ```

3. **Handle overlay actions:**

   ```
   overlayManager.onAction(action):
     if action.kind === 'stop':
       → send 'stop' to hub renderer (triggers existing stop flow)
     if action.kind === 'cancel':
       → send 'stop' to hub renderer (stop MediaRecorder)
       → overlayManager.hide()
       → discard the session (do not process)
     if action.kind === 'dismiss':
       → overlayManager.hide()
   ```

4. **Forward pipeline progress to overlay:**
   When creating the pipeline deps, pass an `onProgress` callback that calls `overlayManager.updateProcessingStep(step, 'active')` and marks previous steps as `'done'`.

5. **Update `completeDictationSession` handler** to drive overlay transitions:
   - Before processing: `overlayManager.transitionToProcessing()`
   - On success: `overlayManager.transitionToSuccess(result.targetAppName)`
   - On error: `overlayManager.transitionToError(error.message)`

6. **Update `buildDesktopStatus`** to include `overlayActive: overlayManager.isActive()`.

7. **Handle cancel correctly:** When the user cancels during recording, the audio is captured but should NOT be processed. Add a flag or check in the finalize flow. The simplest approach: if the overlay was hidden (cancelled) before `finalizeRecording` tries to call `completeDictationSession`, skip the completion and delete the saved session.

8. **Keep `⌘⇧'` working** as a stop shortcut — its handler should also trigger the stop logic if overlay is active.

**Commit message:** `feat: wire overlay lifecycle into main process orchestration`

---

### Task 8: Update hub renderer for overlay awareness

**Goal:** When the overlay is active, the hub window should not show its own full recording UI.

**Files:**

- Modify: `src/renderer/index.ts`

**Steps:**

1. In `renderHome()`, check `state.desktop.overlayActive`.
2. If overlay is active, replace the recording card with a simple informational card:
   - "Recording in progress"
   - "Use the floating overlay or press ⌘⇧; to stop."
   - No start/stop buttons (all control goes through the overlay).
3. The existing local "Start recording" button should also trigger the overlay flow. In `startRecording('manual')`, after starting the MediaRecorder, call a new IPC method to tell the main process to show the overlay (or: keep the local-only flow for testing, and only use overlay for shortcut-triggered recordings — **decision: use overlay for both manual and shortcut recordings for consistency**).
4. Refresh data after overlay closes to pick up any new sessions.

**Commit message:** `feat: update hub renderer for overlay-aware recording state`

---

### Task 9: End-to-end manual verification

**Goal:** Verify the full flow works on a real macOS machine.

**Steps:**

1. Run `npm run start` to launch the app.
2. Grant microphone and accessibility permissions if not already done.
3. Focus a text editor (e.g. TextEdit or Notes).
4. Press `⌘⇧;` — verify the overlay appears at top-center with "Recording" state.
5. Speak a sentence.
6. Press `⌘⇧;` again — verify recording stops, overlay transitions to processing.
7. Verify each processing step lights up in sequence.
8. Verify success message appears and overlay auto-closes.
9. Verify the text was pasted into the target app.
10. Test cancel: start recording, click Cancel on overlay, verify overlay closes and no processing occurs.
11. Test error: temporarily break the whisper path, verify error state shows with Dismiss button.

**Commit message:** No commit for this task — it is a verification checkpoint.

---

## 5. Decisions Already Made (Do Not Ask)

These are medium/small decisions made in this document. Implement them directly.

| Decision                                                                 | Rationale                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Overlay is a second BrowserWindow, not a DOM element in the hub window   | Must float above all apps, not just the hub                                     |
| `focusable: false` at creation, temporarily enabled on click             | Prevents stealing focus from the target app                                     |
| Shortcut `⌘⇧;` becomes a toggle (start/stop)                             | More intuitive than two separate shortcuts                                      |
| Keep `⌘⇧'` as an alternative stop shortcut                               | Backwards compatibility, some users prefer a dedicated stop key                 |
| Overlay window is hidden, not destroyed, after use                       | Faster to re-show on next recording                                             |
| Timer runs in the overlay renderer, not pushed from main                 | Avoids high-frequency IPC for a display-only concern                            |
| Processing shows a single rotating label + progress bar, not a step list | Minimal information density; user only needs to know what's happening now       |
| Success auto-closes after 1.2 seconds                                    | Minimal "Done" text is instantly readable; 1.2s feels responsive                |
| Error requires manual dismiss                                            | User should see and acknowledge failures                                        |
| Cancel during recording discards the audio                               | User explicitly chose to cancel; saving would be confusing                      |
| Overlay uses its own dark color tokens, independent of hub's light theme | Dark floating panels feel native on macOS; reduces visual weight on any desktop |
| Use `alwaysOnTop: true, 'floating'` level on macOS                       | Ensures overlay is above full-screen apps and Spaces                            |
| Hub's "Start recording" button also triggers the overlay                 | Consistent experience regardless of entry point                                 |
| Progress bar is indeterminate (shimmer animation)                        | We don't know how long each step takes; a fake percentage would be dishonest    |
| Overlay is positioned at top-center, 64px from top                       | Visible but not covering the main content area                                  |
| Window width 280px                                                       | Narrower pill shape = more compact and premium; sufficient for minimal content  |

## 6. Open Questions (Ask Before Implementing)

None currently. All decisions are covered above. If a major architectural issue is discovered during implementation (e.g. `focusable: false` prevents click events entirely on a given platform), escalate before working around it.

---

## 7. Task Dependency Graph

```
Task 1 (IPC types)
  │
  ├──► Task 2 (overlay renderer)
  │       │
  │       ├──► Task 4 (webpack entry)
  │       │
  │       └──► Task 8 (hub updates)
  │
  ├──► Task 3 (preload)
  │       │
  │       └──► Task 4 (webpack entry)
  │
  ├──► Task 5 (overlay manager)
  │       │
  │       └──► Task 7 (main process wiring)
  │
  └──► Task 6 (pipeline progress)
          │
          └──► Task 7 (main process wiring)

Task 7 depends on: Tasks 4, 5, 6
Task 8 depends on: Task 1
Task 9 depends on: all previous tasks
```

**Recommended execution order:** 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8 → 9

Tasks 2 and 3 can be done in parallel. Task 6 is independent of Tasks 2-4 and can be done early.
