import { useLayoutEffect, useRef, useState } from "react";

/**
 * A stage that is as tall as the game area allows: a fixed logical `width`
 * and a logical height between `baseHeight` and `maxHeight`, picked from the
 * area's shape (wide screens keep width×baseHeight, at full height). Pass
 * `maxHeight: baseHeight` for a fixed-shape stage that is just scaled up to
 * fit.
 *
 * Put `areaRef` on an unpadded element that fills the game area, and size
 * the stage box with `boxStyle`. The height (and pixel density) is only
 * re-picked while `canResize` is true — for Kaboom it remounts the stage, so
 * pass `status === "idle"` and it stays frozen during a run; a resize then
 * just rescales the frozen stage. `height` is undefined until measured, and
 * useKaboomStage waits for it.
 */
export function useTallStage({ width, baseHeight, maxHeight = baseHeight, canResize = true }) {
  const areaRef = useRef(null);
  const [area, setArea] = useState(null);
  const [stage, setStage] = useState(null);

  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) setArea({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!area || !canResize) return;
    const displayWidth = Math.min(area.width, (area.height * width) / baseHeight);
    const logical = Math.round((width * area.height) / displayWidth);
    const height = Math.min(maxHeight, Math.max(baseHeight, logical));
    const scale = Math.min(area.width / width, area.height / height);
    const dpr = window.devicePixelRatio || 1;
    const next = { height, pixelDensity: Math.min(3, Math.max(1, dpr * scale)) };
    // Ignore small jitter (e.g. a phone's address bar sliding in/out).
    setStage((cur) => (cur && Math.abs(cur.height - next.height) < 16 ? cur : next));
  }, [area, canResize, width, baseHeight, maxHeight]);

  const height = stage?.height;
  const scale = area && stage ? Math.min(area.width / width, area.height / stage.height) : 0;
  return {
    areaRef,
    height,
    pixelDensity: stage?.pixelDensity,
    boxStyle: { width: width * scale, height: (height ?? baseHeight) * scale },
  };
}
