import { StateStore, createInitialState, validateBackup } from './storage.js';
import { alignLetters, canAutoConfirmAnswer, classifyAnswer, validateWord } from './spelling.js';
import { createSessionPlan } from './scheduler.js';
import { ACCESSORIES, DEFAULT_EQUIPMENT, WARDROBE_SLOTS, rewardForEncounter, unlockForStars } from './rewards.js';
import { AudioCoach } from './audio.js';
import { hapticsSupport, pulse } from './haptics.js';
import { LetterKeyboard } from './keyboard.js';
import { SpellingArcade } from './arcade.js';
import { setMascotEquipment, setMascotState, celebrate } from './mascot.js';

const PARENT_PIN = '4441';
const TYPING_IDLE_SUBMIT_DELAY = 900;
const store = new StateStore();
let state = createInitialState();
let keyboard;
let arcade;
let parentUnlocked = false;
let pinDigits = '';
let editingSetId = null;
let sentenceDraft = new Map();
let speechReady = false;
let submissionLocked = false;
let arcadeShift = false;
let pendingCorrectAdvance = false;
let arcadeAdvanceTimer = 0;
let celebrationTimer = 0;
let typingSubmitTimer = 0;
let saveChain = Promise.resolve();
let saveTimer = 0;
let saveBlocked = false;
let speakRun = 0;
let waitingWorker = null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const audio = new AudioCoach(message => {
  showMessage(message);
  const prompt = document.querySelector('#prompt-status');
  if (prompt && practiceVisible()) prompt.textContent = message;
});

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function currentSet() {
  return state.sets.find(set => set.current && !set.archived) || null;
}

function currentEncounter() {
  return state.activeSession?.queue[state.activeSession.index] || null;
}

function reducedMotionEnabled() {
  return Boolean(state.settings.reducedMotion || prefersReducedMotion.matches);
}

function showMessage(message, kind = 'notice') {
  const region = document.querySelector('#app-message');
  region.textContent = message;
  region.dataset.kind = kind;
  region.hidden = !message;
  if (message) window.clearTimeout(showMessage.timer), showMessage.timer = window.setTimeout(() => { region.hidden = true; }, 6500);
}

// In-page replacement for confirm(): browsers can suppress native dialogs, which made buttons look dead.
function askConfirm(message, yesLabel = 'Yes') {
  const dialog = document.querySelector('#confirm-dialog');
  if (typeof dialog?.showModal !== 'function') return Promise.resolve(window.confirm(message));
  return new Promise(resolve => {
    document.querySelector('#confirm-message').textContent = message;
    document.querySelector('#confirm-yes').textContent = yesLabel;
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), { once: true });
    dialog.showModal();
  });
}

function displayView(name) {
  if (practiceVisible() && name !== 'practice') {
    audio.stop();
    arcade?.pause();
    clearTypingAutoSubmit();
    window.clearTimeout(arcadeAdvanceTimer);
    pendingCorrectAdvance = false;
    speakRun += 1;
  }
  document.querySelectorAll('.view').forEach(view => {
    const active = view.id === `view-${name}`;
    view.classList.toggle('active', active);
    view.hidden = !active;
  });
  if (name !== 'parent') parentUnlocked = false;
  if (name === 'home') renderHome();
  if (name === 'wardrobe') renderWardrobe();
  if (name === 'parent') renderParent();
  window.scrollTo?.(0, 0);
}

async function persist({ debounce = false } = {}) {
  if (saveBlocked) return false;
  if (debounce) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => persist(), 250);
    return;
  }
  const snapshot = structuredClone(state);
  saveChain = saveChain.then(async () => {
    try {
      await store.save(snapshot);
      document.querySelector('#save-indicator').textContent = 'Saved';
      window.setTimeout(() => { document.querySelector('#save-indicator').textContent = ''; }, 1800);
      return true;
    } catch (error) {
      document.querySelector('#save-indicator').textContent = 'Not saved';
      showMessage(`${error.message || 'Progress could not be saved.'} Try exporting a backup when storage is available.`, 'error');
      return false;
    }
  });
  return saveChain;
}

async function initialize() {
  // Controllers first, so a slow or failed load can never leave the buttons dead.
  keyboard = new LetterKeyboard(document.querySelector('#letter-keyboard'), onTypingChange, submitAnswer);
  arcade = new SpellingArcade(document.querySelector('#arcade-panel'), {
    getSettings: () => state.settings,
    onShoot: () => {
      audio.playCannonShot(state.settings.effectsVolume, state.settings.effectsMuted);
      pulse([12], vibrationEnabled());
    },
    onLetter: letter => {
      const encounter = currentEncounter();
      if (!encounter || !speechReady || encounter.status !== 'pending') return;
      const expected = [...encounter.target][[...encounter.answer].length];
      arcadeShift = false;
      arcade.setShift(false);
      renderShiftToggle();
      if (letter !== expected) {
        const sameLetterOtherCase = expected && letter.toLocaleLowerCase('en-GB') === expected.toLocaleLowerCase('en-GB');
        document.querySelector('#prompt-status').textContent = sameLetterOtherCase ? 'Nearly! Check the capital letter.' : 'Your answer stays hidden until you finish.';
        return;
      }
      document.querySelector('#prompt-status').textContent = 'Your answer stays hidden until you finish.';
      audio.speakLetter(letter, state.settings.rate || 0.86);
      encounter.answer += letter;
      renderArcadeAnswer();
      flashArcadeAnswer(true);
      arcade.setAnswer(encounter.answer);
      persist({ debounce: true });
      if (canAutoConfirmAnswer(encounter.answer, encounter.target)) {
        queueMicrotask(() => submitAnswer());
      }
    }
  });
  try {
    const loaded = await store.load();
    state = loaded && loaded.version === 1 ? loaded : createInitialState();
    normalizeWardrobeState();
    if (!Array.isArray(state.pausedSessions)) state.pausedSessions = [];
    if (!state.settings) state.settings = createInitialState().settings;
    navigator.storage?.persist?.().catch(() => {});
  } catch (error) {
    // Never save over data we could not read.
    state = createInitialState();
    saveBlocked = true;
    showMessage(`${error.message || 'Saved progress could not be opened.'} Nothing has been erased. Close other Word Ninja tabs and reload.`, 'error');
  }
  renderHome();
  renderSettings();
  registerServiceWorker();
}

function renderHome() {
  renderMascots('idle');
  const set = currentSet();
  const summary = document.querySelector('#weekly-summary');
  const preview = document.querySelector('#home-word-preview');
  const bar = document.querySelector('#weekly-progress-bar');
  const label = document.querySelector('#weekly-progress-label');
  const subtitle = document.querySelector('#home-subtitle');
  const resume = document.querySelector('#resume-session');
  document.querySelector('#star-count').textContent = state.stars || 0;
  preview.replaceChildren();
  if (!set || !set.wordIds.length) {
    summary.textContent = 'No words yet. Ask a parent to add this week’s list.';
    label.textContent = 'Waiting for your first word list';
    bar.style.width = '0%';
    subtitle.textContent = 'Ask a parent to add your school spelling words.';
  } else {
    const words = set.wordIds.map(id => state.words.find(word => word.id === id)).filter(Boolean);
    const practised = words.filter(word => ['typing', 'arcade'].some(mode => (state.stats[`${word.id}:${mode}`]?.attempts || 0) > 0)).length;
    summary.textContent = `${set.title}${set.testDate ? ` · test ${formatDate(set.testDate)}` : ''} · ${words.length} words`;
    label.textContent = `Weekly words: ${practised} of ${words.length} practised`;
    bar.style.width = `${words.length ? (practised / words.length) * 100 : 0}%`;
    subtitle.textContent = 'Pick a way to practise. Both games have your whole list.';
    words.slice(0, 8).forEach(word => {
      const item = document.createElement('li');
      item.textContent = word.text;
      preview.append(item);
    });
    if (words.length > 8) {
      const more = document.createElement('li');
      more.textContent = `+${words.length - 8} more`;
      preview.append(more);
    }
  }
  const savedGames = [state.activeSession, ...(state.pausedSessions || [])].filter(Boolean);
  resume.hidden = savedGames.length === 0;
  resume.textContent = savedGames.length ? `Continue your saved game${savedGames.length > 1 ? ` (${savedGames.length})` : ''} →` : '';
  document.querySelector('#saved-games').innerHTML = (state.pausedSessions || []).map(session => {
    const savedSet = state.sets.find(item => item.id === session.setId);
    const label = session.mode === 'typing' ? 'Type the words' : 'Spelling Arcade';
    return `<button class="saved-game-link" type="button" data-resume-session="${session.id}">Resume ${escapeHtml(savedSet?.title || 'saved list')} · ${label}</button>`;
  }).join('');
}

function renderMascots(stateName) {
  setMascotState(stateName, reducedMotionEnabled());
  setMascotEquipment(state.equippedItems);
}

function renderWardrobe() {
  document.querySelector('#wardrobe-stars').textContent = state.stars || 0;
  const grid = document.querySelector('#accessory-grid');
  grid.innerHTML = WARDROBE_SLOTS.map(slot => {
    const items = ACCESSORIES.filter(item => item.slot === slot.id);
    return `<section class="wardrobe-category" aria-labelledby="wardrobe-${slot.id}"><h2 id="wardrobe-${slot.id}">${escapeHtml(slot.name)}</h2><div class="accessory-grid">${items.map(item => {
    const owned = state.ownedAccessories.includes(item.id);
    const equipped = state.equippedItems[item.slot] === item.id;
    const remaining = Math.max(0, item.cost - (state.stars || 0));
    const stateLabel = equipped ? 'Equipped' : owned ? 'Unlocked' : `Unlock at ${item.cost} stars · ${remaining} to go`;
    const action = equipped ? 'Equipped' : owned ? 'Wear' : `🔒 ${item.cost} ★`;
    const swatchStyle = item.color ? ` style="--item-color:${item.color}"` : '';
    return `<article class="accessory-item ${equipped ? 'equipped' : ''} ${owned ? 'is-owned' : 'is-locked'}"><span class="accessory-icon"${swatchStyle} aria-hidden="true">${escapeHtml(item.icon)}</span><div><strong>${escapeHtml(item.name)}</strong><small>${stateLabel}</small></div><button class="button ${equipped ? 'button-secondary' : 'button-primary'}" type="button" data-accessory="${item.id}" ${!owned || equipped ? 'disabled' : ''}>${action}</button></article>`;
    }).join('')}</div></section>`;
  }).join('');
  const equippedNames = WARDROBE_SLOTS.map(slot => {
    const item = ACCESSORIES.find(accessory => accessory.id === state.equippedItems[slot.id]);
    return item && !item.id.startsWith('no-') ? item.name : '';
  }).filter(Boolean);
  document.querySelector('#equipped-label').textContent = equippedNames.length ? `Wearing: ${equippedNames.join(', ')}` : 'Nix is ready for a new look';
  renderMascots('idle');
}

function normalizeWardrobeState(targetState = state) {
  const legacyEquipmentId = targetState.equippedAccessory;
  const hasSlotEquipment = targetState.equippedItems && typeof targetState.equippedItems === 'object' && !Array.isArray(targetState.equippedItems);
  const equippedItems = hasSlotEquipment
    ? { ...DEFAULT_EQUIPMENT, ...targetState.equippedItems }
    : { ...DEFAULT_EQUIPMENT };
  const legacyItem = ACCESSORIES.find(item => item.id === legacyEquipmentId);
  if (!hasSlotEquipment && legacyItem) {
    equippedItems[legacyItem.slot] = legacyItem.id;
  }
  const owned = new Set(Array.isArray(targetState.ownedAccessories) ? targetState.ownedAccessories : []);
  Object.values(DEFAULT_EQUIPMENT).forEach(id => owned.add(id));
  targetState.equippedItems = equippedItems;
  targetState.ownedAccessories = [...owned];
  for (const slot of WARDROBE_SLOTS) {
    const validItem = ACCESSORIES.find(item => item.id === targetState.equippedItems[slot.id] && item.slot === slot.id);
    if (!validItem || !owned.has(validItem.id)) targetState.equippedItems[slot.id] = DEFAULT_EQUIPMENT[slot.id];
  }
  targetState.equippedAccessory = targetState.equippedItems.headwear;
  unlockAccessories(targetState);
}

function renderParent() {
  if (!parentUnlocked) return displayView('pin');
  renderSetList();
  renderStats();
  renderSettings();
}

function renderSetList() {
  const list = document.querySelector('#set-list');
  const sets = [...state.sets].sort((left, right) => Number(right.current) - Number(left.current) || left.title.localeCompare(right.title));
  if (!sets.length) {
    list.innerHTML = '<p class="empty-parent">No word lists yet. Create one here. Your first saved list becomes this week’s list.</p>';
    return;
  }
  list.innerHTML = sets.map(set => `<article class="set-row ${set.current ? 'current' : ''}"><button type="button" class="set-main" data-set-action="edit" data-set-id="${set.id}"><strong>${escapeHtml(set.title)}${set.current ? ' · This week' : ''}${set.archived ? ' · Archived' : ''}</strong><small>${set.wordIds.length} words${set.testDate ? ` · test ${formatDate(set.testDate)}` : ''}</small></button><div class="set-actions">${!set.archived && !set.current ? `<button class="mini-button" type="button" data-set-action="activate" data-set-id="${set.id}" aria-label="Make ${escapeHtml(set.title)} current">Use</button>` : ''}<button class="mini-button" type="button" data-set-action="edit" data-set-id="${set.id}" aria-label="Edit ${escapeHtml(set.title)}">Edit</button>${!set.archived ? `<button class="mini-button" type="button" data-set-action="archive" data-set-id="${set.id}" aria-label="Archive ${escapeHtml(set.title)}">Archive</button>` : ''}</div></article>`).join('');
}

function renderStats() {
  const rows = [];
  state.words.forEach(word => {
    for (const mode of ['typing', 'arcade']) {
      const stats = state.stats[`${word.id}:${mode}`];
      if (!stats?.attempts) continue;
      const sessions = stats.independentSessionIds?.length || 0;
      rows.push(`<tr><td>${escapeHtml(word.text)}</td><td>${mode === 'typing' ? 'Typing' : 'Arcade'}</td><td>${stats.firstSuccesses || 0} independent · ${sessions} sessions</td><td>${stats.assistedCorrections || 0}</td><td>${stats.laterRecallSuccesses || 0}</td><td>${stats.lastPractised ? formatDate(stats.lastPractised.slice(0, 10)) : '—'}</td></tr>`);
    }
  });
  document.querySelector('#stats-table').innerHTML = rows.join('') || '<tr><td colspan="6">No practice history yet.</td></tr>';
}

function renderSettings() {
  const settings = state.settings;
  settings.arcadeDensity = Number(settings.arcadeDensity) <= 3 ? 3 : 4;
  const voiceSelect = document.querySelector('#voice-select');
  if (voiceSelect) refreshVoiceOptions();
  setValue('#speech-rate', settings.rate ?? 0.86);
  setValue('#speech-rate-label', Number(settings.rate ?? 0.86).toFixed(2));
  setValue('#effects-volume', settings.effectsVolume ?? 0.4);
  setChecked('#effects-muted', settings.effectsMuted);
  setChecked('#reduced-motion', settings.reducedMotion);
  setChecked('#vibration', settings.vibration !== false);
  document.querySelector('#vibration-note').textContent = {
    vibrate: 'Buzzes on correct answers and cannon shots.',
    'ios-tick': 'iPhone web pages cannot vibrate. This uses a light tap that only works right after a touch, and may not work on every iPhone.',
    none: 'This device does not support vibration.'
  }[hapticsSupport()];
  setValue('#arcade-speed', settings.arcadeSpeed ?? 26);
  setValue('#arcade-speed-label', String(settings.arcadeSpeed ?? 26));
  setValue('#arcade-density', settings.arcadeDensity ?? 5);
}

function refreshVoiceOptions() {
  const select = document.querySelector('#voice-select');
  if (!select) return;
  const englishVoices = audio.voices.filter(voice => /^en(-|_)/i.test(voice.lang)).sort((left, right) => Number(right.lang.toLowerCase() === 'en-gb') - Number(left.lang.toLowerCase() === 'en-gb') || Number(right.localService) - Number(left.localService) || left.name.localeCompare(right.name));
  const selected = state.settings.voiceURI || '';
  select.innerHTML = englishVoices.length
    ? `<option value="">Automatic British English choice</option>${englishVoices.map(voice => `<option value="${escapeHtml(voice.voiceURI)}">${escapeHtml(voice.name)} · ${escapeHtml(voice.lang)}${voice.localService ? ' · on device' : ''}</option>`).join('')}`
    : '<option value="">No English voice detected</option>';
  select.value = englishVoices.some(voice => voice.voiceURI === selected) ? selected : '';
  const selectedVoice = englishVoices.find(voice => voice.voiceURI === select.value);
  if (select.value) audio.selectPreferredVoice({ voiceURI: select.value });
  else audio.selectPreferredVoice({ voiceURI: state.settings.voiceURI });
  if (selectedVoice) state.settings.voiceName = selectedVoice.name;
}

function startNewSet() {
  editingSetId = null;
  sentenceDraft = new Map();
  document.querySelector('#editor-heading').textContent = 'Create a word set';
  document.querySelector('#set-title').value = '';
  document.querySelector('#test-date').value = '';
  document.querySelector('#word-lines').value = '';
  document.querySelector('#set-form-message').textContent = '';
  document.querySelector('#activate-set').hidden = true;
  document.querySelector('#cancel-edit-set').hidden = true;
  document.querySelector('#save-set').textContent = 'Save list';
  updateWordDetails();
  document.querySelector('#set-title').focus();
}

function editSet(setId) {
  const set = state.sets.find(item => item.id === setId);
  if (!set) return;
  editingSetId = set.id;
  sentenceDraft = new Map();
  const words = set.wordIds.map(id => state.words.find(word => word.id === id)).filter(Boolean);
  words.forEach(word => sentenceDraft.set(word.text, word.sentence || ''));
  document.querySelector('#editor-heading').textContent = `Edit ${set.title}`;
  document.querySelector('#set-title').value = set.title;
  document.querySelector('#test-date').value = set.testDate || '';
  document.querySelector('#word-lines').value = words.map(word => word.text).join('\n');
  document.querySelector('#activate-set').hidden = set.current || set.archived;
  document.querySelector('#cancel-edit-set').hidden = false;
  document.querySelector('#save-set').textContent = 'Save changes';
  document.querySelector('#set-form-message').textContent = '';
  updateWordDetails();
  document.querySelector('#set-title').focus();
}

function currentDraftWords() {
  return document.querySelector('#word-lines').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function updateWordDetails() {
  const container = document.querySelector('#word-details');
  container.querySelectorAll('[data-sentence-word]').forEach(input => sentenceDraft.set(input.dataset.sentenceWord, input.value));
  const words = currentDraftWords();
  container.innerHTML = words.map((word, index) => `<label class="word-detail-row"><span>${escapeHtml(word)}</span><input type="text" maxlength="180" data-sentence-word="${escapeHtml(word)}" aria-label="Optional example sentence for ${escapeHtml(word)}" placeholder="Optional example sentence" value="${escapeHtml(sentenceDraft.get(word) || '')}"></label>`).join('');
}

function saveSet(event) {
  event.preventDefault();
  const title = document.querySelector('#set-title').value.trim();
  const words = currentDraftWords();
  const message = document.querySelector('#set-form-message');
  if (!title) return setFormError('Add a name for this word list.');
  if (!words.length) return setFormError('Add at least one spelling word.');
  const seen = new Map();
  for (const word of words) {
    const validation = validateWord(word);
    if (validation) return setFormError(`“${word}”: ${validation}`);
    const normalized = word.toLocaleLowerCase('en-GB');
    if (seen.has(normalized)) return setFormError(`“${word}” is a duplicate of “${seen.get(normalized)}”. Check the capital letters and remove the duplicate if needed.`);
    seen.set(normalized, word);
  }
  const oldSet = editingSetId ? state.sets.find(set => set.id === editingSetId) : null;
  const oldWords = new Map((oldSet?.wordIds || []).map(id => [state.words.find(word => word.id === id)?.text, id]));
  const wordIds = words.map(wordText => {
    const existingId = oldWords.get(wordText);
    const existingWord = existingId && state.words.find(word => word.id === existingId);
    const sentence = document.querySelector(`[data-sentence-word="${cssEscape(wordText)}"]`)?.value.trim() || sentenceDraft.get(wordText) || '';
    if (existingWord) {
      existingWord.sentence = sentence;
      return existingWord.id;
    }
    const created = { id: makeId('word'), text: wordText, sentence, createdAt: new Date().toISOString() };
    state.words.push(created);
    return created.id;
  });
  if (oldSet) {
    oldSet.title = title;
    oldSet.testDate = document.querySelector('#test-date').value;
    oldSet.wordIds = wordIds;
  } else {
    const newSet = { id: makeId('set'), title, testDate: document.querySelector('#test-date').value, wordIds, current: !currentSet(), archived: false, createdAt: new Date().toISOString() };
    if (newSet.current) state.sets.forEach(set => { set.current = false; });
    state.sets.push(newSet);
    editingSetId = newSet.id;
    document.querySelector('#editor-heading').textContent = `Edit ${newSet.title}`;
    document.querySelector('#cancel-edit-set').hidden = false;
    document.querySelector('#save-set').textContent = 'Save changes';
    document.querySelector('#activate-set').hidden = newSet.current;
  }
  message.textContent = 'List saved on this device.';
  message.classList.add('success');
  persist();
  renderSetList();
  renderHome();
}

function setFormError(text) {
  const message = document.querySelector('#set-form-message');
  message.textContent = text;
  message.classList.remove('success');
}

function activateSet(setId) {
  const set = state.sets.find(item => item.id === setId);
  if (!set || set.archived || !set.wordIds.length) return;
  askConfirm(`Make “${set.title}” the current weekly spelling list? Older lists and their practice history will stay saved.`, 'Make current').then(confirmed => {
    if (!confirmed) return;
    state.sets.forEach(item => { item.current = item.id === set.id; });
    persist();
    renderSetList();
    renderHome();
    showMessage(`“${set.title}” is now this week’s list.`);
  });
}

function archiveSet(setId) {
  const set = state.sets.find(item => item.id === setId);
  if (!set) return;
  if (set.current && !state.sets.some(item => item.id !== set.id && !item.archived && item.wordIds.length)) {
    showMessage('Create or activate another word list before archiving the current one.');
    return;
  }
  askConfirm(`Archive “${set.title}”? Its word list and practice history will be kept, but it will no longer be selectable for this week.`, 'Archive').then(confirmed => {
    if (!confirmed) return;
    set.archived = true;
    set.current = false;
    if (!currentSet()) {
      const replacement = state.sets.find(item => !item.archived && item.wordIds.length);
      if (replacement) replacement.current = true;
    }
    persist();
    renderSetList();
    renderHome();
  });
}

function beginSession(mode) {
  const set = currentSet();
  if (!set || !set.wordIds.length) {
    showMessage('There is no weekly word list yet. Ask a parent to add one.');
    return;
  }
  if (state.activeSession) {
    pauseActiveSession();
    showMessage('Your earlier game is saved. Use “Continue your saved game” to return to it.');
  }
  createSession(set, mode);
  persist();
  openPractice({ speak: true });
}

function pauseActiveSession() {
  if (!state.activeSession) return;
  state.pausedSessions ||= [];
  state.pausedSessions = state.pausedSessions.filter(session => session.id !== state.activeSession.id);
  state.pausedSessions.unshift(state.activeSession);
  const record = state.sessions.find(session => session.id === state.activeSession.id);
  if (record) record.status = 'paused';
  state.activeSession = null;
}

function createSession(set, mode) {
  const plan = createSessionPlan({ set, words: state.words, stats: state.stats, reviewBudget: state.reviewBudget, mode });
  state.reviewBudget = plan.nextBudget;
  state.activeSession = {
    id: makeId('session'), setId: set.id, mode, startedAt: new Date().toISOString(), queue: plan.queue.map(item => makeEncounter(item)),
    index: 0, streakByMode: {}, independentCount: 0, assistedCount: 0, laterCount: 0, starsEarned: 0, reviewCount: plan.queue.filter(item => item.kind === 'review').length
  };
  state.sessions.push({ id: state.activeSession.id, setId: set.id, mode, startedAt: state.activeSession.startedAt, status: 'active' });
}

function resumeSavedSession(sessionId = state.activeSession?.id || state.pausedSessions?.[0]?.id) {
  if (!sessionId) return;
  if (state.activeSession?.id === sessionId) return openPractice({ speak: !currentEncounter()?.heard });
  if (state.activeSession) pauseActiveSession();
  const savedIndex = (state.pausedSessions || []).findIndex(session => session.id === sessionId);
  if (savedIndex < 0) return;
  state.activeSession = state.pausedSessions.splice(savedIndex, 1)[0];
  const record = state.sessions.find(session => session.id === state.activeSession.id);
  if (record) Object.assign(record, { status: 'active', mode: state.activeSession.mode });
  persist();
  openPractice({ speak: !currentEncounter()?.heard });
}

function makeEncounter(item, laterRecall = false) {
  return { encounterId: makeId('encounter'), wordId: item.wordId, target: item.target, kind: laterRecall ? 'later-recall' : item.kind, laterRecall, answer: '', heard: false, revealed: false, submissions: [], status: 'pending', recallScheduled: false };
}

function openPractice({ speak = false } = {}) {
  clearTypingAutoSubmit();
  window.clearTimeout(arcadeAdvanceTimer);
  pendingCorrectAdvance = false;
  const session = state.activeSession;
  const encounter = currentEncounter();
  if (!session || !encounter) return finishSession();
  if (encounter.status === 'complete') {
    session.index += 1;
    persist();
    return openPractice({ speak: true });
  }
  const isTyping = session.mode === 'typing';
  document.querySelector('#typing-panel').hidden = !isTyping;
  document.querySelector('#arcade-panel').hidden = isTyping;
  document.querySelector('#feedback-panel').hidden = true;
  document.querySelector('#pause-panel').hidden = true;
  const practiceView = document.querySelector('#view-practice');
  practiceView.classList.remove('feedback-active', 'paused');
  document.querySelector('#typing-panel').inert = false;
  document.querySelector('#typed-answer').classList.remove('answer-correct');
  document.querySelector('#celebration-effects').hidden = true;
  document.querySelector('#celebration-effects').classList.remove('playing', 'static');
  const weeklyCount = session.queue.filter(item => item.kind !== 'review' && !item.laterRecall).length;
  const currentWeekly = session.queue.slice(0, session.index + 1).filter(item => item.kind !== 'review' && !item.laterRecall).length;
  document.querySelector('#practice-title').textContent = `Weekly words: ${Math.min(currentWeekly, weeklyCount)} of ${weeklyCount}`;
  document.querySelector('#practice-kind').textContent = encounter.laterRecall ? 'LATER RECALL' : encounter.kind === 'review' ? 'REVIEW WORD' : 'WEEKLY WORD';
  document.querySelector('#prompt-status').textContent = encounter.revealed ? `Word spelling: ${encounter.target}` : 'Listen carefully, then build the word.';
  document.querySelector('#correction-model').hidden = !encounter.revealed;
  document.querySelector('#correction-model strong').textContent = encounter.revealed ? encounter.target : '';
  speechReady = Boolean(encounter.heard);
  submissionLocked = false;
  arcadeShift = false;
  renderShiftToggle();
  if (!isTyping) encounter.answer = correctPrefix(encounter.answer, encounter.target);
  keyboard.setValue(encounter.answer);
  updateSubmitAvailability();
  renderArcadeAnswer();
  renderMascots('listening');
  displayView('practice');
  if (isTyping) arcade.pause();
  else {
    arcade.start(encounter.target, encounter.answer);
    arcade.pause();
  }
  document.querySelector('#pause-game').disabled = false;
  if (speak || !encounter.heard) speakCurrent({ resume: true });
  else {
    speechReady = true;
    document.querySelector('#prompt-status').textContent = encounter.revealed ? `Word spelling: ${encounter.target}` : 'Listen again any time. Your answer will stay hidden.';
    if (!isTyping) arcade.resume();
  }
}

async function speakCurrent({ resume = false } = {}) {
  clearTypingAutoSubmit();
  const encounter = currentEncounter();
  if (!encounter) return;
  audio.stop();
  speechReady = false;
  const run = ++speakRun;
  arcade.pause();
  document.querySelector('#prompt-status').textContent = 'Listen carefully…';
  renderMascots('listening');
  try {
    const outcome = await audio.speakWord(encounter.target, state.words.find(word => word.id === encounter.wordId)?.sentence || '', state.settings.rate || 0.86);
    if (run !== speakRun) return;
    encounter.heard = true;
    speechReady = true;
    document.querySelector('#prompt-status').textContent = outcome?.silent
      ? 'I could not tell if the word played. Tap the speaker to hear it again.'
      : encounter.revealed ? `Word spelling: ${encounter.target}` : 'Your answer stays hidden until you finish.';
    renderMascots('idle');
    if (resume && practiceVisible() && state.activeSession?.mode === 'arcade' && !document.querySelector('#view-practice').classList.contains('paused')) arcade.resume();
    updateSubmitAvailability();
    // Letters typed while the word was still playing are checked now.
    if (practiceVisible() && state.activeSession?.mode === 'typing' && keyboard.value) onTypingChange(keyboard.value);
    persist();
  } catch (error) {
    if (error?.superseded || run !== speakRun) return;
    speechReady = false;
    updateSubmitAvailability();
  }
}

function updateSubmitAvailability() {
  if (state.activeSession?.mode === 'typing') document.querySelector('#typing-finished').disabled = !keyboard?.value || !speechReady || submissionLocked;
}

function onTypingChange(value) {
  const encounter = currentEncounter();
  if (!encounter || state.activeSession?.mode !== 'typing') return;
  const insertedLetter = findInsertedLetter(encounter.answer, value);
  if (insertedLetter) audio.speakLetter(insertedLetter, state.settings.rate || 0.86);
  encounter.answer = value;
  updateSubmitAvailability();
  persist({ debounce: true });
  clearTypingAutoSubmit();
  // iOS can only tick inside a tap, so buzz when the last letter lands.
  if (hapticsSupport() === 'ios-tick' && canAutoConfirmAnswer(value, encounter.target)) pulse([35], vibrationEnabled());
  if (value && speechReady && encounter.status === 'pending') {
    const encounterId = encounter.encounterId;
    document.querySelector('#typing-status').textContent = `${value.length} letters · I’ll check when you pause.`;
    const submitAfterIdle = () => {
      const current = currentEncounter();
      if (current?.encounterId !== encounterId || current.status !== 'pending' || !speechReady || !practiceVisible() || document.hidden) return;
      if (audio.hasPendingLetters) {
        typingSubmitTimer = window.setTimeout(submitAfterIdle, 120);
        return;
      }
      if (canAutoConfirmAnswer(current.answer, current.target)) {
        submitAnswer();
      } else {
        document.querySelector('#typing-status').textContent = 'Take your time. Press Finished when you’re ready.';
      }
    };
    typingSubmitTimer = window.setTimeout(submitAfterIdle, TYPING_IDLE_SUBMIT_DELAY);
  }
}

function findInsertedLetter(previousValue, nextValue) {
  const previous = [...previousValue];
  const next = [...nextValue];
  if (next.length !== previous.length + 1) return '';
  let insertionIndex = 0;
  while (insertionIndex < previous.length && previous[insertionIndex] === next[insertionIndex]) insertionIndex += 1;
  if (previous.slice(insertionIndex).join('') !== next.slice(insertionIndex + 1).join('')) return '';
  return next[insertionIndex];
}

function clearTypingAutoSubmit() {
  window.clearTimeout(typingSubmitTimer);
  typingSubmitTimer = 0;
}

function correctPrefix(answer, target) {
  const typed = [...answer];
  const expected = [...target];
  let length = 0;
  while (length < typed.length && typed[length] === expected[length]) length += 1;
  return typed.slice(0, length).join('');
}

function renderArcadeAnswer() {
  const encounter = currentEncounter();
  const answer = document.querySelector('#arcade-answer');
  if (answer) answer.textContent = encounter?.answer || '';
}

function flashArcadeAnswer(isCorrectLetter) {
  const answer = document.querySelector('#arcade-answer');
  const flashClass = isCorrectLetter ? 'flash-correct' : 'flash-wrong';
  answer.classList.remove('flash-correct', 'flash-wrong', 'flash-static');
  void answer.offsetWidth;
  answer.classList.add(flashClass);
  if (reducedMotionEnabled()) answer.classList.add('flash-static');
  window.setTimeout(() => answer.classList.remove('flash-correct', 'flash-wrong', 'flash-static'), reducedMotionEnabled() ? 260 : 500);
}

function renderShiftToggle() {
  const shift = document.querySelector('.shift-toggle');
  shift.setAttribute('aria-pressed', String(arcadeShift));
  shift.textContent = `⇧ Shift: ${arcadeShift ? 'on' : 'off'}`;
  arcade?.setShift(arcadeShift);
}

async function submitAnswer() {
  const encounter = currentEncounter();
  const session = state.activeSession;
  if (!encounter || !session || encounter.status !== 'pending' || submissionLocked) return;
  const answer = session.mode === 'typing' ? keyboard.value : encounter.answer;
  if (!answer) return;
  if (!speechReady) {
    showMessage('Hear the spoken word before submitting. Tap Replay to try again.', 'error');
    return;
  }
  clearTypingAutoSubmit();
  submissionLocked = true;
  arcade.pause();
  audio.stop();
  const wasRevealed = encounter.revealed;
  const firstSubmission = encounter.submissions.length === 0;
  const result = classifyAnswer(answer, encounter.target);
  const timestamp = new Date().toISOString();
  const mode = session.mode;
  const statKey = `${encounter.wordId}:${mode}`;
  const stats = state.stats[statKey] ||= { attempts: 0, firstSuccesses: 0, firstMisses: 0, assistedCorrections: 0, laterRecallSuccesses: 0, independentSessionIds: [], consecutiveIndependentSessions: 0, lastPractised: '' };
  stats.attempts += 1;
  stats.lastPractised = timestamp;
  const event = {
    wordId: encounter.wordId, target: encounter.target, mode, timestamp, sessionId: session.id, encounterId: encounter.encounterId,
    answer, submissionNo: encounter.submissions.length + 1, correct: result.kind === 'correct', answerRevealed: wasRevealed, laterRecall: encounter.laterRecall,
    outcomeType: mode === 'arcade' ? 'supported-letter-selection' : 'typed-recall'
  };
  state.attempts.push(event);
  encounter.submissions.push(event);
  if (result.kind !== 'correct') {
    if (firstSubmission) {
      stats.firstMisses += 1;
      session.streakByMode[mode] = 0;
      scheduleLaterRecall(session, encounter);
    }
    encounter.heard = true;
    persist();
    showAnswerFeedback({ answer, encounter, result, assisted: wasRevealed, correct: false });
    return;
  }

  encounter.status = 'complete';
  let feedbackKind = 'independent';
  if (encounter.laterRecall && !wasRevealed) {
    stats.laterRecallSuccesses += 1;
    session.laterCount += 1;
    feedbackKind = 'later';
  } else if (wasRevealed || !firstSubmission) {
    stats.assistedCorrections += 1;
    session.assistedCount += 1;
    feedbackKind = 'assisted';
  } else if (firstSubmission) {
    stats.firstSuccesses += 1;
    if (!stats.independentSessionIds.includes(session.id)) stats.independentSessionIds.push(session.id);
    stats.consecutiveIndependentSessions = stats.independentSessionIds.length;
    session.independentCount += 1;
    session.streakByMode[mode] = (session.streakByMode[mode] || 0) + 1;
  }
  const reward = awardEncounter(session, encounter, feedbackKind);
  session.starsEarned += reward;
  persist();
  celebrateCorrectAnswer(feedbackKind, reward);
}

function celebrateCorrectAnswer(feedbackKind, reward) {
  const session = state.activeSession;
  const typing = session.mode === 'typing';
  const streak = session.streakByMode[session.mode] || 0;
  const big = feedbackKind === 'independent' && streak >= 2;
  pendingCorrectAdvance = true;
  arcade.pause();
  if (typing) audio.playFanfare(state.settings.effectsVolume, state.settings.effectsMuted, big);
  else audio.playEffect(big ? 'big' : 'small', state.settings.effectsVolume, state.settings.effectsMuted);
  renderMascots(big ? 'celebrating-big' : 'celebrating');
  triggerCorrectCelebration(feedbackKind, streak);
  document.querySelector('#feedback-panel').hidden = true;
  document.querySelector('#view-practice').classList.remove('feedback-active');
  if (typing) {
    document.querySelector('#typing-panel').inert = true;
    document.querySelector('#typed-answer').classList.add('answer-correct');
  }
  burstAnswerSparks(document.querySelector(typing ? '#typed-answer' : '#arcade-answer'));
  document.querySelector('#prompt-status').textContent = `${correctHeadline(feedbackKind, streak)}${reward ? ` +${reward} star${reward === 1 ? '' : 's'}` : ''}`;
  document.querySelector('#star-count').textContent = state.stars;
  arcadeAdvanceTimer = window.setTimeout(() => {
    if (!pendingCorrectAdvance || document.hidden || !practiceVisible()) return;
    pendingCorrectAdvance = false;
    document.querySelector('#celebration-effects').hidden = true;
    advanceEncounter();
  }, reducedMotionEnabled() ? 700 : 1600);
}

function correctHeadline(feedbackKind, streak) {
  if (feedbackKind === 'assisted') return 'You spotted it!';
  if (feedbackKind === 'later') return 'You remembered it later!';
  return streak >= 5 ? 'Five in a row!' : streak >= 3 ? 'Three in a row!' : streak >= 2 ? 'Two in a row!' : 'Correct!';
}

function burstAnswerSparks(element) {
  if (!element || reducedMotionEnabled()) return;
  const textNode = [...element.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent);
  const range = document.createRange();
  range.selectNodeContents(textNode || element);
  const rect = range.getBoundingClientRect();
  const layer = document.createElement('div');
  layer.className = 'answer-sparks';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  const count = 18;
  for (let index = 0; index < count; index += 1) {
    const angle = (((index * 37) % 140) - 70) * Math.PI / 180;
    const distance = 46 + ((index * 13) % 34);
    const spark = document.createElement('span');
    spark.className = 'answer-spark';
    spark.textContent = index % 2 ? '✦' : '★';
    spark.style.left = `${((index + 0.5) / count) * 100}%`;
    spark.style.setProperty('--dx', `${Math.round(Math.sin(angle) * distance)}px`);
    spark.style.setProperty('--dy', `${Math.round(-Math.cos(angle) * distance)}px`);
    spark.style.animationDelay = `${(index % 3) * 45}ms`;
    layer.append(spark);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), 900);
}

function scheduleLaterRecall(session, encounter) {
  if (encounter.recallScheduled || encounter.laterRecall || session.queue.filter(item => item.kind !== 'review' && !item.laterRecall).length <= 3) return;
  encounter.recallScheduled = true;
  const recall = makeEncounter({ wordId: encounter.wordId, target: encounter.target, kind: 'weekly' }, true);
  const afterOthers = session.index + 4;
  session.queue.splice(Math.min(session.queue.length, afterOthers), 0, recall);
}

function awardEncounter(session, encounter, feedbackKind) {
  const reward = rewardForEncounter({
    sessionId: session.id, encounterId: encounter.encounterId,
    result: feedbackKind === 'independent' ? 'correct' : feedbackKind === 'assisted' ? 'correct' : 'correct',
    revealed: feedbackKind === 'assisted', laterRecall: feedbackKind === 'later', alreadyAwarded: false
  });
  const date = new Date().toISOString().slice(0, 10);
  const rewardId = `${date}:${encounter.wordId}:${session.mode}:base`;
  if (!reward.stars || state.rewardEvents.some(item => item.id === rewardId)) return 0;
  state.rewardEvents.push({ id: rewardId, date, wordId: encounter.wordId, mode: session.mode, stars: reward.stars, createdAt: new Date().toISOString() });
  state.stars += reward.stars;
  unlockAccessories();
  return reward.stars;
}

function unlockAccessories(targetState = state) {
  for (const id of unlockForStars(targetState.stars || 0, targetState.ownedAccessories)) targetState.ownedAccessories.push(id);
}

function showAnswerFeedback({ answer, encounter, result }) {
  const practice = document.querySelector('#view-practice');
  const celebration = document.querySelector('#celebration-effects');
  celebration.hidden = true;
  celebration.classList.remove('playing', 'static');
  practice.classList.add('feedback-active');
  document.querySelector('#feedback-panel').hidden = false;
  document.querySelector('#feedback-answer').textContent = answer;
  document.querySelector('#feedback-target').textContent = encounter.target;
  const heading = document.querySelector('#feedback-heading');
  const detail = document.querySelector('#feedback-detail');
  const icon = document.querySelector('#feedback-icon');
  document.querySelector('#feedback-next').hidden = true;
  document.querySelector('#feedback-fix').hidden = false;
  document.querySelector('#feedback-skip').hidden = false;
  document.querySelector('#feedback-target-column').hidden = true;
  document.querySelector('.answer-comparison').classList.add('single-answer');
  heading.textContent = result.message;
  icon.textContent = '✦';
  const alignment = alignLetters(answer, encounter.target);
  const missing = alignment.filter(item => item.state === 'missing').length;
  detail.textContent = result.kind === 'case' ? result.message : missing === 1 ? 'One letter might be missing. Have another go.' : result.kind === 'near' ? 'You’re close. Check the letter order and try again.' : 'Good try. Have another go, or keep practising this word next time.';
  document.querySelector('#prompt-status').textContent = 'Your answer stays hidden until you finish.';
  renderMascots('encouraging');
  arcade.pause();
  document.querySelector('#star-count').textContent = state.stars;
  submissionLocked = false;
  document.querySelector('#feedback-fix').focus({ preventScroll: true });
}

function triggerCorrectCelebration(feedbackKind, streak) {
  const celebration = document.querySelector('#celebration-effects');
  const reducedMotion = reducedMotionEnabled();
  window.clearTimeout(celebrationTimer);
  celebration.hidden = false;
  celebration.dataset.tone = feedbackKind === 'independent' && streak >= 2 ? 'big' : 'small';
  celebration.classList.toggle('static', reducedMotion);
  celebration.classList.remove('playing');
  if (!reducedMotion) {
    requestAnimationFrame(() => {
      celebration.classList.add('playing');
    });
  }
  celebrationTimer = window.setTimeout(() => {
    celebration.hidden = true;
    celebration.classList.remove('playing', 'static');
  }, reducedMotion ? 1050 : 1700);
  pulse(feedbackKind === 'independent' && streak >= 2 ? [35, 35, 55] : [35], vibrationEnabled());
}

function vibrationEnabled() {
  return state.settings.vibration !== false;
}

function fixAnswer() {
  const encounter = currentEncounter();
  if (!encounter) return;
  const practice = document.querySelector('#view-practice');
  practice.classList.remove('feedback-active');
  document.querySelector('#feedback-panel').hidden = true;
  document.querySelector('#prompt-status').textContent = 'Your answer stays hidden until you finish.';
  document.querySelector('#correction-model').hidden = true;
  document.querySelector('#correction-model strong').textContent = '';
  speechReady = true;
  submissionLocked = false;
  if (state.activeSession.mode === 'typing') {
    keyboard.setValue(encounter.answer);
    updateSubmitAvailability();
    document.querySelector('#typing-finished').focus({ preventScroll: true });
  } else {
    arcade.setAnswer(encounter.answer);
    arcade.resume();
    document.querySelector('[data-shoot]').focus({ preventScroll: true });
  }
  renderMascots('encouraging');
}

function skipEncounter() {
  const session = state.activeSession;
  const encounter = currentEncounter();
  if (!session || !encounter) return;
  askConfirm(`Move on from “${encounter.target}” for now? It can come back as a hidden recall later in this game.`, 'Move on').then(confirmed => {
    if (!confirmed || currentEncounter() !== encounter) return;
    encounter.status = 'skipped';
    session.index += 1;
    persist();
    openPractice({ speak: true });
  });
}

function advanceEncounter() {
  const session = state.activeSession;
  const encounter = currentEncounter();
  if (!session || !encounter || encounter.status !== 'complete') return;
  session.index += 1;
  persist();
  openPractice({ speak: true });
}

async function finishSession() {
  const session = state.activeSession;
  if (!session) return displayView('home');
  const date = new Date().toISOString().slice(0, 10);
  const bonusId = `${date}:${session.setId}:${session.mode}:completion`;
  let completionBonus = 0;
  if (!state.rewardEvents.some(item => item.id === bonusId)) {
    completionBonus = 3;
    state.stars += completionBonus;
    state.rewardEvents.push({ id: bonusId, date, setId: session.setId, mode: session.mode, stars: completionBonus, createdAt: new Date().toISOString() });
    session.starsEarned += completionBonus;
    unlockAccessories();
  }
  const record = state.sessions.find(item => item.id === session.id);
  if (record) Object.assign(record, { status: 'complete', completedAt: new Date().toISOString(), independentCount: session.independentCount, assistedCount: session.assistedCount, laterCount: session.laterCount, starsEarned: session.starsEarned });
  state.activeSession = null;
  persist();
  document.querySelector('#results-stars').textContent = `★ +${session.starsEarned} stars${completionBonus ? ' · includes your dojo bonus' : ''}`;
  renderMascots('celebrating-big');
  audio.playEffect('big', state.settings.effectsVolume, state.settings.effectsMuted);
  triggerCorrectCelebration('independent', 5);
  displayView('results');
}

function pauseGame({ fromBackground = false } = {}) {
  if (!practiceVisible()) return;
  clearTypingAutoSubmit();
  arcade.pause();
  audio.stop();
  document.querySelector('#view-practice').classList.add('paused');
  document.querySelector('#pause-panel').hidden = false;
  document.querySelector('#prompt-status').textContent = fromBackground ? 'The game paused while you were away.' : 'Game paused.';
  persist();
}

function openLeaveDialog() {
  if (!practiceVisible() || !state.activeSession) return;
  if (pendingCorrectAdvance) {
    window.clearTimeout(arcadeAdvanceTimer);
    pendingCorrectAdvance = false;
    document.querySelector('#celebration-effects').hidden = true;
    advanceEncounter();
    if (!state.activeSession) return;
  }
  const otherMode = state.activeSession.mode === 'typing' ? 'Spelling Arcade' : 'Type the words';
  document.querySelector('#switch-game-style').textContent = `Switch to ${otherMode}`;
  document.querySelector('#leave-game-dialog').showModal();
  arcade.pause();
  audio.stop();
  persist();
}

function handleLeaveAction(action) {
  const dialog = document.querySelector('#leave-game-dialog');
  if (dialog.open) dialog.close();
  if (action === 'stay') {
    return resumeGame();
  }
  if (action === 'switch') {
    if (!state.activeSession) return;
    state.activeSession.mode = state.activeSession.mode === 'typing' ? 'arcade' : 'typing';
    state.activeSession.streakByMode ||= {};
    const sessionRecord = state.sessions.find(session => session.id === state.activeSession.id);
    if (sessionRecord) sessionRecord.mode = state.activeSession.mode;
    persist();
    return openPractice({ speak: !currentEncounter()?.heard });
  }
  if (action === 'words') {
    arcade.pause();
    audio.stop();
    persist();
    return openPin();
  }
  if (action === 'home') {
    arcade.pause();
    audio.stop();
    persist();
    return displayView('home');
  }
}

function resumeGame() {
  const encounter = currentEncounter();
  document.querySelector('#view-practice').classList.remove('paused');
  document.querySelector('#pause-panel').hidden = true;
  if (pendingCorrectAdvance && encounter?.status === 'complete') {
    window.clearTimeout(arcadeAdvanceTimer);
    pendingCorrectAdvance = false;
    document.querySelector('#celebration-effects').hidden = true;
    return advanceEncounter();
  }
  if (document.querySelector('#view-practice').classList.contains('feedback-active')) return;
  if (!encounter?.heard) return speakCurrent({ resume: true });
  speechReady = true;
  document.querySelector('#prompt-status').textContent = encounter.revealed ? `Word spelling: ${encounter.target}` : 'Your answer stays hidden until you finish.';
  if (state.activeSession.mode === 'arcade') arcade.resume();
  else if (keyboard.value) onTypingChange(keyboard.value);
  persist();
}

function practiceVisible() {
  return document.querySelector('#view-practice').classList.contains('active');
}

function openPin() {
  parentUnlocked = false;
  pinDigits = '';
  updatePinDisplay();
  document.querySelector('#pin-error').textContent = '';
  renderPinKeys();
  displayView('pin');
}

function renderPinKeys() {
  const keys = [...Array(9)].map((_, index) => String(index + 1));
  keys.push('Clear', '0', 'Delete');
  document.querySelector('#pin-keypad').innerHTML = keys.map(key => `<button class="pin-key" type="button" data-pin="${key === 'Delete' ? 'delete' : key === 'Clear' ? 'clear' : key}" aria-label="${key === 'Delete' ? 'Delete last digit' : key === 'Clear' ? 'Clear PIN' : `Digit ${key}`}">${key === 'Delete' ? '⌫' : key}</button>`).join('');
}

function updatePinDisplay() {
  document.querySelectorAll('#pin-dots i').forEach((dot, index) => dot.classList.toggle('filled', index < pinDigits.length));
  document.querySelector('#pin-dots').setAttribute('aria-label', `${pinDigits.length} of 4 PIN digits entered`);
}

function enterPinDigit(digit) {
  if (digit === 'clear') pinDigits = '';
  else if (digit === 'delete') pinDigits = pinDigits.slice(0, -1);
  else if (pinDigits.length < 4) pinDigits += digit;
  updatePinDisplay();
  if (pinDigits.length === 4) {
    if (pinDigits === PARENT_PIN) {
      parentUnlocked = true;
      document.querySelector('#pin-error').textContent = '';
      displayView('parent');
    } else {
      document.querySelector('#pin-error').textContent = 'That PIN did not match. Try again.';
      pinDigits = '';
      updatePinDisplay();
    }
  }
}

function lockParent() {
  if (!parentUnlocked && !document.querySelector('#view-parent').classList.contains('active')) return;
  parentUnlocked = false;
  displayView('home');
}

function renderStatsAndSets() {
  renderSetList();
  renderStats();
}

function handleSetAction(action, setId) {
  if (action === 'edit') editSet(setId);
  if (action === 'activate') activateSet(setId);
  if (action === 'archive') archiveSet(setId);
}

function updatePreference(key, value) {
  state.settings[key] = value;
  persist();
}

function selectVoice(voiceURI) {
  const voice = audio.voices.find(item => item.voiceURI === voiceURI);
  state.settings.voiceURI = voice?.voiceURI || '';
  state.settings.voiceName = voice?.name || '';
  state.settings.voiceLang = voice?.lang || 'en-GB';
  audio.selectPreferredVoice({ voiceURI: state.settings.voiceURI });
  persist();
}

async function exportBackup() {
  await persist();
  const blob = new Blob([JSON.stringify({ ...state, version: 1, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `word-ninja-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  document.querySelector('#backup-message').textContent = 'Backup exported. Keep it somewhere separate from this device.';
  document.querySelector('#backup-message').classList.add('success');
}

async function importBackup(file) {
  const message = document.querySelector('#backup-message');
  try {
    const parsed = JSON.parse(await file.text());
    if (!validateBackup(parsed)) throw new Error('This file is not a valid Word Ninja version 1 backup. Nothing has changed.');
    const confirmation = await askConfirm('Importing this backup replaces all word lists, practice history, settings and rewards currently on this device. Export the current data first if you need to keep it. Replace local data now?', 'Replace data');
    if (!confirmation) return;
    const nextState = { ...createInitialState(), ...parsed, activeSession: parsed.activeSession || null, pausedSessions: parsed.pausedSessions || [] };
    if (!parsed.equippedItems) delete nextState.equippedItems;
    normalizeWardrobeState(nextState);
    await store.replace(nextState);
    state = nextState;
    message.textContent = 'Backup restored on this device.';
    message.classList.add('success');
    renderParent();
    renderHome();
  } catch (error) {
    message.textContent = error.message || 'The backup could not be read. Your current data is unchanged.';
    message.classList.remove('success');
  } finally {
    document.querySelector('#import-backup').value = '';
  }
}

function checkSpeech() {
  const result = document.querySelector('#speech-check-result');
  result.classList.remove('success');
  if (!audio.speechEnabled) {
    result.textContent = 'Speech synthesis is not available in this browser.';
    return;
  }
  const voices = audio.voices.length ? audio.voices : speechSynthesis.getVoices();
  const voice = audio.selectPreferredVoice({ voiceURI: state.settings.voiceURI });
  if (!voice) {
    result.textContent = 'No English voice is available yet. Check device speech settings and try again.';
    return;
  }
  result.textContent = `${voice.name} (${voice.lang})${voice.localService ? ' is marked on-device; still test in aeroplane mode.' : ' may need an internet connection.'}`;
  result.classList.add('success');
  audio.speakWord('Monday', 'I will see you on Monday.', state.settings.rate || 0.86).catch(() => {});
}

function showSpeechCapability() {
  const voices = audio.voices;
  showMessage(!audio.speechEnabled ? 'This browser does not provide speech synthesis.' : voices.length ? `Speech is available with ${voices.length} installed voice${voices.length === 1 ? '' : 's'}. Offline playback still needs an aeroplane-mode test on the iPhone.` : 'Speech synthesis exists, but no voices have loaded yet. Check the device language and speech settings.', 'notice');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
        navigator.serviceWorker.ready.then(() => {
          document.querySelector('#offline-indicator').textContent = 'Offline copy ready';
        });
    if (registration.waiting) showUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(worker);
      });
    });
  }).catch(() => showMessage('Offline setup did not finish. Keep this page open and check the connection, then reload to retry.', 'error'));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!practiceVisible() && !parentUnlocked) location.reload();
    else showMessage('The update is ready. Finish this word before reloading to use it.');
  });
}

function showUpdate(worker) {
  waitingWorker = worker;
  document.querySelector('#update-banner').hidden = false;
}

function applyWaitingUpdate() {
  if (!waitingWorker) return;
  if (state.activeSession && practiceVisible()) return showMessage('Finish or leave this game before applying the update. Your progress is saved.');
  waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, character => `\\${character}`);
}

function setValue(selector, value) {
  const element = document.querySelector(selector);
  if (element && 'value' in element) element.value = value;
  else if (element) element.textContent = value;
}

function setChecked(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.checked = Boolean(value);
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

document.addEventListener('click', event => {
  const leaveAction = event.target.closest('[data-leave-action]');
  if (leaveAction) return handleLeaveAction(leaveAction.dataset.leaveAction);
  const navigation = event.target.closest('[data-nav]');
  const start = event.target.closest('[data-start-mode]');
  if (navigation) {
    if (navigation.dataset.nav === 'pin') return openPin();
    if (navigation.dataset.nav === 'parent' && parentUnlocked) return displayView('parent');
    if (navigation.dataset.nav === 'home') {
      if (practiceVisible()) arcade.pause();
      return displayView('home');
    }
    return displayView(navigation.dataset.nav);
  }
  if (start) return beginSession(start.dataset.startMode);
  const setAction = event.target.closest('[data-set-action]');
  if (setAction) return handleSetAction(setAction.dataset.setAction, setAction.dataset.setId);
  const accessory = event.target.closest('[data-accessory]');
  if (accessory) {
    const item = ACCESSORIES.find(value => value.id === accessory.dataset.accessory);
    if (!item) return;
    if (!state.ownedAccessories.includes(item.id)) {
      showMessage(`Earn ${Math.max(0, item.cost - state.stars)} more stars to unlock ${item.name}.`);
      return;
    }
    state.equippedItems[item.slot] = item.id;
    if (item.slot === 'headwear') state.equippedAccessory = item.id;
    persist();
    renderWardrobe();
  }
  if (event.target.closest('#resume-session')) return resumeSavedSession();
  const resumeSaved = event.target.closest('[data-resume-session]');
  if (resumeSaved) return resumeSavedSession(resumeSaved.dataset.resumeSession);
  if (event.target.closest('[data-replay-word]')) return speakCurrent({ resume: true });
  if (event.target.closest('#pause-game')) return pauseGame();
  if (event.target.closest('#resume-game')) return resumeGame();
  if (event.target.closest('#leave-practice')) {
    return openLeaveDialog();
  }
  if (event.target.closest('#typing-finished')) return submitAnswer();
  if (event.target.closest('[data-shift]')) {
    arcadeShift = !arcadeShift;
    renderShiftToggle();
  }
  if (event.target.closest('#feedback-next')) return advanceEncounter();
  if (event.target.closest('#feedback-fix')) return fixAnswer();
  if (event.target.closest('#feedback-skip')) return skipEncounter();
  if (event.target.closest('#results-home')) return displayView('home');
  if (event.target.closest('#new-set')) return startNewSet();
  if (event.target.closest('#cancel-edit-set')) return startNewSet();
  if (event.target.closest('#activate-set')) return editingSetId && activateSet(editingSetId);
  if (event.target.closest('#parent-done') || event.target.closest('#lock-parent')) return lockParent();
  if (event.target.closest('#preview-list-speech')) {
    const word = currentDraftWords()[0];
    if (word) audio.speakWord(word, document.querySelector(`[data-sentence-word="${cssEscape(word)}"]`)?.value || '', state.settings.rate || 0.86).catch(() => {});
    else showMessage('Add a word before previewing speech.');
  }
  if (event.target.closest('#test-speech')) return checkSpeech();
  if (event.target.closest('#speech-capability')) return showSpeechCapability();
  if (event.target.closest('#export-backup')) return exportBackup();
  if (event.target.closest('#apply-update')) return applyWaitingUpdate();
});

document.querySelector('#leave-game-dialog').addEventListener('cancel', event => {
  event.preventDefault();
  handleLeaveAction('stay');
});

document.querySelector('#set-form').addEventListener('submit', saveSet);
document.querySelector('#word-lines').addEventListener('input', updateWordDetails);
document.querySelector('#pin-keypad').addEventListener('click', event => {
  const button = event.target.closest('[data-pin]');
  if (button) enterPinDigit(button.dataset.pin);
});
document.querySelector('#import-backup').addEventListener('change', event => {
  const file = event.target.files?.[0];
  if (file) importBackup(file);
});
document.querySelector('#voice-select').addEventListener('change', event => selectVoice(event.target.value));
document.querySelector('#speech-rate').addEventListener('input', event => {
  state.settings.rate = Number(event.target.value);
  document.querySelector('#speech-rate-label').textContent = state.settings.rate.toFixed(2);
  persist({ debounce: true });
});
document.querySelector('#effects-volume').addEventListener('input', event => {
  state.settings.effectsVolume = Number(event.target.value);
  persist({ debounce: true });
});
document.querySelector('#effects-muted').addEventListener('change', event => updatePreference('effectsMuted', event.target.checked));
document.querySelector('#vibration').addEventListener('change', event => {
  updatePreference('vibration', event.target.checked);
  pulse([40], event.target.checked);
});
document.querySelector('#reduced-motion').addEventListener('change', event => {
  updatePreference('reducedMotion', event.target.checked);
  renderMascots('idle');
});
document.querySelector('#arcade-speed').addEventListener('input', event => {
  state.settings.arcadeSpeed = Number(event.target.value);
  document.querySelector('#arcade-speed-label').textContent = String(state.settings.arcadeSpeed);
  persist({ debounce: true });
});
document.querySelector('#arcade-density').addEventListener('change', event => updatePreference('arcadeDensity', Number(event.target.value)));
window.addEventListener('voiceschanged', refreshVoiceOptions);
if ('speechSynthesis' in globalThis) speechSynthesis.addEventListener?.('voiceschanged', refreshVoiceOptions);

document.addEventListener('keydown', event => {
  if (document.querySelector('#view-pin').classList.contains('active') && /^[0-9]$/.test(event.key)) return enterPinDigit(event.key);
  if (practiceVisible() && state.activeSession?.mode === 'typing' && !pendingCorrectAdvance && !event.target?.matches?.('input, textarea, select')) {
    if (event.key === 'Shift') return;
    if (keyboard.handlePhysicalKey(event)) updateSubmitAvailability();
  }
  if (practiceVisible() && state.activeSession?.mode === 'arcade' && document.querySelector('#arcade-panel').contains(document.activeElement)) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === ' ') {
      event.preventDefault();
      if (event.key === ' ') arcade.shoot();
      else arcade.setKeyboardDirection(event.key === 'ArrowLeft' ? 'left' : 'right');
    }
  }
  if (event.key === 'Escape' && parentUnlocked) lockParent();
});
document.addEventListener('keyup', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') arcade?.setKeyboardDirection(null);
});
window.addEventListener('blur', () => arcade?.setKeyboardDirection(null));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) audio.getContext();
  if (document.hidden) {
    if (parentUnlocked) lockParent();
    if (practiceVisible()) pauseGame({ fromBackground: true });
    audio.stop();
  }
});
window.addEventListener('pagehide', () => {
  parentUnlocked = false;
  arcade?.pause();
  audio.stop();
  persist();
});
prefersReducedMotion.addEventListener?.('change', () => renderMascots('idle'));
['pointerdown', 'touchend', 'click', 'keydown'].forEach(type => document.addEventListener(type, () => audio.unlock(), { capture: true, passive: true }));

initialize();