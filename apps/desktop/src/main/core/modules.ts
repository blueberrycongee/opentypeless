import type { RuntimeModule } from '../../shared/ipc';

export const plannedModules: RuntimeModule[] = [
  {
    id: 'hotkeys',
    label: 'Global hotkeys',
    status: 'planned',
    note: 'Register push-to-talk and future mode shortcuts.'
  },
  {
    id: 'audio',
    label: 'Audio capture',
    status: 'ready',
    note: 'Microphone capture and raw audio session storage are wired end to end.'
  },
  {
    id: 'transcription',
    label: 'Transcription',
    status: 'ready',
    note: 'Local whisper.cpp transcription runs on saved audio after ffmpeg normalization.'
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    status: 'ready',
    note: 'A local MLX-hosted open-source model cleans transcripts into send-ready messages on Apple Silicon.'
  },
  {
    id: 'insertion',
    label: 'Insertion',
    status: 'planned',
    note: 'System-wide insertion is still pending; this milestone verifies a simulated send outbox.'
  },
  {
    id: 'local-data',
    label: 'Local data',
    status: 'ready',
    note: 'Session manifests, normalized audio paths, transcripts, rewrites, and outbox entries are persisted locally.'
  }
];
