import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DictationSession, SaveCapturedAudioInput } from '../../shared/ipc';

export interface DictationPipeline {
  listSessions: () => Promise<DictationSession[]>;
  saveCapturedAudio: (input: SaveCapturedAudioInput) => Promise<DictationSession>;
}

const AUDIO_DIR = 'audio';
const SESSION_DIR = 'sessions';

export function createDictationPipeline(dataRoot: string): DictationPipeline {
  return {
    async saveCapturedAudio(input: SaveCapturedAudioInput): Promise<DictationSession> {
      if (input.audioBytes.length === 0) {
        throw new Error('Cannot store an empty recording.');
      }

      await ensureStorage(dataRoot);

      const id = randomUUID();
      const createdAt = new Date().toISOString();
      const extension = extensionForMimeType(input.mimeType);
      const fileName = `${createdAt.replace(/[:.]/g, '-')}-${id}${extension}`;
      const relativePath = join(AUDIO_DIR, fileName);

      const session: DictationSession = {
        id,
        createdAt,
        durationMs: input.durationMs,
        source: 'microphone',
        audio: {
          bytes: input.audioBytes.length,
          fileName,
          mimeType: input.mimeType,
          relativePath
        },
        pipeline: {
          capture: 'completed',
          storage: 'completed',
          transcription: 'pending',
          rewrite: 'pending'
        }
      };

      await writeFile(join(dataRoot, relativePath), Buffer.from(input.audioBytes));
      await writeFile(join(dataRoot, SESSION_DIR, `${session.id}.json`), `${JSON.stringify(session, null, 2)}\n`);

      return session;
    },

    async listSessions(): Promise<DictationSession[]> {
      await ensureStorage(dataRoot);

      const names = await readdir(join(dataRoot, SESSION_DIR));
      const manifests = await Promise.all(
        names
          .filter((name) => name.endsWith('.json'))
          .map(async (name) => {
            const contents = await readFile(join(dataRoot, SESSION_DIR, name), 'utf8');
            return JSON.parse(contents) as DictationSession;
          })
      );

      return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }
  };
}

async function ensureStorage(dataRoot: string): Promise<void> {
  await Promise.all([
    mkdir(join(dataRoot, AUDIO_DIR), { recursive: true }),
    mkdir(join(dataRoot, SESSION_DIR), { recursive: true })
  ]);
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) {
    return '.webm';
  }

  if (mimeType.includes('wav')) {
    return '.wav';
  }

  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    return '.m4a';
  }

  return '.bin';
}
