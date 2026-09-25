import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, shuffle } from "@/games/assets/gameAssets";
import OddOneOut from "./OddOneOut";

const ROUND_SECONDS = 60;
const TARGETS_PER_LEVEL = 3;
const FIND_POINTS = 10;
const LEVEL_BONUS = 25;
// Scene items are laid out on a jittered COLS x ROWS grid so they can
// overlap a little (it's a messy room) but never hide each other.
const COLS = 4;
const ROWS = 6;
const JITTER = 0.22;
// Seconds without a find before the next target starts to wiggle.
const HINT_AFTER = 8;
// How long the "Level clear!" banner shows before the next scene.
const LEVEL_PAUSE = 1.1;

function itemCountFor(level) {
  return Math.min(COLS * ROWS, 8 + level * 4);
}

let sceneUid = 0;

function makeScene(level) {
  const items = shuffle(gameAssets.sceneItems).slice(0, itemCountFor(level));
  const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i));
  const placed = items.map((item, i) => {
    const cell = cells[i];
    const col = cell % COLS;
    const row = Math.floor(cell / COLS);
    return {
      item,
      left: ((col + 0.5 + (Math.random() * 2 - 1) * JITTER) / COLS) * 100,
      top: ((row + 0.5 + (Math.random() * 2 - 1) * JITTER) / ROWS) * 100,
      rotate: Math.round((Math.random() * 2 - 1) * 28),
      scale: 0.9 + Math.random() * 0.25,
    };
  });
  const targets = shuffle(items).slice(0, TARGETS_PER_LEVEL).map((item) => item.id);
  return { id: ++sceneUid, level, placed, targets };
}

export default function FindTheItem({ onGameComplete }) {
  // "hidden" (this component) or "odd" (Odd One Out, a second mode).
  const [mode, setMode] = useState("hidden");
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const statsRef = useRef({ found: 0, levels: 0 });

  const [scene, setScene] = useState(() => makeScene(1));
  const [found, setFound] = useState([]);
  const [wrong, setWrong] = useState(null);
  // Round time of the last find (or scene start); drives the hint.
  const [lastFindAt, setLastFindAt] = useState(0);
  // Round time at which the cleared scene is swapped for the next one.
  const [clearedAt, setClearedAt] = useState(null);
  const [score, setScore] = useState(0);

  const [highScore, setHighScore] = useHighScore("find-item");

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "find-item",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(() => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level: statsRef.current.levels + 1, won: true, isNewBest, ...statsRef.current });
  }, [finish, highScore, setHighScore]);

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: endGame });
  const elapsed = ROUND_SECONDS - timer.time;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Next scene once the "Level clear!" banner has shown (round time, so
  // pausing holds it too).
  useEffect(() => {
    if (status !== "playing" || clearedAt === null || elapsed < clearedAt + LEVEL_PAUSE) return;
    setScene((s) => makeScene(s.level + 1));
    setFound([]);
    setWrong(null);
    setClearedAt(null);
    setLastFindAt(elapsed);
  }, [clearedAt, elapsed, status]);

  const handlePick = (event, entry) => {
    event.stopPropagation();
    if (statusRef.current !== "playing" || clearedAt !== null) return;
    const { id } = entry.item;
    if (found.includes(id)) return;

    if (!scene.targets.includes(id)) {
      setWrong({ id, key: Date.now() });
      return;
    }

    const nextFound = [...found, id];
    setFound(nextFound);
    setLastFindAt(elapsed);
    statsRef.current.found += 1;
    scoreRef.current += FIND_POINTS;
    navigator.vibrate?.(12);

    if (nextFound.length === scene.targets.length) {
      statsRef.current.levels += 1;
      scoreRef.current += LEVEL_BONUS;
      setClearedAt(elapsed);
    }
    setScore(scoreRef.current);
  };

  const beginGame = useCallback(() => {
    setScene(makeScene(1));
    setFound([]);
    setWrong(null);
    setClearedAt(null);
    setLastFindAt(0);
    setScore(0);
    scoreRef.current = 0;
    statsRef.current = { found: 0, levels: 0 };
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

  const hintId =
    status === "playing" && clearedAt === null && elapsed - lastFindAt >= HINT_AFTER
      ? scene.targets.find((id) => !found.includes(id))
      : null;
  const targetItems = scene.targets.map((id) => gameAssets.sceneItems.find((item) => item.id === id));

  if (mode === "odd") return <OddOneOut onGameComplete={onGameComplete} onSwitchMode={() => setMode("hidden")} />;

  return (
    <GameShell
      title="Find the Item"
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
            title="Great eyes!"
            emoji="🔎"
            celebrate={result.isNewBest}
            stats={[
              { label: "Found", value: result.found },
              { label: "Rooms cleared", value: result.levels },
            ]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div className="touch-none-game absolute inset-0 flex flex-col">
        {status !== "idle" && (
          <div className="bg-fluffy-bg border-fluffy-border border-b px-3 py-3">
            <div className="text-fluffy-subtext mb-2 text-center text-[11px] font-semibold tracking-wide uppercase">
              Room {scene.level} · Find these
            </div>
            <ul className="flex justify-center gap-3" aria-live="polite">
              {targetItems.map((item) => {
                const isFound = found.includes(item.id);
                return (
                  <li
                    key={item.id}
                    className={cn(
                      "ring-fluffy-border relative flex w-24 flex-col items-center gap-1 rounded-2xl px-2 py-2 ring-1 transition-colors",
                      isFound ? "bg-fluffy-success/15 ring-fluffy-success" : "bg-fluffy-cream",
                    )}
                  >
                    <img src={item.src} alt="" draggable={false} className={cn("h-10 w-10 object-contain", isFound && "opacity-50")} />
                    <span className={cn("text-fluffy-text text-center text-xs leading-tight font-semibold", isFound && "line-through opacity-60")}>
                      {item.name}
                    </span>
                    {isFound && (
                      <span className="bg-fluffy-success absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-white">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {/* The room: soft wall + floor, drawn in CSS so the decor can never be
            mistaken for a findable item. */}
        <div className="relative flex-1 overflow-hidden bg-[#fdf6ec]">
          <div className="bg-fluffy-cream absolute inset-x-0 top-0 h-[38%]" />
          <div className="border-fluffy-bg absolute top-[7%] left-[8%] h-[20%] w-[26%] rounded-xl border-[6px] bg-[#d6ecfa]" aria-hidden="true">
            <div className="bg-fluffy-bg absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2" />
          </div>
          <div className="bg-fluffy-blush/70 absolute bottom-[8%] left-1/2 h-[26%] w-[80%] -translate-x-1/2 rounded-[50%]" aria-hidden="true" />

          {/* sm:bottom-14 keeps the last row clear of GameShell, which runs ~32px
              past the viewport on desktop (min-h-100dvh plus its sm:py-8). */}
          {status !== "idle" && (
            <div key={scene.id} className="absolute inset-x-2 top-3 bottom-2 sm:bottom-14">
              {scene.placed.map((entry) => {
                const { id } = entry.item;
                const isFound = found.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onPointerDown={(event) => handlePick(event, entry)}
                    aria-label={entry.item.name}
                    disabled={isFound}
                    className="absolute flex h-[clamp(48px,12vmin,76px)] w-[clamp(48px,12vmin,76px)] touch-manipulation items-center justify-center"
                    style={{
                      left: `${entry.left}%`,
                      top: `${entry.top}%`,
                      transform: `translate(-50%, -50%) rotate(${entry.rotate}deg) scale(${entry.scale})`,
                    }}
                  >
                    <img
                      key={wrong?.id === id ? wrong.key : "idle"}
                      src={entry.item.src}
                      alt=""
                      draggable={false}
                      className={cn(
                        "pointer-events-none h-full w-full object-contain drop-shadow-[0_2px_2px_rgba(75,85,99,0.25)]",
                        wrong?.id === id && "animate-[shake_0.3s_ease-in-out]",
                        isFound && "find-item-found",
                        hintId === id && "find-item-hint",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {clearedAt !== null && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <div className="bg-fluffy-success font-poppins find-item-banner rounded-full px-5 py-2 text-lg font-extrabold text-white shadow-lg">
                Room clear! +{LEVEL_BONUS}
              </div>
            </div>
          )}

          {status === "idle" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Find the hidden items!</h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                The room is full of toys, treats and clothes. Tap the {TARGETS_PER_LEVEL} items on your list
                to clear each room. Stuck? A hint will wiggle for you.
              </p>
              <button type="button" className="btn btn-primary" onClick={beginGame}>
                Start
              </button>
              <button type="button" className="btn btn-outline" onClick={() => setMode("odd")}>
                Odd One Out mode
              </button>
            </div>
          )}
        </div>

      </div>
    </GameShell>
  );
}
