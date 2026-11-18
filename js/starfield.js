// Background stars: bigger squares are nearer, so they fall faster, but always slower than the letters.
export const MAX_STAR_SIZE = 4;

export function createStars(count = 40, random = Math.random) {
  return Array.from({ length: count }, () => ({ x: random(), y: random(), size: 1 + Math.floor(random() * MAX_STAR_SIZE) }));
}

export function starSpeed(size, letterSpeed) {
  return Math.min(size * 7, letterSpeed * 0.8);
}

export function advanceStars(stars, seconds, fieldHeight, letterSpeed, random = Math.random) {
  if (!fieldHeight) return;
  for (const star of stars) {
    star.y += (starSpeed(star.size, letterSpeed) * seconds) / fieldHeight;
    if (star.y > 1) {
      star.y -= 1;
      star.x = random();
    }
  }
}

export function drawStars(canvas, stars) {
  const context = canvas?.getContext?.('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const scale = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
  for (const star of stars) {
    const side = Math.max(1, Math.round(star.size * scale));
    context.fillStyle = `rgba(214, 255, 224, ${0.18 + star.size * 0.1})`;
    context.fillRect(Math.round(star.x * (canvas.width - side)), Math.round(star.y * (canvas.height - side)), side, side);
  }
}
