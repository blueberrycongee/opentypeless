import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkflowController } from './workflow-controller';

test('processAndInsertSession pastes rewritten text into the captured target app', async () => {
  const calls: string[] = [];
  const controller = createWorkflowController({
    detectTargetApp: async () => ({
      appName: 'Notes',
      bundleId: 'com.apple.Notes'
    }),
    processSession: async (sessionId) => {
      calls.push(`process:${sessionId}`);
      return {
        id: sessionId,
        rewrite: {
          text: 'Hello from OpenTypeless.'
        }
      };
    },
    insertText: async (text, target) => {
      calls.push(`insert:${target.appName}:${text}`);
    }
  });

  const target = await controller.beginCapture();
  const result = await controller.processAndInsertSession('session-1');

  assert.equal(target?.appName, 'Notes');
  assert.equal(result.inserted, true);
  assert.deepEqual(calls, [
    'process:session-1',
    'insert:Notes:Hello from OpenTypeless.'
  ]);
  assert.equal(controller.getActiveTarget(), null);
});

test('processAndInsertSession skips insertion when no target app is available', async () => {
  const controller = createWorkflowController({
    detectTargetApp: async () => null,
    processSession: async (sessionId) => ({
      id: sessionId,
      rewrite: {
        text: 'Fallback text.'
      }
    }),
    insertText: async () => {
      throw new Error('insert should not be called');
    }
  });

  await controller.beginCapture();
  const result = await controller.processAndInsertSession('session-2');

  assert.equal(result.inserted, false);
  assert.equal(result.processed.id, 'session-2');
});
