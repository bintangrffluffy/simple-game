// Tiny air-hockey physics in logical table units (W × H, portrait).
// Player 0 defends the bottom goal, player 1 the top goal.
export const W = 360;
export const H = 640;
export const PUCK_R = 14;
export const PADDLE_R = { kid: 34, grownup: 26 };
// Width of the goal each player *defends*: a Kid's goal is narrower.
export const GOAL_W = { kid: 112, grownup: 150 };
const MAX_PUCK_SPEED = 950;
const MAX_PADDLE_SPEED = 2200;
const WALL_BOUNCE = 0.9;
const HIT_BOUNCE = 0.92;
const POST_R = 5;
// Fraction of speed kept per second (air-table glide).
const GLIDE = 0.6;

export function makeWorld(levels) {
  return {
    levels,
    puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
    paddles: [0, 1].map((i) => {
      const y = i === 0 ? H - 90 : 90;
      return { x: W / 2, y, tx: W / 2, ty: y, vx: 0, vy: 0, r: PADDLE_R[levels[i]] };
    }),
  };
}

// Keeps a paddle target inside its own half.
export function clampTarget(world, i, x, y) {
  const p = world.paddles[i];
  const minY = i === 0 ? H / 2 + p.r : p.r;
  const maxY = i === 0 ? H - p.r : H / 2 - p.r;
  p.tx = Math.max(p.r, Math.min(W - p.r, x));
  p.ty = Math.max(minY, Math.min(maxY, y));
}

export function serve(world, towardPlayer) {
  // The player who conceded gets the puck, resting in their half.
  world.puck = { x: W / 2, y: towardPlayer === 0 ? H * 0.72 : H * 0.28, vx: 0, vy: 0 };
}

function bounceOffCircle(puck, cx, cy, radius, cvx, cvy, restitution) {
  const dx = puck.x - cx;
  const dy = puck.y - cy;
  const dist = Math.hypot(dx, dy);
  const min = radius + PUCK_R;
  if (dist >= min || dist === 0) return false;
  const nx = dx / dist;
  const ny = dy / dist;
  puck.x = cx + nx * min;
  puck.y = cy + ny * min;
  const rel = (puck.vx - cvx) * nx + (puck.vy - cvy) * ny;
  if (rel < 0) {
    puck.vx -= (1 + restitution) * rel * nx;
    puck.vy -= (1 + restitution) * rel * ny;
  }
  return true;
}

// Advances the world by dt seconds. Returns { goal: scoringPlayer } when the
// puck leaves through a goal, { hit: true } on a paddle hit, else {}.
export function step(world, dt) {
  const events = {};
  world.paddles.forEach((p) => {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const dist = Math.hypot(dx, dy);
    const maxMove = MAX_PADDLE_SPEED * dt;
    const k = dist > maxMove ? maxMove / dist : 1;
    const nx = p.x + dx * k;
    const ny = p.y + dy * k;
    p.vx = (nx - p.x) / dt;
    p.vy = (ny - p.y) / dt;
    p.x = nx;
    p.y = ny;
  });

  const puck = world.puck;
  const glide = Math.pow(GLIDE, dt);
  puck.vx *= glide;
  puck.vy *= glide;
  puck.x += puck.vx * dt;
  puck.y += puck.vy * dt;

  world.paddles.forEach((p) => {
    if (bounceOffCircle(puck, p.x, p.y, p.r, p.vx, p.vy, HIT_BOUNCE)) events.hit = true;
  });

  // Side walls.
  if (puck.x < PUCK_R) {
    puck.x = PUCK_R;
    puck.vx = Math.abs(puck.vx) * WALL_BOUNCE;
  } else if (puck.x > W - PUCK_R) {
    puck.x = W - PUCK_R;
    puck.vx = -Math.abs(puck.vx) * WALL_BOUNCE;
  }

  // End walls with goal openings; posts are small circles at the openings.
  [
    { y: 0, dir: 1, defender: 1 },
    { y: H, dir: -1, defender: 0 },
  ].forEach(({ y, dir, defender }) => {
    const half = GOAL_W[world.levels[defender]] / 2;
    [W / 2 - half, W / 2 + half].forEach((px) => bounceOffCircle(puck, px, y, POST_R, 0, 0, WALL_BOUNCE));
    const inMouth = Math.abs(puck.x - W / 2) < half - PUCK_R * 0.3;
    const past = dir === 1 ? puck.y < PUCK_R : puck.y > H - PUCK_R;
    if (!past) return;
    if (inMouth) {
      if (dir === 1 ? puck.y < -PUCK_R : puck.y > H + PUCK_R) events.goal = 1 - defender;
    } else {
      puck.y = dir === 1 ? PUCK_R : H - PUCK_R;
      puck.vy = dir * Math.abs(puck.vy) * WALL_BOUNCE;
    }
  });

  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > MAX_PUCK_SPEED) {
    puck.vx *= MAX_PUCK_SPEED / speed;
    puck.vy *= MAX_PUCK_SPEED / speed;
  }
  return events;
}
