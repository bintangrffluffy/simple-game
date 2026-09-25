import GameHeader from "./GameHeader";

// Reusable game frame: header (back/score/timer/pause) + game area + result
// overlay. Every game renders itself inside this shell so the surrounding
// chrome, layout and result UI stay consistent across all six games.
export default function GameShell({
  title,
  score = 0,
  scoreLabel,
  best,
  timeLabel,
  paused = false,
  onPauseToggle,
  showPause = false,
  result,
  children,
  maxWidth = "max-w-[900px]",
}) {
  return (
    <div className="bg-fluffy-cream flex min-h-[100dvh] items-start justify-center framed:items-center framed:px-4 framed:py-8">
      <div
        className={`bg-fluffy-bg relative flex min-h-[100dvh] w-full ${maxWidth} flex-col overflow-hidden framed:min-h-[calc(100dvh-4rem)] framed:rounded-3xl framed:shadow-xl`}
      >
        <GameHeader
          title={title}
          score={score}
          scoreLabel={scoreLabel}
          best={best}
          timeLabel={timeLabel}
          paused={paused}
          onPauseToggle={onPauseToggle}
          showPause={showPause}
        />

        <div className="relative flex-1">
          {children}

          {paused && !result && (
            <div className="bg-fluffy-text/40 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px]">
              <div className="bg-fluffy-bg rounded-2xl px-6 py-4 text-center shadow-xl">
                <p className="font-poppins text-fluffy-text font-bold">
                  Paused
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-3"
                  onClick={onPauseToggle}
                >
                  Resume
                </button>
              </div>
            </div>
          )}

          {result}
        </div>
      </div>
    </div>
  );
}
