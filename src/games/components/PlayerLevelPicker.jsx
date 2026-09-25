import { cn } from "@/lib/utils";
import { PLAYER_LEVELS, PLAYER_STYLES } from "./players";

// Per-player Kid / Grown-up handicap picker for "Play Together" modes.

export default function PlayerLevelPicker({ levels, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {levels.map((current, index) => (
        <div key={index} className="flex items-center justify-between gap-2">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", PLAYER_STYLES[index])}>Player {index + 1}</span>
          <div className="bg-fluffy-cream flex rounded-full p-1" role="group" aria-label={`Player ${index + 1} level`}>
            {PLAYER_LEVELS.map((level) => (
              <button
                key={level.id}
                type="button"
                aria-pressed={current === level.id}
                onClick={() => onChange(levels.map((l, i) => (i === index ? level.id : l)))}
                className={cn(
                  "min-h-11 rounded-full px-4 text-xs font-bold transition-colors",
                  current === level.id ? "bg-fluffy-bg text-fluffy-primary shadow-sm" : "text-fluffy-subtext",
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
