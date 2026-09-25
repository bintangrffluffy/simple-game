import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { PLAYER_STYLES } from "@/games/components/players";
import AssetIcon from "@/games/components/AssetIcon";
import { gameAssets, getProductSet } from "@/games/assets/gameAssets";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";

const DIFFICULTIES = {
  easy: { pairs: 6, cols: 4, label: "Easy" },
  medium: { pairs: 8, cols: 4, label: "Medium" },
  hard: { pairs: 10, cols: 5, label: "Hard" },
};
// Play together: two players on one device take turns; a match earns
// another turn.
const TOGETHER_LEVEL = "medium";

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck(level) {
  const products = getProductSet(DIFFICULTIES[level].pairs);
  const deck = products.flatMap((product) => [
    { key: `${product.id}-a`, pairId: product.id, product },
    { key: `${product.id}-b`, pairId: product.id, product },
  ]);
  return shuffle(deck);
}

export default function MemoryMatch({ onGameComplete }) {
  const [difficulty, setDifficulty] = useState("easy");
  const [deck, setDeck] = useState(() => buildDeck("easy"));
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState(new Set());
  const [moves, setMoves] = useState(0);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [mode, setMode] = useState("solo");
  const [player, setPlayer] = useState(0);
  const [pairs, setPairs] = useState([0, 0]);
  const busyRef = useRef(false);

  const [highScore, setHighScore] = useHighScore("memory");
  const timer = useGameTimer({ mode: "up" });
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "memory",
    onComplete: onGameComplete,
  });

  const cols = DIFFICULTIES[difficulty].cols;
  const together = mode === "together";

  const beginGame = useCallback(
    (level, nextMode = "solo") => {
      setMode(nextMode);
      setPlayer(0);
      setPairs([0, 0]);
      setDifficulty(level);
      setDeck(buildDeck(level));
      setFlipped([]);
      setMatched(new Set());
      setMoves(0);
      setCombo(0);
      setScore(0);
      busyRef.current = false;
      timer.reset(0);
      timer.start();
      start();
    },
    [start, timer],
  );

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  const handleFlip = (index) => {
    if (status !== "playing" || busyRef.current) return;
    if (flipped.includes(index) || matched.has(deck[index].pairId)) return;
    if (flipped.length === 2) return;

    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;

    busyRef.current = true;
    setMoves((m) => m + 1);
    const [a, b] = next;
    const isMatch = deck[a].pairId === deck[b].pairId;

    setTimeout(
      () => {
        if (isMatch && together) {
          const nextMatched = new Set(matched);
          nextMatched.add(deck[a].pairId);
          const nextPairs = pairs.map((n, i) => (i === player ? n + 1 : n));
          setMatched(nextMatched);
          setPairs(nextPairs);
          if (nextMatched.size === DIFFICULTIES[difficulty].pairs) {
            timer.pause();
            const [p1, p2] = nextPairs;
            // Flat "played together" completion — never per-player points.
            finish({
              score: 0,
              level: difficulty,
              mode: "together",
              pairs: nextPairs,
              winner: p1 === p2 ? 0 : p1 > p2 ? 1 : 2,
              moves: moves + 1,
              duration: Math.round(timer.time),
            });
          }
        } else if (together) {
          setPlayer(1 - player);
        } else if (isMatch) {
          const nextMatched = new Set(matched);
          nextMatched.add(deck[a].pairId);
          const gained = 100 + combo * 20;
          const newScore = score + gained;
          const newCombo = combo + 1;

          setMatched(nextMatched);
          setScore(newScore);
          setCombo(newCombo);

          if (nextMatched.size === DIFFICULTIES[difficulty].pairs) {
            timer.pause();
            const elapsed = Math.round(timer.time);
            const timeBonus = Math.max(0, 400 - elapsed * 4);
            const finalScore = newScore + timeBonus;
            const isNewBest = finalScore > highScore;
            if (isNewBest) setHighScore(finalScore);
            setScore(finalScore);
            finish({
              score: finalScore,
              level: difficulty,
              moves: moves + 1,
              duration: elapsed,
              won: true,
              isNewBest,
            });
          }
        } else {
          setCombo(0);
        }
        setFlipped([]);
        busyRef.current = false;
      },
      isMatch ? 500 : 900,
    );
  };

  return (
    <GameShell
      title="Memory Match"
      score={together ? `${pairs[0]} · ${pairs[1]}` : score}
      scoreLabel={together ? "P1 · P2" : "Score"}
      best={together ? undefined : highScore}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          together ? (
            <GameResult
              title={result.winner ? `Player ${result.winner} wins!` : "It's a tie!"}
              emoji="🃏"
              scoreLabel="Pairs"
              score={`${result.pairs[0]} – ${result.pairs[1]}`}
              stats={[
                { label: "Moves", value: result.moves },
                { label: "Time", value: `${result.duration}s` },
              ]}
              shareText={`We played Memory Match together on Fluffy Play — ${result.winner ? `Player ${result.winner} won` : "it's a tie"} (${result.pairs[0]}–${result.pairs[1]} pairs)! 🃏`}
              onRestart={() => beginGame(TOGETHER_LEVEL, "together")}
            />
          ) : (
            <GameResult
              score={result.score}
              best={highScore}
              isNewBest={result.isNewBest}
              stats={[
                { label: "Moves", value: result.moves },
                { label: "Time", value: `${result.duration}s` },
              ]}
              onRestart={() => beginGame(difficulty)}
            />
          )
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-6 text-center">
          <AssetIcon asset={gameAssets.decorative.logo} size={40} className="h-20 w-20" />
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Find every pair</h2>
            <p className="text-fluffy-subtext mt-1 text-sm">Flip two cards at a time and match the Fluffy products.</p>
          </div>
          <div className="flex gap-2">
            {Object.entries(DIFFICULTIES).map(([key, cfg]) => (
              <button key={key} type="button" className="btn btn-outline" onClick={() => beginGame(key)}>
                {cfg.label}
              </button>
            ))}
          </div>
          <div className="bg-fluffy-cream w-full max-w-sm rounded-3xl p-4">
            <h3 className="font-poppins text-fluffy-text text-sm font-bold">Play together</h3>
            <p className="text-fluffy-subtext mt-1 text-xs">
              Two players, one device. Take turns flipping — find a pair and you go again. Most pairs wins!
            </p>
            <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => beginGame(TOGETHER_LEVEL, "together")}>
              Start together
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col overflow-y-auto p-4 sm:p-6">
          {together ? (
            <div className="mb-3 flex items-center justify-center gap-2" aria-live="polite">
              {[0, 1].map((index) => (
                <span
                  key={index}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition-opacity",
                    PLAYER_STYLES[index],
                    player !== index && "opacity-40",
                  )}
                >
                  Player {index + 1}: {pairs[index]}
                  {player === index && " · your turn"}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-fluffy-subtext mb-3 flex items-center justify-between text-xs font-bold">
              <span>Moves: {moves}</span>
              <span>Combo: x{combo}</span>
            </div>
          )}
          <div className="grid flex-1 content-start gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {deck.map((card, index) => {
              const isFlipped = flipped.includes(index) || matched.has(card.pairId);
              return (
                <button
                  key={card.key}
                  type="button"
                  className="memory-card"
                  data-flipped={isFlipped}
                  onClick={() => handleFlip(index)}
                  aria-label={isFlipped ? card.product.name : "Hidden card"}
                >
                  <div className="memory-card-inner">
                    <div className="memory-card-face memory-card-back">
                      <AssetIcon asset={gameAssets.decorative.logo} size={20} className="h-9 w-9" />
                    </div>
                    <div className="memory-card-face memory-card-front">
                      <AssetIcon asset={card.product} size={26} className="h-full w-full" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </GameShell>
  );
}
