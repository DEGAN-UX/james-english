import { DEFAULT_EQUIPMENT } from './rewards.js';

const DATABASE_NAME = 'word-ninja-local';
const STORE_NAME = 'app-state';
const STATE_KEY = 'primary';
export const DATA_VERSION = 1;

export function createInitialState() {
  return {
    version: DATA_VERSION,
    words: [],
    sets: [],
    stats: {},
    attempts: [],
    sessions: [],
    activeSession: null,
    pausedSessions: [],
    reviewBudget: 0,
    stars: 0,
    rewardEvents: [],
    ownedAccessories: Object.values(DEFAULT_EQUIPMENT),
    equippedItems: { ...DEFAULT_EQUIPMENT },
    equippedAccessory: 'headband',
    settings: { voiceURI: '', voiceName: '', voiceLang: 'en-GB', rate: 0.86, effectsVolume: 0.4, effectsMuted: false, vibration: true, reducedMotion: false, arcadeSpeed: 26, arcadeDensity: 4 },
    updatedAt: new Date().toISOString()
  };
}

export function validateBackup(value) {
  if (!value || value.version !== DATA_VERSION || !Array.isArray(value.words) || !Array.isArray(value.sets) || !Array.isArray(value.attempts) || !Array.isArray(value.sessions) || !Array.isArray(value.rewardEvents) || !Array.isArray(value.ownedAccessories) || !value.stats || typeof value.stats !== 'object' || !value.settings || typeof value.settings !== 'object') return false;
  const wordIds = new Set();
  for (const word of value.words) {
    if (!word || typeof word.id !== 'string' || typeof word.text !== 'string' || !/^[A-Za-z]+$/.test(word.text) || wordIds.has(word.id)) return false;
    wordIds.add(word.id);
  }
  const setIds = new Set();
  for (const set of value.sets) {
    if (!set || typeof set.id !== 'string' || typeof set.title !== 'string' || !Array.isArray(set.wordIds) || setIds.has(set.id) || set.wordIds.some(id => !wordIds.has(id)) || new Set(set.wordIds).size !== set.wordIds.length) return false;
    setIds.add(set.id);
  }
  const currentSets = value.sets.filter(set => set.current && !set.archived);
  if (currentSets.length !== (value.sets.length ? 1 : 0)) return false;
  if (value.activeSession && (!Array.isArray(value.activeSession.queue) || !Number.isInteger(value.activeSession.index) || value.activeSession.index < 0 || value.activeSession.index > value.activeSession.queue.length)) return false;
  if (value.equippedItems && (typeof value.equippedItems !== 'object' || Array.isArray(value.equippedItems) || Object.values(value.equippedItems).some(id => typeof id !== 'string'))) return false;
  return true;
}

const STORAGE_TIMEOUT_MS = 6000;

function withTimeout(promise, message) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), STORAGE_TIMEOUT_MS); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export class StateStore {
  constructor() {
    this.databasePromise = null;
  }

  open() {
    if (!('indexedDB' in globalThis)) return Promise.reject(new Error('This browser does not support local app storage.'));
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATA_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => {
          const database = request.result;
          // Safari closes idle connections; forget this one so the next save reopens.
          database.onclose = () => { this.databasePromise = null; };
          database.onversionchange = () => { database.close(); this.databasePromise = null; };
          resolve(database);
        };
        request.onblocked = () => reject(new Error('Another Word Ninja tab is using the saved data.'));
        request.onerror = () => reject(request.error || new Error('Could not open local storage.'));
      }).catch(error => {
        this.databasePromise = null;
        throw error;
      });
    }
    return this.databasePromise;
  }

  async load() {
    const database = await withTimeout(this.open(), 'Saved progress took too long to open.');
    return withTimeout(new Promise((resolve, reject) => {
      const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || createInitialState());
      request.onerror = () => reject(request.error || new Error('Could not read saved progress.'));
    }), 'Saved progress took too long to read.');
  }

  async save(state) {
    const snapshot = { ...state, version: DATA_VERSION, updatedAt: new Date().toISOString() };
    const attempt = async () => {
      const database = await this.open();
      return new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(snapshot, STATE_KEY);
        transaction.oncomplete = () => resolve(snapshot);
        transaction.onerror = () => reject(transaction.error || new Error('Could not save your progress.'));
        transaction.onabort = () => reject(transaction.error || new Error('Saving was interrupted.'));
      });
    };
    try {
      return await withTimeout(attempt(), 'Saving took too long.');
    } catch (error) {
      // A closed or stuck connection is the usual cause on phones; retry once on a fresh one.
      this.databasePromise = null;
      return withTimeout(attempt(), 'Saving took too long.');
    }
  }

  async replace(state) {
    if (!validateBackup(state)) throw new Error('This backup is not valid for Word Ninja. Your current progress has not changed.');
    return this.save(state);
  }
}