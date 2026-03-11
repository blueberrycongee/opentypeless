export const ipcChannels = {
  getRuntimeInfo: 'app:get-runtime-info',
  getDesktopStatus: 'desktop:get-status',
  requestMicrophonePermission: 'desktop:request-microphone-permission',
  requestAccessibilityPermission: 'desktop:request-accessibility-permission',
  openPermissionSettings: 'desktop:open-permission-settings',
  listDictationSessions: 'dictation:list-sessions',
  getDictationSession: 'dictation:get-session',
  saveCapturedAudio: 'dictation:save-captured-audio',
  processDictationSession: 'dictation:process-session',
  completeDictationSession: 'dictation:complete-session',
  listSentMessages: 'outbox:list-sent-messages',
  recordingCommand: 'recording:command',
  desktopAttention: 'desktop:attention',
  overlayState: 'overlay:state',
  overlayAction: 'overlay:action'
} as const;

export type ModuleStatus = 'planned' | 'ready' | 'blocked';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';
export type MicrophonePermissionStatus = 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
export type AccessibilityPermissionStatus = 'granted' | 'denied';
export type RecordingCommand = 'start' | 'stop' | 'cancel';
export type DesktopPermissionKind = 'microphone' | 'accessibility';

export interface RuntimeModule {
  id: 'hotkeys' | 'audio' | 'transcription' | 'rewrite' | 'insertion' | 'local-data';
  label: string;
  status: ModuleStatus;
  note: string;
}

export interface RuntimeInfo {
  appName: string;
  platform: NodeJS.Platform;
  modules: RuntimeModule[];
}

export interface DesktopPermissionState {
  microphone: MicrophonePermissionStatus;
  accessibility: AccessibilityPermissionStatus;
}

export interface DesktopStatus {
  permissions: DesktopPermissionState;
  shortcuts: {
    startRecording: string;
    stopRecording: string;
  };
  activeTargetAppName: string | null;
  overlayActive: boolean;
}

export interface DesktopAttentionEvent {
  kind: 'permission-required';
  missing: DesktopPermissionKind[];
}

export interface TranscriptResult {
  text: string;
  model: string;
  completedAt: string;
}

export interface RewriteResult {
  text: string;
  model: string;
  completedAt: string;
}

export interface DeliveryResult {
  channel: string;
  deliveredText: string;
  deliveredAt: string;
}

export interface SentMessage {
  sessionId: string;
  text: string;
  channel: string;
  deliveredAt: string;
}

export interface DictationSession {
  id: string;
  createdAt: string;
  durationMs: number | null;
  source: 'microphone';
  audio: {
    bytes: number;
    fileName: string;
    mimeType: string;
    relativePath: string;
    normalizedRelativePath: string | null;
  };
  pipeline: {
    capture: PipelineStageStatus;
    storage: PipelineStageStatus;
    transcription: PipelineStageStatus;
    rewrite: PipelineStageStatus;
    send: PipelineStageStatus;
  };
  transcript: TranscriptResult | null;
  rewrite: RewriteResult | null;
  delivery: DeliveryResult | null;
  error: string | null;
}

export interface SaveCapturedAudioInput {
  audioBytes: number[];
  durationMs: number | null;
  mimeType: string;
}

export interface CompleteDictationResult {
  inserted: boolean;
  targetAppName: string | null;
  processed: DictationSession;
}

export interface OpenTypelessBridge {
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  getDesktopStatus: () => Promise<DesktopStatus>;
  requestMicrophonePermission: () => Promise<boolean>;
  requestAccessibilityPermission: () => Promise<boolean>;
  openPermissionSettings: (kind: DesktopPermissionKind) => Promise<void>;
  listDictationSessions: () => Promise<DictationSession[]>;
  getDictationSession: (sessionId: string) => Promise<DictationSession | null>;
  saveCapturedAudio: (input: SaveCapturedAudioInput) => Promise<DictationSession>;
  processDictationSession: (sessionId: string) => Promise<DictationSession>;
  completeDictationSession: (sessionId: string) => Promise<CompleteDictationResult>;
  listSentMessages: () => Promise<SentMessage[]>;
  onRecordingCommand: (callback: (command: RecordingCommand) => void) => () => void;
  onDesktopAttention: (callback: (event: DesktopAttentionEvent) => void) => () => void;
}

// ── Overlay types ───────────────────────────────────────────────────

export type OverlayStep = 'transcribing' | 'rewriting' | 'inserting';
export type OverlayStepStatus = 'pending' | 'active' | 'done';

export interface OverlayStateRecording {
  kind: 'recording';
  startedAtIso: string;
}

export interface OverlayStateProcessing {
  kind: 'processing';
  steps: Array<{ id: OverlayStep; status: OverlayStepStatus }>;
}

export interface OverlayStateSuccess {
  kind: 'success';
  targetAppName: string | null;
}

export interface OverlayStateError {
  kind: 'error';
  message: string;
}

export interface OverlayStateHidden {
  kind: 'hidden';
}

export type OverlayState =
  | OverlayStateRecording
  | OverlayStateProcessing
  | OverlayStateSuccess
  | OverlayStateError
  | OverlayStateHidden;

export type OverlayAction =
  | { kind: 'stop' }
  | { kind: 'cancel' }
  | { kind: 'dismiss' }
  | { kind: 'request-focus' };

export interface OverlayBridge {
  onState: (callback: (state: OverlayState) => void) => () => void;
  sendAction: (action: OverlayAction) => void;
}
