import { CalendarDays } from "lucide-react";
import { todayKey } from "@/games/utils/seededRandom";

// "Today's run" entry point for daily modes: same seed for every player
// today (see utils/seededRandom.js), so scores are comparable and shareable.
export default function DailyModeButton({ onClick, best }) {
  const label = new Date(`${todayKey()}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <button type="button" className="btn btn-secondary flex-col gap-0 py-2" onClick={onClick}>
      <span className="inline-flex items-center gap-1.5">
        <CalendarDays size={16} /> Daily · {label}
      </span>
      <span className="text-fluffy-subtext text-[11px] font-semibold">
        Same run for everyone today{best ? ` · best ${best}` : ""}
      </span>
    </button>
  );
}
