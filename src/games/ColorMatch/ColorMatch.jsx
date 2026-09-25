import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import ColorShape from "@/games/components/ColorShape";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, pickRandom, shuffle } from "@/games/assets/gameAssets";

const ROUND_SECONDS = 45;
const POINTS = 10;
// +5 per 3-answer streak, capped so a long streak can't dwarf the base score.
const MAX_STREAK_BONUS = 15;
// After this many correct answers the board grows from 4 to 6 choices.
const HARD_AFTER = 6;
// How long the solved board stays up (with its check mark) before the next one.
const SOLVED_PAUSE = 0.45;

// One correct item plus distractors from *different* colors, one per color,
// so there is always exactly one right answer.
function makeQuestion(choiceCount, previousColorId) {
  const groups = gameAssets.colorGroups;
  const color = pickRandom(groups.filter((g) => g.id !== previousColorId));
  const others = shuffle(groups.filter((g) => g.id !== color.id)).slice(0, choiceCount - 1);
  const choices = shuffle([
    { item: pickRandom(color.items), colorId: color.id },
    ...others.map((g) => ({ item: pickRandom(g.items), colorId: g.id })),
  ]);
  return { color, choices };
}

export default function ColorMatch({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const statsRef = useRef({ correct: 0, wrong: 0, bestStreak: 0 });

  const [question, setQuestion] = useState(() => makeQuestion(4));
  const [wrongIds, setWrongIds] = useState([]);
  // { itemId, advanceAt } while the solved board is showing, in round time.
  const [solved, setSolved] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);

  const [highScore, setHighScore] = useHighScore("color-match");

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "color-match",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(() => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level: 1, won: true, isNewBest, ...statsRef.current });
  }, [finish, highScore, setHighScore]);

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: endGame });
  const elapsed = ROUND_SECONDS - timer.time;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Advance on round time rather than a setTimeout, so pausing holds it too.
  useEffect(() => {
    if (status !== "playing" || !solved || elapsed < solved.advanceAt) return;
    const choiceCount = statsRef.current.correct >= HARD_AFTER ? 6 : 4;
    setQuestion((q) => makeQuestion(choiceCount, q.color.id));
    setWrongIds([]);
    setSolved(null);
  }, [elapsed, solved, status]);

  const handlePick = (choice) => {
    if (statusRef.current !== "playing" || solved || wrongIds.includes(choice.item.id)) return;
    const stats = statsRef.current;

    if (choice.colorId !== question.color.id) {
      stats.wrong += 1;
      streakRef.current = 0;
      setStreak(0);
      setWrongIds((ids) => [...ids, choice.item.id]);
      navigator.vibrate?.([20, 40, 20]);
      return;
    }

    const nextStreak = streakRef.current + 1;
    streakRef.current = nextStreak;
    setStreak(nextStreak);
    stats.correct += 1;
    stats.bestStreak = Math.max(stats.bestStreak, nextStreak);

    scoreRef.current += POINTS + Math.min(MAX_STREAK_BONUS, Math.floor(nextStreak / 3) * 5);
    setScore(scoreRef.current);
    setSolved({ itemId: choice.item.id, advanceAt: elapsed + SOLVED_PAUSE });
    navigator.vibrate?.(12);
  };

  const beginGame = useCallback(() => {
    setQuestion(makeQuestion(4));
    setWrongIds([]);
    setSolved(null);
    setScore(0);
    setStreak(0);
    scoreRef.current = 0;
    streakRef.current = 0;
    statsRef.current = { correct: 0, wrong: 0, bestStreak: 0 };
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

  const { color, choices } = question;

  return (
    <GameShell
      title="Color Match"
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
            title="Colorful work!"
            emoji="🎨"
            celebrate={result.isNewBest}
            stats={[
              { label: "Correct", value: result.correct },
              { label: "Missed", value: result.wrong },
              { label: "Best streak", value: result.bestStreak },
            ]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-5 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex gap-2" aria-hidden="true">
              {gameAssets.colorGroups.map((g) => (
                <ColorShape key={g.id} shape={g.shape} hex={g.hex} size={28} />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Match the color!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Each color comes with its own shape and name. Tap the thing that matches — a Yellow star means find
              something yellow, like a banana.
            </p>
            <button type="button" className="btn btn-primary" onClick={beginGame}>
              Start
            </button>
          </div>
        ) : (
          <>
            <div
              className="bg-fluffy-bg ring-fluffy-border flex w-full max-w-[420px] items-center gap-4 rounded-3xl px-5 py-4 shadow-sm ring-1"
              aria-live="polite"
            >
              <ColorShape shape={color.shape} hex={color.hex} size={56} />
              <div className="min-w-0 flex-1">
                <div className="text-fluffy-subtext text-xs font-semibold tracking-wide uppercase">Find something</div>
                <div className="font-poppins text-fluffy-text text-2xl font-extrabold">{color.name}</div>
              </div>
              {streak > 2 && (
                <div className="bg-fluffy-primary shrink-0 rounded-full px-3 py-1 text-xs font-bold text-white">
                  Streak x{streak}
                </div>
              )}
            </div>

            <div
              className={cn(
                "grid w-full max-w-[420px] gap-3 sm:gap-4",
                choices.length > 4 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {choices.map((choice) => {
                const isWrong = wrongIds.includes(choice.item.id);
                const isSolved = solved?.itemId === choice.item.id;
                return (
                  <button
                    key={`${color.id}-${choice.item.id}`}
                    type="button"
                    onPointerDown={() => handlePick(choice)}
                    aria-label={choice.item.name}
                    className={cn(
                      "bg-fluffy-bg ring-fluffy-border relative flex aspect-square touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl p-2 shadow-sm ring-1 transition-[transform,opacity] duration-200",
                      isWrong && "animate-[shake_0.3s_ease-in-out] opacity-45",
                      isSolved && "ring-fluffy-success scale-105 ring-4",
                      solved && !isSolved && "opacity-60",
                    )}
                  >
                    <img
                      src={choice.item.src}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-[58%] w-[58%] object-contain"
                    />
                    <span className="text-fluffy-text pointer-events-none text-xs font-semibold sm:text-sm">
                      {choice.item.name}
                    </span>
                    {isWrong && (
                      <span className="bg-fluffy-danger absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-white">
                        <X size={14} strokeWidth={3} />
                      </span>
                    )}
                    {isSolved && (
                      <span className="bg-fluffy-success absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-white">
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
