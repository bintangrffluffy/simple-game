import { useCallback, useRef, useState } from "react";

/**
 * Drives a game's status state machine: idle -> playing -> (paused) -> result.
 * `finish(payload)` builds the result contract consumed by the reward system
 * (see games/reward/gameEvents.js) and calls the provided onComplete once.
 */
export function useGameResult({ gameId, onComplete } = {}) {
  const [status, setStatus] = useState("idle");
  const [result, setResult] = useState(null);
  const startedAtRef = useRef(null);

  const start = useCallback(() => {
    startedAtRef.current = performance.now();
    setResult(null);
    setStatus("playing");
  }, []);

  const pause = useCallback(() => {
    setStatus((current) => (current === "playing" ? "paused" : current));
  }, []);

  const resume = useCallback(() => {
    setStatus((current) => (current === "paused" ? "playing" : current));
  }, []);

  const finish = useCallback(
    (payload = {}) => {
      const duration =
        payload.duration ??
        (startedAtRef.current ? Math.round((performance.now() - startedAtRef.current) / 1000) : 0);
      const finalResult = { gameId, score: 0, level: 1, ...payload, duration };
      setResult(finalResult);
      setStatus("result");
      onComplete?.(finalResult);
    },
    [gameId, onComplete],
  );

  const restart = useCallback(() => {
    setResult(null);
    setStatus("idle");
  }, []);

  return { status, result, start, pause, resume, finish, restart };
}
