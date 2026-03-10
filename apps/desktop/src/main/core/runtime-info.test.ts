import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRuntimeInfo } from './runtime-info';

test('buildRuntimeInfo returns app shell metadata and module placeholders', () => {
  const info = buildRuntimeInfo('darwin');

  assert.equal(info.appName, 'OpenTypeless');
  assert.equal(info.platform, 'darwin');
  assert.equal(info.modules.length, 6);
  assert.deepEqual(
    info.modules.map((module) => module.id),
    ['hotkeys', 'audio', 'transcription', 'rewrite', 'insertion', 'local-data']
  );
  assert.equal(info.modules.find((module) => module.id === 'audio')?.status, 'ready');
  assert.equal(info.modules.find((module) => module.id === 'local-data')?.status, 'ready');
});
