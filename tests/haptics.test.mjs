import test from 'node:test';
import assert from 'node:assert/strict';
import { hapticsSupport, pulse } from '../js/haptics.js';

function withNavigator(value, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
  try { return run(); } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else delete globalThis.navigator;
  }
}

test('uses the Vibration API when available', () => {
  const calls = [];
  withNavigator({ vibrate: pattern => { calls.push(pattern); return true; } }, () => {
    assert.equal(hapticsSupport(), 'vibrate');
    assert.equal(pulse([35, 35, 55]), true);
  });
  assert.deepEqual(calls, [[35, 35, 55]]);
});

test('does nothing when disabled', () => {
  const calls = [];
  withNavigator({ vibrate: pattern => calls.push(pattern) }, () => assert.equal(pulse([35], false), false));
  assert.equal(calls.length, 0);
});

test('reports no support and never throws without haptics', () => {
  withNavigator({ userAgent: 'Desktop', platform: 'Linux', maxTouchPoints: 0 }, () => {
    assert.equal(hapticsSupport(), 'none');
    assert.equal(pulse([35]), false);
  });
});
