import { contextBridge, ipcRenderer } from 'electron';

import {
  ipcChannels,
  type CompleteDictationResult,
  type DesktopAttentionEvent,
  type DesktopPermissionKind,
  type DesktopStatus,
  type DictationSession,
  type OpenTypelessBridge,
  type RecordingCommand,
  type RuntimeInfo,
  type SaveCapturedAudioInput,
  type SentMessage
} from '../shared/ipc';

const bridge: OpenTypelessBridge = {
  getRuntimeInfo: () => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  getDesktopStatus: () => ipcRenderer.invoke(ipcChannels.getDesktopStatus) as Promise<DesktopStatus>,
  requestMicrophonePermission: () => ipcRenderer.invoke(ipcChannels.requestMicrophonePermission) as Promise<boolean>,
  requestAccessibilityPermission: () => ipcRenderer.invoke(ipcChannels.requestAccessibilityPermission) as Promise<boolean>,
  openPermissionSettings: (kind: DesktopPermissionKind) => ipcRenderer.invoke(ipcChannels.openPermissionSettings, kind) as Promise<void>,
  listDictationSessions: () => ipcRenderer.invoke(ipcChannels.listDictationSessions) as Promise<DictationSession[]>,
  getDictationSession: (sessionId: string) =>
    ipcRenderer.invoke(ipcChannels.getDictationSession, sessionId) as Promise<DictationSession | null>,
  saveCapturedAudio: (input: SaveCapturedAudioInput) =>
    ipcRenderer.invoke(ipcChannels.saveCapturedAudio, input) as Promise<DictationSession>,
  processDictationSession: (sessionId: string) =>
    ipcRenderer.invoke(ipcChannels.processDictationSession, sessionId) as Promise<DictationSession>,
  completeDictationSession: (sessionId: string) =>
    ipcRenderer.invoke(ipcChannels.completeDictationSession, sessionId) as Promise<CompleteDictationResult>,
  listSentMessages: () => ipcRenderer.invoke(ipcChannels.listSentMessages) as Promise<SentMessage[]>,
  onRecordingCommand: (callback: (command: RecordingCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: RecordingCommand) => callback(command);
    ipcRenderer.on(ipcChannels.recordingCommand, listener);
    return () => {
      ipcRenderer.removeListener(ipcChannels.recordingCommand, listener);
    };
  },
  onDesktopAttention: (callback: (event: DesktopAttentionEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: DesktopAttentionEvent) => callback(event);
    ipcRenderer.on(ipcChannels.desktopAttention, listener);
    return () => {
      ipcRenderer.removeListener(ipcChannels.desktopAttention, listener);
    };
  }
};

contextBridge.exposeInMainWorld('opentypeless', bridge);
