const ROWS = ['qwertzuiop', 'asdfghjkl', 'yxcvbnm'];

export class LetterKeyboard {
  constructor(root, onChange, onFinish) {
    this.root = root;
    this.onChange = onChange;
    this.onFinish = onFinish;
    this.value = '';
    this.caret = 0;
    this.shift = false;
    this.render();
    root.addEventListener('click', event => this.handleClick(event));
  }

  render() {
    this.root.innerHTML = `${ROWS.map((row, rowIndex) => `<div class="key-row key-row-${rowIndex + 1}">${row.split('').map(letter => `<button class="key letter-key" type="button" data-letter="${letter}" aria-label="${letter}">${letter}</button>`).join('')}</div>`).join('')}
      <div class="key-row utility-row"><button class="key utility-key shift-key" type="button" data-action="shift" aria-pressed="${this.shift}">Shift</button><button class="key utility-key" type="button" data-action="left" aria-label="Move cursor left">◀</button><button class="key utility-key" type="button" data-action="right" aria-label="Move cursor right">▶</button><button class="key utility-key delete-key" type="button" data-action="delete" aria-label="Delete letter before cursor"><span class="key-symbol" aria-hidden="true">⌫</span></button></div>`;
    this.drawAnswer();
  }

  drawAnswer() {
    const answer = document.querySelector('#typed-answer');
    const before = this.value.slice(0, this.caret);
    const after = this.value.slice(this.caret);
    answer.innerHTML = `${escapeText(before)}<span class="answer-caret" aria-hidden="true"></span>${escapeText(after)}`;
    answer.setAttribute('aria-label', this.value ? `Your spelling: ${this.value}` : 'Your spelling is empty');
    document.querySelector('#typing-finished').disabled = !this.value;
    document.querySelector('#typing-status').textContent = this.value ? `${this.value.length} letters` : 'Build your answer with the letter keys.';
  }

  handleClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const tappedLetter = button.dataset.letter;
    const startBounds = tappedLetter ? button.getBoundingClientRect() : null;
    if (tappedLetter) this.insert(tappedLetter);
    if (button.dataset.action === 'shift') this.shift = !this.shift;
    if (button.dataset.action === 'left') this.caret = Math.max(0, this.caret - 1);
    if (button.dataset.action === 'right') this.caret = Math.min(this.value.length, this.caret + 1);
    if (button.dataset.action === 'delete' && this.caret > 0) {
      this.value = this.value.slice(0, this.caret - 1) + this.value.slice(this.caret);
      this.caret -= 1;
    }
    if (button.dataset.action === 'shift') button.setAttribute('aria-pressed', String(this.shift));
    this.drawAnswer();
    this.onChange(this.value);
    if (tappedLetter) animateTappedLetter(button, startBounds, this.caret - 1, this.value[this.caret - 1]);
  }

  insert(letter, forceCapital = false) {
    const inserted = this.shift || forceCapital ? letter.toUpperCase() : letter;
    this.value = this.value.slice(0, this.caret) + inserted + this.value.slice(this.caret);
    this.caret += 1;
    this.shift = false;
    const shiftButton = this.root.querySelector('[data-action="shift"]');
    shiftButton.setAttribute('aria-pressed', 'false');
  }

  handlePhysicalKey(event) {
    // Leave browser shortcuts (reload, copy, switch tab) and focused buttons alone.
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return false;
    if (event.key === 'Enter') {
      if (event.target?.closest?.('button, a, summary')) return false;
      event.preventDefault();
      if (this.value) this.onFinish();
      return true;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (this.caret > 0) {
        this.value = this.value.slice(0, this.caret - 1) + this.value.slice(this.caret);
        this.caret -= 1;
      }
      this.drawAnswer();
      this.onChange(this.value);
      return true;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.caret = Math.max(0, Math.min(this.value.length, this.caret + (event.key === 'ArrowLeft' ? -1 : 1)));
      this.drawAnswer();
      return true;
    }
    if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      this.insert(event.key.toLowerCase(), event.shiftKey);
      this.drawAnswer();
      this.onChange(this.value);
      return true;
    }
    return false;
  }

  setValue(value = '') {
    this.value = value;
    this.caret = value.length;
    this.shift = false;
    this.drawAnswer();
  }
}

function animateTappedLetter(sourceButton, startBounds, answerIndex, letter) {
  if (!startBounds || !letter || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const answer = document.querySelector('#typed-answer');
  const answerText = answer.firstChild;
  if (!answerText || answerText.nodeType !== Node.TEXT_NODE || answerIndex < 0 || answerIndex >= answerText.length) return;

  const range = document.createRange();
  range.setStart(answerText, answerIndex);
  range.setEnd(answerText, answerIndex + 1);
  const targetBounds = range.getBoundingClientRect();
  const flight = sourceButton.cloneNode(true);
  flight.className = 'key key-flight-ghost';
  flight.removeAttribute('data-letter');
  flight.removeAttribute('aria-label');
  flight.setAttribute('aria-hidden', 'true');
  flight.disabled = true;
  flight.textContent = letter;
  flight.style.left = `${startBounds.left}px`;
  flight.style.top = `${startBounds.top}px`;
  flight.style.width = `${startBounds.width}px`;
  flight.style.height = `${startBounds.height}px`;
  document.body.append(flight);

  const deltaX = targetBounds.left + targetBounds.width / 2 - (startBounds.left + startBounds.width / 2);
  const deltaY = targetBounds.top + targetBounds.height / 2 - (startBounds.top + startBounds.height / 2);
  const animation = flight.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${deltaX}px, ${deltaY}px) scale(.42)`, opacity: 0.18 }
  ], { duration: 390, easing: 'cubic-bezier(.2, .78, .28, 1)', fill: 'forwards' });
  animation.onfinish = () => flight.remove();
}

function escapeText(text) {
  return text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}