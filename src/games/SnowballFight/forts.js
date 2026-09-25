// Snow forts for Snowball Fight. The layout escalates with the total number
// of hits so a match gets livelier as it goes:
//   0 static → 1 sliding → 2 more forts → 3 forts shuffle every few seconds.
// Every layout is randomly generated, so each match plays differently.
// Forts take FORT_HP snowballs, shrinking with each hit, then crumble and
// regrow in the same spot a few seconds later.
// Fairness: forts come as a center fort plus *pairs*; each pair's twin is the
// point reflection through the table center, so whatever cover one player
// gets, the other gets too.
export const W = 360;
export const H = 640;
// Forts live between the two throwing lanes (pairs in the top half, twins
// mirrored into the bottom half).
const MIN_Y = 160;
const EDGE = 8;
const FADE = 0.35;
const SHUFFLE_EVERY = 5;
export const FORT_HP = 3;
const REGROW = 6;

export const STAGE_NOTICES = [null, "Forts are moving!", "More forts!", "Forts shuffle!"];

// Total hits (both players) at which each stage starts.
const STAGE_AT = [0, 2, 4, 6];
export function stageFor(totalHits) {
  let stage = 0;
  STAGE_AT.forEach((at, i) => {
    if (totalHits >= at) stage = i;
  });
  return stage;
}

const between = (rng, [a, b]) => a + rng() * (b - a);
const sign = (rng) => (rng() < 0.5 ? -1 : 1);

// Every stage is randomized — positions, sizes and speeds — so no two matches
// look alike. Stages only set how many forts, how big and how fast.
const STAGE_RULES = [
  { pairs: 2, centerR: [22, 28], pairR: [16, 22], speed: null },
  { pairs: 2, centerR: [22, 26], pairR: [16, 21], speed: [45, 90] },
  { pairs: 3, centerR: [18, 24], pairR: [14, 19], speed: [60, 105] },
  { pairs: 3, centerR: [18, 24], pairR: [14, 20], speed: [60, 125] },
];
// Snowball radius + the x range a Fluffy can throw from.
const BALL_R = 9;
const LANE_MIN_X = 28;
const LANE_MAX_X = W - 28;
// At least this much of the lane must be open for straight throws, so a
// static layout can never wall a player in.
const MIN_OPEN = 50;
const GAP = 12;

function speedFor(rule, rng) {
  return rule.speed ? sign(rng) * between(rng, rule.speed) : 0;
}

// Center fort + pairs (twins mirrored through the table center), as circles.
function circlesOf(shape) {
  return [
    { x: shape.center.x, y: H / 2, r: shape.center.r },
    ...shape.pairs.flatMap((p) => [
      { x: p.x, y: p.y, r: p.r },
      { x: W - p.x, y: H - p.y, r: p.r },
    ]),
  ];
}

function overlaps(circles) {
  return circles.some((a, i) => circles.some((b, j) => j > i && Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + GAP));
}

// Width of the throwing lane not covered by any fort (straight-throw lanes).
function openWidth(circles) {
  const blocked = circles
    .map((c) => [Math.max(LANE_MIN_X, c.x - c.r - BALL_R), Math.min(LANE_MAX_X, c.x + c.r + BALL_R)])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let end = LANE_MIN_X;
  blocked.forEach(([a, b]) => {
    if (b <= end) return;
    covered += b - Math.max(a, end);
    end = b;
  });
  return LANE_MAX_X - LANE_MIN_X - covered;
}

function randomShape(rule, rng) {
  const cr = between(rng, rule.centerR);
  return {
    center: { x: between(rng, [cr + EDGE + 40, W - cr - EDGE - 40]), r: cr, vx: speedFor(rule, rng) },
    pairs: Array.from({ length: rule.pairs }, () => {
      const r = between(rng, rule.pairR);
      return {
        x: between(rng, [r + EDGE, W - r - EDGE]),
        y: between(rng, [MIN_Y + r, H / 2 - r - 24]),
        r,
        vx: speedFor(rule, rng),
      };
    }),
  };
}

function shapeFor(stage, rng) {
  const rule = STAGE_RULES[stage];
  let shape = randomShape(rule, rng);
  for (let attempt = 0; attempt < 300; attempt++) {
    const circles = circlesOf(shape);
    if (!overlaps(circles) && openWidth(circles) >= MIN_OPEN) return shape;
    shape = randomShape(rule, rng);
  }
  return shape; // practically unreachable; still a fair (symmetric) layout
}

export function makeLayout(stage, rng = Math.random) {
  // damage: fort index (fortsOf order) -> { hits, brokenAt }
  return { stage, ...shapeFor(stage, rng), alpha: stage === 0 ? 1 : 0, fadingOut: false, next: null, age: 0, damage: {} };
}

// Swap to another layout with a short fade out / fade in.
export function queueLayout(layout, next) {
  layout.next = next;
  layout.fadingOut = true;
}

function slide(f, dt) {
  if (!f.vx) return;
  f.x += f.vx * dt;
  if (f.x < f.r + EDGE) {
    f.x = f.r + EDGE;
    f.vx = Math.abs(f.vx);
  } else if (f.x > W - f.r - EDGE) {
    f.x = W - f.r - EDGE;
    f.vx = -Math.abs(f.vx);
  }
}

// Sliding forts bounce off each other instead of passing through. Each
// circle knows the object that drives it (a twin moves mirrored, so its
// velocity is -vx); flipping the driver's vx keeps pairs symmetric.
function bounceForts(layout) {
  const movers = [
    { src: layout.center, mirrored: false, y: H / 2 },
    ...layout.pairs.flatMap((p) => [
      { src: p, mirrored: false, y: p.y },
      { src: p, mirrored: true, y: H - p.y },
    ]),
  ]
    .map((m, id) => ({ ...m, id, x: m.mirrored ? W - m.src.x : m.src.x, r: m.src.r, vx: m.mirrored ? -m.src.vx : m.src.vx }))
    .filter((m) => !layout.damage[m.id]?.brokenAt); // crumbled forts don't bounce anything
  const flipped = new Set();
  movers.forEach((a, i) =>
    movers.forEach((b, j) => {
      if (j <= i || a.src === b.src || Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r) return;
      if ((b.x - a.x) * (b.vx - a.vx) >= 0) return; // already separating
      [a, b].forEach((m) => {
        if (!m.src.vx || flipped.has(m.src)) return;
        m.src.vx = -m.src.vx;
        flipped.add(m.src);
      });
    }),
  );
}

// Advances the layout; returns the layout to use from now on.
export function stepLayout(layout, dt, rng = Math.random) {
  if (layout.fadingOut) {
    layout.alpha = Math.max(0, layout.alpha - dt / FADE);
    if (layout.alpha === 0) return layout.next ?? makeLayout(layout.stage, rng);
    return layout;
  }
  layout.alpha = Math.min(1, layout.alpha + dt / FADE);
  layout.age += dt;
  Object.entries(layout.damage).forEach(([id, d]) => {
    if (d.brokenAt !== undefined && layout.age - d.brokenAt >= REGROW) delete layout.damage[id];
  });
  slide(layout.center, dt);
  layout.pairs.forEach((p) => slide(p, dt));
  bounceForts(layout);
  if (layout.stage >= 3 && layout.age >= SHUFFLE_EVERY) queueLayout(layout, makeLayout(layout.stage, rng));
  return layout;
}

// A snowball hit on fort `id`. Returns true when that hit crumbles it.
export function hitFort(layout, id) {
  const d = (layout.damage[id] ??= { hits: 0 });
  if (d.brokenAt !== undefined) return false;
  d.hits += 1;
  if (d.hits < FORT_HP) return false;
  d.brokenAt = layout.age;
  return true;
}

// Every fort as { id, x, y, r, hp, broken, solid }, twins included. Damaged
// forts shrink (r is the current, hittable size). `solid` is false while
// the layout fades or the fort is crumbled, so snowballs pass through.
export function fortsOf(layout) {
  const visible = layout.alpha > 0.6;
  const base = [{ x: layout.center.x, y: H / 2, r: layout.center.r }];
  layout.pairs.forEach((p) => {
    base.push({ x: p.x, y: p.y, r: p.r });
    base.push({ x: W - p.x, y: H - p.y, r: p.r });
  });
  return base.map((f, id) => {
    const d = layout.damage[id];
    const broken = d?.brokenAt !== undefined;
    const hp = broken ? 0 : 1 - (d?.hits ?? 0) / FORT_HP;
    return { ...f, id, r: f.r * (0.55 + 0.45 * hp), hp, broken, solid: visible && !broken };
  });
}
