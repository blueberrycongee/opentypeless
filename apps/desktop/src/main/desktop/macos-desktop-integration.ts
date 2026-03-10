import { app, clipboard, systemPreferences } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { TargetApp } from './workflow-controller';
import type { DesktopPermissionState } from '../../shared/ipc';

const execFileAsync = promisify(execFile);

export interface DesktopIntegration {
  getPermissionState: () => DesktopPermissionState;
  requestMicrophonePermission: () => Promise<boolean>;
  requestAccessibilityPermission: () => boolean;
  openPermissionSettings: (kind: 'microphone' | 'accessibility') => Promise<void>;
  detectTargetApp: () => Promise<TargetApp | null>;
  insertTextIntoTarget: (text: string, target: TargetApp) => Promise<void>;
}

export function createMacOsDesktopIntegration(): DesktopIntegration {
  return {
    getPermissionState(): DesktopPermissionState {
      return {
        microphone: systemPreferences.getMediaAccessStatus('microphone'),
        accessibility: systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied'
      };
    },

    requestMicrophonePermission(): Promise<boolean> {
      return systemPreferences.askForMediaAccess('microphone');
    },

    requestAccessibilityPermission(): boolean {
      return systemPreferences.isTrustedAccessibilityClient(true);
    },

    async openPermissionSettings(kind: 'microphone' | 'accessibility'): Promise<void> {
      const url =
        kind === 'microphone'
          ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
          : 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
      await execFileAsync('open', [url]);
    },

    async detectTargetApp(): Promise<TargetApp | null> {
      const script = [
        'tell application "System Events"',
        '  set frontApp to first application process whose frontmost is true',
        '  return (name of frontApp) & "||" & (bundle identifier of frontApp) & "||" & (unix id of frontApp as text)',
        'end tell'
      ].join('\n');

      try {
        const { stdout } = await execFileAsync('osascript', ['-e', script]);
        return parseDetectedTargetApp(stdout, process.pid, app.getName());
      } catch {
        return null;
      }
    },

    async insertTextIntoTarget(text: string, target: TargetApp): Promise<void> {
      const previousClipboard = clipboard.readText();
      clipboard.writeText(text);

      const script = [
        `tell application id "${escapeAppleScriptString(target.bundleId)}" to activate`,
        'delay 0.2',
        'tell application "System Events"',
        '  keystroke "v" using command down',
        'end tell'
      ].join('\n');

      try {
        await execFileAsync('osascript', ['-e', script]);
      } finally {
        setTimeout(() => {
          clipboard.writeText(previousClipboard);
        }, 800);
      }
    }
  };
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function parseDetectedTargetApp(stdout: string, currentPid: number, currentAppName = 'OpenTypeless'): TargetApp | null {
  const [appName, bundleId, pidText] = stdout.trim().split('||');
  const targetPid = Number(pidText);

  if (!appName || !bundleId) {
    return null;
  }

  if (!Number.isNaN(targetPid) && targetPid === currentPid) {
    return null;
  }

  if (appName === currentAppName) {
    return null;
  }

  return { appName, bundleId };
}
