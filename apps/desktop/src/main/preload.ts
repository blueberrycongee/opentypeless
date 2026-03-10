import { contextBridge, ipcRenderer } from 'electron';

import {
  ipcChannels,
  type DictationSession,
  type OpenTypelessBridge,
  type RuntimeInfo,
  type SaveCapturedAudioInput
} from '../shared/ipc';

const bridge: OpenTypelessBridge = {
  getRuntimeInfo: () => ipcRenderer.invoke(ipcChannels.getRuntimeInfo) as Promise<RuntimeInfo>,
  listDictationSessions: () => ipcRenderer.invoke(ipcChannels.listDictationSessions) as Promise<DictationSession[]>,
  saveCapturedAudio: (input: SaveCapturedAudioInput) =>
    ipcRenderer.invoke(ipcChannels.saveCapturedAudio, input) as Promise<DictationSession>
};

contextBridge.exposeInMainWorld('opentypeless', bridge);
