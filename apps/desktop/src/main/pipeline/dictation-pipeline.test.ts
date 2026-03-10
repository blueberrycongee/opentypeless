import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createDictationPipeline } from './dictation-pipeline';

test('saveCapturedAudio stores raw audio and a pending pipeline manifest', async () => {
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

  const audioFile = await readFile(join(root, session.audio.relativePath));
  assert.deepEqual([...audioFile], [1, 2, 3, 4, 5]);

  const manifestFile = await readFile(join(root, 'sessions', `${session.id}.json`), 'utf8');
  const manifest = JSON.parse(manifestFile) as { id: string; pipeline: { transcription: string } };
  assert.equal(manifest.id, session.id);
  assert.equal(manifest.pipeline.transcription, 'pending');
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
