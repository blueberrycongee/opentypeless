import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDetectedTargetApp } from './macos-desktop-integration';

test('parseDetectedTargetApp returns an external frontmost app', () => {
  const target = parseDetectedTargetApp('TextEdit||com.apple.TextEdit||4242', 9999);

  assert.deepEqual(target, {
    appName: 'TextEdit',
    bundleId: 'com.apple.TextEdit',
  });
});

test('parseDetectedTargetApp ignores the current OpenTypeless process', () => {
  const target = parseDetectedTargetApp('OpenTypeless||com.github.Electron||9999', 9999);

  assert.equal(target, null);
});
