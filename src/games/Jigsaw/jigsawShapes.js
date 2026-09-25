// Classic interlocking jigsaw outlines.
//
// Every internal edge between two neighbouring pieces gets its own random
// tab: a style (round knob, mushroom head, tall, squarish, small, or a
// double knob), which side it bulges to, how big it is and where along the
// edge it sits. Both neighbours trace the very same curve (one forwards, one
// in reverse), so pieces always fit together exactly while no two puzzles —
// and almost no two pieces — share the same shape. Outer border edges stay
// straight, like a real puzzle.
//
// Edges are built in unit edge space: `along` 0..1 runs the edge, `across`
// is the bulge, scaled by the smaller cell side so tabs look the same on
// non-square cells.

// Nominal cell height in SVG units; cell width follows the image's aspect.
export const CELL = 100;
// How far (as a fraction of the smaller cell side) a tab can reach past its
// own cell. Every style below keeps height * t + jitter under this.
export const TAB_REACH = 0.42;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pick(weighted) {
  let roll = Math.random() * weighted.reduce((sum, [w]) => sum + w, 0);
  for (const [w, value] of weighted) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return weighted[weighted.length - 1][1];
}

// Knob silhouettes: neck = neck half-width, head = head half-width,
// height = how tall the head rises (all in multiples of the tab size t).
const KNOBS = {
  round: { neck: 1, head: 2, height: 3, t: [0.085, 0.11] },
  mushroom: { neck: 0.8, head: 2.6, height: 3, t: [0.085, 0.1] },
  tall: { neck: 0.9, head: 1.6, height: 3.5, t: [0.085, 0.1] },
  square: { neck: 1, head: 1.3, height: 3.3, t: [0.09, 0.105] },
  small: { neck: 1, head: 2, height: 3, t: [0.065, 0.078] },
};

// The 6 points of a knob between the edge's shoulders (3 cubic segments'
// worth of control/end points minus the shoulders themselves).
function knobPoints(center, dir, shape, t) {
  const c = rand(-0.03, 0.03);
  const d = rand(-0.03, 0.03);
  const { neck, head, height } = shape;
  return [
    [center + d, (-t + c) * dir],
    [center - neck * t, (t + c) * dir],
    [center - head * t - d, (height * t + c) * dir],
    [center + head * t - d, (height * t + c) * dir],
    [center + neck * t, (t + c) * dir],
    [center + d, (-t + c) * dir],
  ];
}

function singleKnobEdge(shapeName) {
  const shape = KNOBS[shapeName];
  const t = rand(...shape.t);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const center = 0.5 + rand(-0.07, 0.07);
  return [
    [0, 0],
    [0.2, rand(-0.06, 0.06)],
    ...knobPoints(center, dir, shape, t),
    [0.8, rand(-0.06, 0.06)],
    [1, 0],
  ];
}

// Two small knobs on one edge — same side or an S-shaped in/out pair.
function doubleKnobEdge() {
  const shape = KNOBS.round;
  const dirA = Math.random() < 0.5 ? 1 : -1;
  const dirB = Math.random() < 0.5 ? dirA : -dirA;
  return [
    [0, 0],
    [0.1, rand(-0.04, 0.04)],
    ...knobPoints(0.29 + rand(-0.02, 0.02), dirA, shape, rand(0.058, 0.066)),
    [0.44, 0],
    [0.5, 0],
    [0.56, 0],
    ...knobPoints(0.71 + rand(-0.02, 0.02), dirB, shape, rand(0.058, 0.066)),
    [0.9, rand(-0.04, 0.04)],
    [1, 0],
  ];
}

function randomEdge() {
  const style = pick([
    [30, "round"],
    [15, "mushroom"],
    [15, "tall"],
    [12, "square"],
    [10, "small"],
    [18, "double"],
  ]);
  return style === "double" ? doubleKnobEdge() : singleKnobEdge(style);
}

const r2 = (n) => Math.round(n * 100) / 100;

// Cubic segments from a 1 + 3k point list (point 0 is the current point).
function curve(points) {
  const parts = [];
  for (let i = 1; i < points.length; i += 3) {
    const seg = points.slice(i, i + 3).map(([x, y]) => `${r2(x)} ${r2(y)}`);
    parts.push(`C ${seg.join(" ")}`);
  }
  return parts.join(" ");
}

/**
 * Builds one SVG path (board coordinates) per piece, indexed
 * row * cols + col, for a rows x cols grid of cw x ch cells.
 */
export function buildPiecePaths({ rows, cols, cw, ch }) {
  const unit = Math.min(cw, ch);
  // horizontal[r][c]: edge on y = r*ch between rows r-1 and r (r >= 1)
  // vertical[r][c]:   edge on x = c*cw between cols c-1 and c (c >= 1)
  const horizontal = [];
  const vertical = [];
  for (let r = 0; r < rows; r++) {
    horizontal.push([]);
    vertical.push([]);
    for (let c = 0; c < cols; c++) {
      horizontal[r].push(r > 0 ? randomEdge() : null);
      vertical[r].push(c > 0 ? randomEdge() : null);
    }
  }

  const hPoints = (r, c) => horizontal[r][c].map(([u, w]) => [c * cw + u * cw, r * ch + w * unit]);
  const vPoints = (r, c) => vertical[r][c].map(([u, w]) => [c * cw + w * unit, r * ch + u * ch]);

  const paths = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = r2(c * cw);
      const y0 = r2(r * ch);
      const x1 = r2(x0 + cw);
      const y1 = r2(y0 + ch);
      const top = r === 0 ? `L ${x1} ${y0}` : curve(hPoints(r, c));
      const right = c === cols - 1 ? `L ${x1} ${y1}` : curve(vPoints(r, c + 1));
      const bottom = r === rows - 1 ? `L ${x0} ${y1}` : curve(hPoints(r + 1, c).reverse());
      const left = c === 0 ? `L ${x0} ${y0}` : curve(vPoints(r, c).reverse());
      paths.push(`M ${x0} ${y0} ${top} ${right} ${bottom} ${left} Z`);
    }
  }
  return paths;
}

/**
 * Picks a rows x cols grid near `target` pieces whose cells come out as
 * close to square as possible for an image of the given aspect (w / h).
 */
export function gridFor(target, aspect) {
  let best = null;
  for (let rows = 2; rows <= 16; rows++) {
    for (let cols = 2; cols <= 16; cols++) {
      const count = rows * cols;
      const cellRatio = (aspect * rows) / cols;
      const cost = Math.abs(Math.log(cellRatio)) + (1.5 * Math.abs(count - target)) / target;
      if (!best || cost < best.cost) best = { rows, cols, cost };
    }
  }
  return { rows: best.rows, cols: best.cols };
}
