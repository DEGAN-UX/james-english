const LETTER_NAMES = {
  a: 'ay', b: 'bee', c: 'see', d: 'dee', e: 'ee', f: 'eff', g: 'gee', h: 'aitch',
  i: 'eye', j: 'jay', k: 'kay', l: 'ell', m: 'em', n: 'en', o: 'oh', p: 'pee',
  q: 'cue', r: 'ar', s: 'ess', t: 'tee', u: 'you', v: 'vee', w: 'double you',
  x: 'ex', y: 'why', z: 'zed'
};
const LETTER_SPEECH_RATE = 1.2;
const LETTER_PENDING_MS = 1800;

export function normaliseLang(lang) {
  return String(lang || '').replace('_', '-').toLowerCase();
}

// Android reports "en_GB"; some devices only have US voices, so fall back rather than fail.
export function pickVoice(voices, preferredURI = '') {
  const list = Array.isArray(voices) ? voices : [];
  const isEnglish = voice => /^en(-|$)/.test(normaliseLang(voice.lang));
  return (preferredURI && list.find(voice => voice.voiceURI === preferredURI)) ||
    list.find(voice => normaliseLang(voice.lang) === 'en-gb' && voice.localService) ||
    list.find(voice => normaliseLang(voice.lang) === 'en-gb') ||
    list.find(voice => isEnglish(voice) && voice.localService) ||
    list.find(isEnglish) || null;
}

function supersededError() {
  const error = new Error('Speech was replaced.');
  error.superseded = true;
  return error;
}

export function getAlphabetLetterName(letter) {
  return LETTER_NAMES[String(letter).toLowerCase()] || '';
}

export function formatAlphabetLetterNames(letters) {
  return [...letters].map(getAlphabetLetterName).filter(Boolean).join(' ');
}

export class AudioCoach {
  constructor(onError = () => {}) {
    this.onError = onError;
    this.selectedVoice = null;
    this.speechEnabled = 'speechSynthesis' in globalThis && 'SpeechSynthesisUtterance' in globalThis;
    this.voices = [];
    this.preferredURI = '';
    this.pendingLetters = new Map();
    this.live = new Set();
    this.aborters = new Set();
    this.wordToken = 0;
    this.watchdogBaseMs = 2500;
    this.context = null;
    if (this.speechEnabled) {
      speechSynthesis.addEventListener('voiceschanged', () => this.refreshVoices());
      this.refreshVoices();
    }
  }

  refreshVoices() {
    this.voices = speechSynthesis.getVoices();
    this.selectPreferredVoice({ voiceURI: this.preferredURI });
  }

  selectPreferredVoice(preference = {}) {
    if (preference.voiceURI !== undefined) this.preferredURI = preference.voiceURI;
    this.selectedVoice = pickVoice(this.voices, this.preferredURI);
    return this.selectedVoice;
  }

  speakWord(word, sentence, rate = 0.86) {
    if (!this.speechEnabled) {
      this.onError('Speech is not available in this browser. Check the browser settings or try another device.');
      return Promise.reject(new Error('Speech is unavailable.'));
    }
    if (!this.voices.length) this.refreshVoices();
    this.abortWords();
    this.clearLetterQueue();
    const token = ++this.wordToken;
    const mustWait = this.cancelSpeech();
    const sequence = [word, ...(sentence ? [sentence, word] : [])];
    return (async () => {
      // Safari and Chrome drop a speak() that immediately follows cancel(); a short pause avoids it.
      if (mustWait) await new Promise(resolve => setTimeout(resolve, 80));
      let silent = false;
      for (const text of sequence) {
        if (token !== this.wordToken) throw supersededError();
        if (await this.say(text, rate, token) === 'silent') silent = true;
      }
      if (token !== this.wordToken) throw supersededError();
      // True when the browser never confirmed it started speaking, so the app can hint at Replay.
      return { silent };
    })();
  }

  createUtterance(text, rate) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = this.selectedVoice?.lang || 'en-GB';
    utterance.rate = rate;
    try {
      if (this.selectedVoice) utterance.voice = this.selectedVoice;
    } catch {
      // A stale voice object is not fatal; the browser default still speaks.
    }
    return utterance;
  }

  // Resolves when the utterance ends, or when a watchdog decides it must have (some browsers never fire onend).
  say(text, rate, token) {
    return new Promise((resolve, reject) => {
      const utterance = this.createUtterance(text, rate);
      this.live.add(utterance);
      let settled = false;
      let started = false;
      const finish = (settle, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        this.live.delete(utterance);
        this.aborters.delete(abort);
        settle(value);
      };
      const abort = () => finish(reject, supersededError());
      const watchdog = setTimeout(() => {
        if (token === this.wordToken && speechSynthesis.speaking) speechSynthesis.cancel();
        finish(resolve, started ? 'timeout' : 'silent');
      }, this.watchdogBaseMs + (text.length * 130) / Math.max(0.5, rate));
      this.aborters.add(abort);
      utterance.onstart = () => { started = true; };
      utterance.onend = () => finish(resolve, 'ended');
      utterance.onerror = event => {
        const interrupted = event.error === 'canceled' || event.error === 'interrupted';
        if (interrupted && token !== this.wordToken) return finish(reject, supersededError());
        const message = interrupted
          ? 'Speech stopped. Tap Replay to hear the word again.'
          : event.error === 'not-allowed'
            ? 'The browser blocked the sound. Tap Replay to hear the word.'
            : 'Speech could not play. Tap Replay or ask a parent to check the voice settings.';
        this.onError(message);
        finish(reject, new Error(message));
      };
      if (speechSynthesis.paused) speechSynthesis.resume();
      speechSynthesis.speak(utterance);
    });
  }

  abortWords() {
    for (const abort of [...this.aborters]) abort();
  }

  // Returns true when something was cancelled (the caller should then wait briefly before speaking).
  cancelSpeech() {
    if (!this.speechEnabled) return false;
    const busy = Boolean(speechSynthesis.speaking || speechSynthesis.pending);
    if (busy) speechSynthesis.cancel();
    return busy;
  }

  stop() {
    this.wordToken += 1;
    this.abortWords();
    this.clearLetterQueue();
    this.cancelSpeech();
  }

  speakLetter(letter, rate = 0.86) {
    const name = getAlphabetLetterName(letter);
    if (!name || !this.speechEnabled) return;
    if (!this.voices.length) this.refreshVoices();
    const utterance = this.createUtterance(name, Math.min(1.3, Math.max(LETTER_SPEECH_RATE, rate)));
    this.live.add(utterance);
    this.pendingLetters.set(utterance, performance.now() + LETTER_PENDING_MS);
    const complete = () => {
      this.pendingLetters.delete(utterance);
      this.live.delete(utterance);
    };
    utterance.onend = complete;
    utterance.onerror = complete;
    if (speechSynthesis.paused) speechSynthesis.resume();
    speechSynthesis.speak(utterance);
  }

  clearLetterQueue() {
    this.pendingLetters.clear();
  }

  // Entries expire so a lost onend can never block auto-submit.
  get hasPendingLetters() {
    const now = performance.now();
    for (const [utterance, deadline] of this.pendingLetters) {
      if (deadline > now) continue;
      this.pendingLetters.delete(utterance);
      this.live.delete(utterance);
    }
    return this.pendingLetters.size > 0;
  }

  getContext() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return null;
    this.context ||= new Context();
    if (this.context.state === 'suspended' || this.context.state === 'interrupted') this.context.resume().catch(() => {});
    return this.context;
  }

  // Browsers only allow audio after a touch or key press, so the app calls this on the first one.
  unlock() {
    if (this.context?.state === 'running') return;
    try {
      const context = this.getContext();
      if (!context) return;
      const source = context.createBufferSource();
      source.buffer = context.createBuffer(1, 1, 22050);
      source.connect(context.destination);
      source.start(0);
    } catch {
      // Sound is optional.
    }
  }

  playEffect(kind, volume = 0.4, muted = false) {
    if (muted || volume <= 0) return;
    try {
      const context = this.getContext();
      if (!context) return;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = 'triangle';
      oscillator.frequency.value = kind === 'big' ? 660 : kind === 'small' ? 520 : 390;
      gain.gain.setValueAtTime(Math.min(0.1, volume * 0.16), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.17);
    } catch {
      // Audio effects are optional; speech remains independent.
    }
  }

  playFanfare(volume = 0.4, muted = false, big = false) {
    if (muted || volume <= 0) return;
    try {
      const context = this.getContext();
      if (!context) return;
      const start = context.currentTime + 0.02;
      const peak = Math.min(0.12, volume * 0.2);
      const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((frequency, index) => {
        const last = index === notes.length - 1;
        const at = start + index * 0.085;
        const length = last ? 0.5 : 0.14;
        [['triangle', 1, 1], ['square', 2, 0.12]].forEach(([type, multiplier, level]) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = type;
          oscillator.frequency.value = frequency * multiplier;
          gain.gain.setValueAtTime(0.001, at);
          gain.gain.exponentialRampToValueAtTime(peak * level, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.001, at + length);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(at);
          oscillator.stop(at + length + 0.02);
        });
      });
    } catch {
      // Audio effects are optional; speech remains independent.
    }
  }

  playCannonShot(volume = 0.4, muted = false) {
    if (muted || volume <= 0) return;
    try {
      const context = this.getContext();
      if (!context) return;

      const now = context.currentTime;
      const output = context.createGain();
      output.gain.setValueAtTime(Math.min(0.24, volume * 0.34), now);
      output.connect(context.destination);

      const tone = context.createOscillator();
      const toneGain = context.createGain();
      tone.type = 'sawtooth';
      tone.frequency.setValueAtTime(170, now);
      tone.frequency.exponentialRampToValueAtTime(48, now + 0.16);
      toneGain.gain.setValueAtTime(0.7, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      tone.connect(toneGain).connect(output);
      tone.start(now);
      tone.stop(now + 0.2);

      const sampleRate = context.sampleRate;
      const noiseBuffer = context.createBuffer(1, Math.floor(sampleRate * 0.095), sampleRate);
      const noiseSamples = noiseBuffer.getChannelData(0);
      for (let index = 0; index < noiseSamples.length; index += 1) {
        noiseSamples[index] = (Math.random() * 2 - 1) * (1 - index / noiseSamples.length);
      }
      const noise = context.createBufferSource();
      const noiseFilter = context.createBiquadFilter();
      const noiseGain = context.createGain();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.setValueAtTime(1500, now);
      noiseGain.gain.setValueAtTime(0.55, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      noise.buffer = noiseBuffer;
      noise.connect(noiseFilter).connect(noiseGain).connect(output);
      noise.start(now);
      noise.stop(now + 0.1);
    } catch {
      // Cannon audio is optional; the visual shot still works without Web Audio.
    }
  }
}