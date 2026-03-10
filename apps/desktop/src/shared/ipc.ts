export const ipcChannels = {
  getRuntimeInfo: 'app:get-runtime-info',
  listDictationSessions: 'dictation:list-sessions',
  getDictationSession: 'dictation:get-session',
  saveCapturedAudio: 'dictation:save-captured-audio',
  processDictationSession: 'dictation:process-session',
  listSentMessages: 'outbox:list-sent-messages'
} as const;

export type ModuleStatus = 'planned' | 'ready' | 'blocked';
export type PipelineStageStatus = 'pending' | 'running' | 'completed' | 'failed';

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

export interface OpenTypelessBridge {
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  listDictationSessions: () => Promise<DictationSession[]>;
  getDictationSession: (sessionId: string) => Promise<DictationSession | null>;
  saveCapturedAudio: (input: SaveCapturedAudioInput) => Promise<DictationSession>;
  processDictationSession: (sessionId: string) => Promise<DictationSession>;
  listSentMessages: () => Promise<SentMessage[]>;
}
