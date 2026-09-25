import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import AssetIcon from "@/games/components/AssetIcon";
import { getProductSet } from "@/games/assets/gameAssets";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";

const SIZE = 5;
const TILE_TYPES = 6;
const ROUND_SECONDS = 60;

function randomType(types) {
  return types[Math.floor(Math.random() * types.length)];
}

function hasAnyMatch(grid, types) {
  return types.some((type) => grid.filter((cell) => cell?.id === type.id).length >= 2);
}

function buildGrid(types) {
  let grid;
  do {
    grid = Array.from({ length: SIZE * SIZE }, () => randomType(types));
  } while (!hasAnyMatch(grid, types));
  return grid;
}

export default function TileMatch({ onGameComplete }) {
  const types = useRef(getProductSet(TILE_TYPES)).current;
  const [grid, setGrid] = useState(() => buildGrid(types));
  const [selected, setSelected] = useState(null);
  const [shaking, setShaking] = useState([]);
  const [clearing, setClearing] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const busyRef = useRef(false);
  const scoreRef = useRef(0);
  const matchesRef = useRef(0);

  const [highScore, setHighScore] = useHighScore("tile-match");
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "tile-match",
    onComplete: onGameComplete,
  });

  const handleTimeUp = useCallback(() => {
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level, won: true, isNewBest });
  }, [finish, highScore, level, setHighScore]);

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: handleTimeUp });

  const beginGame = useCallback(() => {
    setGrid(buildGrid(types));
    setSelected(null);
    setShaking([]);
    setClearing([]);
    setScore(0);
    setCombo(0);
    setLevel(1);
    scoreRef.current = 0;
    matchesRef.current = 0;
    busyRef.current = false;
    timer.reset(ROUND_SECONDS);
    timer.start();
    start();
  }, [start, timer, types]);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  const handleTileClick = (index) => {
    if (status !== "playing" || busyRef.current) return;
    if (clearing.includes(index)) return;

    if (selected === null) {
      setSelected(index);
      return;
    }
    if (selected === index) {
      setSelected(null);
      return;
    }

    const a = grid[selected];
    const b = grid[index];

    if (a.id === b.id) {
      busyRef.current = true;
      const clearedPair = [selected, index];
      setClearing(clearedPair);
      const newCombo = combo + 1;
      const gained = 20 + newCombo * 5;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      setCombo(newCombo);
      setSelected(null);

      setTimeout(() => {
        setGrid((prevGrid) => {
          const nextGrid = [...prevGrid];
          nextGrid[clearedPair[0]] = randomType(types);
          nextGrid[clearedPair[1]] = randomType(types);
          return hasAnyMatch(nextGrid, types) ? nextGrid : buildGrid(types);
        });
        setClearing([]);
        busyRef.current = false;
        matchesRef.current += 1;
        setLevel(Math.floor(matchesRef.current / 10) + 1);
      }, 260);
    } else {
      const pair = [selected, index];
      setShaking(pair);
      setCombo(0);
      setSelected(null);
      setTimeout(() => setShaking([]), 320);
    }
  };

  return (
    <GameShell
      title="Tile Match"
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
            title="Time's up!"
            emoji="✨"
            celebrate={result.isNewBest}
            stats={[{ label: "Level", value: result.level }]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <h2 className="font-poppins text-fluffy-text text-xl font-bold">Match the Fluffy tiles</h2>
          <p className="text-fluffy-subtext max-w-xs text-sm">
            Tap two matching tiles before the clock runs out. Chain matches for combo bonuses.
          </p>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col overflow-y-auto p-4 sm:p-6">
          <div className="text-fluffy-subtext mb-3 flex items-center justify-between text-xs font-bold">
            <span>Level {level}</span>
            <span>Combo x{combo}</span>
          </div>
          <div className="grid flex-1 content-start gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}>
            {grid.map((tile, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleTileClick(index)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-lg border-2 transition-all duration-200",
                  selected === index ? "border-fluffy-primary scale-95" : "border-transparent",
                  clearing.includes(index) && "scale-0 opacity-0",
                  shaking.includes(index) && "animate-[shake_0.3s_ease-in-out]",
                )}
              >
                <AssetIcon asset={tile} size={20} className="h-full w-full" />
              </button>
            ))}
          </div>
        </div>
      )}
    </GameShell>
  );
}
