import { app, BrowserWindow, globalShortcut, ipcMain, screen } from 'electron';
import { join } from 'node:path';

import { createLocalAiPipelineDeps } from './ai/local-ai';
import { buildRuntimeInfo } from './core/runtime-info';
import { createMacOsDesktopIntegration } from './desktop/macos-desktop-integration';
import { createWorkflowController } from './desktop/workflow-controller';
import {
  createOverlayManager,
  type OverlayManager,
  type OverlayWindow,
} from './overlay/overlay-manager';
import { createDictationPipeline } from './pipeline/dictation-pipeline';
import type { PipelineProgressStep } from './pipeline/dictation-pipeline';
import {
  ipcChannels,
  type CompleteDictationResult,
  type DesktopAttentionEvent,
  type DesktopPermissionKind,
  type DesktopStatus,
  type OverlayAction,
  type OverlayStep,
  type RecordingCommand,
  type SaveCapturedAudioInput,
} from '../shared/ipc';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const OVERLAY_WEBPACK_ENTRY: string;
declare const OVERLAY_PRELOAD_WEBPACK_ENTRY: string;

const shortcuts = {
  startRecording: 'CommandOrControl+Shift+;',
  stopRecording: "CommandOrControl+Shift+'",
} as const;

const OVERLAY_WIDTH = 280;
const OVERLAY_TOP_OFFSET = 64;

const PIPELINE_STEP_MAP: Record<PipelineProgressStep, OverlayStep> = {
  transcribing: 'transcribing',
  rewriting: 'rewriting',
  inserting: 'inserting',
};

let mainWindow: BrowserWindow | null = null;
let overlayManager: OverlayManager | null = null;
let pendingCancel = false;

if (require('electron-squirrel-startup')) {
  app.quit();
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 1040,
    minHeight: 720,
    title: 'OpenTypeless',
    backgroundColor: '#f7f6f3',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void window.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  mainWindow = window;
  return window;
}

function getMainWindow(): BrowserWindow {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return createMainWindow();
  }

  return mainWindow;
}

function createOverlayBrowserWindow(): OverlayWindow {
  const { workArea } = screen.getPrimaryDisplay();
  const x = Math.round(workArea.x + (workArea.width - OVERLAY_WIDTH) / 2);
  const y = workArea.y + OVERLAY_TOP_OFFSET;

  const win = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: 44,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: OVERLAY_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void win.loadURL(OVERLAY_WEBPACK_ENTRY);

  win.setVisibleOnAllWorkspaces(true);
  if (process.platform === 'darwin') {
    win.setAlwaysOnTop(true, 'floating');
  }

  return {
    sendState(state) {
      if (!win.isDestroyed()) {
        win.webContents.send(ipcChannels.overlayState, state);
      }
    },
    show() {
      if (!win.isDestroyed()) win.showInactive();
    },
    hide() {
      if (!win.isDestroyed()) win.hide();
    },
    destroy() {
      if (!win.isDestroyed()) win.close();
    },
    setFocusable(value) {
      if (!win.isDestroyed()) win.setFocusable(value);
    },
    focus() {
      if (!win.isDestroyed()) win.focus();
    },
    setHeight(height) {
      if (!win.isDestroyed()) {
        const [w] = win.getSize();
        win.setSize(w, height);
      }
    },
    isDestroyed() {
      return win.isDestroyed();
    },
  };
}

function registerIpcHandlers(): void {
  const dataRoot = join(app.getPath('userData'), 'dictation');

  const overlay = createOverlayManager({
    createWindow: createOverlayBrowserWindow,
  });
  overlayManager = overlay;

  const localAiDeps = createLocalAiPipelineDeps(dataRoot);
  const pipeline = createDictationPipeline(dataRoot, {
    ...localAiDeps,
    onProgress(step) {
      if (overlay.isActive()) {
        overlay.updateProcessingStep(PIPELINE_STEP_MAP[step], 'active');
      }
    },
  });

  const desktop = createMacOsDesktopIntegration();
  const workflow = createWorkflowController({
    detectTargetApp: desktop.detectTargetApp,
    processSession: (sessionId) => pipeline.processSession(sessionId),
    insertText: desktop.insertTextIntoTarget,
  });

  ipcMain.on(ipcChannels.overlayAction, (_event, action: OverlayAction) => {
    overlay.handleRendererAction(action);
  });

  overlay.onAction((action) => {
    const window = getMainWindow();
    switch (action.kind) {
      case 'stop':
        sendRecordingCommand(window, 'stop');
        break;
      case 'cancel':
        pendingCancel = true;
        overlay.hide();
        sendRecordingCommand(window, 'cancel');
        break;
      case 'dismiss':
        overlay.hide();
        break;
    }
  });

  ipcMain.handle(ipcChannels.getRuntimeInfo, () => buildRuntimeInfo(process.platform));
  ipcMain.handle(ipcChannels.getDesktopStatus, () =>
    buildDesktopStatus(desktop, workflow, overlay),
  );
  ipcMain.handle(ipcChannels.requestMicrophonePermission, async () => {
    const granted = await desktop.requestMicrophonePermission();
    getMainWindow().show();
    return granted;
  });
  ipcMain.handle(ipcChannels.requestAccessibilityPermission, () => {
    const granted = desktop.requestAccessibilityPermission();
    getMainWindow().show();
    return granted;
  });
  ipcMain.handle(ipcChannels.openPermissionSettings, (_event, kind: DesktopPermissionKind) =>
    desktop.openPermissionSettings(kind),
  );
  ipcMain.handle(ipcChannels.listDictationSessions, () => pipeline.listSessions());
  ipcMain.handle(ipcChannels.getDictationSession, (_event, sessionId: string) =>
    pipeline.getSession(sessionId),
  );
  ipcMain.handle(ipcChannels.listSentMessages, () => pipeline.listSentMessages());
  ipcMain.handle(ipcChannels.saveCapturedAudio, (_event, input: SaveCapturedAudioInput) =>
    pipeline.saveCapturedAudio(input),
  );
  ipcMain.handle(ipcChannels.processDictationSession, (_event, sessionId: string) =>
    pipeline.processSession(sessionId),
  );
  ipcMain.handle(ipcChannels.completeDictationSession, async (_event, sessionId: string) => {
    if (pendingCancel) {
      pendingCancel = false;
      const session = await pipeline.getSession(sessionId);
      return {
        inserted: false,
        targetAppName: null,
        processed: session!,
      } satisfies CompleteDictationResult;
    }

    overlay.transitionToProcessing();

    try {
      const result = await workflow.processAndInsertSession(sessionId);
      const completionResult = {
        inserted: result.inserted,
        targetAppName: result.target?.appName ?? null,
        processed: result.processed,
      } satisfies CompleteDictationResult;

      overlay.transitionToSuccess(completionResult.targetAppName);
      return completionResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      overlay.transitionToError(message);
      throw error;
    }
  });

  registerGlobalShortcuts(desktop, workflow, overlay);
}

function registerGlobalShortcuts(
  desktop: ReturnType<typeof createMacOsDesktopIntegration>,
  workflow: ReturnType<typeof createWorkflowController>,
  overlay: OverlayManager,
): void {
  globalShortcut.unregisterAll();

  globalShortcut.register(shortcuts.startRecording, async () => {
    if (overlay.isActive()) {
      sendRecordingCommand(getMainWindow(), 'stop');
      return;
    }

    const window = getMainWindow();
    const permissions = desktop.getPermissionState();
    const missing = getMissingPermissions(permissions);
    if (missing.length > 0) {
      window.show();
      window.focus();
      sendDesktopAttention(window, {
        kind: 'permission-required',
        missing,
      });
      return;
    }

    await workflow.beginCapture();
    overlay.showRecording();
    sendRecordingCommand(window, 'start');
  });

  globalShortcut.register(shortcuts.stopRecording, () => {
    if (overlay.isActive()) {
      sendRecordingCommand(getMainWindow(), 'stop');
      return;
    }
    sendRecordingCommand(getMainWindow(), 'stop');
  });
}

function sendRecordingCommand(window: BrowserWindow, command: RecordingCommand): void {
  window.webContents.send(ipcChannels.recordingCommand, command);
}

function sendDesktopAttention(window: BrowserWindow, event: DesktopAttentionEvent): void {
  window.webContents.send(ipcChannels.desktopAttention, event);
}

function getMissingPermissions(permissions: DesktopStatus['permissions']): DesktopPermissionKind[] {
  const missing: DesktopPermissionKind[] = [];

  if (permissions.microphone !== 'granted') {
    missing.push('microphone');
  }

  if (permissions.accessibility !== 'granted') {
    missing.push('accessibility');
  }

  return missing;
}

function buildDesktopStatus(
  desktop: ReturnType<typeof createMacOsDesktopIntegration>,
  workflow: ReturnType<typeof createWorkflowController>,
  overlay: OverlayManager,
): DesktopStatus {
  return {
    permissions: desktop.getPermissionState(),
    shortcuts,
    activeTargetAppName: workflow.getActiveTarget()?.appName ?? null,
    overlayActive: overlay.isActive(),
  };
}

app.whenReady().then(() => {
  createMainWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    getMainWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  overlayManager?.destroy();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
