import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAppUpdates } from '../js/updates.js';

function target() {
  const listeners = new Map();
  return {
    hidden: true,
    addEventListener: (event, listener) => listeners.set(event, listener),
    fire: event => listeners.get(event)?.(),
    focus() {}
  };
}

function environment(t, initialController = {}) {
  const elements = new Map();
  const window = target();
  const document = {
    ...target(),
    hidden: false,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, target());
      return elements.get(selector);
    }
  };
  let poll;
  window.setInterval = (callback, interval) => {
    assert.equal(interval, 5 * 60 * 1000);
    poll = callback;
  };
  window.setTimeout = callback => { window.timeout = callback; return 1; };
  window.clearTimeout = () => { window.timeout = undefined; };

  let checks = 0;
  const registration = { ...target(), async update() { checks += 1; } };
  const serviceWorker = {
    ...target(),
    controller: initialController,
    async register(path, options) {
      assert.equal(path, './sw.js');
      assert.deepEqual(options, { scope: './', updateViaCache: 'none' });
      return registration;
    },
    ready: Promise.resolve(registration)
  };

  let reloads = 0;
  const navigator = { serviceWorker, onLine: true };
  const location = { protocol: 'https:', reload() { reloads += 1; } };
  for (const [key, value] of Object.entries({ navigator, window, document, location })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }

  const messages = [];
  const worker = { ...target(), postMessage: data => messages.push(data) };
  function installUpdate() {
    registration.installing = worker;
    registration.fire('updatefound');
    registration.waiting = worker;
    worker.fire('statechange');
  }
  function activateUpdate() {
    registration.waiting = null;
    serviceWorker.controller = worker;
    serviceWorker.fire('controllerchange');
  }

  return {
    window, document, navigator, installUpdate, activateUpdate, messages, poll: () => poll(),
    element: selector => document.querySelector(selector), checks: () => checks, reloads: () => reloads
  };
}

test('checks for updates at launch, on return and periodically, and waits for approval before reloading', async t => {
  const app = environment(t);
  let safe = false;
  let saved = false;
  const refresh = registerAppUpdates({
    canUpdate: () => safe,
    save: async () => saved,
    notify: assert.fail
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.checks(), 1);
  app.document.hidden = true;
  await app.poll();
  assert.equal(app.checks(), 1);
  app.document.hidden = false;
  await app.document.fire('visibilitychange');
  await app.poll();
  app.navigator.onLine = false;
  await app.window.fire('focus');
  assert.equal(app.checks(), 3);
  app.navigator.onLine = true;
  await app.window.fire('online');
  assert.equal(app.checks(), 4);

  app.installUpdate();
  const banner = app.element('#update-banner');
  const apply = app.element('#apply-update');
  assert.equal(banner.hidden, true);
  safe = true;
  refresh();
  assert.equal(banner.hidden, false);
  app.element('#defer-update').fire('click');
  assert.equal(banner.hidden, true);
  assert.deepEqual(app.messages, []);
  const reopen = app.element('#show-update');
  assert.equal(reopen.hidden, false);
  reopen.fire('click');
  assert.equal(banner.hidden, false);
  await apply.fire('click');
  assert.deepEqual(app.messages, []);

  saved = true;
  await apply.fire('click');
  assert.deepEqual(app.messages, [{ type: 'SKIP_WAITING' }]);
  assert.equal(app.reloads(), 0);
  safe = false;
  app.activateUpdate();
  assert.equal(app.reloads(), 0);
  safe = true;
  refresh();
  refresh();
  assert.equal(app.reloads(), 1);
});

test('the initial offline install and a later activation in another window do not force a reload', async t => {
  const app = environment(t, null);
  registerAppUpdates({ canUpdate: () => true, save: async () => true, notify: assert.fail });
  await new Promise(resolve => setImmediate(resolve));
  app.activateUpdate();
  assert.equal(app.element('#update-banner').hidden, true);
  assert.equal(app.reloads(), 0);

  app.navigator.serviceWorker.controller = {};
  app.navigator.serviceWorker.fire('controllerchange');
  assert.equal(app.element('#update-banner').hidden, false);
  assert.equal(app.reloads(), 0);
  await app.element('#apply-update').fire('click');
  assert.equal(app.reloads(), 1);
});
