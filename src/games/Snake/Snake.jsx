import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, ArrowLeft as ArrowLeftIcon, ArrowRight } from "lucide-react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { gameAssets, loadAssetCanvases, pickRandom } from "@/games/assets/gameAssets";
import DailyModeButton from "@/games/components/DailyModeButton";
import { dailyKey, dailyRandomAt, todayKey } from "@/games/utils/seededRandom";

const COLS = 14;
const ROWS = 14;
const BASE_INTERVAL = 170;
const MIN_INTERVAL = 80;
// Drag distance (px) that commits a turn. Steering happens mid-drag, so a
// single continuous drag can chain several turns without lifting.
const SWIPE_THRESHOLD = 18;
// Turns buffered ahead of the tick, so two quick swipes (e.g. up, then left)
// both land instead of the second overwriting the first.
const MAX_QUEUED_TURNS = 2;

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

// Optional enhancement only — swipe/drag and the on-screen pad are primary.
const KEY_MAP = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  W: "up",
  S: "down",
  A: "left",
  D: "right",
};

function isOpposite(a, b) {
  return a.x === -b.x && a.y === -b.y;
}

function randomEmptyCell(snake, rng) {
  let cell;
  do {
    cell = { x: Math.floor(rng() * COLS), y: Math.floor(rng() * ROWS) };
  } while (snake.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

// Food is a cell plus which treat illustration to draw there.
function spawnFood(snake, rng = Math.random) {
  return { ...randomEmptyCell(snake, rng), treat: pickRandom(gameAssets.treats, rng).id };
}

// Daily: the Nth treat of the day comes from its own seed, so it's the same
// for everyone (as far as the snake's body allows).
function nextFoodRng(dailyRef, countRef) {
  return dailyRef.current ? dailyRandomAt("snake", countRef.current++) : Math.random;
}

export default function Snake({ onGameComplete }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);
  const accRef = useRef(0);
  const cellSizeRef = useRef(20);

  const snakeRef = useRef([
    { x: 6, y: 7 },
    { x: 5, y: 7 },
    { x: 4, y: 7 },
  ]);
  const dirRef = useRef(DIRECTIONS.right);
  const turnQueueRef = useRef([]);
  const foodRef = useRef({ x: 10, y: 7, treat: gameAssets.treats[0].id });
  const treatImagesRef = useRef({});
  const intervalRef = useRef(BASE_INTERVAL);
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const gameOverRef = useRef(false);
  const swipeAnchorRef = useRef(null);
  const dailyRef = useRef(false);
  const foodCountRef = useRef(0);

  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useHighScore("snake");
  const [daily, setDaily] = useState(false);
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("snake"));
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "snake",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const endGame = useCallback(() => {
    const finalScore = scoreRef.current;
    const isDaily = dailyRef.current;
    const isNewBest = finalScore > (isDaily ? dailyBest : highScore);
    setHighScore(finalScore);
    if (isDaily) setDailyBest(finalScore);
    finish({
      score: finalScore,
      level: finalScore,
      won: false,
      isNewBest,
      mode: isDaily ? "daily" : "classic",
      date: isDaily ? todayKey() : undefined,
    });
  }, [dailyBest, finish, highScore, setDailyBest, setHighScore]);

  const setupGame = useCallback(() => {
    snakeRef.current = [
      { x: 6, y: 7 },
      { x: 5, y: 7 },
      { x: 4, y: 7 },
    ];
    dirRef.current = DIRECTIONS.right;
    turnQueueRef.current = [];
    foodCountRef.current = 0;
    foodRef.current = spawnFood(snakeRef.current, nextFoodRng(dailyRef, foodCountRef));
    intervalRef.current = BASE_INTERVAL;
    accRef.current = 0;
    gameOverRef.current = false;
    scoreRef.current = 0;
    setScore(0);
  }, []);

  const beginGame = useCallback(
    (isDaily = false) => {
      dailyRef.current = isDaily;
      setDaily(isDaily);
      setupGame();
      start();
    },
    [setupGame, start],
  );

  const step = useCallback(() => {
    if (gameOverRef.current) return false;

    if (turnQueueRef.current.length) dirRef.current = turnQueueRef.current.shift();
    const head = snakeRef.current[0];
    const newHead = { x: head.x + dirRef.current.x, y: head.y + dirRef.current.y };

    const hitWall = newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS;
    const hitSelf = !hitWall && snakeRef.current.some((s) => s.x === newHead.x && s.y === newHead.y);

    if (hitWall || hitSelf) {
      gameOverRef.current = true;
      endGame();
      return false;
    }

    const ateFood = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
    const nextSnake = [newHead, ...snakeRef.current];
    if (!ateFood) {
      nextSnake.pop();
    } else {
      foodRef.current = spawnFood(nextSnake, nextFoodRng(dailyRef, foodCountRef));
      intervalRef.current = Math.max(MIN_INTERVAL, intervalRef.current - 4);
      scoreRef.current += 10;
      setScore(scoreRef.current);
    }
    snakeRef.current = nextSnake;
    return true;
  }, [endGame]);

  const setDirection = useCallback((dir) => {
    if (statusRef.current !== "playing") return;
    const nextDir = DIRECTIONS[dir];
    if (!nextDir) return;
    const queue = turnQueueRef.current;
    // Validate against the last direction the snake *will* be moving in.
    const lastDir = queue.length ? queue[queue.length - 1] : dirRef.current;
    if (nextDir === lastDir || isOpposite(nextDir, lastDir)) return;
    if (queue.length >= MAX_QUEUED_TURNS) return;
    queue.push(nextDir);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return undefined;

    function resize() {
      const rect = container.getBoundingClientRect();
      const size = Math.floor(Math.min(rect.width, rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cellSizeRef.current = size / COLS;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAssetCanvases(gameAssets.treats, { size: 96 })
      .then((canvases) => {
        if (!cancelled) treatImagesRef.current = canvases;
      })
      .catch((err) => console.error("Snake: failed to load treat art", err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      const dir = KEY_MAP[e.key];
      if (dir) {
        e.preventDefault();
        setDirection(dir);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setDirection]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function draw() {
      const cell = cellSizeRef.current;
      const size = COLS * cell;
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = "#eaf4fb";
      ctx.fillRect(0, 0, size, size);

      const food = foodRef.current;
      const treatImage = treatImagesRef.current[food.treat];
      if (treatImage) {
        // Gentle bob so the treat reads as the thing to go for.
        const bob = reduceMotion ? 0 : Math.sin(performance.now() / 260) * cell * 0.06;
        // Drawn slightly larger than its cell so the art stays legible.
        const size = cell * 1.2;
        const offset = (size - cell) / 2;
        ctx.drawImage(treatImage, food.x * cell - offset, food.y * cell - offset + bob, size, size);
      } else {
        ctx.fillStyle = "#d9a85b";
        ctx.beginPath();
        ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2);
        ctx.fill();
      }

      snakeRef.current.forEach((segment, i) => {
        ctx.fillStyle = i === 0 ? "#035f90" : "#0477b6";
        ctx.beginPath();
        ctx.roundRect(segment.x * cell + 1, segment.y * cell + 1, cell - 2, cell - 2, 5);
        ctx.fill();
      });
    }

    function frame(now) {
      if (lastTimeRef.current == null) lastTimeRef.current = now;
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;

      if (statusRef.current === "playing") {
        accRef.current += dt;
        while (accRef.current >= intervalRef.current) {
          accRef.current -= intervalRef.current;
          const alive = step();
          if (!alive) break;
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [step]);

  const swipeHandlers = usePointerInput({
    onStart: useCallback((p) => {
      swipeAnchorRef.current = p;
    }, []),
    onMove: useCallback(
      (p) => {
        const anchor = swipeAnchorRef.current;
        if (!anchor) return;
        const dx = p.x - anchor.x;
        const dy = p.y - anchor.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
        if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? "right" : "left");
        else setDirection(dy > 0 ? "down" : "up");
        swipeAnchorRef.current = p;
      },
      [setDirection],
    ),
    onEnd: useCallback(() => {
      swipeAnchorRef.current = null;
    }, []),
  });

  // Fires on press, not release, so the pad feels as immediate as a swipe.
  const padPress = (dir) => (e) => {
    e.preventDefault();
    setDirection(dir);
  };

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Snake"
      score={score}
      best={daily ? dailyBest : highScore}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={daily ? dailyBest : highScore}
            isNewBest={result.isNewBest}
            title="Nice run!"
            emoji="🐍"
            celebrate={result.isNewBest}
            shareText={result.mode === "daily" ? `Snake · Daily ${result.date}: ${result.score / 10} treats, ${result.score} points 🐍 Same treats for everyone today!` : undefined}
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto p-4">
        <div
          ref={containerRef}
          className="touch-none-game relative aspect-square w-full max-w-[420px]"
          // Only while playing: the hook captures the pointer, which would
          // otherwise swallow the click on the Start button inside the board.
          {...(status === "playing" ? swipeHandlers : {})}
        >
          <canvas ref={canvasRef} className="block h-full w-full rounded-2xl" />

          {status === "idle" && (
            <div className="bg-fluffy-cream/95 absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Ready, Fluffy?</h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Swipe or drag on the board to steer the snake to every treat — or use the arrow pad below.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
                Start
              </button>
              <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />
            </div>
          )}
        </div>

        {status === "playing" && (
          <div className="touch-none-game grid grid-cols-3 gap-2">
            <div />
            <button type="button" className="btn-icon bg-fluffy-cream" onPointerDown={padPress("up")} aria-label="Up">
              <ArrowUp size={20} />
            </button>
            <div />
            <button type="button" className="btn-icon bg-fluffy-cream" onPointerDown={padPress("left")} aria-label="Left">
              <ArrowLeftIcon size={20} />
            </button>
            <button type="button" className="btn-icon bg-fluffy-cream" onPointerDown={padPress("down")} aria-label="Down">
              <ArrowDown size={20} />
            </button>
            <button type="button" className="btn-icon bg-fluffy-cream" onPointerDown={padPress("right")} aria-label="Right">
              <ArrowRight size={20} />
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
