const PREFIX = "fluffy_game_highscore_";

export function getHighScore(gameId) {
  try {
    const raw = localStorage.getItem(PREFIX + gameId);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function saveHighScore(gameId, score) {
  try {
    localStorage.setItem(PREFIX + gameId, String(score));
  } catch {
    // localStorage unavailable (private mode / disabled) — fail silently
  }
}
