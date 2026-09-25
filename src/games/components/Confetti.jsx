import { useMemo } from "react";

const COLORS = ["#0477b6", "#d9a85b", "#a9d2f2", "#60bb8f", "#e08ba0"];

// Lightweight CSS-only celebration effect — no canvas/rAF loop, nothing to
// clean up on unmount, and prefers-reduced-motion (see index.css) disables
// it automatically.
export default function Confetti({ pieces = 24 }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.6 + Math.random() * 1.2,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    [pieces],
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.id}
          className="confetti-piece absolute top-0 rounded-sm"
          style={{
            left: `${item.left}%`,
            width: item.size,
            height: item.size * 1.4,
            background: item.color,
            animationDelay: `${item.delay}s`,
            animationDuration: `${item.duration}s`,
            "--rotate": `${item.rotate}deg`,
          }}
        />
      ))}
    </div>
  );
}
