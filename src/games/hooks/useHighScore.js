import { useCallback, useState } from "react";
import { getHighScore, saveHighScore } from "@/games/utils/highScore";

// Reads/writes fluffy_game_highscore_{gameId} in localStorage.
// `lowerIsBetter` is for time-style records (e.g. reaction ms), where 0 means
// "no record yet" rather than an unbeatable best.
export function useHighScore(gameId, { lowerIsBetter = false } = {}) {
  const [highScore, setHighScoreState] = useState(() => getHighScore(gameId));

  const setHighScore = useCallback(
    (score) => {
      setHighScoreState((prev) => {
        const isBetter = lowerIsBetter ? score > 0 && (prev === 0 || score < prev) : score > prev;
        if (isBetter) {
          saveHighScore(gameId, score);
          return score;
        }
        return prev;
      });
    },
    [gameId, lowerIsBetter],
  );

  return [highScore, setHighScore];
}
