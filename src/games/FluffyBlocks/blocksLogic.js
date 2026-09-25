import { gameAssets } from "@/games/assets/gameAssets";

const SIZE = 8;

// Soft "fabric" tiles: each color group gets a pastel tint plus its own
// woven pattern, so pieces read as different even without color vision.
const PATTERNS = {
  red: { image: "repeating-linear-gradient(45deg, rgba(255,255,255,.35) 0 3px, transparent 3px 8px)" },
  yellow: { image: "radial-gradient(rgba(255,255,255,.7) 1.6px, transparent 2.2px)", size: "8px 8px" },
  green: {
    image:
      "linear-gradient(90deg, rgba(255,255,255,.3) 50%, transparent 50%), linear-gradient(rgba(255,255,255,.3) 50%, transparent 50%)",
    size: "10px 10px",
  },
  blue: { image: "repeating-linear-gradient(90deg, rgba(255,255,255,.4) 0 2px, transparent 2px 7px)" },
  purple: {
    image:
      "linear-gradient(45deg, rgba(255,255,255,.3) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.3) 75%), linear-gradient(45deg, rgba(255,255,255,.3) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.3) 75%)",
    size: "8px 8px",
    position: "0 0, 4px 4px",
  },
  pink: { image: "radial-gradient(rgba(255,255,255,.55) 3px, transparent 3.6px)", size: "12px 12px" },
  orange: { image: "repeating-linear-gradient(0deg, rgba(255,255,255,.35) 0 3px, transparent 3px 8px)" },
};

// Mixes a hex color toward white (amount 0..1) for the soft pastel look.
function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * amount);
  return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export const FABRICS = Object.fromEntries(
  gameAssets.colorGroups.map((g) => {
    const p = PATTERNS[g.id];
    return [
      g.id,
      {
        name: g.name,
        style: {
          backgroundColor: tint(g.hex, 0.3),
          backgroundImage: p.image,
          backgroundSize: p.size,
          backgroundPosition: p.position,
          boxShadow: "inset 0 -3px 0 rgba(0,0,0,.12)",
        },
      },
    ];
  }),
);
const FABRIC_IDS = Object.keys(FABRICS);

function shape(id, cells, weight = 1) {
  const h = Math.max(...cells.map(([r]) => r)) + 1;
  const w = Math.max(...cells.map(([, c]) => c)) + 1;
  return { id, cells, w, h, weight };
}
const line = (n, vertical) => Array.from({ length: n }, (_, i) => (vertical ? [i, 0] : [0, i]));
const square = (n) => Array.from({ length: n * n }, (_, i) => [Math.floor(i / n), i % n]);

// Classic 1010!-style set. Big pieces are rarer so early boards stay open.
export const SHAPES = [
  shape("dot", [[0, 0]], 1),
  shape("i2h", line(2), 1.2),
  shape("i2v", line(2, true), 1.2),
  shape("i3h", line(3), 1.2),
  shape("i3v", line(3, true), 1.2),
  shape("i4h", line(4), 0.9),
  shape("i4v", line(4, true), 0.9),
  shape("i5h", line(5), 0.5),
  shape("i5v", line(5, true), 0.5),
  shape("sq2", square(2), 1.2),
  shape("sq3", square(3), 0.4),
  shape("l3a", [[0, 0], [1, 0], [1, 1]]),
  shape("l3b", [[0, 0], [0, 1], [1, 0]]),
  shape("l3c", [[0, 0], [0, 1], [1, 1]]),
  shape("l3d", [[0, 1], [1, 0], [1, 1]]),
  shape("l5a", [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], 0.5),
  shape("l5b", [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]], 0.5),
  shape("l5c", [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]], 0.5),
  shape("l5d", [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]], 0.5),
];
const TOTAL_WEIGHT = SHAPES.reduce((sum, s) => sum + s.weight, 0);

function pickShape(rng) {
  let roll = rng() * TOTAL_WEIGHT;
  for (const s of SHAPES) {
    roll -= s.weight;
    if (roll <= 0) return s;
  }
  return SHAPES[0];
}

// Three new pieces. `rng` is Math.random or a daily seeded rng, so a daily
// run hands every player the same pieces in the same order.
export function pickPieces(rng) {
  return Array.from({ length: 3 }, () => ({ ...pickShape(rng), fabric: FABRIC_IDS[Math.floor(rng() * FABRIC_IDS.length)] }));
}

export function canPlace(grid, piece, row, col) {
  return piece.cells.every(([dr, dc]) => {
    const r = row + dr;
    const c = col + dc;
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE && !grid[r][c];
  });
}

export function fitsAnywhere(grid, piece) {
  for (let r = 0; r <= SIZE - piece.h; r++) {
    for (let c = 0; c <= SIZE - piece.w; c++) {
      if (canPlace(grid, piece, r, c)) return true;
    }
  }
  return false;
}

export function findClears(grid) {
  const rows = [];
  const cols = [];
  for (let i = 0; i < SIZE; i++) {
    if (grid[i].every(Boolean)) rows.push(i);
    if (grid.every((row) => row[i])) cols.push(i);
  }
  return { rows, cols };
}
