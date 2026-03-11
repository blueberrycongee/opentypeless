import type { OverlayBridge } from '../../shared/ipc';

declare global {
  interface Window {
    overlayBridge: OverlayBridge;
  }
}

export {};
