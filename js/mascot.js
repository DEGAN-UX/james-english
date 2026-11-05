const EQUIPMENT_LAYERS = ['mascot-cap', 'mascot-crown', 'mascot-arms', 'mascot-pants', 'mascot-gear'];

export function setMascotState(state, reducedMotion = false) {
  document.querySelectorAll('.mascot').forEach(mascot => {
    mascot.dataset.mood = state;
    mascot.classList.toggle('reduced-motion', reducedMotion);
    mascot.setAttribute('aria-label', `Nix the spelling ninja is ${state.replaceAll('-', ' ')}`);
  });
}

export function setMascotEquipment(equipment = {}) {
  document.querySelectorAll('.mascot').forEach(mascot => {
    for (const layer of EQUIPMENT_LAYERS) {
      if (mascot.querySelector(`.${layer}`)) continue;
      const element = document.createElement('span');
      element.className = layer;
      element.setAttribute('aria-hidden', 'true');
      mascot.append(element);
    }
    for (const slot of ['headwear', 'eyewear', 'neckwear', 'shirt', 'arms', 'legs', 'footwear', 'gear', 'effect']) {
      mascot.dataset[slot] = equipment[slot] || '';
    }
  });
}

export function celebrate(level = 'small') {
  const mascot = document.querySelector('.mascot');
  if (!mascot) return;
  mascot.dataset.mood = level === 'big' ? 'celebrating-big' : 'celebrating';
}