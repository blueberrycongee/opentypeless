# Recording Overlay Implementation Plan

> **Execution note:** Execute in small verified steps with atomic commits. Make medium/small design decisions autonomously. Only escalate major architectural changes that would be expensive to reverse.

**Goal:** When the user presses the global dictation shortcut, a small floating overlay window appears on screen. The overlay shows the user that recording is in progress, provides cancel and stop controls, and displays a step-by-step progress indicator during the transcription/rewrite/insertion pipeline. The overlay auto-closes on success.

**Architecture:** A second frameless, always-on-top BrowserWindow managed by the main process. The overlay has its own HTML entry point, preload script, and renderer. The main process controls the overlay lifecycle and pushes state updates to it via IPC. The shortcut becomes a toggle: first press starts recording and opens the overlay, second press stops recording.

**Tech Stack:** Electron BrowserWindow, TypeScript, Webpack (new Forge entry point), same CSS design system as hub window.

---

## 1. Product Requirements

### 1.1 User flow

```
User is in any desktop app (e.g. Notes, Slack, Chrome)
  │
  ├─ Presses ⌘⇧;
  │   → Overlay appears at top-center of screen
  │   → Recording starts
  │   → Overlay shows: pulsing indicator, live timer, [Cancel] and [■ Stop] buttons
  │
  ├─ User speaks into microphone
  │
  ├─ User ends recording (any of these):
  │   ├─ Presses ⌘⇧; again (toggle)
  │   ├─ Presses ⌘⇧' (dedicated stop shortcut)
  │   └─ Clicks [■ Stop] on the overlay
  │
  ├─ Overlay switches to processing mode
  │   → Shows progress steps: Transcribing → Rewriting → Inserting
  │   → Each step lights up as it starts and gets a checkmark when done
  │
  ├─ On success:
  │   → Overlay shows "✓ Inserted into {appName}" for 1.5 seconds
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

| Current behavior | New behavior |
|-----------------|-------------|
| `⌘⇧;` always means "start recording" | `⌘⇧;` toggles: start if idle, stop if recording |
| `⌘⇧'` always means "stop recording" | `⌘⇧'` still means "stop recording" (unchanged) |

When recording is not active, `⌘⇧;` starts recording and opens the overlay.
When recording is active, `⌘⇧;` stops recording (same as clicking Stop).

---

## 2. Visual Design Spec

The overlay uses the same design system as the hub window (colors, typography, radius, etc. from `styles.css` `:root` variables). It is a compact floating panel.

### 2.1 Dimensions and position

- Width: 320px
- Height: dynamic based on state (~80px recording, ~90px processing, ~60px success/error)
- Position: top-center of the screen, 80px below the top edge
- Corner radius: 14px (matches `--radius-lg`)
- Background: `#ffffff` with slight opacity (`rgba(255, 255, 255, 0.92)`) and backdrop blur
- Border: `1px solid rgba(0, 0, 0, 0.08)`
- Shadow: `0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)`

### 2.2 Recording state

```
┌──────────────────────────────────────────┐
│                                          │
│   🔴  Recording              0:04       │
│                                          │
│   [Cancel]                  [■ Stop]     │
│                                          │
└──────────────────────────────────────────┘
```

- Left: pulsing red dot (8px, same `pulse-rec` animation) + "Recording" label
- Right: live timer in tabular-nums font, updates every 100ms
- Bottom row: "Cancel" ghost button (left), "Stop" primary button (right)
- The red dot and "Recording" text are `var(--red)` colored

### 2.3 Processing state

```
┌──────────────────────────────────────────┐
│                                          │
│   ● Transcribing...                      │
│   ○ Rewriting                            │
│   ○ Inserting                            │
│                                          │
│   ━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░   │
│                                          │
└──────────────────────────────────────────┘
```

- A vertical step list with 3 steps: Transcribing, Rewriting, Inserting
- Current step: filled dot (`●`) + "..." suffix + `var(--blue)` color
- Completed step: checkmark (`✓`) + `var(--green)` color
- Pending step: empty dot (`○`) + `var(--text-tertiary)` color
- Below the steps: a thin progress bar (3px height, rounded ends)
- The progress bar is indeterminate (animated shimmer) during each active step
- No cancel button during processing (the pipeline is already running)

### 2.4 Success state

```
┌──────────────────────────────────────────┐
│                                          │
│   ✓  Inserted into Notes                 │
│                                          │
└──────────────────────────────────────────┘
```

- Green checkmark icon + success message
- `var(--green)` for the check, `var(--text)` for the label
- Auto-closes after 1.5 seconds
- If no target app was available: "✓ Processed (no target app)"

### 2.5 Error state

```
┌──────────────────────────────────────────┐
│                                          │
│   ✗  Pipeline failed                     │
│   Whisper process exited with code 1     │
│                              [Dismiss]   │
│                                          │
└──────────────────────────────────────────┘
```

- Red X icon + error title + detail message (truncated to 1 line)
- `var(--red)` for the icon, `var(--text-secondary)` for detail
- [Dismiss] ghost button to close
- Does NOT auto-close (user must acknowledge)

### 2.6 Cancelled state

No visual state. The overlay closes immediately when the user cancels.

---

## 3. Technical Architecture

### 3.1 Window configuration

```typescript
const overlayWindow = new BrowserWindow({
  width: 320,
  height: 88,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  hasShadow: false,       // shadow via CSS for better control
  focusable: false,        // do not steal focus on creation
  show: false,             // show manually after positioning
  webPreferences: {
    preload: OVERLAY_PRELOAD_WEBPACK_ENTRY,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false
  }
});
```

**macOS-specific:** Set `overlayWindow.setVisibleOnAllWorkspaces(true)` so the overlay appears even if the user switches Spaces. Set `overlayWindow.setAlwaysOnTop(true, 'floating')` for the correct window level.

**Positioning:** On creation, read the primary display bounds via `screen.getPrimaryDisplay().workArea` and center the window horizontally, 80px below the top.

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
overlayState: 'overlay:state'

// Overlay → Main (user actions)
overlayAction: 'overlay:action'
```

#### State payload (Main → Overlay)

```typescript
type OverlayStep = 'transcribing' | 'rewriting' | 'inserting';
type OverlayStepStatus = 'pending' | 'active' | 'done';

interface OverlayStateRecording {
  kind: 'recording';
  elapsedMs: number;        // updated by overlay renderer's own timer
  startedAtIso: string;     // ISO timestamp so renderer can compute elapsed
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
- Use the same `:root` CSS variables as the hub window for color/typography consistency.
- The overlay body has `background: transparent` and a single container div with the frosted-glass card style.
- The overlay renderer maintains its own 100ms interval timer during the recording state to update elapsed time (it receives `startedAtIso` from main and computes elapsed locally to avoid high-frequency IPC).
- Reuse the `icons.ts` module from the hub renderer (import it).
- The overlay HTML has a minimal CSP matching the hub window.

**Steps:**
1. Create `index.html` with `<div id="overlay"></div>`, matching CSP.
2. Create `styles.css` with overlay-specific styles (the frosted card, recording row, processing steps, success/error states, progress bar animation).
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
   - On `transitionToSuccess()`: start a 1.5s timeout that calls `hide()`.
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

| Decision | Rationale |
|----------|-----------|
| Overlay is a second BrowserWindow, not a DOM element in the hub window | Must float above all apps, not just the hub |
| `focusable: false` at creation, temporarily enabled on click | Prevents stealing focus from the target app |
| Shortcut `⌘⇧;` becomes a toggle (start/stop) | More intuitive than two separate shortcuts |
| Keep `⌘⇧'` as an alternative stop shortcut | Backwards compatibility, some users prefer a dedicated stop key |
| Overlay window is hidden, not destroyed, after use | Faster to re-show on next recording |
| Timer runs in the overlay renderer, not pushed from main | Avoids high-frequency IPC for a display-only concern |
| Progress uses 3 named steps (transcribing, rewriting, inserting) | Matches the actual pipeline stages; simple and predictable |
| Success auto-closes after 1.5 seconds | Long enough to confirm success, short enough not to annoy |
| Error requires manual dismiss | User should see and acknowledge failures |
| Cancel during recording discards the audio | User explicitly chose to cancel; saving would be confusing |
| Overlay uses same CSS variable names as hub for consistency | One design system across all windows |
| Use `alwaysOnTop: true, 'floating'` level on macOS | Ensures overlay is above full-screen apps and Spaces |
| Hub's "Start recording" button also triggers the overlay | Consistent experience regardless of entry point |
| Progress bar is indeterminate (shimmer animation) | We don't know how long each step takes; a fake percentage would be dishonest |
| Overlay is positioned at top-center, 80px from top | Visible but not covering the main content area |
| Window width 320px | Compact enough to not obscure content, wide enough for the UI |

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
