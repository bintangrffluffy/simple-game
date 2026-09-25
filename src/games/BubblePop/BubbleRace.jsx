import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, pickRandom } from "@/games/assets/gameAssets";

const ROUND_SECONDS = 40;
const COUNTDOWN_SECONDS = 3;
const GOLDEN_CHANCE = 0.15;
// Kid side: bigger, slower, more generous bubbles so a parent never has to
// hold back.
const LEVEL_TUNING = {
  kid: { size: 78, lifetime: 4.4, gap: 0.62 },
  grownup: { size: 56, lifetime: 3.0, gap: 0.5 },
};
const ZONE_STYLES = ["bg-fluffy-primary/10", "bg-fluffy-gold/15"];
const ZONE_TEXT = ["text-fluffy-primary", "text-fluffy-gold"];

let uid = 0;

// Bubble Pop's Together mode (a same-device race): each player pops the
// bubbles rising in their own half (Player 2's half is rotated 180° to face
// them across a table). Taps on two halves are independent pointer events,
// so both can play at once. Visuals reuse Bubble Pop's bubble style and its
// `bubble-pop-item` rise animation (including its reduced-motion rule).
export default function BubbleRace({ onGameComplete, onSwitchMode }) {
  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [phase, setPhase] = useState("countdown");
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [bubbles, setBubbles] = useState([]);
  const [popped, setPopped] = useState([0, 0]);
  const [popups, setPopups] = useState([]);

  const zoneRefs = useRef([]);
  const nextSpawnRef = useRef([0, 0]);
  const poppedRef = useRef([0, 0]);
  const levelsRef = useRef(levels);
  const reduceMotionRef = useRef(false);

  const { status, result, start, finish } = useGameResult({
    gameId: "bubble-pop",
    onComplete: onGameComplete,
  });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    setPhase("over");
    const [a, b] = poppedRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: 1, mode: "together", popped: poppedRef.current, winner: a === b ? 0 : a > b ? 1 : 2 });
  };
  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: () => endGameRef.current() });
  const elapsed = ROUND_SECONDS - timer.time;

  useEffect(() => {
    reduceMotionRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const startTimer = timer.start;
  useEffect(() => {
    if (status !== "playing" || phase !== "countdown") return undefined;
    if (countdown <= 0) {
      setPhase("race");
      startTimer();
      return undefined;
    }
    const id = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(id);
  }, [countdown, phase, startTimer, status]);

  // Spawning and expiry run on round time (like Bubble Pop).
  useEffect(() => {
    if (status !== "playing" || phase !== "race") return;
    const born = [];
    [0, 1].forEach((player) => {
      if (elapsed < nextSpawnRef.current[player]) return;
      const zone = zoneRefs.current[player];
      if (!zone) return;
      const tune = LEVEL_TUNING[levelsRef.current[player]];
      const golden = Math.random() < GOLDEN_CHANCE;
      const size = golden ? tune.size * 0.85 : tune.size;
      const height = zone.clientHeight;
      born.push({
        id: ++uid,
        player,
        golden,
        size,
        item: pickRandom(golden ? gameAssets.toys : gameAssets.treats),
        x: Math.random() * Math.max(0, zone.clientWidth - size),
        // Reduced motion: no rise — place the bubble at a random height.
        y: reduceMotionRef.current ? Math.random() * Math.max(0, height - size) : -size,
        rise: height + size,
        born: elapsed,
        lifetime: tune.lifetime,
      });
      nextSpawnRef.current[player] = elapsed + tune.gap * (0.8 + Math.random() * 0.4);
    });
    setBubbles((current) => {
      const alive = current.filter((b) => elapsed - b.born < b.lifetime);
      return born.length || alive.length !== current.length ? [...alive, ...born] : current;
    });
    setPopups((current) => (current.some((p) => elapsed - p.at > 0.6) ? current.filter((p) => elapsed - p.at <= 0.6) : current));
  }, [elapsed, phase, status]);

  const pop = (bubble, event) => {
    event.stopPropagation();
    if (status !== "playing" || phase !== "race") return;
    const points = bubble.golden ? 3 : 1;
    const next = poppedRef.current.map((n, i) => (i === bubble.player ? n + points : n));
    poppedRef.current = next;
    setPopped(next);
    setBubbles((current) => current.filter((b) => b.id !== bubble.id));
    const zone = zoneRefs.current[bubble.player].getBoundingClientRect();
    const local = bubble.player === 1 ? { x: zone.right - event.clientX, y: zone.bottom - event.clientY } : { x: event.clientX - zone.left, y: event.clientY - zone.top };
    setPopups((current) => [...current, { id: bubble.id, player: bubble.player, points, at: elapsed, ...local }]);
    navigator.vibrate?.(8);
  };

  const beginGame = useCallback(() => {
    levelsRef.current = levels;
    poppedRef.current = [0, 0];
    nextSpawnRef.current = [0, 0];
    setPopped([0, 0]);
    setBubbles([]);
    setPopups([]);
    setCountdown(COUNTDOWN_SECONDS);
    setPhase("countdown");
    timer.reset(ROUND_SECONDS);
    start();
  }, [levels, start, timer]);

  return (
    <GameShell
      title="Bubble Pop"
      score={`${popped[0]} · ${popped[1]}`}
      scoreLabel="P1 · P2"
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      result={
        status === "result" && result ? (
          <GameResult
            title={result.winner ? `Player ${result.winner} wins!` : "It's a tie!"}
            emoji="🫧"
            scoreLabel="Bubbles"
            score={`${result.popped[0]} – ${result.popped[1]}`}
            stats={[{ label: "Played together", value: "2 players" }]}
            shareText={`We raced in Bubble Pop on Fluffy Play — ${result.winner ? `Player ${result.winner} won` : "it's a tie"} (${result.popped[0]}–${result.popped[1]})! 🫧`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="flex gap-2" aria-hidden="true">
            {gameAssets.treats.slice(0, 3).map((t) => (
              <span key={t.id} className="border-fluffy-peach flex h-14 w-14 items-center justify-center rounded-full border-[3px] bg-white/60">
                <img src={t.src} alt="" className="h-8 w-8" draggable={false} />
              </span>
            ))}
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Race to pop!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Two players, one screen. Pop the bubbles rising in your half — golden toy bubbles are worth 3. Kids get
              bigger, slower bubbles. {ROUND_SECONDS} seconds!
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">Player 1 plays the bottom half, Player 2 the top half.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
          <button type="button" className="btn btn-outline" onClick={onSwitchMode}>
            <ArrowLeft size={16} /> 1 player mode
          </button>
        </div>
      ) : (
        <div className="touch-none-game absolute inset-0 flex flex-col">
          {[1, 0].map((player) => (
            <div
              key={player}
              ref={(el) => (zoneRefs.current[player] = el)}
              aria-label={`Player ${player + 1} area`}
              className={cn("relative flex-1 overflow-hidden", ZONE_STYLES[player], player === 1 && "rotate-180")}
            >
              {/* Player 1's label: sm:bottom-10 clears GameShell's ~32px overflow on desktop. */}
              <div
                className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-2 z-10 flex items-center justify-center gap-2",
                  player === 0 && "sm:bottom-10",
                )}
              >
                <span className={cn("text-xs font-black tracking-widest uppercase", ZONE_TEXT[player])}>Player {player + 1}</span>
                <span className="font-poppins text-fluffy-text text-2xl font-black tabular-nums">{popped[player]}</span>
                <span className="text-fluffy-subtext text-xs font-bold">{levels[player] === "kid" ? "Kid" : "Grown-up"}</span>
              </div>
              {bubbles
                .filter((b) => b.player === player)
                .map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onPointerDown={(e) => pop(b, e)}
                    aria-label={`Pop ${b.item.name}`}
                    className={cn(
                      "bubble-pop-item absolute flex items-center justify-center rounded-full border-[3px] shadow-md",
                      b.golden ? "border-fluffy-gold bg-fluffy-gold/20" : "border-fluffy-peach bg-white/55",
                    )}
                    style={{
                      left: b.x,
                      bottom: b.y,
                      width: b.size,
                      height: b.size,
                      animationDuration: `${b.lifetime}s`,
                      "--rise": `${b.rise}px`,
                    }}
                  >
                    <span className="pointer-events-none absolute top-[14%] left-[20%] h-[18%] w-[26%] -rotate-30 rounded-full bg-white/80" />
                    <img src={b.item.src} alt="" draggable={false} className="pointer-events-none h-[62%] w-[62%] object-contain" />
                    {b.golden && (
                      <span className="bg-fluffy-gold pointer-events-none absolute -bottom-2 rounded-full px-1.5 text-[10px] leading-4 font-black text-white">
                        +3
                      </span>
                    )}
                  </button>
                ))}
              {popups
                .filter((p) => p.player === player)
                .map((p) => (
                  <span
                    key={p.id}
                    className="whack-float font-poppins text-fluffy-primary pointer-events-none absolute text-lg font-black"
                    style={{ left: p.x, top: p.y }}
                  >
                    +{p.points}
                  </span>
                ))}
            </div>
          ))}

          <div className="bg-fluffy-border pointer-events-none absolute inset-x-0 top-1/2 h-0.5" aria-hidden="true" />
          {(phase === "countdown" || (phase === "race" && timer.time > ROUND_SECONDS - 0.6)) && (
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
