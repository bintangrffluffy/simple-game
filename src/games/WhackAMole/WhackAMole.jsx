import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";

const HOLE_COUNT = 9;
const ROUND_SECONDS = 30;
const BASE_SPAWN_MS = 750;
const MIN_SPAWN_MS = 350;
const BASE_UP_MS = 1100;
const MIN_UP_MS = 550;
// Hit feedback: the mole stays up dazed for HIT_DAZE_MS, then sinks; the hole
// is only free for a new spawn once HIT_TOTAL_MS has passed.
const HIT_DAZE_MS = 430;
const HIT_TOTAL_MS = 750;
// Polar bear gimmick: sometimes a polar bear pops up instead of a mole.
// Whacking it ends the game instantly. Its share grows a little over time.
const BASE_BEAR_CHANCE = 0.18;
const MAX_BEAR_CHANCE = 0.3;
// How long the "bonked" bear stays on screen before the result appears.
const BONK_REVEAL_MS = 900;

export default function WhackAMole({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const elapsedRef = useRef(0);
  const spawnTimeoutRef = useRef(null);
  const hideTimeoutsRef = useRef(new Map());
  const hitTimeoutsRef = useRef(new Set());
  const hitHolesRef = useRef(new Set());
  const hitKeyRef = useRef(0);

  // hole -> { type: "mole" | "bear", up }. Entries are kept (up: false) after
  // hiding so the sink animation still renders the right animal.
  const [activeHoles, setActiveHoles] = useState(() => new Map());
  const [bonkedHole, setBonkedHole] = useState(null);
  // hole -> { key, points, sinking }
  const [hits, setHits] = useState({});
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);

  const [highScore, setHighScore] = useHighScore("whack-a-mole");

  const clearAllTimers = useCallback(() => {
    if (spawnTimeoutRef.current) clearTimeout(spawnTimeoutRef.current);
    hideTimeoutsRef.current.forEach((t) => clearTimeout(t));
    hideTimeoutsRef.current.clear();
    hitTimeoutsRef.current.forEach((t) => clearTimeout(t));
    hitTimeoutsRef.current.clear();
    hitHolesRef.current.clear();
  }, []);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "whack-a-mole",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(
    ({ bonked = false } = {}) => {
      clearAllTimers();
      const finalScore = scoreRef.current;
      const isNewBest = finalScore > highScore;
      if (isNewBest) setHighScore(finalScore);
      finish({ score: finalScore, level: 1, won: !bonked, bonked, isNewBest });
    },
    [clearAllTimers, finish, highScore, setHighScore],
  );
  const endGameRef = useRef(endGame);
  endGameRef.current = endGame;

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: () => endGameRef.current() });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === "playing") elapsedRef.current = ROUND_SECONDS - timer.time;
  }, [timer.time, status]);

  useEffect(() => clearAllTimers, [clearAllTimers]);

  const hideMole = useCallback((hole) => {
    setActiveHoles((prev) => {
      const entry = prev.get(hole);
      if (!entry?.up) return prev;
      const next = new Map(prev);
      next.set(hole, { ...entry, up: false });
      return next;
    });
    const t = hideTimeoutsRef.current.get(hole);
    if (t) {
      clearTimeout(t);
      hideTimeoutsRef.current.delete(hole);
    }
  }, []);

  const spawnMole = useCallback(() => {
    if (statusRef.current !== "playing") return;

    setActiveHoles((prev) => {
      const empty = Array.from({ length: HOLE_COUNT }, (_, i) => i).filter((i) => !prev.get(i)?.up && !hitHolesRef.current.has(i));
      if (empty.length === 0) return prev;
      const hole = empty[Math.floor(Math.random() * empty.length)];
      const upTime = Math.max(MIN_UP_MS, BASE_UP_MS - elapsedRef.current * 12);
      const bearChance = Math.min(MAX_BEAR_CHANCE, BASE_BEAR_CHANCE + elapsedRef.current * 0.004);
      const type = Math.random() < bearChance ? "bear" : "mole";
      const hideTimeout = setTimeout(() => {
        hideMole(hole);
        // Letting a bear go is the right call — only missed moles break the combo.
        if (type === "mole") {
          comboRef.current = 0;
          setCombo(0);
        }
      }, upTime);
      hideTimeoutsRef.current.set(hole, hideTimeout);
      const next = new Map(prev);
      next.set(hole, { type, up: true });
      return next;
    });

    const spawnDelay = Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - elapsedRef.current * 8);
    spawnTimeoutRef.current = setTimeout(spawnMole, spawnDelay);
  }, [hideMole]);

  const handleWhack = (hole) => {
    if (statusRef.current !== "playing") return;
    const entry = activeHoles.get(hole);
    if (!entry?.up) return;

    if (entry.type === "bear") {
      // Game over: freeze the board, show the bonked bear, then the result.
      statusRef.current = "bonked";
      clearAllTimers();
      timer.pause();
      setBonkedHole(hole);
      navigator.vibrate?.([40, 60, 40]);
      const t = setTimeout(() => endGameRef.current({ bonked: true }), BONK_REVEAL_MS);
      hitTimeoutsRef.current.add(t);
      return;
    }

    hideMole(hole);

    const nextCombo = comboRef.current + 1;
    comboRef.current = nextCombo;
    setCombo(nextCombo);

    const points = 10 + Math.floor(nextCombo / 5) * 10;
    scoreRef.current += points;
    setScore(scoreRef.current);

    const key = ++hitKeyRef.current;
    hitHolesRef.current.add(hole);
    setHits((prev) => ({ ...prev, [hole]: { key, points, sinking: false } }));
    navigator.vibrate?.(15);

    const schedule = (fn, ms) => {
      const t = setTimeout(() => {
        hitTimeoutsRef.current.delete(t);
        fn();
      }, ms);
      hitTimeoutsRef.current.add(t);
    };
    schedule(() => {
      setHits((prev) => (prev[hole]?.key === key ? { ...prev, [hole]: { ...prev[hole], sinking: true } } : prev));
    }, HIT_DAZE_MS);
    schedule(() => {
      hitHolesRef.current.delete(hole);
      setHits((prev) => {
        if (prev[hole]?.key !== key) return prev;
        const next = { ...prev };
        delete next[hole];
        return next;
      });
    }, HIT_TOTAL_MS);
  };

  const beginGame = useCallback(() => {
    clearAllTimers();
    setActiveHoles(new Map());
    setBonkedHole(null);
    setHits({});
    setScore(0);
    setCombo(0);
    scoreRef.current = 0;
    comboRef.current = 0;
    elapsedRef.current = 0;
    timer.reset(ROUND_SECONDS);
    timer.start();
    start();
    spawnTimeoutRef.current = setTimeout(spawnMole, 400);
  }, [clearAllTimers, spawnMole, start, timer]);

  const handlePauseToggle = () => {
    if (bonkedHole !== null) return;
    if (status === "paused") {
      resume();
      timer.start();
      spawnTimeoutRef.current = setTimeout(spawnMole, 300);
    } else if (status === "playing") {
      pause();
      timer.pause();
      if (spawnTimeoutRef.current) clearTimeout(spawnTimeoutRef.current);
    }
  };

  return (
    <GameShell
      title="Whack-a-Mole"
      score={score}
      best={highScore}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={(status === "playing" || status === "paused") && bonkedHole === null}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={highScore}
            isNewBest={result.isNewBest}
            title={result.bonked ? "Oops, not the polar bear!" : "Great reflexes!"}
            emoji={result.bonked ? "🐻‍❄️" : "🐹"}
            celebrate={result.isNewBest && !result.bonked}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
        {combo > 2 && status === "playing" && (
          <div className="bg-fluffy-gold rounded-full px-3 py-1 text-xs font-bold text-white">Combo x{combo}</div>
        )}

        <div className="relative grid w-full max-w-[420px] grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: HOLE_COUNT }).map((_, hole) => {
            const hit = hits[hole];
            const entry = activeHoles.get(hole);
            const type = entry?.type;
            const bonked = bonkedHole === hole;
            const isUp = entry?.up || (hit && !hit.sinking);
            return (
              <div key={hole} className="relative aspect-square">
                <button
                  type="button"
                  onPointerDown={() => handleWhack(hole)}
                  className={cn(
                    "absolute inset-0 touch-manipulation overflow-hidden rounded-full bg-[#c9a06b]",
                    hit && !hit.sinking && "whack-hole-bump",
                    bonked && "ring-fluffy-danger whack-shake ring-4",
                  )}
                  aria-label={
                    !entry?.up ? "Empty hole" : type === "bear" ? "Polar bear — don't whack it!" : "Whack the mole"
                  }
                >
                  <div className="absolute inset-x-0 bottom-0 h-2/3 rounded-t-full bg-[#8a6a45]" />
                  <div
                    className={cn(
                      "absolute inset-0 flex items-end justify-center transition-transform",
                      hit?.sinking ? "duration-300 ease-in" : "duration-150 ease-out",
                      isUp ? "translate-y-0" : "translate-y-full",
                    )}
                  >
                    {type === "bear" ? (
                      <PolarBear bonked={bonked} />
                    ) : (
                      <Mole key={hit?.key ?? "mole"} dazed={Boolean(hit)} />
                    )}
                  </div>
                </button>

                {hit && <HitEffects key={hit.key} points={hit.points} />}
              </div>
            );
          })}
        </div>

        {status === "idle" && (
          <div className="bg-fluffy-cream/95 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Quick, whack the mole!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">Tap the moles as soon as they pop up. Chain hits for a combo bonus.</p>
            <div className="bg-fluffy-bg ring-fluffy-border flex items-center gap-3 rounded-2xl px-4 py-2 text-left ring-1">
              {/* Rendered at in-game size, then scaled down so the ears keep their proportions. */}
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-[#c9a06b]">
                <div className="absolute top-0 left-0 flex h-24 w-24 origin-top-left scale-50 items-end justify-center">
                  <PolarBear />
                </div>
              </div>
              <p className="text-fluffy-text max-w-50 text-sm font-semibold">
                Don&apos;t whack the polar bear — one bonk and it&apos;s game over!
              </p>
            </div>
            <button type="button" className="btn btn-primary" onClick={beginGame}>
              Start
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}

function Mole({ dazed }) {
  return (
    <div className={cn("bg-fluffy-brown relative h-[78%] w-[62%] rounded-t-full", dazed && "whack-squash")}>
      <span className="bg-fluffy-brown absolute -top-1 left-[12%] h-4 w-4 rounded-full sm:h-5 sm:w-5" />
      <span className="bg-fluffy-brown absolute -top-1 right-[12%] h-4 w-4 rounded-full sm:h-5 sm:w-5" />
      {dazed ? (
        <>
          <DizzyEye className="left-[22%]" />
          <DizzyEye className="right-[22%]" />
          <span className="absolute top-[46%] left-[10%] h-2 w-3 rounded-full bg-[#e0708a]/60 sm:h-2.5 sm:w-4" />
          <span className="absolute top-[46%] right-[10%] h-2 w-3 rounded-full bg-[#e0708a]/60 sm:h-2.5 sm:w-4" />
          <span className="bg-fluffy-text absolute top-[54%] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[#e0708a] sm:h-3 sm:w-3" />
          <span className="text-fluffy-warning absolute top-[2%] left-1/2 flex -translate-x-1/2 gap-0.5 text-sm leading-none drop-shadow-[0_1px_0_rgba(0,0,0,0.25)] sm:text-base">
            <span className="whack-star">★</span>
            <span className="whack-star -mt-1" style={{ animationDelay: "-170ms" }}>
              ★
            </span>
            <span className="whack-star" style={{ animationDelay: "-340ms" }}>
              ★
            </span>
          </span>
        </>
      ) : (
        <>
          <span className="bg-fluffy-text absolute top-[38%] left-[28%] h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" />
          <span className="bg-fluffy-text absolute top-[38%] right-[28%] h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" />
          <span className="absolute top-[54%] left-1/2 h-1 w-2.5 -translate-x-1/2 rounded-full bg-[#e0708a]" />
        </>
      )}
    </div>
  );
}

// Distinct from the mole by shape too (big round ears with pink insides,
// oval muzzle, blue scarf), not only by its white colour.
function PolarBear({ bonked = false }) {
  return (
    <div
      className={cn(
        "border-fluffy-border relative h-[80%] w-[66%] rounded-t-full border-2 border-b-0 bg-white",
        bonked && "whack-squash",
      )}
    >
      <span className="border-fluffy-border absolute -top-2 left-[4%] h-5 w-5 rounded-full border-2 bg-white sm:h-6 sm:w-6">
        <span className="absolute inset-1 rounded-full bg-[#f4b8c8]" />
      </span>
      <span className="border-fluffy-border absolute -top-2 right-[4%] h-5 w-5 rounded-full border-2 bg-white sm:h-6 sm:w-6">
        <span className="absolute inset-1 rounded-full bg-[#f4b8c8]" />
      </span>
      {bonked ? (
        <>
          <span className="bg-fluffy-text absolute top-[30%] left-[24%] h-2.5 w-2.5 rounded-full ring-2 ring-white sm:h-3 sm:w-3" />
          <span className="bg-fluffy-text absolute top-[30%] right-[24%] h-2.5 w-2.5 rounded-full ring-2 ring-white sm:h-3 sm:w-3" />
          <span className="text-fluffy-danger absolute top-[-2%] left-1/2 -translate-x-1/2 text-lg leading-none font-black sm:text-xl">
            !
          </span>
        </>
      ) : (
        <>
          <span className="bg-fluffy-text absolute top-[34%] left-[28%] h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" />
          <span className="bg-fluffy-text absolute top-[34%] right-[28%] h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2" />
        </>
      )}
      <span className="bg-fluffy-cream absolute top-[46%] left-1/2 flex h-[24%] w-[46%] -translate-x-1/2 flex-col items-center rounded-full pt-[6%]">
        <span className="bg-fluffy-text h-1.5 w-2.5 rounded-full sm:h-2 sm:w-3" />
        {bonked && <span className="bg-fluffy-text mt-0.5 h-1.5 w-1.5 rounded-full" />}
      </span>
      <span className="bg-fluffy-primary absolute right-0 bottom-0 left-0 h-[12%]" />
    </div>
  );
}

function DizzyEye({ className }) {
  return (
    <span className={cn("absolute top-[34%] h-2.5 w-2.5 sm:h-3 sm:w-3", className)}>
      <span className="bg-fluffy-cream absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 rotate-45 rounded-full" />
      <span className="bg-fluffy-cream absolute top-1/2 left-0 h-[3px] w-full -translate-y-1/2 -rotate-45 rounded-full" />
    </span>
  );
}

function HitEffects({ points }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="whack-burst absolute top-[22%] left-1/2 h-[52%] w-[52%]">
        <polygon
          points="50,4 60,32 90,22 70,46 96,60 64,64 70,94 50,72 30,94 36,64 4,60 30,46 10,22 40,32"
          className="fill-fluffy-warning"
          opacity="0.85"
        />
        <circle cx="50" cy="52" r="14" fill="#fff" opacity="0.9" />
      </svg>

      <svg viewBox="0 0 60 60" className="whack-mallet absolute -top-[18%] -right-[12%] h-[62%] w-[62%] drop-shadow-sm">
        <rect x="30" y="22" width="7" height="34" rx="3.5" transform="rotate(-35 33 39)" className="fill-fluffy-gold" />
        <rect x="6" y="6" width="36" height="20" rx="8" transform="rotate(-35 24 16)" className="fill-fluffy-primary" />
        <rect x="10" y="10" width="10" height="12" rx="4" transform="rotate(-35 24 16)" fill="#fff" opacity="0.35" />
      </svg>

      <span className="whack-float font-poppins text-fluffy-primary absolute top-[2%] left-1/2 text-lg font-extrabold drop-shadow-[0_1px_0_#fff] sm:text-xl">
        +{points}
      </span>
    </div>
  );
}
