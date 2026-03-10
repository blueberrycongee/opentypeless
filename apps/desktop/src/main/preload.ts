import { contextBridge, ipcRenderer } from 'electron';

import {
  ipcChannels,
  type DictationSession,
  type OpenTypelessBridge,
  type RuntimeInfo,
  type SaveCapturedAudioInput,
  type SentMessage
} from '../shared/ipc';

const bridge: OpenTypelessBridge = {
  getRuntimeInfo: () => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  listDictationSessions: () => ipcRenderer.invoke(ipcChannels.listDictationSessions) as Promise<DictationSession[]>,
  getDictationSession: (sessionId: string) =>
    ipcRenderer.invoke(ipcChannels.getDictationSession, sessionId) as Promise<DictationSession | null>,
  saveCapturedAudio: (input: SaveCapturedAudioInput) =>
    ipcRenderer.invoke(ipcChannels.saveCapturedAudio, input) as Promise<DictationSession>,
  processDictationSession: (sessionId: string) =>
    ipcRenderer.invoke(ipcChannels.processDictationSession, sessionId) as Promise<DictationSession>,
  listSentMessages: () => ipcRenderer.invoke(ipcChannels.listSentMessages) as Promise<SentMessage[]>
};

contextBridge.exposeInMainWorld('opentypeless', bridge);
