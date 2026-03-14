# Electron Skeleton Implementation Plan

> **Execution note:** Use `executing-plans` to implement this plan task-by-task, or another equivalent execution workflow supported by the current agent runtime.

**Goal:** Add a first runnable Electron desktop-app skeleton under `apps/desktop` that matches the repository's desktop-first architecture direction.

**Architecture:** Use Electron Forge as the application shell, TypeScript for main/preload/renderer code, and a small React renderer for future settings/history surfaces. Keep domain boundaries explicit from the start by splitting desktop-only services, IPC contracts, and UI code. Start with one verified IPC path and placeholder modules for hotkeys, audio, transcription, rewrite, insertion, and local data.

**Tech Stack:** Electron, Electron Forge, TypeScript, React, Webpack, Jest, ESLint

---

### Task 1: Replace the placeholder app directory with an Electron Forge app

**Files:**

- Create: `apps/desktop/package.json`
- Create: `apps/desktop/forge.config.ts`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/webpack.main.config.ts`
- Create: `apps/desktop/webpack.renderer.config.ts`
- Create: `apps/desktop/webpack.rules.ts`
- Create: `apps/desktop/.eslintrc.json`
- Create: `apps/desktop/src/main.ts`
- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/renderer.tsx`
- Modify: `apps/desktop/README.md`

**Step 1: Generate the official Electron Forge TypeScript/Webpack template**
Run: `npm init electron-app@latest apps/desktop -- --template=webpack-typescript`
Expected: Forge scaffolds a runnable Electron app.

**Step 2: Verify the template files exist**
Run: `find apps/desktop -maxdepth 2 -type f | sort`
Expected: package, forge, webpack, tsconfig, and source files are present.

**Step 3: Adapt the scaffold to repository structure and architecture**
Add source folders and naming aligned with OpenTypeless.

**Step 4: Start the app once**
Run: `npm run start --workspace=apps/desktop`
Expected: Dev build succeeds and the Electron shell opens.

### Task 2: Add a typed IPC seam and architecture placeholders with TDD

**Files:**

- Create: `apps/desktop/src/shared/ipc.ts`
- Create: `apps/desktop/src/main/core/runtime-info.ts`
- Create: `apps/desktop/src/main/core/runtime-info.test.ts`
- Create: `apps/desktop/src/main/core/modules.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `apps/desktop/src/preload.ts`
- Modify: `apps/desktop/src/renderer.tsx`

**Step 1: Write a failing test for runtime info shaping**
Add a test that expects app name, platform, and placeholder module states.

**Step 2: Run the test to verify it fails**
Run: `npm test --workspace=apps/desktop -- runtime-info`
Expected: FAIL because the module does not exist yet.

**Step 3: Implement the minimal runtime-info module and IPC contract**
Expose one `window.opentypeless.getRuntimeInfo()` bridge.

**Step 4: Run the test to verify it passes**
Run: `npm test --workspace=apps/desktop -- runtime-info`
Expected: PASS.

### Task 3: Add baseline quality checks and project guidance

**Files:**

- Create: `apps/desktop/jest.config.ts`
- Create: `apps/desktop/jest.setup.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/README.md`
- Optionally create: repository root workspace file if needed

**Step 1: Add scripts for lint, test, package, and dev start**
Keep commands explicit and predictable.

**Step 2: Run the smallest relevant verification**
Run: `npm test --workspace=apps/desktop`
Expected: PASS.

**Step 3: Run lint**
Run: `npm run lint --workspace=apps/desktop`
Expected: PASS.

**Step 4: Document how to run the desktop app**
Describe install, start, test, and current architecture boundaries.
