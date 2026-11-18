import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioCoach, pickVoice, normaliseLang } from '../js/audio.js';

function withSpeech(mock, run) {
  const keys = ['window', 'speechSynthesis', 'SpeechSynthesisUtterance'];
  const saved = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
  Object.defineProperty(globalThis, 'speechSynthesis', { configurable: true, value: mock });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: class { constructor(text) { this.text = text; } } });
  const restore = () => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
  return Promise.resolve(run()).finally(restore);
}

const voice = (lang, extra = {}) => ({ name: lang, voiceURI: lang, lang, localService: true, ...extra });

test('voice choice copes with Android underscores and missing British voices', () => {
  assert.equal(normaliseLang('en_GB'), 'en-gb');
  assert.equal(pickVoice([voice('en-US'), voice('en_GB')]).lang, 'en_GB');
  assert.equal(pickVoice([voice('fr-FR'), voice('en-US')]).lang, 'en-US');
  assert.equal(pickVoice([voice('fr-FR')]), null);
  assert.equal(pickVoice([voice('en-GB'), voice('en-US')], 'en-US').lang, 'en-US');
});

test('a word still finishes when the browser never reports speech, after trying other voice settings', async () => {
  const spoken = [];
  const mock = { getVoices: () => [], addEventListener() {}, cancel() {}, speak: utterance => spoken.push(utterance.text) };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    coach.watchdogBaseMs = 10;
    const outcome = await coach.speakWord('cat', 'The cat sat.', 1);
    assert.deepEqual(spoken, ['cat', 'cat', 'cat', 'The cat sat.', 'The cat sat.', 'The cat sat.', 'cat', 'cat', 'cat']);
    assert.equal(outcome.silent, true);
    assert.match(coach.diagnostics(), /never started/);
  });
});

test('a voice setting that works is remembered for later speech', async () => {
  const seen = [];
  const mock = {
    getVoices: () => [], addEventListener() {}, cancel() {},
    speak: utterance => {
      seen.push(utterance.lang);
      // Only the US setting makes this fake browser actually speak.
      if (utterance.lang === 'en-US') queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); });
    }
  };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    coach.watchdogBaseMs = 10;
    const first = await coach.speakWord('cat', '', 1);
    assert.equal(first.silent, false);
    assert.equal(coach.voiceMode, 'us');
    seen.length = 0;
    await coach.speakWord('dog', '', 1);
    assert.deepEqual(seen, ['en-US']);
  });
});

test('a phrase that starts normally is spoken once', async () => {
  const spoken = [];
  const mock = {
    getVoices: () => [], addEventListener() {}, cancel() {},
    speak: utterance => { spoken.push(utterance.text); queueMicrotask(() => { utterance.onstart?.(); utterance.onend?.(); }); }
  };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    const outcome = await coach.speakWord('cat', '', 1);
    assert.deepEqual(spoken, ['cat']);
    assert.equal(outcome.silent, false);
  });
});

test('speech works with no voice at all', async () => {
  const spoken = [];
  const mock = { getVoices: () => [], addEventListener() {}, cancel() {}, speak: utterance => { spoken.push(utterance); queueMicrotask(() => utterance.onend?.()); } };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    await coach.speakWord('cat', '', 1);
    assert.equal(spoken[0].lang, 'en-GB');
  });
});

test('stopping or replaying supersedes the earlier word without an error', async () => {
  const mock = { getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} };
  await withSpeech(mock, async () => {
    const errors = [];
    const coach = new AudioCoach(message => errors.push(message));
    coach.watchdogBaseMs = 5000;
    const first = coach.speakWord('cat', '', 1);
    coach.stop();
    await assert.rejects(first, error => error.superseded === true);
    const second = coach.speakWord('dog', '', 1);
    const third = coach.speakWord('log', '', 1);
    await assert.rejects(second, error => error.superseded === true);
    coach.stop();
    await assert.rejects(third, error => error.superseded === true);
    assert.deepEqual(errors, []);
  });
});

test('the letter A is spoken as "eigh", which voices read as the letter name', async () => {
  const spoken = [];
  const mock = { getVoices: () => [], addEventListener() {}, cancel() {}, speak: utterance => spoken.push(utterance.text) };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    coach.speakLetter('a', 0.86);
    coach.speakLetter('A', 0.86);
    coach.speakLetter('b', 0.86);
    assert.deepEqual(spoken, ['eigh', 'eigh', 'bee']);
  });
});

test('letters that never finish stop counting as pending', async () => {
  const mock = { getVoices: () => [], addEventListener() {}, cancel() {}, speak() {} };
  await withSpeech(mock, async () => {
    const coach = new AudioCoach();
    coach.speakLetter('a', 0.86);
    assert.equal(coach.hasPendingLetters, true);
    for (const utterance of coach.pendingLetters.keys()) coach.pendingLetters.set(utterance, 0);
    assert.equal(coach.hasPendingLetters, false);
  });
});
