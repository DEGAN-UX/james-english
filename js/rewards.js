export const WARDROBE_SLOTS = [
  { id: 'headwear', name: 'Hats & headwear' },
  { id: 'eyewear', name: 'Glasses & goggles' },
  { id: 'neckwear', name: 'Scarves' },
  { id: 'shirt', name: 'Shirts & colours' },
  { id: 'arms', name: 'Arms & gloves' },
  { id: 'legs', name: 'Trousers & legs' },
  { id: 'footwear', name: 'Shoes' },
  { id: 'gear', name: 'Training gear' },
  { id: 'effect', name: 'Energy trails' }
];

export const DEFAULT_EQUIPMENT = {
  headwear: 'headband',
  eyewear: 'no-eyewear',
  neckwear: 'no-scarf',
  shirt: 'ocean-shirt',
  arms: 'bare-arms',
  legs: 'shorts',
  footwear: 'dojo-slippers',
  gear: 'no-gear',
  effect: 'no-trail'
};

export const ACCESSORIES = [
  { id: 'headband', slot: 'headwear', name: 'Ninja headband', icon: '◉', cost: 0 },
  { id: 'star-cap', slot: 'headwear', name: 'Star cap', icon: '★', cost: 8 },
  { id: 'space-helmet', slot: 'headwear', name: 'Space helmet', icon: '◌', cost: 18 },
  { id: 'helmet', slot: 'headwear', name: 'Classic space helmet', icon: '◌', cost: 34 },
  { id: 'crown', slot: 'headwear', name: 'Champion crown', icon: '♛', cost: 32 },
  { id: 'no-eyewear', slot: 'eyewear', name: 'No glasses', icon: '·', cost: 0 },
  { id: 'shades', slot: 'eyewear', name: 'Star sunglasses', icon: '✦', cost: 12 },
  { id: 'goggles', slot: 'eyewear', name: 'Comet goggles', icon: '◎', cost: 24 },
  { id: 'no-scarf', slot: 'neckwear', name: 'No scarf', icon: '·', cost: 0 },
  { id: 'scarf', slot: 'neckwear', name: 'Sky scarf', icon: '≈', cost: 8 },
  { id: 'star-scarf', slot: 'neckwear', name: 'Starlight scarf', icon: '✧', cost: 26 },
  { id: 'ocean-shirt', slot: 'shirt', name: 'Ocean-blue shirt', icon: '■', cost: 0 },
  { id: 'coral-shirt', slot: 'shirt', name: 'Coral-red shirt', icon: '■', color: '#ef6d62', cost: 6 },
  { id: 'leaf-shirt', slot: 'shirt', name: 'Leaf-green shirt', icon: '■', color: '#39a878', cost: 14 },
  { id: 'gold-shirt', slot: 'shirt', name: 'Golden shirt', icon: '■', color: '#e8ab19', cost: 24 },
  { id: 'bare-arms', slot: 'arms', name: 'Ninja sleeves', icon: '▰', cost: 0 },
  { id: 'blue-wraps', slot: 'arms', name: 'Blue training wraps', icon: '▰', color: '#3285d8', cost: 8 },
  { id: 'gold-gloves', slot: 'arms', name: 'Golden gloves', icon: '✦', color: '#ffd454', cost: 20 },
  { id: 'rainbow-gloves', slot: 'arms', name: 'Rainbow gloves', icon: '✧', color: '#a574dc', cost: 36 },
  { id: 'shorts', slot: 'legs', name: 'Ninja shorts', icon: '▥', cost: 0 },
  { id: 'red-trousers', slot: 'legs', name: 'Red trousers', icon: '▥', color: '#e75d58', cost: 10 },
  { id: 'forest-trousers', slot: 'legs', name: 'Forest trousers', icon: '▥', color: '#299467', cost: 22 },
  { id: 'star-trousers', slot: 'legs', name: 'Star trousers', icon: '★', color: '#8a64d6', cost: 34 },
  { id: 'dojo-slippers', slot: 'footwear', name: 'Dojo slippers', icon: '⌁', cost: 0 },
  { id: 'trainers', slot: 'footwear', name: 'Lightning trainers', icon: '↯', cost: 8 },
  { id: 'star-boots', slot: 'footwear', name: 'Star boots', icon: '✦', cost: 28 },
  { id: 'no-gear', slot: 'gear', name: 'No training gear', icon: '·', cost: 0 },
  { id: 'training-staff', slot: 'gear', name: 'Practice staff', icon: '╱', cost: 16 },
  { id: 'foam-sword', slot: 'gear', name: 'Foam training sword', icon: '⚔', cost: 24 },
  { id: 'pixel-wand', slot: 'gear', name: 'Pixel wand', icon: '✧', cost: 38 },
  { id: 'no-trail', slot: 'effect', name: 'No trail', icon: '·', cost: 0 },
  { id: 'trail', slot: 'effect', name: 'Rainbow trail', icon: '✧', cost: 20 },
  { id: 'sparkle-trail', slot: 'effect', name: 'Sparkle trail', icon: '✦', cost: 40 }
];

export function rewardForEncounter({ sessionId, encounterId, result, revealed, laterRecall, alreadyAwarded }) {
  const eventId = `${sessionId}:${encounterId}:base`;
  if (alreadyAwarded || laterRecall) return { eventId, stars: 0 };
  if (result === 'correct' && !revealed) return { eventId, stars: 2 };
  return { eventId, stars: 1 };
}

export function unlockForStars(totalStars, owned = []) {
  return ACCESSORIES.filter(item => item.cost <= totalStars && !owned.includes(item.id)).map(item => item.id);
}