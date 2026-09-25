// Deterministic randomness for "fair" daily modes: everyone who plays a
// game's daily run on the same day gets the same sequence (Wordle model),
// so scores are comparable. Games take an optional `rng` (a () => [0, 1)
// function, like Math.random) instead of calling Math.random() directly.

// Small, fast 32-bit PRNG. Plenty for game layouts; not for security.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a: turns a string key into a 32-bit seed.
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// The player's local calendar day, "YYYY-MM-DD" — a daily puzzle flips at
// the player's midnight, not UTC's.
export function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function seededRandom(key) {
  return mulberry32(hashString(key));
}

// Today's rng for one game, e.g. dailyRandom("stack").
export function dailyRandom(gameId, date = new Date()) {
  return seededRandom(`${gameId}:${todayKey(date)}`);
}

// High-score key for today's daily run, e.g. useHighScore(dailyKey("blocks")).
export function dailyKey(gameId, date = new Date()) {
  return `${gameId}-daily-${todayKey(date)}`;
}

// Per-event daily rng: the Nth spawn of the day gets its own seed, so it's
// identical for everyone even when earlier play (e.g. which targets were
// hit) changed how many random numbers the game used before it.
export function dailyRandomAt(gameId, index, date = new Date()) {
  return seededRandom(`${gameId}:${todayKey(date)}:${index}`);
}
