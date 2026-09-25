import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import DailyModeButton from "@/games/components/DailyModeButton";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { FABRICS, canPlace, findClears, fitsAnywhere, pickPieces } from "./blocksLogic";

const SIZE = 8;
// Floating piece sits this far above the pointer so a finger never hides it.
const LIFT = 28;

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
}

function lineBonus(lines) {
  return (10 * lines * (lines + 1)) / 2; // 10, 30, 60, 100, …
}

export default function FluffyBlocks({ onGameComplete }) {
  const [daily, setDaily] = useState(false);
  const [grid, setGrid] = useState(emptyGrid);
  const [tray, setTray] = useState([]);
  const [score, setScore] = useState(0);
  const [drag, setDrag] = useState(null);
  const [flash, setFlash] = useState(null);

  const rngRef = useRef(Math.random);
  const gridRef = useRef(grid);
  const trayRef = useRef(tray);
  const scoreRef = useRef(0);
  const statsRef = useRef({ lines: 0, pieces: 0, streak: 0 });
  const boardRef = useRef(null);
  const dragRef = useRef(null);

  const [highScore, setHighScore] = useHighScore("blocks");
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("blocks"));
  const { status, result, start, finish } = useGameResult({
    gameId: "blocks",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 360);
    return () => clearTimeout(id);
  }, [flash]);

  const endGame = useCallback(() => {
    const finalScore = scoreRef.current;
    const best = daily ? dailyBest : highScore;
    const isNewBest = finalScore > best;
    if (daily) setDailyBest(finalScore);
    setHighScore(finalScore);
    finish({
      score: finalScore,
      level: statsRef.current.lines,
      mode: daily ? "daily" : "classic",
      date: daily ? todayKey() : undefined,
      lines: statsRef.current.lines,
      pieces: statsRef.current.pieces,
      isNewBest,
    });
  }, [daily, dailyBest, finish, highScore, setDailyBest, setHighScore]);

  const beginGame = useCallback(
    (isDaily) => {
      setDaily(isDaily);
      rngRef.current = isDaily ? dailyRandom("blocks") : Math.random;
      const fresh = emptyGrid();
      const pieces = pickPieces(rngRef.current);
      gridRef.current = fresh;
      trayRef.current = pieces;
      setGrid(fresh);
      setTray(pieces);
      scoreRef.current = 0;
      setScore(0);
      statsRef.current = { lines: 0, pieces: 0, streak: 0 };
      setFlash(null);
      start();
    },
    [start],
  );

  // Converts the floating piece's top-left corner to a board cell.
  const placementFor = useCallback((point, piece) => {
    const board = boardRef.current?.getBoundingClientRect();
    if (!board) return null;
    const cell = board.width / SIZE;
    const left = point.x - (piece.w * cell) / 2;
    const top = point.y - LIFT - piece.h * cell;
    const col = Math.round((left - board.left) / cell);
    const row = Math.round((top - board.top) / cell);
    return canPlace(gridRef.current, piece, row, col) ? { row, col } : null;
  }, []);

  const updateDrag = (next) => {
    dragRef.current = next;
    setDrag(next);
  };

  const placeRef = useRef(null);
  placeRef.current = (index, { row, col }) => {
    const piece = trayRef.current[index];
    const next = gridRef.current.map((r) => [...r]);
    piece.cells.forEach(([dr, dc]) => (next[row + dr][col + dc] = piece.fabric));
    const { rows, cols } = findClears(next);
    const cleared = [];
    rows.forEach((r) => next[r].forEach((fabric, c) => cleared.push({ r, c, fabric })));
    cols.forEach((c) => next.forEach((line, r) => !rows.includes(r) && cleared.push({ r, c, fabric: line[c] })));
    rows.forEach((r) => next[r].fill(null));
    cols.forEach((c) => next.forEach((line) => (line[c] = null)));

    const stats = statsRef.current;
    const lines = rows.length + cols.length;
    stats.pieces += 1;
    stats.lines += lines;
    stats.streak = lines ? stats.streak + 1 : 0;
    // Clearing on back-to-back placements earns a small streak bonus.
    scoreRef.current += piece.cells.length + lineBonus(lines) + (lines && stats.streak > 1 ? 5 * (stats.streak - 1) : 0);
    setScore(scoreRef.current);
    if (lines) {
      setFlash({ key: Date.now(), cells: cleared, lines });
      navigator.vibrate?.(lines > 1 ? [15, 30, 15] : 15);
    }

    let remaining = trayRef.current.map((p, i) => (i === index ? null : p));
    if (remaining.every((p) => !p)) remaining = pickPieces(rngRef.current);
    gridRef.current = next;
    trayRef.current = remaining;
    setGrid(next);
    setTray(remaining);

    const stuck = remaining.every((p) => !p || !fitsAnywhere(next, p));
    if (stuck) setTimeout(endGame, 450);
  };

  const pointer = usePointerInput({
    onStart: useCallback(
      (point, event) => {
        if (status !== "playing") return;
        const slot = event.target.closest("[data-slot]");
        const index = slot ? Number(slot.dataset.slot) : -1;
        const piece = trayRef.current[index];
        if (!piece) return;
        updateDrag({ index, point, target: placementFor(point, piece) });
      },
      [placementFor, status],
    ),
    onMove: useCallback(
      (point) => {
        const current = dragRef.current;
        if (!current) return;
        updateDrag({ ...current, point, target: placementFor(point, trayRef.current[current.index]) });
      },
      [placementFor],
    ),
    onEnd: useCallback(() => {
      const current = dragRef.current;
      updateDrag(null);
      if (current?.target) placeRef.current(current.index, current.target);
    }, []),
  });

  const cellPx = boardRef.current ? boardRef.current.getBoundingClientRect().width / SIZE : 40;
  const dragPiece = drag ? tray[drag.index] : null;
  const preview = new Map();
  let previewClears = { rows: [], cols: [] };
  if (dragPiece && drag.target) {
    const ghost = grid.map((r) => [...r]);
    dragPiece.cells.forEach(([dr, dc]) => {
      preview.set(`${drag.target.row + dr}-${drag.target.col + dc}`, dragPiece.fabric);
      ghost[drag.target.row + dr][drag.target.col + dc] = dragPiece.fabric;
    });
    previewClears = findClears(ghost);
  }

  const best = daily ? dailyBest : highScore;

  return (
    <GameShell
      title="Fluffy Blocks"
      score={score}
      best={best}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={best}
            isNewBest={result.isNewBest}
            title={result.mode === "daily" ? "Daily run done!" : "No more room!"}
            emoji="🧵"
            celebrate={result.isNewBest}
            stats={[
              { label: "Lines", value: result.lines },
              { label: "Pieces", value: result.pieces },
            ]}
            shareText={
              result.mode === "daily"
                ? `Fluffy Blocks · Daily ${result.date}: ${result.score} points, ${result.lines} lines 🧵 Same pieces for everyone today — can you beat me?`
                : undefined
            }
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="grid grid-cols-4 gap-1" aria-hidden="true">
              {["red", "yellow", "green", "blue", "purple", "pink", "orange", "blue"].map((f, i) => (
                <span key={i} className="h-7 w-7 rounded-md" style={FABRICS[f].style} />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Fit the fabric blocks!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Drag the pieces onto the board. Fill a whole row or column to clear it. The game ends when no piece fits.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
              Play classic
            </button>
            <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />
          </div>
        ) : (
          <>
            {daily && (
              <div className="text-fluffy-subtext text-[11px] font-semibold tracking-wide uppercase">Daily run · {todayKey()}</div>
            )}
            <div
              ref={boardRef}
              className="bg-fluffy-bg ring-fluffy-border relative grid aspect-square w-full max-w-[400px] gap-[3px] rounded-2xl p-[3px] shadow-sm ring-1"
              style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
            >
              {grid.map((row, r) =>
                row.map((fabric, c) => {
                  const ghost = preview.get(`${r}-${c}`);
                  const willClear = previewClears.rows.includes(r) || previewClears.cols.includes(c);
                  const shown = fabric ?? ghost;
                  return (
                    <div
                      key={`${r}-${c}`}
                      className={cn(
                        "rounded-[5px] transition-opacity",
                        !shown && "bg-fluffy-cream",
                        ghost && !fabric && "opacity-50",
                        willClear && (fabric || ghost) && "ring-fluffy-gold ring-2",
                      )}
                      style={shown ? FABRICS[shown].style : undefined}
                    />
                  );
                }),
              )}
              {flash && (
                <div key={flash.key} className="pointer-events-none absolute inset-[3px]" aria-hidden="true">
                  {flash.cells.map(({ r, c, fabric }) => (
                    <span
                      key={`${r}-${c}`}
                      className="blocks-clear absolute rounded-[5px]"
                      style={{
                        ...FABRICS[fabric].style,
                        left: `${(c / SIZE) * 100}%`,
                        top: `${(r / SIZE) * 100}%`,
                        width: `calc(${100 / SIZE}% - 3px)`,
                        height: `calc(${100 / SIZE}% - 3px)`,
                      }}
                    />
                  ))}
                  <span className="font-poppins find-item-banner text-fluffy-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 px-4 py-1 text-lg font-extrabold shadow">
                    +{lineBonus(flash.lines)}
                  </span>
                </div>
              )}
            </div>

            <div className="grid w-full max-w-[400px] grid-cols-3 gap-3" {...pointer}>
              {tray.map((piece, index) => (
                <div
                  key={index}
                  data-slot={index}
                  aria-label={piece ? `Piece ${index + 1}` : `Empty slot ${index + 1}`}
                  className={cn(
                    "bg-fluffy-bg/70 ring-fluffy-border flex aspect-square touch-none items-center justify-center rounded-2xl ring-1",
                    piece && "cursor-grab",
                  )}
                >
                  {piece && drag?.index !== index && <PieceView piece={piece} cell={Math.min(18, 90 / Math.max(piece.w, piece.h))} />}
                </div>
              ))}
            </div>
            <p className="text-fluffy-subtext text-xs">Drag a piece onto the board</p>
          </>
        )}
      </div>

      {dragPiece && (
        <div
          className="pointer-events-none fixed z-40 drop-shadow-lg"
          style={{
            left: drag.point.x - (dragPiece.w * cellPx) / 2,
            top: drag.point.y - LIFT - dragPiece.h * cellPx,
            opacity: drag.target ? 0.35 : 0.95,
          }}
        >
          <PieceView piece={dragPiece} cell={cellPx} />
        </div>
      )}
    </GameShell>
  );
}

function PieceView({ piece, cell }) {
  const gap = Math.max(2, cell * 0.08);
  return (
    <div className="relative" style={{ width: piece.w * cell, height: piece.h * cell }}>
      {piece.cells.map(([r, c]) => (
        <span
          key={`${r}-${c}`}
          className="absolute rounded-[5px]"
          style={{
            ...FABRICS[piece.fabric].style,
            left: c * cell + gap / 2,
            top: r * cell + gap / 2,
            width: cell - gap,
            height: cell - gap,
          }}
        />
      ))}
    </div>
  );
}

