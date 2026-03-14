import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  DeliveryResult,
  DictationSession,
  SaveCapturedAudioInput,
  SentMessage,
} from '../../shared/ipc';

export type PipelineProgressStep = 'transcribing' | 'rewriting' | 'inserting';

export interface DictationPipelineDeps {
  transcribeAudio?: (
    audioRelativePath: string,
    session: DictationSession,
  ) => Promise<{
    transcript: string;
    normalizedAudioRelativePath: string | null;
    model?: string;
  }>;
  rewriteTranscript?: (
    transcript: string,
    session: DictationSession,
  ) => Promise<
    | {
        text: string;
        model?: string;
      }
    | string
  >;
  simulateSend?: (message: string, session: DictationSession) => Promise<DeliveryResult>;
  onProgress?: (step: PipelineProgressStep) => void;
  now?: () => string;
}

export interface DictationPipeline {
  listSessions: () => Promise<DictationSession[]>;
  getSession: (sessionId: string) => Promise<DictationSession | null>;
  listSentMessages: () => Promise<SentMessage[]>;
  saveCapturedAudio: (input: SaveCapturedAudioInput) => Promise<DictationSession>;
  processSession: (sessionId: string) => Promise<DictationSession>;
}

const AUDIO_DIR = 'audio';
const DERIVED_DIR = 'derived';
const OUTBOX_DIR = 'outbox';
const OUTBOX_FILE = 'messages.json';
const SESSION_DIR = 'sessions';

export function createDictationPipeline(
  dataRoot: string,
  deps: DictationPipelineDeps = {},
): DictationPipeline {
  const now = deps.now ?? (() => new Date().toISOString());

  return {
    async saveCapturedAudio(input: SaveCapturedAudioInput): Promise<DictationSession> {
      if (input.audioBytes.length === 0) {
        throw new Error('Cannot store an empty recording.');
      }

      await ensureStorage(dataRoot);

      const id = randomUUID();
      const createdAt = now();
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
          relativePath,
          normalizedRelativePath: null,
        },
        pipeline: {
          capture: 'completed',
          storage: 'completed',
          transcription: 'pending',
          rewrite: 'pending',
          send: 'pending',
        },
        transcript: null,
        rewrite: null,
        delivery: null,
        error: null,
      };

      await writeFile(join(dataRoot, relativePath), Buffer.from(input.audioBytes));
      await persistSession(dataRoot, session);

      return session;
    },

    async processSession(sessionId: string): Promise<DictationSession> {
      if (!deps.transcribeAudio || !deps.rewriteTranscript || !deps.simulateSend) {
        throw new Error('Dictation pipeline dependencies are not configured.');
      }

      const existing = await readSession(dataRoot, sessionId);
      if (!existing) {
        throw new Error(`Session ${sessionId} was not found.`);
      }

      let session: DictationSession = {
        ...existing,
        error: null,
        pipeline: {
          ...existing.pipeline,
          transcription: 'running',
          rewrite: 'pending',
          send: 'pending',
        },
      };
      await persistSession(dataRoot, session);

      try {
        deps.onProgress?.('transcribing');
        const transcription = await deps.transcribeAudio(existing.audio.relativePath, existing);
        session = {
          ...session,
          audio: {
            ...session.audio,
            normalizedRelativePath: transcription.normalizedAudioRelativePath,
          },
          transcript: {
            text: transcription.transcript,
            model: transcription.model ?? 'local-stt',
            completedAt: now(),
          },
          pipeline: {
            ...session.pipeline,
            transcription: 'completed',
            rewrite: 'running',
          },
        };
        await persistSession(dataRoot, session);

        deps.onProgress?.('rewriting');
        const rewritten = await deps.rewriteTranscript(transcription.transcript, session);
        const rewrittenText = typeof rewritten === 'string' ? rewritten : rewritten.text;
        const rewrittenModel =
          typeof rewritten === 'string' ? 'local-rewrite' : (rewritten.model ?? 'local-rewrite');
        session = {
          ...session,
          rewrite: {
            text: rewrittenText,
            model: rewrittenModel,
            completedAt: now(),
          },
          pipeline: {
            ...session.pipeline,
            rewrite: 'completed',
            send: 'running',
          },
        };
        await persistSession(dataRoot, session);

        deps.onProgress?.('inserting');
        const delivery = await deps.simulateSend(rewrittenText, session);
        session = {
          ...session,
          delivery,
          pipeline: {
            ...session.pipeline,
            send: 'completed',
          },
        };
        await persistSession(dataRoot, session);
        await appendOutbox(dataRoot, {
          sessionId: session.id,
          text: delivery.deliveredText,
          channel: delivery.channel,
          deliveredAt: delivery.deliveredAt,
        });

        return session;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        session = {
          ...session,
          error: message,
          pipeline: {
            ...session.pipeline,
            transcription:
              session.pipeline.transcription === 'running'
                ? 'failed'
                : session.pipeline.transcription,
            rewrite: session.pipeline.rewrite === 'running' ? 'failed' : session.pipeline.rewrite,
            send: session.pipeline.send === 'running' ? 'failed' : session.pipeline.send,
          },
        };
        await persistSession(dataRoot, session);
        throw error;
      }
    },

    async getSession(sessionId: string): Promise<DictationSession | null> {
      await ensureStorage(dataRoot);
      return readSession(dataRoot, sessionId);
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
          }),
      );

      return manifests.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },

    async listSentMessages(): Promise<SentMessage[]> {
      await ensureStorage(dataRoot);
      return readOutbox(dataRoot);
    },
  };
}

async function ensureStorage(dataRoot: string): Promise<void> {
  await Promise.all([
    mkdir(join(dataRoot, AUDIO_DIR), { recursive: true }),
    mkdir(join(dataRoot, DERIVED_DIR), { recursive: true }),
    mkdir(join(dataRoot, OUTBOX_DIR), { recursive: true }),
    mkdir(join(dataRoot, SESSION_DIR), { recursive: true }),
  ]);
}

async function persistSession(dataRoot: string, session: DictationSession): Promise<void> {
  await writeFile(
    join(dataRoot, SESSION_DIR, `${session.id}.json`),
    `${JSON.stringify(session, null, 2)}\n`,
  );
}

async function readSession(dataRoot: string, sessionId: string): Promise<DictationSession | null> {
  try {
    const contents = await readFile(join(dataRoot, SESSION_DIR, `${sessionId}.json`), 'utf8');
    return JSON.parse(contents) as DictationSession;
  } catch {
    return null;
  }
}

async function readOutbox(dataRoot: string): Promise<SentMessage[]> {
  try {
    const contents = await readFile(join(dataRoot, OUTBOX_DIR, OUTBOX_FILE), 'utf8');
    return JSON.parse(contents) as SentMessage[];
  } catch {
    return [];
  }
}

async function appendOutbox(dataRoot: string, sentMessage: SentMessage): Promise<void> {
  const existing = await readOutbox(dataRoot);
  existing.unshift(sentMessage);
  await writeFile(
    join(dataRoot, OUTBOX_DIR, OUTBOX_FILE),
    `${JSON.stringify(existing, null, 2)}\n`,
  );
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
