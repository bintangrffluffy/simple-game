// Reward/analytics abstraction. No backend exists yet — this is the single
// seam a future integration (Fluffy Points, badges, leaderboard, coupons)
// plugs into. Game components never talk to a backend directly; they only
// ever call `finish()` from useGameResult, which reaches here via GamePage.
const listeners = new Set();

/**
 * Subscribe to game completion events.
 * @param {(result: { gameId: string, score: number, duration: number, level: number|string }) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onGameCompleteEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitGameComplete(result) {
  listeners.forEach((listener) => listener(result));
}
