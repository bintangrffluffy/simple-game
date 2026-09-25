import { useEffect } from "react";

const SHOW_MS = 4000;

// Stacked "Achievement unlocked" cards, shown above the game (and its result
// screen) for a few seconds. Purely informational — never blocks input.
export default function AchievementToast({ items, onDone }) {
  useEffect(() => {
    if (!items.length) return undefined;
    const timer = setTimeout(onDone, SHOW_MS);
    return () => clearTimeout(timer);
  }, [items, onDone]);

  if (!items.length) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((a) => (
        <div
          key={a.id}
          className="achievement-toast bg-fluffy-bg ring-fluffy-gold flex w-full max-w-xs items-center gap-3 rounded-2xl px-4 py-3 shadow-xl ring-2"
        >
          <span className="text-3xl" aria-hidden="true">
            {a.emoji}
          </span>
          <div className="min-w-0">
            <div className="text-fluffy-gold text-[10px] font-black tracking-widest uppercase">Achievement unlocked</div>
            <div className="font-poppins text-fluffy-text text-sm font-bold">{a.title}</div>
            <div className="text-fluffy-subtext text-xs">{a.description}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
