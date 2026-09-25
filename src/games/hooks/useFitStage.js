import { useEffect, useRef, useState } from "react";

/**
 * Fits a fixed-ratio W×H stage (e.g. a two-player table) inside whatever
 * space its container has, letterboxed. Put `areaRef` on an element with no
 * padding of its own — measuring a padded box makes the stage overflow.
 * `active` re-measures when the stage (re)mounts, e.g. after the idle screen.
 */
export function useFitStage(width, height, active = true) {
  const areaRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const area = areaRef.current;
    if (!area || !active) return undefined;
    const fit = () => {
      const rect = area.getBoundingClientRect();
      const scale = Math.min(rect.width / width, rect.height / height);
      setSize({ width: Math.floor(width * scale), height: Math.floor(height * scale) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [active, width, height]);

  return { areaRef, size };
}
