import type { OpenTypelessBridge } from '../shared/ipc';

declare global {
  interface Window {
    opentypeless: OpenTypelessBridge;
  }
}

export {};
