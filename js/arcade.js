const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
const FADE_OUT_MS = 280;
const FADE_IN_MS = 220;
const WAVE_START_DELAY_MS = 160;
const WAVE_STAGGER_MS = 70;
const MAX_PROJECTILES = 3;
const SHOT_COOLDOWN_MS = 180;
const PROJECTILE_SPEED = 860;
const LETTER_SPEED_FACTOR = 1.5;
const ROW_GAP = 70;
const FRAME_FLIP_MS = 550;
import { nextRequiredIndex } from './scheduler.js';
import { createInvaderElement, invaderSize } from './invaders.js';
import { advanceStars, createStars, drawStars } from './starfield.js';

// Distinct letters in random order, so the needed one can appear at any position.
export function buildLetterWave(required, count, random = Math.random) {
  const pool = [...ALPHABET].filter(letter => letter !== required);
  const letters = [];
  const distractors = required ? count - 1 : count;
  while (letters.length < distractors) letters.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  if (required) letters.splice(Math.floor(random() * (letters.length + 1)), 0, required);
  return letters;
}

export function createFallingTrackCenters(fieldWidth, safeMargin = 34, minimumGap = 56) {
  const usableWidth = Math.max(1, fieldWidth - safeMargin * 2);
  const trackCount = Math.max(2, Math.min(7, Math.floor(usableWidth / minimumGap)));
  return Array.from({ length: trackCount }, (_, index) => safeMargin + ((index + 0.5) * usableWidth) / trackCount);
}

export class SpellingArcade {
  constructor(root, options) {
    this.root = root;
    this.options = options;
    this.field = root.querySelector('.arcade-field');
    this.lettersLayer = root.querySelector('.falling-letters');
    this.projectilesLayer = root.querySelector('.projectiles');
    this.impactLayer = root.querySelector('.impact-layer');
    this.cannon = root.querySelector('.cannon');
    this.starsCanvas = root.querySelector('.stars-layer');
    this.stars = createStars();
    this.letterCount = 6;
    this.frameFlip = 0;
    this.heldPointers = new Map();
    this.keyboardDirection = null;
    this.letters = [];
    this.projectiles = [];
    this.pendingWave = false;
    this.clock = 0;
    this.answer = '';
    this.target = '';
    this.shift = false;
    this.lastFrame = 0;
    this.lastShot = 0;
    this.nextTrackIndex = 0;
    this.active = false;
    this.width = 0;
    this.height = 0;
    this.frameRequest = 0;
    root.addEventListener('pointerdown', event => this.handlePointerDown(event));
    root.addEventListener('pointerup', event => this.handlePointerEnd(event));
    root.addEventListener('pointercancel', event => this.handlePointerEnd(event));
    root.addEventListener('lostpointercapture', event => this.handlePointerEnd(event));
    // Holding a control must never open the browser's long-press menu or start a text selection.
    root.addEventListener('contextmenu', event => event.preventDefault());
    root.addEventListener('selectstart', event => event.preventDefault());
    window.addEventListener('blur', () => this.clearInputs());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearInputs();
      this.resize();
    });
    window.addEventListener('resize', () => this.resize());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.field);
  }

  measure() {
    const bounds = this.field.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return false;
    if (this.starsCanvas && (bounds.width !== this.width || bounds.height !== this.height)) {
      const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
      this.starsCanvas.width = Math.round(bounds.width * ratio);
      this.starsCanvas.height = Math.round(bounds.height * ratio);
    }
    this.width = bounds.width;
    this.height = bounds.height;
    this.cannonX = Number.isFinite(this.cannonX)
      ? Math.max(22, Math.min(this.cannonX, this.width - 22))
      : this.width / 2;
    return true;
  }

  resize() {
    if (!this.measure()) return;
    this.reassignTracks();
    this.ensureVisibleTargetCount();
    this.renderCannon();
    this.renderLetters();
    drawStars(this.starsCanvas, this.stars);
  }

  // Sway range is twice an invader's width on wide screens; tracks are spaced so neighbours rarely touch.
  layout() {
    const widest = invaderSize(2).width;
    const sway = this.motionReduced() ? 0 : this.width >= 600 ? widest : widest / 2;
    const tracks = createFallingTrackCenters(this.width, sway + widest / 2 + 8, widest + 2 * sway + 8);
    return { tracks, sway };
  }

  start(target, answer = '', { letterCount = 6 } = {}) {
    this.measure();
    this.letterCount = letterCount;
    this.lettersLayer.replaceChildren();
    this.target = target;
    this.answer = answer;
    this.letters = [];
    this.projectiles = [];
    this.pendingWave = false;
    this.heldPointers.clear();
    this.active = true;
    this.lastFrame = 0;
    this.seedLetters();
    this.renderLetters();
    this.renderProjectiles();
    this.requestFrame();
  }

  pause() {
    this.active = false;
    this.clearInputs();
    cancelAnimationFrame(this.frameRequest);
  }

  resume() {
    if (this.active) return;
    this.active = true;
    this.lastFrame = 0;
    this.requestFrame();
  }

  setAnswer(answer) {
    this.answer = answer;
    this.ensureRequiredLetter();
  }

  setShift(active) {
    this.shift = active;
    this.renderLetters();
  }

  clearInputs() {
    this.heldPointers.clear();
    this.keyboardDirection = null;
    this.root.querySelectorAll('[data-hold]').forEach(button => button.classList.remove('is-held'));
  }

  setKeyboardDirection(direction) {
    this.keyboardDirection = direction;
  }

  handlePointerDown(event) {
    const button = event.target.closest('[data-hold], [data-shoot], [data-shift]');
    if (!button) return;
    if (button.dataset.hold) {
      event.preventDefault();
      try { button.setPointerCapture(event.pointerId); } catch { /* The pointer may already be gone. */ }
      this.heldPointers.set(event.pointerId, button.dataset.hold);
      button.classList.add('is-held');
      return;
    }
    if (button.dataset.shoot !== undefined) {
      event.preventDefault();
      this.shoot();
    }
  }

  handlePointerEnd(event) {
    const direction = this.heldPointers.get(event.pointerId);
    if (!direction) return;
    this.heldPointers.delete(event.pointerId);
    const anotherPointer = [...this.heldPointers.values()].includes(direction);
    if (!anotherPointer) this.root.querySelector(`[data-hold="${direction}"]`)?.classList.remove('is-held');
  }

  shoot() {
    if (!this.active || this.projectiles.length >= MAX_PROJECTILES || performance.now() - this.lastShot < SHOT_COOLDOWN_MS) return;
    this.lastShot = performance.now();
    this.projectiles.push({ x: this.cannonX, y: this.height - 44, element: null });
    this.options.onShoot?.();
    this.renderProjectiles();
  }

  requestFrame() {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = requestAnimationFrame(timestamp => this.update(timestamp));
  }

  update(timestamp) {
    if (!this.active) return;
    const delta = Math.min(0.05, Math.max(0, (timestamp - (this.lastFrame || timestamp)) / 1000));
    this.lastFrame = timestamp;
    this.clock += delta * 1000;
    const directions = [...this.heldPointers.values(), ...(this.keyboardDirection ? [this.keyboardDirection] : [])];
    const horizontal = directions.includes('left') === directions.includes('right') ? 0 : directions.includes('left') ? -1 : 1;
    this.cannonX = Math.max(22, Math.min(this.width - 22, this.cannonX + horizontal * 245 * delta));
    // Invaders fall 1.5 times as fast as the base setting; stars always fall slower than they do.
    const speed = (Number(this.options.getSettings().arcadeSpeed) || 26) * LETTER_SPEED_FACTOR;
    const seconds = this.clock / 1000;
    for (const letter of this.letters) {
      letter.y += speed * delta;
      letter.x = letter.baseX + letter.sway * Math.sin(letter.phase + letter.omega * seconds);
    }
    if (!this.motionReduced()) advanceStars(this.stars, delta, this.height, speed);
    drawStars(this.starsCanvas, this.stars);
    const flip = this.motionReduced() ? 0 : Math.floor(this.clock / FRAME_FLIP_MS) % 2;
    if (flip !== this.frameFlip) {
      this.frameFlip = flip;
      this.lettersLayer.dataset.frame = flip ? 'b' : 'a';
    }
    const now = this.clock;
    this.letters = this.letters.filter(letter => letter.y < this.height - 50 && !(letter.fadeStart !== undefined && now - letter.fadeStart >= FADE_OUT_MS));
    for (const projectile of this.projectiles) projectile.y -= PROJECTILE_SPEED * delta;
    this.handleHits();
    this.projectiles = this.projectiles.filter(projectile => projectile.y > -20);
    this.ensureRequiredLetter();
    this.ensureVisibleTargetCount();
    this.renderCannon();
    this.renderLetters();
    this.renderProjectiles();
    this.requestFrame();
  }

  seedLetters() {
    const required = this.target[nextRequiredIndex(this.answer, this.target)]?.toLowerCase();
    this.startWave(required, { fadeOld: false, delay: 0 });
  }

  motionReduced() {
    return Boolean(this.options.getSettings().reducedMotion) || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  }

  startWave(required, { fadeOld = true, delay = WAVE_START_DELAY_MS } = {}) {
    const now = this.clock;
    const reduced = this.motionReduced();
    if (fadeOld) {
      if (reduced) this.letters = [];
      else for (const letter of this.letters) letter.fadeStart ??= now;
    }
    const { tracks, sway } = this.layout();
    const order = tracks.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    buildLetterWave(required, this.visibleTargetCount()).forEach((letter, index) => {
      const track = order[index % order.length];
      this.letters.push(this.makeLetter(letter, track, tracks[track], 30 + Math.floor(index / order.length) * ROW_GAP, sway, reduced || !fadeOld ? {} : { bornAt: now + delay + index * WAVE_STAGGER_MS }));
    });
  }

  makeLetter(letter, track, baseX, y, sway, extra = {}) {
    const phase = Math.random() * Math.PI * 2;
    const omega = (Math.PI * 2) / (3.2 + Math.random() * 2.6);
    return {
      letter, track, baseX, y, sway, phase, omega,
      kind: Math.floor(Math.random() * 3),
      x: baseX + sway * Math.sin(phase + omega * (this.clock / 1000)),
      element: null,
      ...extra
    };
  }

  visibleTargetCount() {
    const { tracks } = this.layout();
    const rows = Math.max(1, Math.floor((this.height - 120) / ROW_GAP));
    const cap = Number(this.options.getSettings().arcadeMaxLetters) || 8;
    return Math.max(3, Math.min(this.letterCount, cap, tracks.length * rows));
  }

  spawnVisibleLetter(forcedLetter = null) {
    const { tracks, sway } = this.layout();
    const minimumY = 30;
    const maximumY = Math.max(minimumY, this.height - 120);
    let slot = null;
    for (let offset = 0; offset < tracks.length && !slot; offset += 1) {
      const track = (this.nextTrackIndex + offset) % tracks.length;
      for (let y = minimumY; y <= maximumY; y += ROW_GAP) {
        const occupied = this.letters.some(letter => letter.fadeStart === undefined && letter.track === track && Math.abs(letter.y - y) < 50);
        if (!occupied) {
          slot = { track, y };
          break;
        }
      }
    }
    if (!slot) return false;
    this.nextTrackIndex = (slot.track + 1) % tracks.length;
    this.letters.push(this.makeLetter(forcedLetter || ALPHABET[Math.floor(Math.random() * ALPHABET.length)], slot.track, tracks[slot.track], slot.y, sway, this.motionReduced() ? {} : { bornAt: this.clock }));
    return true;
  }

  ensureVisibleTargetCount() {
    const lastShootableY = this.height - 50;
    let visibleCount = this.letters.filter(letter => letter.fadeStart === undefined && letter.y >= 0 && letter.y <= lastShootableY).length;
    while (visibleCount < this.visibleTargetCount() && this.spawnVisibleLetter()) visibleCount += 1;
  }

  reassignTracks() {
    if (!this.letters.length || !this.width) return;
    const { tracks, sway } = this.layout();
    const orderedLetters = [...this.letters].sort((left, right) => left.y - right.y);
    const assignments = tracks.map(() => []);
    for (const letter of orderedLetters) {
      const available = assignments.map((lane, index) => ({ index, gap: lane.length ? Math.min(...lane.map(existing => Math.abs(existing.y - letter.y))) : Infinity }));
      available.sort((left, right) => right.gap - left.gap);
      const track = available[0].index;
      letter.track = track;
      letter.baseX = tracks[track];
      letter.sway = sway;
      letter.x = letter.baseX + sway * Math.sin(letter.phase + letter.omega * (this.clock / 1000));
      assignments[track].push(letter);
    }
  }

  ensureRequiredLetter() {
    if (!this.width || !this.target) return;
    const waveRequested = this.pendingWave;
    this.pendingWave = false;
    const required = this.target[nextRequiredIndex(this.answer, this.target)]?.toLowerCase();
    const lastShootableY = this.height - 50;
    const present = required && this.letters.some(letter => letter.fadeStart === undefined && letter.letter === required && letter.y < lastShootableY);
    if (required && (waveRequested || !present)) this.startWave(required);
    this.ensureVisibleTargetCount();
  }

  handleHits() {
    const now = this.clock;
    for (const projectile of [...this.projectiles]) {
      // A bullet meets the lowest invader in its path first.
      let hitIndex = -1;
      this.letters.forEach((letter, index) => {
        if (letter.fadeStart !== undefined || letter.bornAt > now) return;
        const size = invaderSize(letter.kind);
        if (Math.abs(letter.x - projectile.x) >= size.width / 2 + 3 || Math.abs(letter.y - projectile.y) >= size.height / 2 + 6) return;
        if (hitIndex < 0 || letter.y > this.letters[hitIndex].y) hitIndex = index;
      });
      if (hitIndex >= 0) {
        const [hit] = this.letters.splice(hitIndex, 1);
        this.projectiles = this.projectiles.filter(item => item !== projectile);
        const capturedLetter = this.shift ? hit.letter.toUpperCase() : hit.letter;
        const correctHit = capturedLetter === [...this.target][[...this.answer].length];
        this.showHitEffect(hit, correctHit);
        this.pendingWave = correctHit;
        this.shift = false;
        this.options.onLetter(capturedLetter);
        this.renderLetters();
      }
    }
  }

  renderCannon() {
    if (!this.cannon || !this.width) return;
    this.cannon.style.left = `${this.cannonX}px`;
  }

  renderLetters() {
    const now = this.clock;
    const alive = new Set();
    for (const letter of this.letters) {
      if (!letter.element) {
        letter.element = createInvaderElement(letter.kind);
        this.lettersLayer.append(letter.element);
      }
      alive.add(letter.element);
      let opacity = letter.bornAt === undefined ? 1 : Math.max(0, Math.min(1, (now - letter.bornAt) / FADE_IN_MS));
      if (letter.fadeStart !== undefined) opacity = Math.min(opacity, Math.max(0, 1 - (now - letter.fadeStart) / FADE_OUT_MS));
      const size = invaderSize(letter.kind);
      const scale = (0.85 + 0.15 * opacity).toFixed(3);
      letter.element.style.transform = `translate(${(letter.x - size.width / 2).toFixed(1)}px, ${(letter.y - size.height / 2).toFixed(1)}px) scale(${scale})`;
      letter.element.style.opacity = opacity.toFixed(2);
      const text = this.shift ? letter.letter.toUpperCase() : letter.letter;
      const label = letter.element.lastElementChild;
      if (label.textContent !== text) label.textContent = text;
    }
    for (const child of [...this.lettersLayer.children]) if (!alive.has(child)) child.remove();
  }

  renderProjectiles() {
    this.projectilesLayer.innerHTML = this.projectiles.map(projectile => `<span class="projectile" style="left:${projectile.x}px;top:${projectile.y}px" aria-hidden="true"></span>`).join('');
  }

  showHitEffect(hit, correctHit) {
    const effect = document.createElement('span');
    effect.className = correctHit ? 'hit-burst hit-burst-correct' : 'hit-burst hit-burst-wrong';
    effect.style.left = `${hit.x}px`;
    effect.style.top = `${hit.y}px`;
    if (correctHit) {
      for (let index = 0; index < 8; index += 1) {
        const spark = document.createElement('span');
        spark.className = 'hit-spark';
        spark.style.setProperty('--spark-angle', `${index * 45}deg`);
        spark.textContent = '■';
        effect.append(spark);
      }
    } else {
      const ghost = document.createElement('span');
      ghost.className = 'hit-ghost';
      ghost.textContent = this.shift ? hit.letter.toUpperCase() : hit.letter;
      effect.append(ghost);
    }
    this.impactLayer.append(effect);
    window.setTimeout(() => effect.remove(), 480);
  }
}