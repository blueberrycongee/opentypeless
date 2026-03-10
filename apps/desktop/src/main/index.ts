import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

import { buildRuntimeInfo } from './core/runtime-info';
import { createDictationPipeline } from './pipeline/dictation-pipeline';
import { ipcChannels, type SaveCapturedAudioInput } from '../shared/ipc';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

function createMainWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 980,
    minHeight: 640,
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

  void mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

function registerIpcHandlers(): void {
  const pipeline = createDictationPipeline(join(app.getPath('userData'), 'dictation'));

  ipcMain.handle(ipcChannels.getRuntimeInfo, () => buildRuntimeInfo(process.platform));
  ipcMain.handle(ipcChannels.listDictationSessions, () => pipeline.listSessions());
  ipcMain.handle(ipcChannels.saveCapturedAudio, (_event, input: SaveCapturedAudioInput) => pipeline.saveCapturedAudio(input));
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
