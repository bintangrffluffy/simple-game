import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { gameAssets, pickRandom } from "@/games/assets/gameAssets";

const ATTEMPTS = 5;
// Random wait before the treat appears, so it can't be anticipated.
const MIN_WAIT_MS = 1200;
const MAX_WAIT_MS = 3600;
// Added to the final average for every tap before the treat appeared.
const FALSE_START_PENALTY_MS = 100;
const ITEMS = [...gameAssets.treats, ...gameAssets.toys];

// Touch and mouse have different input latency, so records are kept per
// input type instead of being compared against each other.
function inputKind() {
  return window.matchMedia?.("(pointer: coarse)").matches ? "touch" : "mouse";
}

function rating(ms) {
  if (ms < 250) return { title: "Lightning fast!", emoji: "⚡" };
  if (ms < 350) return { title: "Quick paws!", emoji: "🐾" };
  return { title: "Nice reflexes!", emoji: "✨" };
}

export default function Reflex({ onGameComplete }) {
  const [kind] = useState(inputKind);
  // wait -> go -> shown -> wait ...; early tap in wait -> early -> wait
  const [phase, setPhase] = useState("wait");
  const [times, setTimes] = useState([]);
  const [falseStarts, setFalseStarts] = useState(0);
  const [item, setItem] = useState(() => pickRandom(ITEMS));

  const phaseRef = useRef(phase);
  const goAtRef = useRef(0);
  const waitTimerRef = useRef(null);

  const [best, setBest] = useHighScore(`reflex-${kind}`, { lowerIsBetter: true });
  const { status, result, start, finish } = useGameResult({
    gameId: "reflex",
    onComplete: onGameComplete,
  });

  const goTo = (next) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const armAttempt = useCallback(() => {
    clearTimeout(waitTimerRef.current);
    goAtRef.current = 0;
    goTo("wait");
    const delay = MIN_WAIT_MS + Math.random() * (MAX_WAIT_MS - MIN_WAIT_MS);
    waitTimerRef.current = setTimeout(() => {
      setItem(pickRandom(ITEMS));
      goTo("go");
    }, delay);
  }, []);

  // Start the clock once the treat has actually been painted (two frames
  // after the state change), not when React was asked to show it.
  useEffect(() => {
    if (phase !== "go") return undefined;
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        goAtRef.current = performance.now();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [phase]);

  useEffect(() => () => clearTimeout(waitTimerRef.current), []);

  const endGame = (allTimes, starts) => {
    const average = Math.round(allTimes.reduce((sum, t) => sum + t, 0) / allTimes.length) + starts * FALSE_START_PENALTY_MS;
    const isNewBest = best === 0 || average < best;
    if (isNewBest) setBest(average);
    finish({
      // Reaction time in ms — lower is better (see lowerIsBetter).
      score: average,
      scoreUnit: "ms",
      lowerIsBetter: true,
      level: ATTEMPTS,
      inputType: kind,
      fastest: Math.min(...allTimes),
      slowest: Math.max(...allTimes),
      falseStarts: starts,
      isNewBest,
    });
  };

  const handleTap = (event) => {
    if (status !== "playing") return;
    const current = phaseRef.current;

    if (current === "wait") {
      clearTimeout(waitTimerRef.current);
      setFalseStarts((n) => n + 1);
      navigator.vibrate?.([20, 40, 20]);
      goTo("early");
      return;
    }
    if (current === "go") {
      // event.timeStamp shares performance.now()'s clock and is taken when
      // the input happened, not when this handler got to run.
      const goAt = goAtRef.current || performance.now();
      const ms = Math.max(1, Math.round(event.timeStamp - goAt));
      const next = [...times, ms];
      setTimes(next);
      navigator.vibrate?.(12);
      goTo("shown");
      return;
    }
    if (current === "shown") {
      if (times.length >= ATTEMPTS) endGame(times, falseStarts);
      else armAttempt();
      return;
    }
    if (current === "early") armAttempt();
  };

  const beginGame = () => {
    setTimes([]);
    setFalseStarts(0);
    goAtRef.current = 0;
    start();
    armAttempt();
  };

  const last = times[times.length - 1];
  const attempt = Math.min(ATTEMPTS, times.length + (phase === "shown" ? 0 : 1));
  const bestLabel = best ? `${best} ms` : "—";

  const screens = {
    wait: { bg: "bg-fluffy-cream", title: "Wait for it…", text: "Tap the moment the treat appears." },
    go: { bg: "bg-fluffy-success", title: "TAP!", text: "" },
    early: { bg: "bg-fluffy-blush", title: "Too soon!", text: `Wait for the treat. +${FALSE_START_PENALTY_MS} ms · tap to try again` },
    shown: {
      bg: "bg-fluffy-bg",
      title: `${last ?? 0} ms`,
      text: times.length >= ATTEMPTS ? "Tap to see your result" : "Tap for the next try",
    },
  };
  const screen = screens[phase];

  return (
    <GameShell
      title="Fluffy Reflex"
      score={status === "idle" ? "—" : `${attempt}/${ATTEMPTS}`}
      scoreLabel="Try"
      best={bestLabel}
      result={
        status === "result" && result ? (
          <GameResult
            {...rating(result.score)}
            scoreLabel="Average"
            score={`${result.score} ms`}
            best={bestLabel}
            isNewBest={result.isNewBest}
            celebrate={result.isNewBest}
            stats={[
              { label: "Fastest", value: `${result.fastest} ms` },
              { label: "Slowest", value: `${result.slowest} ms` },
              { label: "Too soon", value: result.falseStarts },
            ]}
            shareText={`My Fluffy Reflex average: ${result.score} ms ${rating(result.score).emoji} (fastest ${result.fastest} ms, ${result.inputType}) — can you beat it?`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-4 bg-linear-to-b p-6 text-center">
          <div className="flex gap-2" aria-hidden="true">
            {gameAssets.treats.slice(0, 3).map((treat) => (
              <img key={treat.id} src={treat.src} alt="" className="h-12 w-12" draggable={false} />
            ))}
          </div>
          <h2 className="font-poppins text-fluffy-text text-xl font-bold">How fast are you?</h2>
          <p className="text-fluffy-subtext max-w-xs text-sm">
            Wait for a treat to pop up, then tap anywhere as fast as you can. {ATTEMPTS} tries — your average is your
            score. Tapping too early adds {FALSE_START_PENALTY_MS} ms.
          </p>
          <p className="text-fluffy-subtext text-xs">Records are kept separately for touch and mouse.</p>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : (
        <button
          type="button"
          onPointerDown={handleTap}
          aria-label={screen.title}
          className={cn(
            "touch-none-game absolute inset-0 flex w-full flex-col items-center justify-center gap-4 p-6 text-center transition-colors duration-100",
            screen.bg,
          )}
        >
          {phase === "go" ? (
            <img src={item.src} alt="" draggable={false} className="pointer-events-none h-40 w-40 object-contain drop-shadow-lg sm:h-48 sm:w-48" />
          ) : (
            <div className="bg-fluffy-bg/70 pointer-events-none flex h-40 w-40 items-center justify-center rounded-full sm:h-48 sm:w-48">
              <span className="text-5xl" aria-hidden="true">
                {phase === "early" ? "🙈" : phase === "shown" ? "⏱️" : "👀"}
              </span>
            </div>
          )}
          <div className="pointer-events-none">
            <div
              className={cn(
                "font-poppins text-4xl font-black tabular-nums",
                phase === "go" ? "text-white" : phase === "early" ? "text-fluffy-danger" : "text-fluffy-text",
              )}
            >
              {screen.title}
            </div>
            {screen.text && <p className="text-fluffy-subtext mt-2 text-sm font-semibold">{screen.text}</p>}
          </div>
          {times.length > 0 && phase !== "go" && (
            <div className="pointer-events-none flex gap-2">
              {times.map((t, i) => (
                <span key={i} className="bg-fluffy-bg text-fluffy-text rounded-full px-3 py-1 text-xs font-bold tabular-nums">
                  {t}
                </span>
              ))}
            </div>
          )}
        </button>
      )}
    </GameShell>
  );
}
