import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDictationPipeline, type PipelineProgressStep } from './dictation-pipeline';

test('saveCapturedAudio stores raw audio and a queued pipeline manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opentypeless-pipeline-'));
  const pipeline = createDictationPipeline(root);

  const session = await pipeline.saveCapturedAudio({
    audioBytes: [1, 2, 3, 4, 5],
    durationMs: 1250,
    mimeType: 'audio/webm'
  });

  assert.equal(session.audio.bytes, 5);
  assert.equal(session.audio.mimeType, 'audio/webm');
  assert.equal(session.durationMs, 1250);
  assert.equal(session.pipeline.capture, 'completed');
  assert.equal(session.pipeline.storage, 'completed');
  assert.equal(session.pipeline.transcription, 'pending');
  assert.equal(session.pipeline.rewrite, 'pending');
  assert.equal(session.pipeline.send, 'pending');

  const audioFile = await readFile(join(root, session.audio.relativePath));
  assert.deepEqual([...audioFile], [1, 2, 3, 4, 5]);

  const manifestFile = await readFile(join(root, 'sessions', `${session.id}.json`), 'utf8');
  const manifest = JSON.parse(manifestFile) as { id: string; pipeline: { transcription: string; send: string } };
  assert.equal(manifest.id, session.id);
  assert.equal(manifest.pipeline.transcription, 'pending');
  assert.equal(manifest.pipeline.send, 'pending');
});

test('processSession runs transcription, rewrite, and simulated send in order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opentypeless-pipeline-'));
  const pipeline = createDictationPipeline(root, {
    transcribeAudio: async (audioPath) => {
      assert.match(audioPath, /audio\//);
      return {
        transcript: 'hey sam lets meet at noon',
        normalizedAudioRelativePath: 'derived/example.wav'
      };
    },
    rewriteTranscript: async (transcript) => {
      assert.equal(transcript, 'hey sam lets meet at noon');
      return 'Hey Sam, let\'s meet at noon.';
    },
    simulateSend: async (message) => {
      assert.equal(message, 'Hey Sam, let\'s meet at noon.');
      return {
        channel: 'simulated-chat',
        deliveredText: message,
        deliveredAt: '2026-03-10T10:00:00.000Z'
      };
    }
  });

  const saved = await pipeline.saveCapturedAudio({
    audioBytes: [7, 6, 5],
    durationMs: 900,
    mimeType: 'audio/webm'
  });
  const processed = await pipeline.processSession(saved.id);

  assert.equal(processed.pipeline.transcription, 'completed');
  assert.equal(processed.pipeline.rewrite, 'completed');
  assert.equal(processed.pipeline.send, 'completed');
  assert.equal(processed.transcript?.text, 'hey sam lets meet at noon');
  assert.equal(processed.rewrite?.text, 'Hey Sam, let\'s meet at noon.');
  assert.equal(processed.delivery?.channel, 'simulated-chat');
  assert.equal(processed.audio.normalizedRelativePath, 'derived/example.wav');

  const reloaded = await pipeline.getSession(saved.id);
  assert.equal(reloaded?.rewrite?.text, 'Hey Sam, let\'s meet at noon.');

  const outbox = JSON.parse(await readFile(join(root, 'outbox', 'messages.json'), 'utf8')) as Array<{ text: string }>;
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].text, 'Hey Sam, let\'s meet at noon.');
});

test('processSession calls onProgress in order: transcribing, rewriting, inserting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opentypeless-pipeline-'));
  const progressSteps: PipelineProgressStep[] = [];
  const pipeline = createDictationPipeline(root, {
    transcribeAudio: async () => ({
      transcript: 'hello',
      normalizedAudioRelativePath: null
    }),
    rewriteTranscript: async () => 'Hello.',
    simulateSend: async (message) => ({
      channel: 'test',
      deliveredText: message,
      deliveredAt: '2026-03-11T00:00:00.000Z'
    }),
    onProgress: (step) => {
      progressSteps.push(step);
    }
  });

  const saved = await pipeline.saveCapturedAudio({
    audioBytes: [1],
    durationMs: 100,
    mimeType: 'audio/webm'
  });
  await pipeline.processSession(saved.id);

  assert.deepEqual(progressSteps, ['transcribing', 'rewriting', 'inserting']);
});

test('listSessions returns newest sessions first', async () => {
  const root = await mkdtemp(join(tmpdir(), 'opentypeless-pipeline-'));
  const pipeline = createDictationPipeline(root);

  const first = await pipeline.saveCapturedAudio({
    audioBytes: [9],
    durationMs: 100,
    mimeType: 'audio/webm'
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = await pipeline.saveCapturedAudio({
    audioBytes: [8],
    durationMs: 200,
    mimeType: 'audio/webm'
  });

  const sessions = await pipeline.listSessions();

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].id, second.id);
  assert.equal(sessions[1].id, first.id);
});
