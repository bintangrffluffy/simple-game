import { useCallback, useMemo, useState } from "react";
import { Eraser, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import DailyModeButton from "@/games/components/DailyModeButton";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { gameAssets } from "@/games/assets/gameAssets";
import { SIZES, findConflicts, makeSudoku } from "./sudokuLogic";

// Fruits picked for distinct color *and* shape, so the grid reads without
// color vision. 4×4 uses the first four.
const FRUIT_IDS = ["strawberry", "banana", "grapes", "green-apple", "tangerine", "watermelon"];
const ALL_FRUITS = [...gameAssets.fruits, ...gameAssets.sceneItems, ...gameAssets.colorGroups.flatMap((g) => g.items)];
const FRUITS = FRUIT_IDS.map((id) => ALL_FRUITS.find((f) => f.id === id));
const HINT_PENALTY = 15;

export default function FruitSudoku({ onGameComplete }) {
  const [game, setGame] = useState(() => ({ ...makeSudoku(4), daily: false }));
  const [grid, setGrid] = useState(game.puzzle);
  const [selected, setSelected] = useState(null);
  const [hints, setHints] = useState(0);

  const [best4, setBest4] = useHighScore("fruit-sudoku-4", { lowerIsBetter: true });
  const [best6, setBest6] = useHighScore("fruit-sudoku-6", { lowerIsBetter: true });
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("fruit-sudoku"), { lowerIsBetter: true });
  const timer = useGameTimer({ mode: "up" });
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "fruit-sudoku",
    onComplete: onGameComplete,
  });

  const { n, boxRows, boxCols } = SIZES[game.size];
  const conflicts = useMemo(() => findConflicts(grid, game.size), [grid, game.size]);
  const best = game.daily ? dailyBest : game.size === 4 ? best4 : best6;

  const beginGame = useCallback(
    (size, daily = false) => {
      const next = { ...makeSudoku(size, daily ? dailyRandom("fruit-sudoku") : Math.random), daily };
      setGame(next);
      setGrid(next.puzzle);
      setSelected(null);
      setHints(0);
      timer.reset();
      timer.start();
      start();
    },
    [start, timer],
  );

  const complete = (nextGrid, usedHints) => {
    if (nextGrid.some((v, i) => v !== game.solution[i])) return;
    timer.pause();
    const seconds = Math.round(timer.time) + usedHints * HINT_PENALTY;
    const isNewBest = best === 0 || seconds < best;
    if (game.daily) setDailyBest(seconds);
    if (game.size === 4) setBest4(seconds);
    else setBest6(seconds);
    navigator.vibrate?.([15, 30, 15]);
    finish({
      // Solve time in seconds — lower is better.
      score: seconds,
      scoreUnit: "s",
      lowerIsBetter: true,
      level: game.size,
      size: game.size,
      hints: usedHints,
      mode: game.daily ? "daily" : "classic",
      date: game.daily ? todayKey() : undefined,
      isNewBest,
      duration: Math.round(timer.time),
    });
  };

  const place = (value) => {
    if (status !== "playing" || selected === null || game.puzzle[selected]) return;
    const next = [...grid];
    next[selected] = next[selected] === value ? 0 : value;
    setGrid(next);
    complete(next, hints);
  };

  const hint = () => {
    if (status !== "playing") return;
    // The selected empty (or wrong) cell, else the first one that needs work.
    const target =
      selected !== null && !game.puzzle[selected] && grid[selected] !== game.solution[selected]
        ? selected
        : grid.findIndex((v, i) => v !== game.solution[i]);
    if (target === -1) return;
    const next = [...grid];
    next[target] = game.solution[target];
    setGrid(next);
    setSelected(target);
    setHints(hints + 1);
    complete(next, hints + 1);
  };

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  const fruits = FRUITS.slice(0, n);
  const sel = selected !== null ? { r: Math.floor(selected / n), c: selected % n } : null;
  const fmt = (s) => (s ? formatTime(s) : "—");

  return (
    <GameShell
      title="Fruit Sudoku"
      score={status === "idle" ? "—" : `${n}×${n}`}
      scoreLabel="Grid"
      best={status === "idle" ? undefined : fmt(best)}
      timeLabel={status !== "idle" ? formatTime(timer.time + hints * HINT_PENALTY) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={result.hints ? "Solved with a little help!" : "Solved it!"}
            emoji="🍓"
            scoreLabel="Solve time"
            score={formatTime(result.score)}
            best={fmt(best)}
            isNewBest={result.isNewBest}
            celebrate
            stats={[
              { label: "Grid", value: `${result.size}×${result.size}` },
              { label: "Hints", value: result.hints },
            ]}
            shareText={
              result.mode === "daily"
                ? `Fruit Sudoku · Daily ${result.date}: solved in ${formatTime(result.score)}${result.hints ? ` (${result.hints} hint${result.hints > 1 ? "s" : ""})` : ""} 🍓 Same puzzle for everyone today!`
                : `I solved a ${result.size}×${result.size} Fruit Sudoku in ${formatTime(result.score)} on Fluffy Play! 🍓`
            }
            onRestart={() => beginGame(game.size, game.daily)}
          />
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="grid grid-cols-2 gap-1" aria-hidden="true">
              {FRUITS.slice(0, 4).map((f) => (
                <img key={f.id} src={f.src} alt="" className="h-10 w-10" draggable={false} />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Fruit Sudoku</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Every row, column and box needs one of each fruit. Tap a square, then tap a fruit. No rush — and a hint is
              always there if you're stuck.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => beginGame(4)}>
                Easy · 4×4
              </button>
              <button type="button" className="btn btn-outline" onClick={() => beginGame(6)}>
                Classic · 6×6
              </button>
            </div>
            <DailyModeButton onClick={() => beginGame(6, true)} best={dailyBest ? formatTime(dailyBest) : null} />
          </div>
        ) : (
          <>
            {game.daily && <div className="text-fluffy-subtext text-[11px] font-semibold tracking-wide uppercase">Daily puzzle · {todayKey()}</div>}
            <div
              className="bg-fluffy-text/70 grid aspect-square w-full max-w-[400px] gap-px overflow-hidden rounded-2xl p-[3px] shadow-sm"
              style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {grid.map((value, i) => {
                const r = Math.floor(i / n);
                const c = i % n;
                const given = !!game.puzzle[i];
                const related = sel && (sel.r === r || sel.c === c);
                return (
                  <button
                    key={i}
                    type="button"
                    onPointerDown={() => status === "playing" && setSelected(i)}
                    aria-label={`Row ${r + 1} column ${c + 1}${value ? `: ${FRUITS[value - 1].name}` : ", empty"}${given ? " (given)" : ""}`}
                    className={cn(
                      "relative flex aspect-square items-center justify-center",
                      given ? "bg-fluffy-cream" : "bg-fluffy-bg",
                      related && !given && "bg-[#f3f9fd]",
                      selected === i && "ring-fluffy-primary z-10 ring-4 ring-inset",
                      conflicts.has(i) && !given && "bg-[#fde8e8]",
                      // Thicker lines between boxes.
                      c % boxCols === boxCols - 1 && c !== n - 1 && "border-r-fluffy-text/70 border-r-[3px]",
                      r % boxRows === boxRows - 1 && r !== n - 1 && "border-b-fluffy-text/70 border-b-[3px]",
                    )}
                  >
                    {value > 0 && (
                      <img
                        src={FRUITS[value - 1].src}
                        alt=""
                        draggable={false}
                        className={cn("pointer-events-none h-[64%] w-[64%] object-contain", given && "opacity-90")}
                      />
                    )}
                    {conflicts.has(i) && !given && <span className="bg-fluffy-danger absolute top-1 right-1 h-2 w-2 rounded-full" />}
                  </button>
                );
              })}
            </div>

            <div className="flex w-full max-w-[400px] flex-wrap justify-center gap-2">
              {fruits.map((fruit, index) => (
                <button
                  key={fruit.id}
                  type="button"
                  onPointerDown={() => place(index + 1)}
                  aria-label={`Place ${fruit.name}`}
                  disabled={selected === null || !!game.puzzle[selected]}
                  className="bg-fluffy-bg ring-fluffy-border flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 disabled:opacity-40 sm:h-14 sm:w-14"
                >
                  <img src={fruit.src} alt="" draggable={false} className="pointer-events-none h-9 w-9" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onPointerDown={() => place(grid[selected] || 0)}
                disabled={selected === null || !!game.puzzle[selected] || !grid[selected]}
              >
                <Eraser size={16} /> Clear
              </button>
              <button type="button" className="btn btn-secondary" onPointerDown={hint}>
                <Lightbulb size={16} /> Hint (+{HINT_PENALTY}s)
              </button>
            </div>
            <p className="text-fluffy-subtext text-xs">
              {selected === null ? "Tap an empty square to start" : game.puzzle[selected] ? "That fruit was given — pick an empty square" : "Now tap a fruit"}
            </p>
          </>
        )}
      </div>
    </GameShell>
  );
}
