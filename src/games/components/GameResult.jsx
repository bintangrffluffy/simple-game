import { Trophy, RotateCcw, ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { getGameById } from "@/games/config/games";
import Confetti from "./Confetti";
import ShareButton from "./ShareButton";

// Default share text, so every game gets a Share button for free. Games
// override it via `shareText` when the plain score isn't the story (e.g.
// reaction ms, a together-mode winner). Never put a daily puzzle's solution
// in here.
function defaultShareText({ title, score, scoreLabel, isNewBest }) {
  const line = scoreLabel === "Score" ? `I scored ${score} in ${title}` : `${title} — ${scoreLabel}: ${score}`;
  return `${line} on Fluffy Play!${isNewBest ? " New personal best! 🏆" : " 🎉"}`;
}

export default function GameResult({
  title = "You did it!",
  emoji = "🎉",
  score,
  scoreLabel = "Score",
  best,
  isNewBest,
  stats = [],
  onRestart,
  celebrate = true,
  shareText,
}) {
  const { gameId } = useParams();
  const game = getGameById(gameId);
  const text = shareText ?? defaultShareText({ title: game?.title ?? "Fluffy Play", score, scoreLabel, isNewBest });
  const url = `${window.location.origin}/games/${gameId ?? ""}`;

  return (
    <div className="bg-fluffy-text/40 absolute inset-0 z-20 flex items-center justify-center p-4 backdrop-blur-[2px]">
      {celebrate && <Confetti />}
      <div className="bg-fluffy-bg relative z-10 w-full max-w-xs rounded-3xl p-6 text-center shadow-xl">
        <div className="text-4xl">{emoji}</div>
        <h2 className="font-poppins text-fluffy-text mt-2 text-xl font-extrabold">{title}</h2>

        <div className="bg-fluffy-cream mt-4 rounded-2xl px-4 py-3">
          <div className="text-fluffy-subtext text-[11px] font-semibold tracking-wide uppercase">{scoreLabel}</div>
          <div className="font-poppins text-fluffy-primary text-3xl font-black tabular-nums">{score}</div>
          {isNewBest && (
            <div className="text-fluffy-gold mt-1 inline-flex items-center gap-1 text-xs font-bold">
              <Trophy size={14} /> New best!
            </div>
          )}
          {!isNewBest && best !== undefined && (
            <div className="text-fluffy-subtext mt-1 text-xs font-semibold">Best: {best}</div>
          )}
        </div>

        {stats.length > 0 && (
          <div className="text-fluffy-subtext mt-3 flex justify-center gap-4 text-xs">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-fluffy-text font-bold">{stat.value}</div>
                <div>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button type="button" className="btn btn-primary w-full" onClick={onRestart}>
            <RotateCcw size={16} /> Play Again
          </button>
          <ShareButton text={text} url={url} />
          <Link to="/" className="btn btn-outline w-full">
            <ArrowLeft size={16} /> Back to Games
          </Link>
        </div>
      </div>
    </div>
  );
}
