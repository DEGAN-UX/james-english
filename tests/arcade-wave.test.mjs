import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLetterWave } from '../js/arcade.js';

test('wave has distinct letters including the required one', () => {
  for (let run = 0; run < 200; run += 1) {
    const wave = buildLetterWave('q', 4);
    assert.equal(wave.length, 4);
    assert.equal(new Set(wave).size, 4);
    assert.ok(wave.includes('q'));
  }
});

test('required letter lands in every position over many waves', () => {
  const positions = new Set();
  for (let run = 0; run < 300; run += 1) positions.add(buildLetterWave('a', 4).indexOf('a'));
  assert.deepEqual([...positions].sort(), [0, 1, 2, 3]);
});

test('wave without a required letter is all distractors', () => {
  assert.equal(buildLetterWave(undefined, 3).length, 3);
});
