import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Check, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { PLAYER_STYLES } from "@/games/components/players";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { gameAssets } from "@/games/assets/gameAssets";

const BOX = gameAssets.decorative.gift;
const TEDDY = gameAssets.toys.find((toy) => toy.id === "teddy-bear");

const HEARTS = 3;
const BASE_POINTS = 10;
// Together mode: players alternate hiding/guessing for this many rounds.
const TOGETHER_ROUNDS = 6;
const TOGETHER_BOXES = 3;
const TOGETHER_SWAP_MS = 450;

// Difficulty grows with rounds won: more boxes, more swaps, faster swaps.
function roundConfig(wins) {
  return {
    boxes: wins < 3 ? 3 : wins < 7 ? 4 : 5,
    swaps: Math.min(14, 3 + wins),
    swapMs: Math.max(260, 650 - wins * 35),
  };
}

function makeBoxes(count) {
  return Array.from({ length: count }, (_, i) => ({ id: i, slot: i }));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function GuessTheBox({ onGameComplete }) {
  const [mode, setMode] = useState("solo");
  // solo:     show -> shuffle -> guess -> reveal -> show ...
  // together: hide -> swap -> guess -> reveal -> hide ...
  const [phase, setPhase] = useState("show");
  const [boxes, setBoxes] = useState(() => makeBoxes(3));
  const [teddyBox, setTeddyBox] = useState(0);
  const [lifted, setLifted] = useState([]);
  const [picked, setPicked] = useState(null);
  const [selected, setSelected] = useState(null);
  const [swapCount, setSwapCount] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState(HEARTS);
  const [wins, setWins] = useState(0);
  const [round, setRound] = useState(0);
  const [points, setPoints] = useState([0, 0]);

  const boxesRef = useRef(boxes);
  const elementsRef = useRef({});
  const sessionRef = useRef(0);
  const reduceMotionRef = useRef(false);

  const [highScore, setHighScore] = useHighScore("guess-box");
  const { status, result, start, finish } = useGameResult({
    gameId: "guess-box",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Invalidate any running round/shuffle on unmount.
    return () => {
      sessionRef.current += 1;
    };
  }, []);

  const commitBoxes = (next) => {
    boxesRef.current = next;
    setBoxes(next);
  };

  // Swaps the boxes in two slots with the Web Animations API — not a CSS
  // transition, because the global reduced-motion rule collapses transitions
  // to ~0ms and the shuffle *is* the gameplay. Reduced motion keeps the swap
  // but drops the arc.
  const animateSwap = useCallback(async (slotA, slotB, ms) => {
    const current = boxesRef.current;
    const boxA = current.find((b) => b.slot === slotA);
    const boxB = current.find((b) => b.slot === slotB);
    const elA = elementsRef.current[boxA.id];
    const elB = elementsRef.current[boxB.id];
    const arc = reduceMotionRef.current ? 0 : 22;
    const frames = (from, to, lift) => [
      { transform: `translateX(${from * 100}%) translateY(0)` },
      { transform: `translateX(${((from + to) / 2) * 100}%) translateY(${lift}%)` },
      { transform: `translateX(${to * 100}%) translateY(0)` },
    ];
    const options = { duration: ms, easing: "ease-in-out", fill: "forwards" };
    const animA = elA.animate(frames(slotA, slotB, -arc), options);
    const animB = elB.animate(frames(slotB, slotA, arc), options);
    await Promise.all([animA.finished, animB.finished]);
    // Commit the new slots to the DOM before dropping the animations, so the
    // boxes never flash back to their old positions.
    flushSync(() =>
      commitBoxes(
        current.map((b) =>
          b.id === boxA.id ? { ...b, slot: slotB } : b.id === boxB.id ? { ...b, slot: slotA } : b,
        ),
      ),
    );
    animA.cancel();
    animB.cancel();
  }, []);

  // Solo: reveal the teddy, hide it, shuffle, then wait for a guess.
  const playSoloRound = useCallback(
    async (winsSoFar) => {
      const session = ++sessionRef.current;
      const alive = () => sessionRef.current === session;
      const { boxes: count, swaps, swapMs } = roundConfig(winsSoFar);
      const fresh = makeBoxes(count);
      const hidden = Math.floor(Math.random() * count);
      commitBoxes(fresh);
      setTeddyBox(hidden);
      setPicked(null);
      setLifted([hidden]);
      setPhase("show");
      await wait(1300);
      if (!alive()) return;
      setLifted([]);
      await wait(550);
      if (!alive()) return;
      setPhase("shuffle");
      try {
        for (let i = 0; i < swaps; i++) {
          const a = Math.floor(Math.random() * count);
          let b = Math.floor(Math.random() * (count - 1));
          if (b >= a) b += 1;
          await animateSwap(a, b, swapMs);
          if (!alive()) return;
        }
      } catch {
        return; // animation cancelled by unmount
      }
      setPhase("guess");
    },
    [animateSwap],
  );

  const startTogetherRound = useCallback((roundIndex) => {
    sessionRef.current += 1;
    commitBoxes(makeBoxes(TOGETHER_BOXES));
    setRound(roundIndex);
    setPicked(null);
    setSelected(null);
    setSwapCount(0);
    setLifted([]);
    setPhase("hide");
  }, []);

  const endGame = useCallback(
    (finalScore, finalWins, finalPoints) => {
      setPhase("over");
      if (mode === "together") {
        const [a, b] = finalPoints;
        // Flat "played together" completion — never per-player points.
        finish({ score: 0, level: TOGETHER_ROUNDS, mode: "together", points: finalPoints, winner: a === b ? 0 : a > b ? 1 : 2 });
        return;
      }
      const isNewBest = finalScore > highScore;
      if (isNewBest) setHighScore(finalScore);
      finish({ score: finalScore, level: finalWins, mode: "solo", isNewBest });
    },
    [finish, highScore, mode, setHighScore],
  );

  const handleBox = async (box) => {
    if (status !== "playing" || animating) return;

    if (phase === "hide") {
      setTeddyBox(box.id);
      setLifted([box.id]);
      setPhase("hiding");
      const session = sessionRef.current;
      await wait(1000);
      if (sessionRef.current !== session) return;
      setLifted([]);
      setPhase("swap");
      return;
    }

    if (phase === "swap") {
      if (selected === null) {
        setSelected(box.id);
        return;
      }
      if (selected === box.id) {
        setSelected(null);
        return;
      }
      const other = boxesRef.current.find((b) => b.id === selected);
      setSelected(null);
      setAnimating(true);
      try {
        await animateSwap(other.slot, box.slot, TOGETHER_SWAP_MS);
      } catch {
        return;
      }
      setAnimating(false);
      setSwapCount((n) => n + 1);
      return;
    }

    if (phase !== "guess") return;
    const correct = box.id === teddyBox;
    setPicked(box.id);
    setLifted(correct ? [box.id] : [box.id, teddyBox]);
    setPhase("reveal");
    navigator.vibrate?.(correct ? 12 : [20, 40, 20]);
    const session = sessionRef.current;

    if (mode === "together") {
      const hider = round % 2;
      const next = [...points];
      next[correct ? 1 - hider : hider] += 1;
      setPoints(next);
      await wait(1600);
      if (sessionRef.current !== session) return;
      if (round + 1 >= TOGETHER_ROUNDS) endGame(0, 0, next);
      else startTogetherRound(round + 1);
      return;
    }

    let nextScore = score;
    let nextWins = wins;
    let nextHearts = hearts;
    if (correct) {
      nextScore += BASE_POINTS + (boxesRef.current.length - 3) * 5;
      nextWins += 1;
    } else {
      nextHearts -= 1;
    }
    setScore(nextScore);
    setWins(nextWins);
    setHearts(nextHearts);
    await wait(1400);
    if (sessionRef.current !== session) return;
    if (nextHearts <= 0) endGame(nextScore, nextWins);
    else playSoloRound(nextWins);
  };

  const beginGame = useCallback(
    (nextMode) => {
      setMode(nextMode);
      setScore(0);
      setWins(0);
      setHearts(HEARTS);
      setPoints([0, 0]);
      setAnimating(false);
      start();
      if (nextMode === "together") startTogetherRound(0);
      else playSoloRound(0);
    },
    [playSoloRound, start, startTogetherRound],
  );

  const together = mode === "together";
  const hider = round % 2;
  const guesser = 1 - hider;
  const tappable =
    status === "playing" && !animating && (phase === "guess" || phase === "hide" || phase === "swap");

  const prompt = together
    ? {
        hide: `Player ${hider + 1}: tap a box to hide the teddy`,
        hiding: `Player ${guesser + 1}, keep watching!`,
        swap: `Player ${hider + 1}: tap two boxes to swap them`,
        guess: `Player ${guesser + 1}: where's the teddy?`,
        reveal: picked === teddyBox ? `Found it! Point for Player ${guesser + 1}` : `Tricked! Point for Player ${hider + 1}`,
        over: "",
      }[phase]
    : {
        show: "Remember where the teddy is…",
        shuffle: "Keep your eye on it!",
        guess: "Where's the teddy?",
        reveal: picked === teddyBox ? "You found it!" : "Not this one!",
        over: "",
      }[phase];

  return (
    <GameShell
      title="Guess the Box"
      score={together ? `${points[0]} · ${points[1]}` : score}
      scoreLabel={together ? "P1 · P2" : "Score"}
      best={together ? undefined : highScore}
      result={
        status === "result" && result ? (
          together ? (
            <GameResult
              title={result.winner ? `Player ${result.winner} wins!` : "It's a tie!"}
              emoji="🧸"
              scoreLabel="Points"
              score={`${result.points[0]} – ${result.points[1]}`}
              stats={[{ label: "Rounds", value: result.level }]}
              shareText={`We played Guess the Box together on Fluffy Play — ${result.winner ? `Player ${result.winner} won` : "it's a tie"} (${result.points[0]}–${result.points[1]})! 🧸`}
              onRestart={() => beginGame("together")}
            />
          ) : (
            <GameResult
              score={result.score}
              best={highScore}
              isNewBest={result.isNewBest}
              title="Sharp eyes!"
              emoji="🧸"
              celebrate={result.isNewBest}
              stats={[{ label: "Found", value: result.level }]}
              onRestart={() => beginGame("solo")}
            />
          )
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-5 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="flex items-end gap-2" aria-hidden="true">
              <img src={BOX.src} alt="" className="h-14 w-14" draggable={false} />
              <img src={TEDDY.src} alt="" className="h-10 w-10" draggable={false} />
              <img src={BOX.src} alt="" className="h-14 w-14" draggable={false} />
            </div>
            <div>
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Where did the teddy go?</h2>
              <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
                The teddy hides under a gift box and the boxes shuffle. Follow it with your eyes, then tap the right box.
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => beginGame("solo")}>
              Play solo
            </button>
            <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 ring-1">
              <h3 className="font-poppins text-fluffy-text text-sm font-bold">Play together</h3>
              <p className="text-fluffy-subtext mt-1 text-xs">
                One player hides the teddy and swaps the boxes, the other watches and guesses. Swap roles every round —{" "}
                {TOGETHER_ROUNDS} rounds in all.
              </p>
              <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => beginGame("together")}>
                Start together
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex w-full max-w-[460px] items-center justify-between gap-2">
              {together ? (
                <div className="flex gap-2">
                  {[0, 1].map((index) => (
                    <span key={index} className={cn("rounded-full px-3 py-1 text-xs font-bold", PLAYER_STYLES[index])}>
                      P{index + 1}: {index === hider ? "hides" : "guesses"}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-0.5" aria-label={`${hearts} tries left`}>
                  {Array.from({ length: hearts }, (_, i) => (
                    <Heart key={i} size={20} className="fill-fluffy-danger text-fluffy-danger" />
                  ))}
                </div>
              )}
              <span className="text-fluffy-subtext text-xs font-bold">
                {together ? `Round ${round + 1}/${TOGETHER_ROUNDS}` : `Found ${wins}`}
              </span>
            </div>

            <div
              className={cn(
                "font-poppins min-h-14 max-w-sm text-center text-lg font-extrabold",
                phase === "reveal" && (picked === teddyBox ? "text-fluffy-success" : "text-fluffy-danger"),
                phase !== "reveal" && "text-fluffy-text",
              )}
              aria-live="polite"
            >
              {prompt}
            </div>

            <div className="relative h-44 w-full max-w-[460px] sm:h-52">
              {boxes.map((box) => {
                const isLifted = lifted.includes(box.id);
                const isPicked = picked === box.id;
                return (
                  <button
                    key={box.id}
                    ref={(el) => {
                      if (el) elementsRef.current[box.id] = el;
                      else delete elementsRef.current[box.id];
                    }}
                    type="button"
                    onPointerDown={() => handleBox(box)}
                    disabled={!tappable}
                    aria-label={`Box ${box.slot + 1}`}
                    className="absolute top-0 left-0 flex h-full touch-manipulation flex-col items-center justify-end pb-2"
                    style={{ width: `${100 / boxes.length}%`, transform: `translateX(${box.slot * 100}%)` }}
                  >
                    <div className="relative flex aspect-square w-[82%] max-w-28 items-end justify-center">
                      {box.id === teddyBox && (
                        <img
                          src={TEDDY.src}
                          alt=""
                          draggable={false}
                          className="pointer-events-none absolute bottom-[6%] h-[62%] w-[62%] object-contain"
                        />
                      )}
                      <img
                        src={BOX.src}
                        alt=""
                        draggable={false}
                        className={cn(
                          "pointer-events-none relative h-full w-full object-contain drop-shadow-[0_4px_4px_rgba(75,85,99,0.25)] transition-transform duration-300 ease-out",
                          isLifted && "-translate-y-[62%]",
                          selected === box.id && "scale-110",
                        )}
                      />
                      {selected === box.id && (
                        <span className="ring-fluffy-primary pointer-events-none absolute -inset-1 rounded-2xl ring-4" />
                      )}
                      {phase === "reveal" && isPicked && (
                        <span
                          className={cn(
                            "absolute -top-2 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-white",
                            box.id === teddyBox ? "bg-fluffy-success" : "bg-fluffy-danger",
                          )}
                        >
                          {box.id === teddyBox ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
                        </span>
                      )}
                    </div>
                    <div className="bg-fluffy-text/10 mt-1 h-2 w-[60%] rounded-[50%]" />
                  </button>
                );
              })}
            </div>

            {together && phase === "swap" && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={swapCount === 0 || animating}
                onClick={() => {
                  setSelected(null);
                  setPhase("guess");
                }}
              >
                Done swapping ({swapCount})
              </button>
            )}
          </>
        )}
      </div>
    </GameShell>
  );
}
