import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, pickRandom } from "@/games/assets/gameAssets";

const ROUND_SECONDS = 60;
const BASE_POINTS = 10;
// Seconds without a find before the odd tile starts to wiggle.
const HINT_AFTER = 8;
// A wrong tap freezes the grid briefly, so tapping everything doesn't pay.
const WRONG_LOCK = 0.7;
const SOLVED_PAUSE = 0.45;

// Measured by comparing each illustration with its mirrored / 90°-rotated
// self: only items that clearly look different are used for those rounds,
// otherwise the "odd" tile could be indistinguishable.
const FLIP_OK = new Set([
  "cap", "banana", "balloon", "socks", "pizza", "lemon", "croissant", "watermelon", "puzzle-piece",
  "books", "carrot", "grapes", "shoes", "lollipop", "crayon", "kite", "toothbrush",
]);
const ROTATE_SKIP = new Set([
  "gift", "backpack", "doughnut", "egg", "cookie", "basketball", "game-die", "bucket", "soccer-ball",
  "soap", "cheese", "hot-beverage",
]);

function gridSize(round) {
  if (round <= 2) return 3;
  if (round <= 5) return 4;
  if (round <= 9) return 5;
  return 6;
}

let roundUid = 0;

// Every tile shows the same item except one: a different item early on,
// then the same item mirrored, rotated or shrunk — subtler as rounds go.
function makeRound(round) {
  const items = gameAssets.sceneItems;
  const kind = pickRandom(round <= 2 ? ["other"] : round <= 5 ? ["other", "rotate", "flip"] : ["rotate", "flip", "small"]);
  const pool =
    kind === "flip" ? items.filter((i) => FLIP_OK.has(i.id)) : kind === "rotate" ? items.filter((i) => !ROTATE_SKIP.has(i.id)) : items;
  const base = pickRandom(pool);
  let odd = { item: base, transform: "none" };
  if (kind === "other") odd = { item: pickRandom(items.filter((i) => i.id !== base.id)), transform: "none" };
  if (kind === "flip") odd.transform = "scaleX(-1)";
  if (kind === "rotate") odd.transform = `rotate(${(round <= 8 ? 90 : 45) * (Math.random() < 0.5 ? -1 : 1)}deg)`;
  if (kind === "small") odd.transform = `scale(${round <= 9 ? 0.7 : 0.8})`;
  const size = gridSize(round);
  return { id: ++roundUid, round, size, base, odd, oddIndex: Math.floor(Math.random() * size * size) };
}

export default function OddOneOut({ onGameComplete, onSwitchMode }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const statsRef = useRef({ rounds: 0, misses: 0 });

  const [board, setBoard] = useState(() => makeRound(1));
  const [wrong, setWrong] = useState(null);
  // Round-time marks (not setTimeout) so pausing holds them too.
  const [lockedUntil, setLockedUntil] = useState(0);
  const [solvedAt, setSolvedAt] = useState(null);
  const [lastFindAt, setLastFindAt] = useState(0);
  const [score, setScore] = useState(0);

  const [highScore, setHighScore] = useHighScore("find-item-odd");
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "find-item",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(() => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level: statsRef.current.rounds + 1, mode: "odd-one-out", won: true, isNewBest, ...statsRef.current });
  }, [finish, highScore, setHighScore]);

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: endGame });
  const elapsed = ROUND_SECONDS - timer.time;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status !== "playing" || solvedAt === null || elapsed < solvedAt + SOLVED_PAUSE) return;
    setBoard((b) => makeRound(b.round + 1));
    setWrong(null);
    setSolvedAt(null);
    setLastFindAt(elapsed);
  }, [elapsed, solvedAt, status]);

  const handlePick = (index) => {
    if (statusRef.current !== "playing" || solvedAt !== null || elapsed < lockedUntil) return;
    if (index !== board.oddIndex) {
      statsRef.current.misses += 1;
      setWrong({ index, key: Date.now() });
      setLockedUntil(elapsed + WRONG_LOCK);
      navigator.vibrate?.([20, 40, 20]);
      return;
    }
    statsRef.current.rounds += 1;
    scoreRef.current += BASE_POINTS + (board.size - 3) * 5;
    setScore(scoreRef.current);
    setSolvedAt(elapsed);
    navigator.vibrate?.(12);
  };

  const beginGame = useCallback(() => {
    setBoard(makeRound(1));
    setWrong(null);
    setLockedUntil(0);
    setSolvedAt(null);
    setLastFindAt(0);
    setScore(0);
    scoreRef.current = 0;
    statsRef.current = { rounds: 0, misses: 0 };
    timer.reset(ROUND_SECONDS);
    timer.start();
    start();
  }, [start, timer]);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  const locked = elapsed < lockedUntil;
  const showHint = status === "playing" && solvedAt === null && elapsed - lastFindAt >= HINT_AFTER;

  return (
    <GameShell
      title="Odd One Out"
      score={score}
      best={highScore}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={highScore}
            isNewBest={result.isNewBest}
            title="Eagle eyes!"
            emoji="🔍"
            celebrate={result.isNewBest}
            stats={[
              { label: "Spotted", value: result.rounds },
              { label: "Missed", value: result.misses },
            ]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div className="touch-none-game absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto bg-[#fdf6ec] p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="grid grid-cols-3 gap-1.5" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <img
                  key={i}
                  src={gameAssets.sceneItems.find((item) => item.id === "banana").src}
                  alt=""
                  draggable={false}
                  className="h-9 w-9"
                  style={{ transform: i === 5 ? "scaleX(-1)" : undefined }}
                />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Spot the odd one out!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Every tile looks the same — except one. It might be a different thing, flipped, turned or smaller. The grid
              grows as you go.
            </p>
            <button type="button" className="btn btn-primary" onClick={beginGame}>
              Start
            </button>
            <button type="button" className="btn btn-outline" onClick={onSwitchMode}>
              <ArrowLeft size={16} /> Hidden items mode
            </button>
          </div>
        ) : (
          <>
            <div className="text-fluffy-subtext text-center text-[11px] font-semibold tracking-wide uppercase" aria-live="polite">
              Round {board.round} · Tap the one that's different
            </div>
            <div
              key={board.id}
              className={cn("grid w-full max-w-[420px] gap-2 transition-opacity", locked && "opacity-60")}
              style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: board.size * board.size }, (_, index) => {
                const isOdd = index === board.oddIndex;
                const tile = isOdd ? board.odd : { item: board.base, transform: "none" };
                const isSolved = isOdd && solvedAt !== null;
                return (
                  <button
                    key={wrong?.index === index ? `${index}-${wrong.key}` : index}
                    type="button"
                    onPointerDown={() => handlePick(index)}
                    aria-label={`Tile ${index + 1}`}
                    className={cn(
                      "bg-fluffy-bg ring-fluffy-border relative flex aspect-square min-h-11 touch-manipulation items-center justify-center rounded-2xl shadow-sm ring-1",
                      wrong?.index === index && "animate-[shake_0.3s_ease-in-out]",
                      isSolved && "ring-fluffy-success ring-4",
                      isOdd && showHint && "find-item-hint",
                    )}
                  >
                    <img
                      src={tile.item.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-[68%] w-[68%] object-contain"
                      style={{ transform: tile.transform }}
                    />
                    {isSolved && (
                      <span className="bg-fluffy-success absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </GameShell>
  );
}
