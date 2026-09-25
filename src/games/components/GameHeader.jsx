import { ArrowLeft, Pause, Play } from "lucide-react";
import { Link } from "react-router-dom";

export default function GameHeader({ title, score, scoreLabel = "Score", best, timeLabel, paused, onPauseToggle, showPause }) {
  return (
    <div className="border-fluffy-border flex items-center justify-between gap-3 border-b px-4 py-3 short:py-1 sm:px-6">
      <div className="flex items-center gap-2">
        <Link to="/" aria-label="Back to Fluffy Play" className="btn-icon -ml-2">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-poppins text-fluffy-text text-base font-bold sm:text-lg">{title}</h1>
      </div>

      <div className="text-fluffy-text flex items-center gap-4 text-sm font-bold sm:gap-6">
        {score !== undefined && (
          <div className="text-right">
            <div className="text-fluffy-subtext text-[10px] font-semibold tracking-wide uppercase">{scoreLabel}</div>
            <div className="tabular-nums">{score}</div>
          </div>
        )}

        {best !== undefined && (
          <div className="hidden text-right sm:block">
            <div className="text-fluffy-subtext text-[10px] font-semibold tracking-wide uppercase">Best</div>
            <div className="tabular-nums">{best}</div>
          </div>
        )}

        {timeLabel !== undefined && (
          <div className="text-right">
            <div className="text-fluffy-subtext text-[10px] font-semibold tracking-wide uppercase">Time</div>
            <div className="tabular-nums">{timeLabel}</div>
          </div>
        )}

        {showPause && (
          <button type="button" className="btn-icon" onClick={onPauseToggle} aria-label={paused ? "Resume" : "Pause"}>
            {paused ? <Play size={20} /> : <Pause size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}
