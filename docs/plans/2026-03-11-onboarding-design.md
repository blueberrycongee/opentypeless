# First-Time Onboarding Design

**Goal:** When a user launches OpenTypeless for the first time, a coach-marks overlay guides them through the essential setup: welcome introduction, permission grants, shortcut recognition, and a real first dictation. The overlay operates on the real Hub UI, spotlighting actual elements and navigating between pages. Users can restart the guide from Settings at any time.

**Architecture:** A renderer-layer overlay system within the Hub window. No new Electron windows. The overlay consists of a semi-transparent backdrop, a spotlight cutout highlighting the target element, and a tooltip bubble with step content and navigation.

**Tech Stack:** TypeScript, DOM manipulation (consistent with existing renderer patterns), CSS clip-path/box-shadow for spotlight, existing i18n system for all copy.

---

## 1. User Flow

```
User opens OpenTypeless for the first time
  │
  ├─ localStorage has no 'onboarding-completed' flag
  │   → Onboarding overlay activates
  │
  ├─ Step 1: Welcome
  │   → Full-screen backdrop with centered welcome card
  │   → "Welcome to OpenTypeless" + brief description
  │   → [Get Started] button
  │
  ├─ Step 2: Permissions (auto-navigates to Settings page)
  │   → Spotlight highlights the permissions section
  │   → Tooltip explains why permissions are needed
  │   → Shows live status: ✓/✗ for Microphone and Accessibility
  │   → Auto-advances when both permissions are granted
  │   → User can skip (permissions will be prompted later)
  │
  ├─ Step 3: Shortcuts (auto-navigates to Home page)
  │   → Spotlight highlights the recording card / shortcut display
  │   → Tooltip shows ⌘⇧; and explains start/stop toggle
  │   → [Got it] button
  │
  ├─ Step 4: Try it out
  │   → Tooltip prompts user to press ⌘⇧; right now
  │   → Detects recording start via IPC → updates tooltip to "Recording..."
  │   → Detects recording stop → updates to "Processing..."
  │   → Detects pipeline completion → shows success message
  │   → [Start Using] button
  │
  └─ Complete
      → Sets localStorage 'onboarding-completed' = 'true'
      → Removes overlay
      → User sees normal Home page
```

### Behavior rules

- The onboarding overlay does NOT block global shortcuts. The user can press ⌘⇧; while the overlay is visible (required for Step 4).
- Every step has a **Skip** link in the tooltip, allowing users to skip individual steps.
- There is a **Skip All** link in the progress indicator area to exit onboarding entirely.
- Skipping marks onboarding as completed (so it does not re-trigger on next launch).
- The overlay disables sidebar clicks during Steps 2-3 to prevent the user from navigating away from the guided page. Sidebar re-enables after completing or skipping the step.

---

## 2. Permission Loss Detection (Independent of Onboarding)

Separate from the onboarding flow, the app monitors permission status:

- **When:** Before starting a recording (in the workflow controller), and on app focus/resume.
- **What:** Checks microphone and accessibility permission status via existing `desktop:get-status` IPC.
- **Action on loss:** Sends `desktop:attention` IPC to renderer with a `permission-lost` payload. The renderer shows a modal prompt (not the onboarding overlay) that explains which permission was lost and provides a button to open System Settings.
- **UI:** A simple modal dialog with an icon, message, and "Open Settings" / "Dismiss" buttons. Reuses styling from the onboarding tooltip but is not part of the step flow.

---

## 3. Technical Architecture

### 3.1 File structure

```
renderer/
├── onboarding/
│   ├── onboarding-controller.ts    # Step state machine, flow control
│   ├── onboarding-overlay.ts       # DOM rendering: backdrop, spotlight, tooltip
│   └── onboarding-steps.ts         # Step definitions: target element, copy keys, callbacks
```

### 3.2 Onboarding Controller (state machine)

```
States: idle | welcome | permissions | shortcuts | tryit | complete

Transitions:
  idle → welcome           (on init, if not completed)
  welcome → permissions    (user clicks "Get Started")
  permissions → shortcuts  (both permissions granted, or user skips)
  shortcuts → tryit        (user clicks "Got it")
  tryit → complete         (pipeline finishes successfully, or user skips)
  complete → idle          (overlay removed)
  any → complete           (user clicks "Skip All")
```

The controller:
- Manages current step state
- Triggers page navigation (calls existing `navigateTo()` to switch between Home/Settings)
- Subscribes to IPC events for Step 4 (recording start, pipeline complete)
- Calls the overlay renderer to update DOM on each transition

### 3.3 Onboarding Overlay (DOM layer)

Three DOM layers appended to `document.body`:

1. **Backdrop:** `<div class="onboarding-backdrop">` — fixed fullscreen, semi-transparent
2. **Spotlight:** CSS `box-shadow: 0 0 0 9999px rgba(0,0,0,0.6)` on a positioned element matching the target's bounding rect. This creates a "cutout" effect without clip-path complexity.
3. **Tooltip:** `<div class="onboarding-tooltip">` — absolutely positioned adjacent to the spotlight area, contains step content

Element targeting: Each step config specifies a CSS selector for the target element. The overlay reads `getBoundingClientRect()` to position the spotlight and tooltip.

### 3.4 Step Definitions

Each step is a plain object:

```typescript
interface OnboardingStep {
  id: string;
  page: 'home' | 'settings' | null;  // null = no navigation
  targetSelector: string | null;       // null = centered (no spotlight)
  tooltipPosition: 'bottom' | 'right' | 'left' | 'top';
  i18nPrefix: string;                  // e.g. 'onboarding.welcome'
  canSkip: boolean;
  autoAdvance?: (onAdvance: () => void) => () => void;  // returns cleanup fn
}
```

Step 4's `autoAdvance` subscribes to `recording:command` and pipeline completion IPC events. When the pipeline completes successfully, it calls `onAdvance()`.

### 3.5 Integration points

- **Page navigation:** Calls the existing sidebar nav function (`navigateTo('settings')`, `navigateTo('home')`)
- **Permission status:** Uses existing `window.electronAPI.getDesktopStatus()` and polls every 1s during Step 2 to detect grants
- **Recording detection (Step 4):** Listens to existing `recording:command` IPC from main process
- **Pipeline completion (Step 4):** Listens to existing `desktop:attention` or a new lightweight IPC event for pipeline result
- **Settings page restart:** Adds a "Restart Guide" button to the Settings page that clears `localStorage` and re-initializes the controller

---

## 4. Visual Design

### 4.1 Backdrop

- `background: rgba(0, 0, 0, 0.6)`
- `backdrop-filter: blur(2px)`
- `z-index: 1000`
- Covers entire Hub window

### 4.2 Spotlight

- Matches target element's bounding rect + 8px padding on each side
- `border-radius: 12px`
- Blue glow border: `box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5)`
- Technique: a positioned `<div>` with a massive spread box-shadow to create the backdrop effect, with `border-radius` to create the rounded cutout

### 4.3 Tooltip bubble

- `background: #fff`
- `border-radius: 12px`
- `box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2)`
- `padding: 24px`
- `max-width: 360px`
- 8px CSS arrow pointing toward the spotlight
- Content: title (18px semibold), description (14px regular), action buttons
- Button style: reuses existing `--accent` blue for primary, gray outline for secondary

### 4.4 Progress indicator

- Horizontal dots at the bottom of the tooltip
- Current step: solid blue `●`
- Other steps: gray outline `○`
- 4 dots total

### 4.5 Animations

- Step transitions: spotlight and tooltip animate position/size with `transition: all 300ms ease`
- Backdrop fade-in: `opacity 0 → 1` over 200ms
- Tooltip entrance: `opacity` + slight `translateY` over 200ms
- On complete: all elements fade out over 300ms

---

## 5. Internationalization

All copy lives in existing locale files under `onboarding` namespace:

```json
{
  "onboarding": {
    "welcome": {
      "title": "Welcome to OpenTypeless",
      "description": "Press a shortcut, speak, and your words appear wherever you're typing.",
      "cta": "Get Started"
    },
    "permissions": {
      "title": "Grant Permissions",
      "description": "OpenTypeless needs microphone access to hear you and accessibility access to type for you.",
      "micGranted": "Microphone: Granted",
      "micMissing": "Microphone: Not granted",
      "accGranted": "Accessibility: Granted",
      "accMissing": "Accessibility: Not granted",
      "hint": "Click the Grant buttons above."
    },
    "shortcuts": {
      "title": "Your Shortcut",
      "description": "Press {{shortcut}} anywhere to start recording. Press again to stop.",
      "cta": "Got it"
    },
    "tryit": {
      "title": "Let's Try It!",
      "description": "Press {{shortcut}} now and say something.",
      "waiting": "Waiting for you to press the shortcut...",
      "recording": "Recording... press {{shortcut}} again to stop.",
      "processing": "Processing your voice...",
      "success": "You're All Set!",
      "successDescription": "Your first dictation worked perfectly.",
      "cta": "Start Using"
    },
    "skip": "Skip",
    "skipAll": "Skip setup",
    "next": "Next",
    "back": "Back",
    "restartGuide": "Restart Guide"
  }
}
```

---

## 6. Settings Integration

### "Restart Guide" button

- Location: Settings page, below the existing sections (or in a new "Help" section)
- Behavior: Clears `onboarding-completed` from localStorage, re-initializes OnboardingController
- The button is always visible regardless of onboarding state

### Permission loss modal (independent)

- A simple centered modal (not coach-marks style)
- Shows which permission(s) are missing
- "Open System Settings" button that calls existing permission request IPCs
- "Dismiss" button to close (user accepts the risk)
- Triggered by main process via `desktop:attention` IPC whenever a recording attempt fails due to missing permissions
