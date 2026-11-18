// Pixel-art invaders in the style of the 1978 arcade game: squid, crab and octopus, each with two leg frames.
export const PIXEL = 5;
export const SPRITES = [
  {
    name: 'squid',
    frames: [
      ['...XX...', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '..X..X..', '.X.XX.X.', 'X.X..X.X'],
      ['...XX...', '..XXXX..', '.XXXXXX.', 'XXXXXXXX', 'XXXXXXXX', '.X.XX.X.', 'X......X', '.X....X.']
    ]
  },
  {
    name: 'crab',
    frames: [
      ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XXXXXXXXX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
      ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXXXXXXXXXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.']
    ]
  },
  {
    name: 'octopus',
    frames: [
      ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', '...XX..XX...', '..XX.XX.XX..', 'XX........XX'],
      ['....XXXX....', '.XXXXXXXXXX.', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', 'XXXXXXXXXXXX', '..XXX..XXX..', '.XX..XX..XX.', '..XX....XX..']
    ]
  }
];

export function invaderSize(kind) {
  const sprite = SPRITES[kind];
  return { width: sprite.frames[0][0].length * PIXEL, height: sprite.frames[0].length * PIXEL };
}

// One SVG path per frame: a rectangle for every run of filled pixels in a row.
export function spritePath(rows) {
  const commands = [];
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/X+/g)) commands.push(`M${run.index} ${y}h${run[0].length}v1h-${run[0].length}z`);
  });
  return commands.join('');
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createInvaderElement(kind) {
  const sprite = SPRITES[kind];
  const { width, height } = invaderSize(kind);
  const element = document.createElement('span');
  element.className = 'invader';
  element.dataset.kind = sprite.name;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  sprite.frames.forEach((rows, index) => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', `invader-frame frame-${index ? 'b' : 'a'}`);
    svg.setAttribute('viewBox', `0 0 ${rows[0].length} ${rows.length}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', spritePath(rows));
    svg.append(path);
    element.append(svg);
  });
  const letter = document.createElement('span');
  letter.className = 'invader-letter';
  element.append(letter);
  return element;
}
