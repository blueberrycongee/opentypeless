import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { join } from 'node:path';

import { createLocalAiPipelineDeps } from './ai/local-ai';
import { buildRuntimeInfo } from './core/runtime-info';
import { createMacOsDesktopIntegration } from './desktop/macos-desktop-integration';
import { createWorkflowController } from './desktop/workflow-controller';
import { createDictationPipeline } from './pipeline/dictation-pipeline';
import {
  ipcChannels,
  type CompleteDictationResult,
  type DesktopAttentionEvent,
  type DesktopPermissionKind,
  type DesktopStatus,
  type RecordingCommand,
  type SaveCapturedAudioInput
} from '../shared/ipc';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

const shortcuts = {
  startRecording: 'CommandOrControl+Shift+;',
  stopRecording: 'CommandOrControl+Shift+\''
} as const;

let mainWindow: BrowserWindow | null = null;

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
    backgroundColor: '#f3efe5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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

function registerIpcHandlers(): void {
  const dataRoot = join(app.getPath('userData'), 'dictation');
  const pipeline = createDictationPipeline(dataRoot, createLocalAiPipelineDeps(dataRoot));
  const desktop = createMacOsDesktopIntegration();
  const workflow = createWorkflowController({
    detectTargetApp: desktop.detectTargetApp,
    processSession: (sessionId) => pipeline.processSession(sessionId),
    insertText: desktop.insertTextIntoTarget
  });

  ipcMain.handle(ipcChannels.getRuntimeInfo, () => buildRuntimeInfo(process.platform));
  ipcMain.handle(ipcChannels.getDesktopStatus, () => buildDesktopStatus(desktop, workflow));
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
  ipcMain.handle(ipcChannels.openPermissionSettings, (_event, kind: DesktopPermissionKind) => desktop.openPermissionSettings(kind));
  ipcMain.handle(ipcChannels.listDictationSessions, () => pipeline.listSessions());
  ipcMain.handle(ipcChannels.getDictationSession, (_event, sessionId: string) => pipeline.getSession(sessionId));
  ipcMain.handle(ipcChannels.listSentMessages, () => pipeline.listSentMessages());
  ipcMain.handle(ipcChannels.saveCapturedAudio, (_event, input: SaveCapturedAudioInput) => pipeline.saveCapturedAudio(input));
  ipcMain.handle(ipcChannels.processDictationSession, (_event, sessionId: string) => pipeline.processSession(sessionId));
  ipcMain.handle(ipcChannels.completeDictationSession, async (_event, sessionId: string) => {
    const result = await workflow.processAndInsertSession(sessionId);
    return {
      inserted: result.inserted,
      targetAppName: result.target?.appName ?? null,
      processed: result.processed
    } satisfies CompleteDictationResult;
  });

  registerGlobalShortcuts(desktop, workflow);
}

function registerGlobalShortcuts(
  desktop: ReturnType<typeof createMacOsDesktopIntegration>,
  workflow: ReturnType<typeof createWorkflowController>
): void {
  globalShortcut.unregisterAll();

  globalShortcut.register(shortcuts.startRecording, async () => {
    const window = getMainWindow();
    const permissions = desktop.getPermissionState();
    const missing = getMissingPermissions(permissions);
    if (missing.length > 0) {
      window.show();
      window.focus();
      sendDesktopAttention(window, {
        kind: 'permission-required',
        missing
      });
      return;
    }

    await workflow.beginCapture();
    sendRecordingCommand(window, 'start');
  });

  globalShortcut.register(shortcuts.stopRecording, () => {
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
  workflow: ReturnType<typeof createWorkflowController>
): DesktopStatus {
  return {
    permissions: desktop.getPermissionState(),
    shortcuts,
    activeTargetAppName: workflow.getActiveTarget()?.appName ?? null
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
