const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;
const ACTIVATION_TIMEOUT = 15 * 1000;

export function registerAppUpdates({ canUpdate, save, notify }) {
  const serviceWorkers = navigator.serviceWorker;
  if (!serviceWorkers || !/^https?:$/.test(location.protocol)) return;

  const banner = document.querySelector('#update-banner');
  const apply = document.querySelector('#apply-update');
  const later = document.querySelector('#defer-update');
  const reopen = document.querySelector('#show-update');
  let registration;
  let checking = false;
  let dismissed;
  let approved = false;
  let applying = false;
  let activationTimer;
  let controller = serviceWorkers.controller;
  let reloadAvailable = false;
  let reloading = false;

  function candidate() {
    return registration?.waiting || (reloadAvailable ? controller : null);
  }

  function render() {
    if (approved && reloadAvailable && canUpdate() && !reloading) {
      reloading = true;
      location.reload();
      return;
    }
    const update = candidate();
    const available = Boolean(update && canUpdate());
    const deferred = update === dismissed;
    banner.hidden = !available || deferred;
    reopen.hidden = !available || !deferred;
    apply.disabled = applying;
    later.disabled = applying;
    apply.textContent = applying ? 'Updating…' : 'Update now';
  }

  function resetApply() {
    window.clearTimeout(activationTimer);
    approved = false;
    applying = false;
    render();
  }

  apply.addEventListener('click', async () => {
    if (!candidate() || !canUpdate() || applying) return;
    applying = true;
    render();
    if (!await save() || !canUpdate()) {
      resetApply();
      return;
    }
    approved = true;
    if (reloadAvailable) return render();
    const worker = registration?.waiting;
    if (!worker) return resetApply();
    activationTimer = window.setTimeout(() => {
      resetApply();
      notify('The update took too long. Try again when it is ready.', 'error');
    }, ACTIVATION_TIMEOUT);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      resetApply();
      notify('The update could not start. Try again when it is ready.', 'error');
    }
  });

  later.addEventListener('click', () => {
    dismissed = candidate();
    render();
    reopen.focus();
  });
  reopen.addEventListener('click', () => {
    dismissed = undefined;
    render();
    apply.focus();
  });

  serviceWorkers.addEventListener('controllerchange', () => {
    const next = serviceWorkers.controller;
    if (!next || next === controller) return;
    if (controller) reloadAvailable = true;
    controller = next;
    window.clearTimeout(activationTimer);
    render();
  });

  async function check() {
    if (checking || document.hidden || navigator.onLine === false) return;
    checking = true;
    try {
      await registration.update();
    } catch {
      // The cached app remains usable during a failed update check.
    } finally {
      checking = false;
      render();
    }
  }

  const watchedWorkers = new WeakSet();
  function watchInstallingWorker() {
    const worker = registration.installing;
    if (!worker || watchedWorkers.has(worker)) return;
    watchedWorkers.add(worker);
    worker.addEventListener('statechange', render);
  }

  serviceWorkers.register('./sw.js', { scope: './', updateViaCache: 'none' }).then(result => {
    registration = result;
    registration.addEventListener('updatefound', watchInstallingWorker);
    watchInstallingWorker();
    render();
    check();
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    window.setInterval(check, UPDATE_CHECK_INTERVAL);
    serviceWorkers.ready.then(() => {
      document.querySelector('#offline-indicator').textContent = 'Offline copy ready';
    });
  }).catch(() => notify('Offline setup did not finish. Keep this page open and check the connection, then reload to retry.', 'error'));

  return render;
}
