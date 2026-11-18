import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITES, invaderSize, spritePath } from '../js/invaders.js';
import { advanceStars, createStars, starSpeed } from '../js/starfield.js';
import { arcadeLetterCount, nextArcadeLevel } from '../js/scheduler.js';
import { createFallingTrackCenters } from '../js/arcade.js';

test('every invader frame is a rectangular grid of the same size', () => {
  for (const sprite of SPRITES) {
    const [first, second] = sprite.frames;
    assert.equal(first.length, second.length);
    for (const rows of sprite.frames) assert.ok(rows.every(row => row.length === rows[0].length && /^[.X]+$/.test(row)));
    assert.ok(invaderSize(SPRITES.indexOf(sprite)).width >= 32);
  }
});

test('sprite path draws one rectangle per run of pixels', () => {
  assert.equal(spritePath(['XX.X', '....']), 'M0 0h2v1h-2zM3 0h1v1h-1z');
});

test('stars are slower than letters and bigger stars are faster', () => {
  const letterSpeed = 39;
  for (let size = 1; size <= 4; size += 1) assert.ok(starSpeed(size, letterSpeed) < letterSpeed);
  assert.ok(starSpeed(4, letterSpeed) > starSpeed(1, letterSpeed));
  assert.ok(starSpeed(4, 10) <= 8);
});

test('stars wrap to the top with a new column', () => {
  const stars = [{ x: 0.2, y: 0.999, size: 4 }];
  advanceStars(stars, 1, 300, 39, () => 0.7);
  assert.ok(stars[0].y < 0.1);
  assert.equal(stars[0].x, 0.7);
  assert.equal(createStars(12).length, 12);
});

test('arcade letter count rises 6, 7, 8 only after rounds with few wrong shots', () => {
  assert.equal(arcadeLetterCount(undefined), 6);
  assert.equal(arcadeLetterCount(1), 7);
  assert.equal(arcadeLetterCount(2), 8);
  assert.equal(arcadeLetterCount(9), 8);
  assert.equal(nextArcadeLevel(0, 0), 1);
  assert.equal(nextArcadeLevel(1, 3), 2);
  assert.equal(nextArcadeLevel(2, 0), 2);
  assert.equal(nextArcadeLevel(1, 4), 1);
});

test('slalom tracks leave room for a two-width sway on a tablet and a half-width sway on a phone', () => {
  const width = 48;
  const tablet = createFallingTrackCenters(1000, width + width / 2 + 8, width + 2 * width + 8);
  assert.ok(tablet.length >= 4);
  assert.ok(tablet.every(center => center - width * 1.5 >= 0 && center + width * 1.5 <= 1000));
  const phone = createFallingTrackCenters(360, width / 2 + width / 2 + 8, width + width + 8);
  assert.ok(phone.length >= 2);
});
