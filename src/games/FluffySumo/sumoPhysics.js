// Fluffy Sumo physics in logical table units (W × H, portrait).
export const W = 360;
export const H = 640;
export const CENTER = { x: W / 2, y: H / 2 };
export const RING_R = 150;
// After this long a round's ring starts shrinking, so nobody can stall.
const SHRINK_AFTER = 15;
const SHRINK_TO = 0.62;
const SHRINK_SECONDS = 20;
export const FLUFFY_R = { kid: 27, grownup: 24 };
// A Kid's Fluffy is heavier: harder to shove out.
const MASS = { kid: 1.8, grownup: 1 };
const ACCEL = 700;
const MAX_SPEED = 330;
const GLIDE = 0.35; // fraction of speed kept per second on the ice
const BOUNCE = 1.05; // a little extra pop makes bumps satisfying
export const STICK_RANGE = 60; // joystick drag distance for full push

export function makeRound(levels) {
  return {
    levels,
    time: 0,
    fluffies: [0, 1].map((i) => ({
      x: CENTER.x,
      y: CENTER.y + (i === 0 ? 70 : -70),
      vx: 0,
      vy: 0,
      r: FLUFFY_R[levels[i]],
      m: MASS[levels[i]],
      stick: null, // { ax, ay, x, y } joystick anchor + current, table units
    })),
  };
}

export function ringRadius(round) {
  const t = Math.max(0, round.time - SHRINK_AFTER) / SHRINK_SECONDS;
  return RING_R * (1 - (1 - SHRINK_TO) * Math.min(1, t));
}

// Advances dt seconds. Returns { out: loserIndex } when a Fluffy's center
// leaves the ring, { bump: true } on a collision, else {}.
export function step(round, dt) {
  const events = {};
  round.time += dt;
  const glide = Math.pow(GLIDE, dt);
  round.fluffies.forEach((f) => {
    if (f.stick) {
      let dx = f.stick.x - f.stick.ax;
      let dy = f.stick.y - f.stick.ay;
      const len = Math.hypot(dx, dy);
      if (len > STICK_RANGE) {
        dx *= STICK_RANGE / len;
        dy *= STICK_RANGE / len;
      }
      f.vx += (dx / STICK_RANGE) * ACCEL * dt;
      f.vy += (dy / STICK_RANGE) * ACCEL * dt;
    }
    f.vx *= glide;
    f.vy *= glide;
    const speed = Math.hypot(f.vx, f.vy);
    if (speed > MAX_SPEED) {
      f.vx *= MAX_SPEED / speed;
      f.vy *= MAX_SPEED / speed;
    }
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  });

  // Elastic collision between the two Fluffies (momentum-conserving).
  const [a, b] = round.fluffies;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = a.r + b.r;
  if (dist < min && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = min - dist;
    const total = a.m + b.m;
    a.x -= nx * overlap * (b.m / total);
    a.y -= ny * overlap * (b.m / total);
    b.x += nx * overlap * (a.m / total);
    b.y += ny * overlap * (a.m / total);
    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      const impulse = (-(1 + BOUNCE) * rel) / (1 / a.m + 1 / b.m);
      a.vx -= (impulse / a.m) * nx;
      a.vy -= (impulse / a.m) * ny;
      b.vx += (impulse / b.m) * nx;
      b.vy += (impulse / b.m) * ny;
      events.bump = true;
    }
  }

  const radius = ringRadius(round);
  round.fluffies.forEach((f, i) => {
    if (events.out === undefined && Math.hypot(f.x - CENTER.x, f.y - CENTER.y) > radius) events.out = i;
  });
  return events;
}
