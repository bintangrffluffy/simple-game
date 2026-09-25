import { shuffle } from "@/games/assets/gameAssets";

// 4×4 (2×2 boxes) for kids, 6×6 (2-row × 3-col boxes) for grown-ups.
export const SIZES = {
  4: { n: 4, boxRows: 2, boxCols: 2, removals: 9 },
  6: { n: 6, boxRows: 2, boxCols: 3, removals: 22 },
};

function candidates(grid, cfg, index) {
  const { n, boxRows, boxCols } = cfg;
  const row = Math.floor(index / n);
  const col = index % n;
  const used = new Set();
  for (let i = 0; i < n; i++) {
    used.add(grid[row * n + i]);
    used.add(grid[i * n + col]);
  }
  const br = row - (row % boxRows);
  const bc = col - (col % boxCols);
  for (let r = br; r < br + boxRows; r++) for (let c = bc; c < bc + boxCols; c++) used.add(grid[r * n + c]);
  const out = [];
  for (let v = 1; v <= n; v++) if (!used.has(v)) out.push(v);
  return out;
}

// Fills the grid in place with a random valid solution.
function fill(grid, cfg, rng) {
  const index = grid.indexOf(0);
  if (index === -1) return true;
  for (const v of shuffle(candidates(grid, cfg, index), rng)) {
    grid[index] = v;
    if (fill(grid, cfg, rng)) return true;
  }
  grid[index] = 0;
  return false;
}

// Number of solutions, counting no further than `limit`.
export function countSolutions(grid, cfg, limit = 2) {
  const index = grid.indexOf(0);
  if (index === -1) return 1;
  let count = 0;
  for (const v of candidates(grid, cfg, index)) {
    grid[index] = v;
    count += countSolutions(grid, cfg, limit - count);
    if (count >= limit) break;
  }
  grid[index] = 0;
  return count;
}

// A puzzle with exactly one solution. Cells are removed in random order and
// put back whenever removing them would allow a second solution. `rng` may
// be a daily seeded rng, giving every player the same puzzle.
export function makeSudoku(size, rng = Math.random) {
  const cfg = SIZES[size];
  const solution = Array(cfg.n * cfg.n).fill(0);
  fill(solution, cfg, rng);
  const puzzle = [...solution];
  let removed = 0;
  for (const index of shuffle(puzzle.map((_, i) => i), rng)) {
    if (removed >= cfg.removals) break;
    const saved = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions([...puzzle], cfg) === 1) removed += 1;
    else puzzle[index] = saved;
  }
  return { size, puzzle, solution };
}

// Indexes of filled cells that clash with another cell in their row, column
// or box (shown as a gentle hint, never a penalty).
export function findConflicts(grid, size) {
  const { n, boxRows, boxCols } = SIZES[size];
  const bad = new Set();
  grid.forEach((v, i) => {
    if (!v) return;
    const r = Math.floor(i / n);
    const c = i % n;
    grid.forEach((w, j) => {
      if (j === i || w !== v) return;
      const r2 = Math.floor(j / n);
      const c2 = j % n;
      const sameBox = Math.floor(r / boxRows) === Math.floor(r2 / boxRows) && Math.floor(c / boxCols) === Math.floor(c2 / boxCols);
      if (r === r2 || c === c2 || sameBox) bad.add(i);
    });
  });
  return bad;
}
