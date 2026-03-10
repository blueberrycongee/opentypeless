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
    status: 'planned',
    note: 'Next step: plug a speech-to-text model into the saved raw audio pipeline.'
  },
  {
    id: 'rewrite',
    label: 'Rewrite',
    status: 'planned',
    note: 'Next step: send raw transcript into a cleanup and rewrite model.'
  },
  {
    id: 'insertion',
    label: 'Insertion',
    status: 'planned',
    note: 'Return final text to the focused desktop app.'
  },
  {
    id: 'local-data',
    label: 'Local data',
    status: 'ready',
    note: 'Session manifests and raw audio files are persisted under the app data directory.'
  }
];
