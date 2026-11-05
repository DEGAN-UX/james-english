// Android/Chrome use the Vibration API; iOS Safari has none, so it falls back to the switch-toggle tick (iOS 17.4+, taps only).
let tickLabel = null;

function isIOS() {
  const nav = globalThis.navigator;
  if (!nav) return false;
  return /iP(hone|ad|od)/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

function iosTick() {
  if (!tickLabel) {
    tickLabel = document.createElement('label');
    tickLabel.setAttribute('aria-hidden', 'true');
    tickLabel.style.cssText = 'position:fixed;left:-100px;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    tickLabel.append(input);
    document.body.append(tickLabel);
  }
  tickLabel.click();
}

export function hapticsSupport() {
  if (typeof globalThis.navigator?.vibrate === 'function') return 'vibrate';
  if (typeof document !== 'undefined' && isIOS()) return 'ios-tick';
  return 'none';
}

export function pulse(pattern, enabled = true) {
  if (!enabled) return false;
  const steps = Array.isArray(pattern) ? pattern : [pattern];
  const support = hapticsSupport();
  try {
    if (support === 'vibrate') return navigator.vibrate(steps);
    if (support === 'ios-tick') {
      let elapsed = 0;
      steps.forEach((length, index) => {
        if (index % 2 === 0) {
          if (elapsed === 0) iosTick();
          else window.setTimeout(iosTick, elapsed);
        }
        elapsed += length;
      });
      return true;
    }
  } catch {
    // Haptics are optional and device-specific.
  }
  return false;
}
