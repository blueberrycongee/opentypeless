import assert from 'node:assert/strict';
import test from 'node:test';

import { createOverlayManager, type OverlayManagerDeps } from './overlay-manager';
import type { OverlayAction, OverlayState } from '../../shared/ipc';

function createMockDeps(): OverlayManagerDeps & {
  sentStates: OverlayState[];
  shown: boolean;
  hidden: boolean;
  destroyed: boolean;
  focusable: boolean;
  focused: boolean;
  windowHeight: number;
} {
  const mock = {
    sentStates: [] as OverlayState[],
    shown: false,
    hidden: false,
    destroyed: false,
    focusable: false,
    focused: false,
    windowHeight: 44,
    createWindow: () => ({
      sendState(state: OverlayState) {
        mock.sentStates.push(state);
      },
      show() {
        mock.shown = true;
      },
      hide() {
        mock.hidden = true;
      },
      destroy() {
        mock.destroyed = true;
      },
      setFocusable(value: boolean) {
        mock.focusable = value;
      },
      focus() {
        mock.focused = true;
      },
      setHeight(height: number) {
        mock.windowHeight = height;
      },
      isDestroyed() {
        return mock.destroyed;
      }
    })
  };
  return mock;
}

test('isActive returns false initially', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  assert.equal(manager.isActive(), false);
});

test('showRecording sets active and pushes recording state', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();

  assert.equal(manager.isActive(), true);
  assert.equal(deps.sentStates.length, 1);
  assert.equal(deps.sentStates[0].kind, 'recording');
  assert.equal(deps.shown, true);
});

test('transitionToProcessing pushes processing state with steps', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.transitionToProcessing();

  const last = deps.sentStates[deps.sentStates.length - 1];
  assert.equal(last.kind, 'processing');
  if (last.kind === 'processing') {
    assert.equal(last.steps.length, 3);
    assert.equal(last.steps[0].id, 'transcribing');
    assert.equal(last.steps[0].status, 'pending');
    assert.equal(last.steps[1].id, 'rewriting');
    assert.equal(last.steps[1].status, 'pending');
    assert.equal(last.steps[2].id, 'inserting');
    assert.equal(last.steps[2].status, 'pending');
  }
});

test('updateProcessingStep marks step active and previous steps done', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.transitionToProcessing();
  manager.updateProcessingStep('rewriting', 'active');

  const last = deps.sentStates[deps.sentStates.length - 1];
  assert.equal(last.kind, 'processing');
  if (last.kind === 'processing') {
    assert.equal(last.steps[0].status, 'done');
    assert.equal(last.steps[1].status, 'active');
    assert.equal(last.steps[2].status, 'pending');
  }
});

test('transitionToSuccess pushes success state', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.transitionToProcessing();
  manager.transitionToSuccess('TextEdit');

  const last = deps.sentStates[deps.sentStates.length - 1];
  assert.equal(last.kind, 'success');
  if (last.kind === 'success') {
    assert.equal(last.targetAppName, 'TextEdit');
  }
});

test('transitionToError pushes error state and stays active', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.transitionToProcessing();
  manager.transitionToError('Whisper failed');

  assert.equal(manager.isActive(), true);
  const last = deps.sentStates[deps.sentStates.length - 1];
  assert.equal(last.kind, 'error');
  if (last.kind === 'error') {
    assert.equal(last.message, 'Whisper failed');
  }
});

test('hide sets active to false and hides window', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.hide();

  assert.equal(manager.isActive(), false);
  assert.equal(deps.hidden, true);
});

test('onAction handler receives forwarded actions', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);
  const received: OverlayAction[] = [];

  manager.onAction((action) => received.push(action));
  manager.handleRendererAction({ kind: 'stop' });

  assert.equal(received.length, 1);
  assert.equal(received[0].kind, 'stop');
});

test('destroy cleans up the window', () => {
  const deps = createMockDeps();
  const manager = createOverlayManager(deps);

  manager.showRecording();
  manager.destroy();

  assert.equal(deps.destroyed, true);
});
