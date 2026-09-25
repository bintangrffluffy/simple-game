import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets } from "@/games/assets/gameAssets";

const ROUND_SECONDS = 30;
const COUNTDOWN_SECONDS = 3;
// Rope movement per tap; ~29 unanswered taps pull the knot home.
const STEP = 0.035;
// A Kid's tap counts double, so a parent never has to lose on purpose.
const TAP_POWER = { kid: 2, grownup: 1 };
// Below this, a timed-out round counts as a tie.
const TIE_ZONE = 0.02;
// How far (in % of the board height) the knot travels from the center.
const TRAVEL = 36;

const KNOT = gameAssets.sceneItems.find((item) => item.id === "ribbon");
const TEDDY = gameAssets.toys.find((toy) => toy.id === "teddy-bear");
const ZONE_STYLES = ["bg-fluffy-primary/10 active:bg-fluffy-primary/20", "bg-fluffy-gold/15 active:bg-fluffy-gold/25"];
const ZONE_TEXT = ["text-fluffy-primary", "text-fluffy-gold"];

// Same-device tug of war: Player 1 taps the bottom half, Player 2 the top
// half (rotated 180° so it reads right-way-up from across a table). Each
// half is its own onPointerDown target, so two simultaneous touches are two
// independent pointer events — plain taps need no multi-pointer tracking.
export default function TugOfWar({ onGameComplete }) {
  const [levels, setLevels] = useState(["grownup", "kid"]);
  // countdown -> pull -> over
  const [phase, setPhase] = useState("countdown");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // -1 = at Player 2's goal (top), 1 = at Player 1's goal (bottom).
  const [position, setPosition] = useState(0);
  const [taps, setTaps] = useState([0, 0]);

  const phaseRef = useRef(phase);
  const positionRef = useRef(0);
  const tapsRef = useRef([0, 0]);
  const levelsRef = useRef(levels);

  const { status, result, start, finish } = useGameResult({
    gameId: "tug",
    onComplete: onGameComplete,
  });

  const goTo = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const endGame = useCallback(
    (byTimeout) => {
      if (phaseRef.current === "over") return;
      goTo("over");
      const p = positionRef.current;
      const winner = Math.abs(p) < TIE_ZONE ? 0 : p > 0 ? 1 : 2;
      // Flat "played together" completion — never per-player points.
      finish({ score: 0, level: 1, mode: "together", winner, taps: tapsRef.current, byTimeout });
    },
    [finish],
  );

  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: () => endGame(true) });

  // 3-2-1 before taps count, so both players start together.
  const startTimer = timer.start;
  useEffect(() => {
    if (status !== "playing" || phase !== "countdown") return undefined;
    if (countdown <= 0) {
      goTo("pull");
      startTimer();
      return undefined;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [countdown, phase, startTimer, status]);

  const handleTap = (player) => {
    if (status !== "playing" || phaseRef.current !== "pull") return;
    const nextTaps = tapsRef.current.map((n, i) => (i === player ? n + 1 : n));
    tapsRef.current = nextTaps;
    setTaps(nextTaps);
    const direction = player === 0 ? 1 : -1;
    const next = Math.max(-1, Math.min(1, positionRef.current + direction * STEP * TAP_POWER[levelsRef.current[player]]));
    positionRef.current = next;
    setPosition(next);
    if (Math.abs(next) >= 1) {
      timer.pause();
      endGame(false);
    }
  };

  const beginGame = useCallback(() => {
    levelsRef.current = levels;
    positionRef.current = 0;
    tapsRef.current = [0, 0];
    setPosition(0);
    setTaps([0, 0]);
    setCountdown(COUNTDOWN_SECONDS);
    goTo("countdown");
    timer.reset(ROUND_SECONDS);
    start();
  }, [levels, start, timer]);

  const winnerText = (r) => (r.winner ? `Player ${r.winner} wins!` : "It's a tie!");

  return (
    <GameShell
      title="Fluffy Tug"
      score={`${taps[0]} · ${taps[1]}`}
      scoreLabel="Taps P1 · P2"
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      result={
        status === "result" && result ? (
          <GameResult
            title={winnerText(result)}
            emoji="🎀"
            scoreLabel="Taps"
            score={`${result.taps[0]} – ${result.taps[1]}`}
            stats={[{ label: "Ended by", value: result.byTimeout ? "Time up" : "Pulled home" }]}
            shareText={`We played Fluffy Tug together on Fluffy Play — ${result.winner ? `Player ${result.winner} won` : "it's a tie"}! 🎀`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="flex items-center gap-3" aria-hidden="true">
            <img src={TEDDY.src} alt="" className="h-12 w-12" draggable={false} />
            <div className="bg-fluffy-brown/60 h-1.5 w-16 rounded-full" />
            <img src={KNOT.src} alt="" className="h-10 w-10" draggable={false} />
            <div className="bg-fluffy-brown/60 h-1.5 w-16 rounded-full" />
            <img src={TEDDY.src} alt="" className="h-12 w-12 -scale-x-100" draggable={false} />
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Tug of war — together!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Two players, one screen. Tap your half as fast as you can to pull the ribbon home. Kids' taps count double.
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">Player 1 taps the bottom half, Player 2 the top half.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : (
        <div className="touch-none-game absolute inset-0 flex flex-col">
          {[1, 0].map((player) => (
            <button
              key={player}
              type="button"
              onPointerDown={() => handleTap(player)}
              aria-label={`Player ${player + 1} tap zone`}
              // pr-[50%] centers the counter in the left half, clear of the rope.
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 pr-[50%] transition-colors duration-75",
                ZONE_STYLES[player],
                player === 1 && "rotate-180",
              )}
            >
              <span className={cn("pointer-events-none text-xs font-black tracking-widest uppercase sm:text-sm", ZONE_TEXT[player])}>
                Player {player + 1}
              </span>
              <span className="text-fluffy-subtext pointer-events-none text-xs font-bold">
                {levels[player] === "kid" ? "Kid · taps ×2" : "Grown-up"}
              </span>
              <span className="font-poppins text-fluffy-text pointer-events-none text-5xl font-black tabular-nums">
                {taps[player]}
              </span>
              <span className="text-fluffy-subtext pointer-events-none text-sm font-bold">
                {phase === "pull" ? "TAP TAP TAP!" : "Get ready…"}
              </span>
            </button>
          ))}

          {/* The rope: drawn over both halves, ignores pointer input.
              sm:bottom-8 keeps the bottom teddy clear of GameShell, which runs
              ~32px past the viewport on desktop (min-h-100dvh plus sm:py-8). */}
          <div className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-20 -translate-x-1/2 sm:bottom-8" aria-hidden="true">
            <div className="bg-fluffy-brown/50 absolute inset-y-[8%] left-1/2 w-1.5 -translate-x-1/2 rounded-full" />
            <div className="bg-fluffy-gold absolute top-[14%] left-1/2 h-1 w-16 -translate-x-1/2 rounded-full" />
            <div className="bg-fluffy-primary absolute bottom-[14%] left-1/2 h-1 w-16 -translate-x-1/2 rounded-full" />
            <img src={TEDDY.src} alt="" draggable={false} className="absolute top-[2%] left-1/2 h-10 w-10 -translate-x-1/2 rotate-180" />
            <img src={TEDDY.src} alt="" draggable={false} className="absolute bottom-[2%] left-1/2 h-10 w-10 -translate-x-1/2" />
            <img
              src={KNOT.src}
              alt=""
              draggable={false}
              className="absolute left-1/2 h-14 w-14 drop-shadow-md transition-[top] duration-100 ease-out"
              style={{ top: `${50 + position * TRAVEL}%`, transform: "translate(-50%, -50%)" }}
            />
          </div>

          <div className="sr-only" aria-live="polite">
            {position > 0.5 ? "Player 1 is winning" : position < -0.5 ? "Player 2 is winning" : ""}
          </div>

          {(phase === "countdown" || (phase === "pull" && timer.time > ROUND_SECONDS - 0.6)) && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="bg-fluffy-bg font-poppins text-fluffy-primary flex h-24 w-24 items-center justify-center rounded-full text-5xl font-black shadow-xl">
                {countdown > 0 ? countdown : "Go!"}
              </div>
            </div>
          )}
        </div>
      )}
    </GameShell>
  );
}
