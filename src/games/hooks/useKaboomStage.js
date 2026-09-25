import { useEffect, useRef } from "react";
import kaboom from "kaboom";

/**
 * Mounts an isolated Kaboom instance on a freshly created <canvas> element
 * and fully tears it down on unmount. A brand new canvas is created per
 * mount (rather than reusing one across mounts) so React StrictMode's
 * dev-only double-invoke (mount -> cleanup -> mount) always gets a clean
 * slate instead of depending on kaboom's quit() perfectly resetting a
 * reused canvas.
 *
 * `setup(k)` is only ever called once per mount — it must read live game
 * state through refs, not through closed-over React state, since it will
 * not be re-invoked when the calling component re-renders.
 *
 * `pixelDensity` defaults to the device pixel ratio (max 2); raise it for a
 * stage that gets CSS-scaled well beyond W×H (e.g. Fluffy Volley's court).
 */
export function useKaboomStage({ width, height, background = "#eaf4fb", setup, pixelDensity }) {
  const containerRef = useRef(null);
  const kRef = useRef(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;

  useEffect(() => {
    const container = containerRef.current;
    // A stage measured after first render passes no size until it knows one.
    if (!container || !width || !height) return undefined;

    const canvas = document.createElement("canvas");
    canvas.className = "touch-none-game block h-full w-full";
    container.appendChild(canvas);

    const k = kaboom({
      canvas,
      width,
      height,
      background,
      global: false,
      debug: false,
      touchToMouse: true,
      focus: false,
      pixelDensity: pixelDensity ?? Math.min(window.devicePixelRatio || 1, 2),
    });

    kRef.current = k;
    setupRef.current(k);

    return () => {
      k.quit();
      kRef.current = null;
      container.removeChild(canvas);
    };
  }, [width, height, background, pixelDensity]);

  return { containerRef, kRef };
}
