import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createLocalAiPipelineDeps, ensureLocalAiReady } from '../src/main/ai/local-ai';
import { createDictationPipeline } from '../src/main/pipeline/dictation-pipeline';

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  await ensureLocalAiReady();

  const root = await mkdtemp(join(tmpdir(), 'opentypeless-e2e-'));
  const aiffPath = join(root, 'sample.aiff');
  const wavPath = join(root, 'sample.wav');
  const spokenText = 'Hey Sam, let us meet at noon and bring the design notes.';

  await execFileAsync('say', ['-o', aiffPath, spokenText]);
  await execFileAsync('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    aiffPath,
    '-ar',
    '16000',
    '-ac',
    '1',
    '-c:a',
    'pcm_s16le',
    wavPath,
  ]);

  const pipeline = createDictationPipeline(root, createLocalAiPipelineDeps(root));
  const audioBytes = [...(await readFile(wavPath))];
  const saved = await pipeline.saveCapturedAudio({
    audioBytes,
    durationMs: null,
    mimeType: 'audio/wav',
  });
  const processed = await pipeline.processSession(saved.id);
  const sentMessages = await pipeline.listSentMessages();

  assert.equal(processed.pipeline.transcription, 'completed');
  assert.equal(processed.pipeline.rewrite, 'completed');
  assert.equal(processed.pipeline.send, 'completed');
  assert.ok(processed.transcript?.text.length);
  assert.ok(processed.rewrite?.text.length);
  assert.ok(processed.delivery?.deliveredText.length);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].text, processed.delivery?.deliveredText);

  console.log(
    JSON.stringify(
      {
        sessionId: processed.id,
        transcript: processed.transcript?.text,
        rewrittenText: processed.rewrite?.text,
        deliveredText: processed.delivery?.deliveredText,
        outboxSize: sentMessages.length,
        dataRoot: root,
      },
      null,
      2,
    ),
  );
}

void main();
