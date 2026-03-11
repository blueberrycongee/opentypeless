import assert from 'node:assert/strict';
import test from 'node:test';

import { ONBOARDING_STEPS, STORAGE_KEY } from './onboarding-steps';

test('STORAGE_KEY is correct', () => {
  assert.equal(STORAGE_KEY, 'onboarding-completed');
});

test('ONBOARDING_STEPS has 4 steps in correct order', () => {
  assert.equal(ONBOARDING_STEPS.length, 4);
  assert.equal(ONBOARDING_STEPS[0].id, 'welcome');
  assert.equal(ONBOARDING_STEPS[1].id, 'permissions');
  assert.equal(ONBOARDING_STEPS[2].id, 'shortcuts');
  assert.equal(ONBOARDING_STEPS[3].id, 'tryit');
});

test('welcome step has no target selector (centered)', () => {
  assert.equal(ONBOARDING_STEPS[0].targetSelector, null);
  assert.equal(ONBOARDING_STEPS[0].tooltipPosition, 'center');
});

test('permissions step navigates to settings page', () => {
  assert.equal(ONBOARDING_STEPS[1].page, 'settings');
});

test('shortcuts step navigates to home page', () => {
  assert.equal(ONBOARDING_STEPS[2].page, 'home');
});

test('tryit step has center position', () => {
  assert.equal(ONBOARDING_STEPS[3].tooltipPosition, 'center');
  assert.equal(ONBOARDING_STEPS[3].targetSelector, null);
});
