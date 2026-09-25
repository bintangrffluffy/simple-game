import { useCallback, useEffect, useRef, useState } from "react";
import { CloudLightning, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, pickRandom } from "@/games/assets/gameAssets";
import DailyModeButton from "@/games/components/DailyModeButton";
import { dailyKey, dailyRandomAt, todayKey } from "@/games/utils/seededRandom";

const ROUND_SECONDS = 30;
// Targets start at TARGET_SIZE and shrink to SHRINK_TO of it over their
// lifetime; 96 * 0.5 keeps even a nearly-expired target at the 48px minimum.
const TARGET_SIZE = 96;
const SHRINK_TO = 0.5;
const BASE_LIFETIME = 2.4;
const MIN_LIFETIME = 1.3;
const BASE_SPAWN_GAP = 0.9;
const MIN_SPAWN_GAP = 0.45;
const GIFT_CHANCE = 0.1;
const POPUP_SECONDS = 0.7;
// Target Tap is the precision counterpart to Bubble Pop: every target
// counts. Letting one vanish costs a heart, and chaining Perfects builds a
// score multiplier that any sloppy tap resets.
const LIVES = 3;
const PERFECTS_PER_LEVEL = 2;
const MAX_MULTIPLIER = 3;
// Storm-cloud traps: tapping one costs a heart and the streak; leaving it
// alone is always safe. They start showing up a few seconds in.
const TRAP_START = 0.15;
const TRAP_CHANCE = 0.25;
const TRAP_LIFETIME = 1.9;

// Accuracy rings, measured as distance from the center / current radius.
const RINGS = [
  { max: 0.38, label: "Perfect", points: 30, className: "text-fluffy-success" },
  { max: 0.7, label: "Great", points: 20, className: "text-fluffy-primary" },
  { max: Infinity, label: "Good", points: 10, className: "text-fluffy-gold" },
];

let targetUid = 0;

// Everything time-based (spawn, expiry, popups) runs on the round's own
// elapsed time from useGameTimer, so pausing the timer pauses the whole game
// with no setTimeouts to cancel or reschedule.
export default function TargetTap({ onGameComplete }) {
  const areaRef = useRef(null);
  const statusRef = useRef("idle");
  const nextSpawnRef = useRef(0);
  const scoreRef = useRef(0);
  const streakRef = useRef(0);
  const livesRef = useRef(LIVES);
  const statsRef = useRef({ hits: 0, perfects: 0, bestStreak: 0, dodged: 0 });
  const targetsRef = useRef([]);
  const dailyRef = useRef(false);
  const spawnCountRef = useRef(0);

  const [targets, setTargets] = useState([]);
  const [popups, setPopups] = useState([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [lives, setLives] = useState(LIVES);
  const [hurt, setHurt] = useState(0);

  const [highScore, setHighScore] = useHighScore("target-tap");
  const [daily, setDaily] = useState(false);
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("target-tap"));

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "target-tap",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(() => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isDaily = dailyRef.current;
    const isNewBest = finalScore > (isDaily ? dailyBest : highScore);
    setHighScore(finalScore);
    if (isDaily) setDailyBest(finalScore);
    finish({
      score: finalScore,
      level: 1,
      won: true,
      isNewBest,
      mode: isDaily ? "daily" : "classic",
      date: isDaily ? todayKey() : undefined,
      livesLeft: livesRef.current,
      ...statsRef.current,
    });
  }, [dailyBest, finish, highScore, setDailyBest, setHighScore]);

  const timer = useGameTimer({
    mode: "down",
    duration: ROUND_SECONDS,
    onExpire: endGame,
  });
  const multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor(streak / PERFECTS_PER_LEVEL));
  const elapsed = ROUND_SECONDS - timer.time;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const breakStreak = () => {
    streakRef.current = 0;
    setStreak(0);
  };

  const addPopup = (x, y, text, className) => {
    setPopups((prev) => [...prev, { id: ++targetUid, x, y, text, className, bornAt: elapsed }]);
  };

  const commitTargets = (next) => {
    targetsRef.current = next;
    setTargets(next);
  };

  // Returns true when that was the last heart and the round has ended.
  const loseLives = (count) => {
    breakStreak();
    livesRef.current = Math.max(0, livesRef.current - count);
    setLives(livesRef.current);
    setHurt((n) => n + 1);
    navigator.vibrate?.(40);
    if (livesRef.current > 0) return false;
    commitTargets([]);
    timer.pause();
    endGame();
    return true;
  };

  // Per-frame game step: expire old targets/popups, spawn new ones.
  useEffect(() => {
    if (status !== "playing") return;

    const prev = targetsRef.current;
    let next = prev.filter((t) => elapsed - t.bornAt < t.lifetime);
    if (next.length !== prev.length) {
      const expired = prev.filter((t) => !next.includes(t));
      const missed = expired.filter((t) => !t.trap);
      expired.forEach((t) =>
        t.trap
          ? addPopup(t.x, t.y, "Dodged!", "text-fluffy-success")
          : addPopup(t.x, t.y, "Too slow!", "text-fluffy-danger"),
      );
      statsRef.current.dodged += expired.length - missed.length;
      if (missed.length > 0 && loseLives(missed.length)) return;
    }

    const progress = elapsed / ROUND_SECONDS;
    // Traps don't take up a real target's slot.
    const maxTargets = progress < 0.3 ? 1 : progress < 0.65 ? 2 : 3;
    const realCount = next.filter((t) => !t.trap).length;
    if (elapsed >= nextSpawnRef.current && realCount < maxTargets) {
      nextSpawnRef.current = elapsed + Math.max(MIN_SPAWN_GAP, BASE_SPAWN_GAP - progress * 0.5);
      // Daily: the Nth target of the day is the same for everyone.
      const rng = dailyRef.current ? dailyRandomAt("target-tap", spawnCountRef.current) : Math.random;
      const spawned = spawnTarget(next, areaRef.current, elapsed, progress, rng);
      if (spawned) {
        spawnCountRef.current += 1;
        next = [...next, spawned];
      }
    }
    if (next !== prev) commitTargets(next);

    setPopups((current) => {
      const alive = current.filter((p) => elapsed - p.bornAt < POPUP_SECONDS);
      return alive.length !== current.length ? alive : current;
    });
  }, [elapsed, status]);

  const handleHit = (event, target) => {
    event.stopPropagation();
    if (statusRef.current !== "playing") return;

    if (target.trap) {
      commitTargets(targetsRef.current.filter((t) => t.id !== target.id));
      addPopup(target.x, target.y, "Ouch! −1 ♥", "text-fluffy-danger");
      loseLives(1);
      return;
    }

    // getBoundingClientRect includes the current shrink transform, so the
    // accuracy rings always match what the player sees.
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width / 2;
    const dist = Math.hypot(event.clientX - (rect.left + radius), event.clientY - (rect.top + radius));
    const ring = RINGS.find((r) => dist / radius <= r.max);

    // Perfect grows the streak, Great holds it, Good resets it.
    const nextStreak =
      ring.label === "Perfect" ? streakRef.current + 1 : ring.label === "Great" ? streakRef.current : 0;
    streakRef.current = nextStreak;
    setStreak(nextStreak);
    const mult = Math.min(MAX_MULTIPLIER, 1 + Math.floor(nextStreak / PERFECTS_PER_LEVEL));

    const gained = ring.points * (target.gift ? 2 : 1) * mult;
    scoreRef.current += gained;
    setScore(scoreRef.current);

    const stats = statsRef.current;
    stats.hits += 1;
    if (ring.label === "Perfect") stats.perfects += 1;
    stats.bestStreak = Math.max(stats.bestStreak, nextStreak);

    commitTargets(targetsRef.current.filter((t) => t.id !== target.id));
    addPopup(target.x, target.y, `${ring.label} +${gained}`, ring.className);
    navigator.vibrate?.(12);
  };

  const handleMiss = (event) => {
    if (statusRef.current !== "playing") return;
    const rect = areaRef.current.getBoundingClientRect();
    breakStreak();
    addPopup(event.clientX - rect.left, event.clientY - rect.top, "Miss", "text-fluffy-subtext");
  };

  const beginGame = useCallback((isDaily = false) => {
    dailyRef.current = isDaily;
    setDaily(isDaily);
    spawnCountRef.current = 0;
    commitTargets([]);
    setPopups([]);
    setScore(0);
    setStreak(0);
    setLives(LIVES);
    setHurt(0);
    scoreRef.current = 0;
    streakRef.current = 0;
    livesRef.current = LIVES;
    statsRef.current = { hits: 0, perfects: 0, bestStreak: 0, dodged: 0 };
    nextSpawnRef.current = 0.4;
    timer.reset(ROUND_SECONDS);
    timer.start();
    start();
  }, [start, timer]);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  return (
    <GameShell
      title="Target Tap"
      score={score}
      best={daily ? dailyBest : highScore}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={daily ? dailyBest : highScore}
            isNewBest={result.isNewBest}
            title={result.livesLeft === 0 ? "Out of hearts!" : "Sharp shooting!"}
            emoji="🎯"
            celebrate={result.isNewBest}
            stats={[
              { label: "Hits", value: result.hits },
              { label: "Perfect", value: result.perfects },
              { label: "Perfect streak", value: result.bestStreak },
              { label: "Dodged", value: result.dodged },
            ]}
            shareText={result.mode === "daily" ? `Target Tap · Daily ${result.date}: ${result.score} points, ${result.bestStreak} Perfects in a row 🎯 Same targets for everyone today!` : undefined}
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div
        ref={areaRef}
        onPointerDown={handleMiss}
        className="touch-none-game absolute inset-0 overflow-hidden bg-white"
        style={{
          // Faint dot grid: a calm "range" look, distinct from Bubble Pop's sky gradient.
          backgroundImage: "radial-gradient(var(--color-fluffy-blush) 1.5px, transparent 1.5px)",
          backgroundSize: "22px 22px",
        }}
      >
        {status !== "idle" && (
          <div
            key={hurt}
            className={cn("pointer-events-none absolute top-3 left-3 z-10 flex gap-1", hurt > 0 && "whack-shake")}
            aria-label={`${lives} of ${LIVES} hearts left`}
          >
            {Array.from({ length: LIVES }, (_, i) => (
              <Heart
                key={i}
                className={cn("h-6 w-6", i < lives ? "fill-fluffy-danger text-fluffy-danger" : "text-fluffy-border")}
                strokeWidth={2.5}
              />
            ))}
          </div>
        )}

        {targets.map((target) =>
          target.trap ? (
            // Told apart from real targets by shape too, not just color:
            // dashed ring, storm-cloud icon and an ✕ badge.
            <button
              key={target.id}
              type="button"
              onPointerDown={(event) => handleHit(event, target)}
              aria-label="Storm cloud trap — don't tap"
              className="target-tap-item border-fluffy-danger/70 bg-fluffy-danger/10 absolute flex items-center justify-center rounded-full border-4 border-dashed shadow-md"
              style={{
                left: target.x - TARGET_SIZE / 2,
                top: target.y - TARGET_SIZE / 2,
                width: TARGET_SIZE,
                height: TARGET_SIZE,
                animationDuration: `${target.lifetime}s`,
                animationPlayState: status === "paused" ? "paused" : "running",
                "--shrink-to": SHRINK_TO,
              }}
            >
              <CloudLightning className="text-fluffy-danger pointer-events-none h-[46%] w-[46%]" strokeWidth={2.25} />
              <span className="bg-fluffy-danger pointer-events-none absolute -top-2 rounded-full px-1.5 text-[11px] leading-4 font-black text-white shadow-sm">
                ✕
              </span>
            </button>
          ) : (
            <button
              key={target.id}
              type="button"
              onPointerDown={(event) => handleHit(event, target)}
              aria-label={`Tap the ${target.item.name}${target.gift ? ", double points" : ""}`}
              className={cn(
                "target-tap-item absolute flex items-center justify-center rounded-full border-4 bg-white shadow-md",
                target.gift ? "border-fluffy-gold" : "border-fluffy-primary",
              )}
              style={{
                left: target.x - TARGET_SIZE / 2,
                top: target.y - TARGET_SIZE / 2,
                width: TARGET_SIZE,
                height: TARGET_SIZE,
                animationDuration: `${target.lifetime}s`,
                animationPlayState: status === "paused" ? "paused" : "running",
                "--shrink-to": SHRINK_TO,
              }}
            >
              <span
                className={cn(
                  "pointer-events-none absolute inset-[9%] rounded-full",
                  target.gift ? "bg-fluffy-gold/25" : "bg-fluffy-peach/60",
                )}
              />
              <span
                className="pointer-events-none absolute inset-[20%] rounded-full"
                style={{ background: target.item.bg ?? "#fff" }}
              />
              <img
                src={target.item.src}
                alt=""
                draggable={false}
                className="pointer-events-none relative h-[48%] w-[48%] object-contain"
              />
              {target.gift && (
                <span className="bg-fluffy-gold pointer-events-none absolute -top-2 rounded-full px-1.5 text-[11px] leading-4 font-black text-white shadow-sm">
                  ×2
                </span>
              )}
            </button>
          ),
        )}

        {popups.map((popup) => (
          <span
            key={popup.id}
            className={cn(
              "whack-float font-poppins pointer-events-none absolute z-10 text-base font-extrabold whitespace-nowrap drop-shadow-[0_1px_0_#fff]",
              popup.className,
            )}
            style={{ left: popup.x, top: popup.y - 24 }}
          >
            {popup.text}
          </span>
        ))}

        {multiplier > 1 && status === "playing" && (
          <div className="bg-fluffy-success pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white">
            Perfect streak ×{multiplier}
          </div>
        )}

        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Aim for the center!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Tap each target before it shrinks away — every one you miss costs a heart. Chain Perfects to
              multiply your score up to ×3, but never tap a storm cloud!
            </p>
            <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
              Start
            </button>
            <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />
          </div>
        )}
      </div>
    </GameShell>
  );
}

// Picks a spot inside the play area that doesn't overlap an existing target.
function spawnTarget(existing, area, elapsed, progress, rng = Math.random) {
  const width = area?.clientWidth ?? 360;
  const height = area?.clientHeight ?? 520;
  const margin = TARGET_SIZE / 2 + 8;
  // Leave room at the top for the hearts and streak badge.
  const top = margin + 40;

  for (let attempt = 0; attempt < 12; attempt++) {
    const x = margin + rng() * Math.max(0, width - margin * 2);
    const y = top + rng() * Math.max(0, height - top - margin);
    if (existing.every((t) => Math.hypot(t.x - x, t.y - y) > TARGET_SIZE + 8)) {
      if (progress >= TRAP_START && !existing.some((t) => t.trap) && rng() < TRAP_CHANCE) {
        return {
          id: ++targetUid,
          x,
          y,
          trap: true,
          lifetime: TRAP_LIFETIME,
          bornAt: elapsed,
        };
      }
      const gift = rng() < GIFT_CHANCE;
      const lifetime = Math.max(MIN_LIFETIME, BASE_LIFETIME - progress * 1.1) * (gift ? 0.8 : 1);
      return {
        id: ++targetUid,
        x,
        y,
        gift,
        lifetime,
        bornAt: elapsed,
        item: gift ? gameAssets.decorative.gift : pickRandom(gameAssets.products, rng),
      };
    }
  }
  return null;
}
