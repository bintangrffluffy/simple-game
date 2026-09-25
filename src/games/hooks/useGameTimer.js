import { useCallback, useEffect, useRef, useState } from "react";

/**
 * requestAnimationFrame-driven timer.
 * mode "up": counts elapsed seconds from 0.
 * mode "down": counts remaining seconds from `duration`, calling onExpire once it hits 0.
 */
export function useGameTimer({ mode = "up", duration = 0, autoStart = false, onExpire } = {}) {
  const [time, setTime] = useState(mode === "down" ? duration : 0);
  const [running, setRunning] = useState(autoStart);
  const rafRef = useRef(null);
  const lastRef = useRef(null);
  const timeRef = useRef(time);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!running) return undefined;
    lastRef.current = null;

    function tick(now) {
      if (lastRef.current == null) lastRef.current = now;
      const delta = (now - lastRef.current) / 1000;
      lastRef.current = now;

      // Plain (non-updater) setState calls below — React StrictMode only
      // double-invokes the callback form of setState, and onExpire must
      // fire exactly once, so state is read/written via timeRef instead.
      if (mode === "down") {
        const next = Math.max(0, timeRef.current - delta);
        timeRef.current = next;
        setTime(next);
        if (next <= 0) {
          setRunning(false);
          onExpireRef.current?.();
          return;
        }
      } else {
        const next = timeRef.current + delta;
        timeRef.current = next;
        setTime(next);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [running, mode]);

  const start = useCallback(() => setRunning(true), []);
  const pause = useCallback(() => setRunning(false), []);
  const reset = useCallback(
    (newDuration = duration) => {
      setRunning(false);
      const next = mode === "down" ? newDuration : 0;
      timeRef.current = next;
      setTime(next);
    },
    [duration, mode],
  );

  return { time, seconds: Math.ceil(time), running, start, pause, reset };
}
