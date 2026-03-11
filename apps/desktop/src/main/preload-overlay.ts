import { contextBridge, ipcRenderer } from 'electron';

import { ipcChannels, type OverlayAction, type OverlayBridge, type OverlayState } from '../shared/ipc';

const bridge: OverlayBridge = {
  onState: (callback: (state: OverlayState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: OverlayState) => callback(state);
    ipcRenderer.on(ipcChannels.overlayState, listener);
    return () => {
      ipcRenderer.removeListener(ipcChannels.overlayState, listener);
    };
  },
  sendAction: (action: OverlayAction) => {
    ipcRenderer.send(ipcChannels.overlayAction, action);
  }
};

contextBridge.exposeInMainWorld('overlayBridge', bridge);
