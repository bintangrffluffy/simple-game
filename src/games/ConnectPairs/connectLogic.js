// Level generator for Connect Pairs (Flow-style). Always solvable with every
// square filled:
//   1. Build a Hamiltonian path through the grid (a serpentine), then
//      randomize it with many "backbite" moves.
//   2. Cut that path into `pairs` segments of at least 3 cells. Each
//      segment is one pair's solution; its two ends become the dots.
// Solutions aren't necessarily unique — any path set that connects every
// pair and fills the grid wins, just like the genre.

const key = (r, c) => r * 100 + c;

function neighbors([r, c], n) {
  const out = [];
  if (r > 0) out.push([r - 1, c]);
  if (r < n - 1) out.push([r + 1, c]);
  if (c > 0) out.push([r, c - 1]);
  if (c < n - 1) out.push([r, c + 1]);
  return out;
}

function hamiltonianPath(n, rng) {
  let path = [];
  for (let r = 0; r < n; r++) {
    for (let i = 0; i < n; i++) path.push([r, r % 2 ? n - 1 - i : i]);
  }
  const moves = n * n * 30;
  for (let m = 0; m < moves; m++) {
    // Backbite at the tail: pick a neighbor of the tail that is on the path
    // (not the tail's own predecessor), link to it and reverse the loop.
    if (rng() < 0.5) path.reverse();
    const tail = path[path.length - 1];
    const index = new Map(path.map((cell, i) => [key(...cell), i]));
    const options = neighbors(tail, n).filter((cell) => index.get(key(...cell)) !== path.length - 2);
    const pick = options[Math.floor(rng() * options.length)];
    const i = index.get(key(...pick));
    path = [...path.slice(0, i + 1), ...path.slice(i + 1).reverse()];
  }
  return path;
}

// Segment lengths >= 3 that add up to `total`.
function splitLengths(total, parts, rng) {
  const lengths = Array(parts).fill(3);
  for (let left = total - 3 * parts; left > 0; left--) lengths[Math.floor(rng() * parts)] += 1;
  return lengths;
}

export function makeLevel(n, pairs, rng = Math.random) {
  const path = hamiltonianPath(n, rng);
  const lengths = splitLengths(n * n, pairs, rng);
  const out = [];
  let start = 0;
  lengths.forEach((len, color) => {
    const segment = path.slice(start, start + len);
    start += len;
    out.push({ color, a: segment[0], b: segment[segment.length - 1], solution: segment });
  });
  return { n, pairs: out };
}

// Session pack: grids grow 5×5 → 7×7.
export const PACK = [
  { n: 5, pairs: 4 },
  { n: 5, pairs: 5 },
  { n: 6, pairs: 5 },
  { n: 6, pairs: 6 },
  { n: 7, pairs: 7 },
];

export function makePack(rng = Math.random) {
  return PACK.map(({ n, pairs }) => makeLevel(n, pairs, rng));
}

export const cellKey = key;
export const areAdjacent = ([r1, c1], [r2, c2]) => Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
