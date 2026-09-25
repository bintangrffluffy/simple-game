import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Lightbulb, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import DailyModeButton from "@/games/components/DailyModeButton";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { formatTime } from "@/games/utils/format";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { gameAssets } from "@/games/assets/gameAssets";
import { PACK, areAdjacent, cellKey, makePack } from "./connectLogic";

const HINT_PENALTY = 15;
const CLEAR_PAUSE_MS = 900;
// Each pair: its color group's hex + a well-known item of that color, so
// the dots can be matched by picture as well as by color.
const COLORS = gameAssets.colorGroups.map((g) => ({ hex: g.hex, name: g.name, item: g.items[0] }));

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];

export default function ConnectPairs({ onGameComplete }) {
  const [pack, setPack] = useState(() => makePack());
  const [levelIndex, setLevelIndex] = useState(0);
  const [paths, setPaths] = useState(() => pack[0].pairs.map(() => []));
  const [cleared, setCleared] = useState(false);
  const [daily, setDaily] = useState(false);
  const [hints, setHints] = useState(0);
  const [moves, setMoves] = useState(0);

  const pathsRef = useRef(paths);
  const drawingRef = useRef(null);
  const boardRef = useRef(null);

  const [best, setBest] = useHighScore("connect-pairs", { lowerIsBetter: true });
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("connect-pairs"), { lowerIsBetter: true });
  const timer = useGameTimer({ mode: "up" });
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "connect-pairs",
    onComplete: onGameComplete,
  });

  const level = pack[levelIndex];
  const { n } = level;
  const endpoints = useMemo(() => {
    const map = new Map();
    level.pairs.forEach((p) => {
      map.set(cellKey(...p.a), p.color);
      map.set(cellKey(...p.b), p.color);
    });
    return map;
  }, [level]);

  const commit = (next) => {
    pathsRef.current = next;
    setPaths(next);
  };

  const isComplete = useCallback(
    (color, path) => {
      const pair = level.pairs[color];
      if (path.length < 2) return false;
      const ends = [path[0], path[path.length - 1]];
      return (same(ends[0], pair.a) && same(ends[1], pair.b)) || (same(ends[0], pair.b) && same(ends[1], pair.a));
    },
    [level],
  );

  const filled = new Set(paths.flatMap((p) => p.map((c) => cellKey(...c)))).size;
  const connected = paths.filter((p, color) => isComplete(color, p)).length;
  const solved = connected === level.pairs.length && filled === n * n;

  // Runs after the "Level clear!" banner: next level, or the result.
  const advanceRef = useRef(() => {});
  advanceRef.current = () => {
    if (levelIndex + 1 < pack.length) {
      const next = levelIndex + 1;
      setLevelIndex(next);
      commit(pack[next].pairs.map(() => []));
      setCleared(false);
      return;
    }
    timer.pause();
    const seconds = Math.round(timer.time) + hints * HINT_PENALTY;
    const isNewBest = (daily ? dailyBest : best) === 0 || seconds < (daily ? dailyBest : best);
    if (daily) setDailyBest(seconds);
    setBest(seconds);
    finish({
      score: seconds,
      scoreUnit: "s",
      lowerIsBetter: true,
      level: pack.length,
      hints,
      moves,
      mode: daily ? "daily" : "classic",
      date: daily ? todayKey() : undefined,
      isNewBest,
      duration: Math.round(timer.time),
    });
  };

  useEffect(() => {
    if (!solved || status !== "playing" || cleared) return;
    setCleared(true);
    navigator.vibrate?.([15, 30, 15]);
  }, [cleared, solved, status]);

  // Separate effect: scheduling inside the one above would be cancelled by
  // its own cleanup the moment `cleared` flips to true.
  useEffect(() => {
    if (!cleared) return undefined;
    const id = setTimeout(() => advanceRef.current(), CLEAR_PAUSE_MS);
    return () => clearTimeout(id);
  }, [cleared]);

  const cellAt = (point) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const c = Math.floor(((point.x - rect.left) / rect.width) * n);
    const r = Math.floor(((point.y - rect.top) / rect.height) * n);
    return r >= 0 && r < n && c >= 0 && c < n ? [r, c] : null;
  };

  // One orthogonal step of the path being drawn.
  const extend = (cell) => {
    const color = drawingRef.current;
    const all = pathsRef.current.map((p) => [...p]);
    const path = all[color];
    const head = path[path.length - 1];
    if (!head || !areAdjacent(head, cell)) return false;
    if (path.length >= 2 && same(path[path.length - 2], cell)) {
      path.pop(); // backtrack
      commit(all);
      return true;
    }
    if (isComplete(color, path)) return false;
    const ownIndex = path.findIndex((c) => same(c, cell));
    if (ownIndex !== -1) {
      all[color] = path.slice(0, ownIndex + 1);
      commit(all);
      return true;
    }
    const endpointColor = endpoints.get(cellKey(...cell));
    if (endpointColor !== undefined && endpointColor !== color) return false;
    // Crossing another path cuts it there, like the genre.
    all.forEach((other, i) => {
      if (i === color) return;
      const cut = other.findIndex((c) => same(c, cell));
      if (cut !== -1) all[i] = other.slice(0, cut);
    });
    path.push(cell);
    commit(all);
    return true;
  };

  // Latest-render handlers, so the pointer callbacks below stay stable.
  const handlersRef = useRef({});
  handlersRef.current = {
    start(point) {
      if (status !== "playing" || cleared) return;
      const cell = cellAt(point);
      if (!cell) return;
      const k = cellKey(...cell);
      const endpointColor = endpoints.get(k);
      const all = pathsRef.current.map((p) => [...p]);
      if (endpointColor !== undefined) {
        drawingRef.current = endpointColor;
        all[endpointColor] = [cell];
      } else {
        const color = all.findIndex((p) => p.some((c) => same(c, cell)));
        if (color === -1) return;
        drawingRef.current = color;
        all[color] = all[color].slice(0, all[color].findIndex((c) => same(c, cell)) + 1);
      }
      commit(all);
    },
    move(point) {
      if (drawingRef.current === null) return;
      const target = cellAt(point);
      if (!target) return;
      // Step toward the pointer one square at a time, so a fast swipe
      // can't skip squares.
      for (let guard = 0; guard < 2 * n; guard++) {
        const path = pathsRef.current[drawingRef.current];
        const head = path[path.length - 1];
        if (!head || same(head, target)) break;
        const dr = target[0] - head[0];
        const dc = target[1] - head[1];
        const step =
          Math.abs(dr) >= Math.abs(dc) ? [head[0] + Math.sign(dr), head[1]] : [head[0], head[1] + Math.sign(dc)];
        if (!extend(step)) break;
      }
    },
  };

  const pointer = usePointerInput({
    onStart: useCallback((point) => handlersRef.current.start(point), []),
    onMove: useCallback((point) => handlersRef.current.move(point), []),
    onEnd: useCallback(() => {
      if (drawingRef.current !== null) setMoves((m) => m + 1);
      drawingRef.current = null;
    }, []),
  });

  const beginGame = useCallback(
    (isDaily) => {
      const nextPack = makePack(isDaily ? dailyRandom("connect-pairs") : Math.random);
      setPack(nextPack);
      setDaily(isDaily);
      setLevelIndex(0);
      commit(nextPack[0].pairs.map(() => []));
      setCleared(false);
      setHints(0);
      setMoves(0);
      drawingRef.current = null;
      timer.reset();
      timer.start();
      start();
    },
    [start, timer],
  );

  const resetLevel = () => commit(level.pairs.map(() => []));

  // Reveals one unfinished pair's solution path (cutting through others).
  const hint = () => {
    if (status !== "playing" || cleared) return;
    const pair = level.pairs.find((p) => !isComplete(p.color, pathsRef.current[p.color]));
    if (!pair) return;
    const solutionKeys = new Set(pair.solution.map((c) => cellKey(...c)));
    const all = pathsRef.current.map((p, i) => {
      if (i === pair.color) return [...pair.solution];
      const cut = p.findIndex((c) => solutionKeys.has(cellKey(...c)));
      return cut === -1 ? p : p.slice(0, cut);
    });
    commit(all);
    setHints((h) => h + 1);
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

  const shownBest = daily ? dailyBest : best;
  const fmt = (s) => (s ? formatTime(s) : "—");
  const center = (i) => ((i + 0.5) / n) * 100;
  const cellColor = new Map();
  paths.forEach((p, color) => p.forEach((c) => cellColor.set(cellKey(...c), color)));

  return (
    <GameShell
      title="Connect Pairs"
      score={status === "idle" ? "—" : `${levelIndex + 1}/${PACK.length}`}
      scoreLabel="Level"
      best={status === "idle" ? undefined : fmt(shownBest)}
      timeLabel={status !== "idle" ? formatTime(timer.time + hints * HINT_PENALTY) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title="All connected!"
            emoji="🔗"
            scoreLabel="Time for 5 puzzles"
            score={formatTime(result.score)}
            best={fmt(shownBest)}
            isNewBest={result.isNewBest}
            celebrate
            stats={[
              { label: "Hints", value: result.hints },
              { label: "Moves", value: result.moves },
            ]}
            shareText={
              result.mode === "daily"
                ? `Connect Pairs · Daily ${result.date}: 5 puzzles in ${formatTime(result.score)}${result.hints ? ` (${result.hints} hint${result.hints > 1 ? "s" : ""})` : ""} 🔗 Same puzzles for everyone today!`
                : `I connected 5 Connect Pairs puzzles in ${formatTime(result.score)} on Fluffy Play! 🔗`
            }
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-3 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex gap-2" aria-hidden="true">
              {COLORS.slice(0, 4).map((c) => (
                <span
                  key={c.name}
                  className="flex h-11 w-11 items-center justify-center rounded-full ring-4 ring-white"
                  style={{ background: c.hex }}
                >
                  <img src={c.item.src} alt="" className="h-7 w-7" draggable={false} />
                </span>
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Connect the pairs!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Drag from a dot to its twin to draw a path. Paths can't cross, and every square must be filled. Five
              puzzles, from 5×5 to 7×7.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
              Play
            </button>
            <DailyModeButton onClick={() => beginGame(true)} best={dailyBest ? formatTime(dailyBest) : null} />
          </div>
        ) : (
          <>
            <div
              className="text-fluffy-subtext flex w-full max-w-[420px] items-center justify-between text-xs font-bold"
              aria-live="polite"
            >
              <span>
                {connected}/{level.pairs.length} connected
              </span>
              {daily && <span>Daily · {todayKey()}</span>}
              <span>{Math.round((filled / (n * n)) * 100)}% filled</span>
            </div>
            <div
              ref={boardRef}
              {...pointer}
              className="bg-fluffy-bg ring-fluffy-border relative grid aspect-square w-full max-w-[420px] touch-none overflow-hidden rounded-2xl shadow-sm ring-1"
              style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: n * n }, (_, i) => {
                const r = Math.floor(i / n);
                const c = i % n;
                const color = cellColor.get(cellKey(r, c));
                return (
                  <div
                    key={i}
                    className="border-fluffy-border/70 border-r border-b"
                    style={color !== undefined ? { background: `${COLORS[color].hex}22` } : undefined}
                  />
                );
              })}
              <svg
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                {paths.map((p, color) =>
                  p.length > 1 ? (
                    <polyline
                      key={color}
                      points={p.map(([r, c]) => `${center(c)},${center(r)}`).join(" ")}
                      fill="none"
                      stroke={COLORS[color].hex}
                      strokeWidth={(100 / n) * 0.34}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null,
                )}
              </svg>
              {level.pairs.flatMap((pair) =>
                [pair.a, pair.b].map(([r, c], j) => (
                  <span
                    key={`${pair.color}-${j}`}
                    aria-label={`${COLORS[pair.color].name} ${COLORS[pair.color].item.name}${isComplete(pair.color, paths[pair.color]) ? ", connected" : ""}`}
                    className={cn(
                      "pointer-events-none absolute flex items-center justify-center rounded-full ring-[3px] ring-white",
                      isComplete(pair.color, paths[pair.color]) && "ring-fluffy-success",
                    )}
                    style={{
                      left: `${(c / n) * 100 + 100 / n / 2}%`,
                      top: `${(r / n) * 100 + 100 / n / 2}%`,
                      width: `${(100 / n) * 0.72}%`,
                      height: `${(100 / n) * 0.72}%`,
                      transform: "translate(-50%, -50%)",
                      background: COLORS[pair.color].hex,
                    }}
                  >
                    <img
                      src={COLORS[pair.color].item.src}
                      alt=""
                      draggable={false}
                      className="h-[68%] w-[68%] object-contain"
                    />
                  </span>
                )),
              )}
              {cleared && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/40">
                  <div className="bg-fluffy-success font-poppins find-item-banner rounded-full px-5 py-2 text-lg font-extrabold text-white shadow-lg">
                    {levelIndex + 1 < PACK.length ? "Level clear!" : "All done!"}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline" onClick={resetLevel}>
                <RotateCcw size={16} /> Reset
              </button>
              <button type="button" className="btn btn-secondary" onClick={hint}>
                <Lightbulb size={16} /> Hint (+{HINT_PENALTY}s)
              </button>
            </div>
            <p className="text-fluffy-subtext text-center text-xs">
              {connected === level.pairs.length && filled < n * n
                ? "All pairs joined — now fill every square!"
                : "Drag from a dot to its matching dot"}
            </p>
          </>
        )}
      </div>
    </GameShell>
  );
}
