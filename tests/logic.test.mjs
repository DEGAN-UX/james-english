import test from 'node:test';
import assert from 'node:assert/strict';
import { damerauLevenshtein, classifyAnswer, canAutoConfirmAnswer, alignLetters, validateWord } from '../js/spelling.js';
import { createSessionPlan, nextRequiredIndex, isNextRequiredLetter } from '../js/scheduler.js';
import { ACCESSORIES, DEFAULT_EQUIPMENT, WARDROBE_SLOTS, rewardForEncounter, unlockForStars } from '../js/rewards.js';
import { createInitialState, validateBackup } from '../js/storage.js';
import { createFallingTrackCenters } from '../js/arcade.js';
import { AudioCoach, getAlphabetLetterName } from '../js/audio.js';

test('Damerau-Levenshtein counts insertions, deletions, substitutions and adjacent swaps', () => {
  assert.equal(damerauLevenshtein('lettre', 'letter'), 1);
  assert.equal(damerauLevenshtein('leter', 'letter'), 1);
  assert.equal(damerauLevenshtein('Monday', 'Monday'), 0);
  assert.equal(damerauLevenshtein('form', 'from'), 1);
});

test('classification is exact and gives case-only errors their own hint', () => {
  assert.equal(classifyAnswer('Monday', 'Monday').kind, 'correct');
  assert.equal(classifyAnswer('monday', 'Monday').kind, 'case');
  assert.equal(classifyAnswer('lettre', 'letter').kind, 'near');
  assert.equal(classifyAnswer('zzzzzzzz', 'letter').kind, 'support');
});

test('typing pause auto-confirms only exact case-sensitive answers', () => {
  assert.equal(canAutoConfirmAnswer('Monday', 'Monday'), true);
  assert.equal(canAutoConfirmAnswer('monday', 'Monday'), false);
  assert.equal(canAutoConfirmAnswer('lettre', 'letter'), false);
  assert.equal(canAutoConfirmAnswer('lette', 'letter'), false);
});

test('alignment represents missing letters without shifting every later letter', () => {
  const alignment = alignLetters('leter', 'letter');
  assert.equal(alignment.filter(item => item.state === 'missing').length, 1);
  assert.equal(alignment.filter(item => item.state === 'same').length, 5);
});

test('word entry rejects punctuation and internal spaces', () => {
  assert.equal(validateWord('Monday'), '');
  assert.match(validateWord("don't"), /letters only/);
  assert.match(validateWord('ice cream'), /letters only/);
});

test('session includes every current word and carries review budget only with eligible history', () => {
  const set = { id: 'week', wordIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] };
  const words = [...set.wordIds.map(id => ({ id, text: id })), { id: 'old', text: 'old' }];
  const first = createSessionPlan({ set, words, stats: {}, reviewBudget: 0.7, mode: 'typing', random: () => 0.3 });
  assert.equal(first.queue.filter(item => item.kind === 'weekly').length, 9);
  assert.equal(first.nextBudget, 0);
  const second = createSessionPlan({ set, words, stats: { 'old:typing': { firstMisses: 1, attempts: 2, consecutiveIndependentSessions: 0 } }, reviewBudget: 0.7, mode: 'typing', random: () => 0.3 });
  assert.equal(second.queue.filter(item => item.kind === 'weekly').length, 9);
  assert.equal(second.queue.filter(item => item.kind === 'review').length, 1);
});

test('arcade supply follows the longest matching prefix for recovery', () => {
  assert.equal(nextRequiredIndex('Monx', 'Monday'), 3);
  assert.equal(nextRequiredIndex('Monday', 'Monday'), 5);
  assert.equal(nextRequiredIndex('', 'letter'), 0);
});

test('arcade hit feedback compares against the next needed letter, even after an error', () => {
  assert.equal(isNextRequiredLetter('le', 'letter', 'T'), true);
  assert.equal(isNextRequiredLetter('le', 'letter', 'a'), false);
  assert.equal(isNextRequiredLetter('lx', 'letter', 'e'), true);
  assert.equal(isNextRequiredLetter('letter', 'letter', 'r'), false);
});

test('letter reinforcement uses English alphabet names including British zed', () => {
  assert.equal(getAlphabetLetterName('A'), 'eigh');
  assert.equal(getAlphabetLetterName('b'), 'bee');
  assert.equal(getAlphabetLetterName('z'), 'zed');
  assert.equal(getAlphabetLetterName('1'), '');
});

test('typed letter names are sent immediately as separate utterances for mobile activation', async () => {
  const originalDescriptors = Object.fromEntries(['window', 'speechSynthesis', 'SpeechSynthesisUtterance'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const utterances = [];
  const voice = { name: 'Test English', voiceURI: 'test-en-gb', lang: 'en-GB', localService: true };
  const mockSpeech = {
    getVoices: () => [voice],
    addEventListener() {},
    cancel() {},
    speak(utterance) {
      utterances.push(utterance);
      queueMicrotask(() => utterance.onend?.());
    }
  };
  class MockUtterance {
    constructor(text) { this.text = text; }
  }

  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: mockSpeech });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: MockUtterance });
  try {
    const coach = new AudioCoach();
    coach.speakLetter('a', 0.86);
    coach.speakLetter('l', 0.86);
    coach.speakLetter('l', 0.86);
    assert.equal(utterances.length, 3);
    assert.equal(utterances[0].text, 'eigh');
    assert.equal(utterances[1].text, 'ell');
    assert.equal(utterances[2].text, 'ell');
    assert.equal(utterances[0].rate, 1.2);
    assert.equal(coach.hasPendingLetters, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(coach.hasPendingLetters, false);
  } finally {
    for (const [key, descriptor] of Object.entries(originalDescriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('arcade fall tracks stay inside the letter area and keep targets apart on phone widths', () => {
  for (const width of [288, 320, 375, 430, 760]) {
    const tracks = createFallingTrackCenters(width);
    assert.ok(tracks.length >= 2);
    assert.ok(tracks.every(center => center >= 34 && center <= width - 34));
    for (let index = 1; index < tracks.length; index += 1) {
      assert.ok(tracks[index] - tracks[index - 1] >= 56);
    }
  }
});

test('reward events are idempotent and assisted support cannot earn independent reward', () => {
  assert.equal(rewardForEncounter({ sessionId: 's', encounterId: 'e', result: 'correct', revealed: false }).stars, 2);
  assert.equal(rewardForEncounter({ sessionId: 's', encounterId: 'e', result: 'correct', revealed: true }).stars, 1);
  assert.equal(rewardForEncounter({ sessionId: 's', encounterId: 'e', result: 'correct', revealed: false, laterRecall: true }).stars, 0);
  assert.equal(unlockForStars(8, ['headband']).includes('trainers'), true);
});

test('wardrobe has independently equipable slots and star-unlocked outfit prizes', () => {
  const slots = new Set(WARDROBE_SLOTS.map(slot => slot.id));
  assert.ok(ACCESSORIES.every(item => slots.has(item.slot)));
  assert.ok(Object.entries(DEFAULT_EQUIPMENT).every(([slot, id]) => ACCESSORIES.some(item => item.id === id && item.slot === slot && item.cost === 0)));
  assert.ok(ACCESSORIES.some(item => item.slot === 'shirt' && item.color));
  assert.ok(ACCESSORIES.some(item => item.slot === 'legs' && item.name.includes('trousers')));
  assert.ok(ACCESSORIES.some(item => item.slot === 'arms'));
  assert.ok(ACCESSORIES.some(item => item.slot === 'gear' && item.cost > 0));
  const unlocked = unlockForStars(24, Object.values(DEFAULT_EQUIPMENT));
  assert.ok(unlocked.includes('coral-shirt'));
  assert.ok(unlocked.includes('foam-sword'));
  assert.ok(!unlocked.includes('crown'));
});

test('backup validation accepts a clean state and rejects broken references before replacement', () => {
  const state = createInitialState();
  assert.equal(validateBackup(state), true);
  state.words.push({ id: 'word-a', text: 'Monday' });
  state.sets.push({ id: 'set-a', title: 'This week', wordIds: ['missing-word'], current: true, archived: false });
  assert.equal(validateBackup(state), false);
});