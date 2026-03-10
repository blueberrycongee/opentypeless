export const ipcChannels = {
  getRuntimeInfo: 'app:get-runtime-info',
  listDictationSessions: 'dictation:list-sessions',
  saveCapturedAudio: 'dictation:save-captured-audio'
} as const;

export type ModuleStatus = 'planned' | 'ready' | 'blocked';
export type PipelineStageStatus = 'pending' | 'completed' | 'failed';

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
  };
  pipeline: {
    capture: PipelineStageStatus;
    storage: PipelineStageStatus;
    transcription: PipelineStageStatus;
    rewrite: PipelineStageStatus;
  };
}

export interface SaveCapturedAudioInput {
  audioBytes: number[];
  durationMs: number | null;
  mimeType: string;
}

export interface OpenTypelessBridge {
  getRuntimeInfo: () => Promise<RuntimeInfo>;
  listDictationSessions: () => Promise<DictationSession[]>;
  saveCapturedAudio: (input: SaveCapturedAudioInput) => Promise<DictationSession>;
}
