import { useState } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { achievements, getUnlocked } from "@/games/reward/achievements";

// Hub summary of local achievements: a one-line count that expands into
// the full badge grid (locked ones stay visible so kids know what to try).
export default function AchievementsPanel() {
  const [open, setOpen] = useState(false);
  const [unlocked] = useState(getUnlocked);
  const count = achievements.filter((a) => unlocked[a.id]).length;

  return (
    <section className="bg-fluffy-bg ring-fluffy-border mt-4 rounded-2xl ring-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left sm:px-5"
      >
        <span className="text-2xl" aria-hidden="true">
          🏅
        </span>
        <div className="flex-1">
          <div className="font-poppins text-fluffy-text text-sm font-bold">Achievements</div>
          <div className="text-fluffy-subtext text-xs">
            {count} of {achievements.length} unlocked
          </div>
        </div>
        <div className="bg-fluffy-cream h-2 w-24 overflow-hidden rounded-full" aria-hidden="true">
          <div className="bg-fluffy-gold h-full rounded-full" style={{ width: `${(count / achievements.length) * 100}%` }} />
        </div>
        <ChevronDown size={18} className={cn("text-fluffy-subtext transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="grid grid-cols-1 gap-2 px-4 pb-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-3">
          {achievements.map((a) => {
            const isUnlocked = Boolean(unlocked[a.id]);
            return (
              <li
                key={a.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2",
                  isUnlocked ? "bg-fluffy-cream" : "bg-fluffy-bg ring-fluffy-border ring-1",
                )}
              >
                <span className={cn("text-2xl", !isUnlocked && "opacity-30 grayscale")} aria-hidden="true">
                  {a.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm font-bold", isUnlocked ? "text-fluffy-text" : "text-fluffy-subtext")}>
                    {a.title}
                  </div>
                  <div className="text-fluffy-subtext text-xs">{a.description}</div>
                </div>
                {!isUnlocked && <Lock size={14} className="text-fluffy-subtext shrink-0" aria-label="Locked" />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
