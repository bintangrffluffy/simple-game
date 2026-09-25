import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, pickRandom } from "@/games/assets/gameAssets";
import BubbleRace from "./BubbleRace";

// Bubble Pop is the relaxed, "pop everything" counterpart to Target Tap:
// no misses, no lives, lots of bubbles — drag a finger (or the mouse)
// through them to pop a whole chain in one stroke.
const ROUND_SECONDS = 45;
const BASE_SPAWN_GAP = 0.55;
const MIN_SPAWN_GAP = 0.28;
const BASE_LIFETIME = 3.4;
const MIN_LIFETIME = 2.3;
const CHAIN_BONUS = 5; // extra points per bubble already popped in this stroke
const MAX_CHAIN_BONUS = 40;
const BURST_RADIUS = 150;
const POPUP_SECONDS = 0.7;
// Pointer moves are sampled along the segment at this spacing so a fast
// swipe can't skip over a bubble between two pointermove events.
const SWIPE_STEP_PX = 16;

// Each type also carries its own art (treat / toy / gift) plus a text badge,
// so bubbles are told apart by what's inside, not by color alone.
const BUBBLE_TYPES = [
  {
    id: "normal",
    points: 10,
    weight: 72,
    size: 64,
    items: gameAssets.treats,
    badge: "+10",
    className: "border-fluffy-peach bg-white/55",
    badgeClassName: "bg-fluffy-peach",
  },
  {
    id: "golden",
    points: 30,
    weight: 22,
    size: 58,
    items: gameAssets.toys,
    badge: "+30",
    className: "border-fluffy-gold bg-fluffy-gold/20",
    badgeClassName: "bg-fluffy-gold",
  },
  {
    // Pops every bubble within BURST_RADIUS around it.
    id: "burst",
    points: 20,
    weight: 6,
    size: 62,
    items: [gameAssets.decorative.gift],
    badge: "BURST",
    className: "border-fluffy-primary bg-fluffy-primary/15",
    badgeClassName: "bg-fluffy-primary",
  },
];

function pickType() {
  const total = BUBBLE_TYPES.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * total;
  for (const type of BUBBLE_TYPES) {
    if (roll < type.weight) return type;
    roll -= type.weight;
  }
  return BUBBLE_TYPES[0];
}

let bubbleUid = 0;

// Like Target Tap, everything time-based runs on the round's elapsed time
// from useGameTimer, so pausing the timer pauses spawning, expiry and the
// (CSS) rise animation together.
export default function BubblePop({ onGameComplete }) {
  // "solo" (this component) or "together" (BubbleRace, the 2-player mode).
  const [mode, setMode] = useState("solo");
  const areaRef = useRef(null);
  const statusRef = useRef("idle");
  const nextSpawnRef = useRef(0);
  const scoreRef = useRef(0);
  const bubblesRef = useRef([]);
  const strokeRef = useRef(null);
  const statsRef = useRef({ popped: 0, bestChain: 0, bursts: 0 });
  const elapsedRef = useRef(0);

  const [bubbles, setBubbles] = useState([]);
  const [popups, setPopups] = useState([]);
  const [score, setScore] = useState(0);
  const [chain, setChain] = useState(0);

  const [highScore, setHighScore] = useHighScore("bubble-pop");

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "bubble-pop",
    onComplete: onGameComplete,
  });

  const endGame = useCallback(() => {
    statusRef.current = "result";
    strokeRef.current = null;
    setChain(0);
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({
      score: finalScore,
      level: 1,
      won: true,
      isNewBest,
      ...statsRef.current,
    });
  }, [finish, highScore, setHighScore]);

  const timer = useGameTimer({
    mode: "down",
    duration: ROUND_SECONDS,
    onExpire: endGame,
  });
  const elapsed = ROUND_SECONDS - timer.time;
  elapsedRef.current = elapsed;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const commitBubbles = (next) => {
    bubblesRef.current = next;
    setBubbles(next);
  };

  // Per-frame game step: let escaped bubbles go (no penalty), spawn new ones.
  useEffect(() => {
    if (status !== "playing") return;

    const prev = bubblesRef.current;
    let next = prev.filter((b) => elapsed - b.bornAt < b.lifetime);
    let changed = next.length !== prev.length;

    if (elapsed >= nextSpawnRef.current) {
      const progress = elapsed / ROUND_SECONDS;
      nextSpawnRef.current = elapsed + Math.max(MIN_SPAWN_GAP, BASE_SPAWN_GAP - progress * 0.35);
      next = [...next, spawnBubble(areaRef.current, elapsed, progress)];
      changed = true;
    }
    if (changed) commitBubbles(next);

    setPopups((current) => {
      const alive = current.filter((p) => elapsed - p.bornAt < POPUP_SECONDS);
      return alive.length !== current.length ? alive : current;
    });
  }, [elapsed, status]);

  // Pops one bubble (and, for a burst bubble, everything around it). Returns
  // the new bubble list so a whole swipe/burst commits in one render.
  const popBubble = (list, id, areaRect, fromBurst = false) => {
    const bubble = list.find((b) => b.id === id);
    if (!bubble) return list;
    const el = areaRef.current?.querySelector(`[data-bubble-id="${id}"]`);
    const rect = el?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 0;
    const cy = rect ? rect.top + rect.height / 2 : 0;
    let next = list.filter((b) => b.id !== id);

    const stats = statsRef.current;
    stats.popped += 1;
    let gained = bubble.type.points;
    let text;
    if (fromBurst) {
      text = `+${gained}`;
    } else {
      const stroke = strokeRef.current;
      if (stroke) {
        stroke.count += 1;
        stats.bestChain = Math.max(stats.bestChain, stroke.count);
        setChain(stroke.count);
        gained += Math.min(MAX_CHAIN_BONUS, (stroke.count - 1) * CHAIN_BONUS);
      }
      text = bubble.type.id === "burst" ? `Burst! +${gained}` : `+${gained}`;
    }
    scoreRef.current += gained;
    setPopups((prev) => [
      ...prev,
      {
        id: ++bubbleUid,
        x: cx - areaRect.left,
        y: cy - areaRect.top,
        text,
        className: bubble.type.id === "normal" ? "text-fluffy-primary" : "text-fluffy-gold",
        bornAt: elapsedRef.current,
      },
    ]);

    if (bubble.type.id === "burst" && !fromBurst && rect) {
      stats.bursts += 1;
      navigator.vibrate?.(30);
      const caught = areaRef.current.querySelectorAll("[data-bubble-id]");
      caught.forEach((other) => {
        const r = other.getBoundingClientRect();
        if (Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy) <= BURST_RADIUS) {
          next = popBubble(next, Number(other.dataset.bubbleId), areaRect, true);
        }
      });
    }
    return next;
  };

  const popAt = (points) => {
    const area = areaRef.current;
    if (!area) return;
    const areaRect = area.getBoundingClientRect();
    let next = bubblesRef.current;
    for (const [x, y] of points) {
      const el = document.elementsFromPoint(x, y).find((node) => node.dataset?.bubbleId && area.contains(node));
      if (el) next = popBubble(next, Number(el.dataset.bubbleId), areaRect);
    }
    if (next !== bubblesRef.current) {
      commitBubbles(next);
      setScore(scoreRef.current);
      navigator.vibrate?.(8);
    }
  };

  const handlePointerDown = (event) => {
    if (statusRef.current !== "playing") return;
    // Capture on the play area so the stroke keeps reporting moves even after
    // the bubble it started on disappears — mouse and touch alike.
    try {
      areaRef.current.setPointerCapture(event.pointerId);
    } catch {
      // Capture is only an optimisation; moves still bubble up to the area.
    }
    strokeRef.current = {
      pointerId: event.pointerId,
      count: 0,
      x: event.clientX,
      y: event.clientY,
    };
    setChain(0);
    popAt([[event.clientX, event.clientY]]);
  };

  const handlePointerMove = (event) => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId || statusRef.current !== "playing") return;
    const dx = event.clientX - stroke.x;
    const dy = event.clientY - stroke.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SWIPE_STEP_PX));
    const points = [];
    for (let i = 1; i <= steps; i++) points.push([stroke.x + (dx * i) / steps, stroke.y + (dy * i) / steps]);
    stroke.x = event.clientX;
    stroke.y = event.clientY;
    popAt(points);
  };

  const handlePointerEnd = (event) => {
    if (strokeRef.current?.pointerId !== event.pointerId) return;
    strokeRef.current = null;
    setChain(0);
  };

  const beginGame = useCallback(() => {
    commitBubbles([]);
    setPopups([]);
    setScore(0);
    setChain(0);
    scoreRef.current = 0;
    strokeRef.current = null;
    statsRef.current = { popped: 0, bestChain: 0, bursts: 0 };
    nextSpawnRef.current = 0.3;
    timer.reset(ROUND_SECONDS);
    timer.start();
    start();
  }, [start, timer]);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      strokeRef.current = null;
      setChain(0);
      pause();
      timer.pause();
    }
  };

  if (mode === "together") return <BubbleRace onGameComplete={onGameComplete} onSwitchMode={() => setMode("solo")} />;

  return (
    <GameShell
      title="Bubble Pop"
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
            title="Bubbles popped!"
            emoji="🫧"
            celebrate={result.isNewBest}
            stats={[
              { label: "Popped", value: result.popped },
              { label: "Best chain", value: result.bestChain },
              { label: "Bursts", value: result.bursts },
            ]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div
        ref={areaRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 overflow-hidden bg-linear-to-b"
      >
        {bubbles.map((bubble) => (
          <button
            key={bubble.id}
            type="button"
            data-bubble-id={bubble.id}
            aria-label={`Pop ${bubble.item.name}, ${bubble.type.points} points${bubble.type.id === "burst" ? ", pops nearby bubbles" : ""}`}
            className={cn(
              "bubble-pop-item font-poppins absolute flex items-center justify-center rounded-full border-[3px] shadow-md",
              bubble.type.className,
            )}
            style={{
              left: bubble.x,
              bottom: bubble.y,
              width: bubble.type.size,
              height: bubble.type.size,
              animationDuration: `${bubble.lifetime}s`,
              animationPlayState: status === "paused" ? "paused" : "running",
              "--rise": `${bubble.rise}px`,
            }}
          >
            <span className="pointer-events-none absolute top-[14%] left-[20%] h-[18%] w-[26%] -rotate-30 rounded-full bg-white/80" />
            <img
              src={bubble.item.src}
              alt=""
              draggable={false}
              className="pointer-events-none h-[62%] w-[62%] object-contain"
            />
            <span
              className={cn(
                "pointer-events-none absolute -bottom-2 rounded-full px-1.5 text-[10px] leading-4 font-black text-white shadow-sm",
                bubble.type.badgeClassName,
              )}
            >
              {bubble.type.badge}
            </span>
          </button>
        ))}

        {popups.map((popup) => (
          <span
            key={popup.id}
            className={cn(
              "whack-float font-poppins pointer-events-none absolute z-10 text-sm font-extrabold whitespace-nowrap drop-shadow-[0_1px_0_#fff]",
              popup.className,
            )}
            style={{ left: popup.x, top: popup.y - 20 }}
          >
            {popup.text}
          </span>
        ))}

        {chain > 1 && status === "playing" && (
          <div className="bg-fluffy-primary pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white">
            Chain x{chain}
          </div>
        )}

        {status === "idle" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Swipe to pop them all!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Drag your finger through the bubbles — the more you pop in one swipe, the bigger the chain bonus. Burst
              bubbles pop everything around them.
            </p>
            <button type="button" className="btn btn-primary" onClick={beginGame}>
              Start
            </button>
            <div className="bg-fluffy-cream w-full max-w-sm rounded-3xl p-4">
              <h3 className="font-poppins text-fluffy-text text-sm font-bold">Play together</h3>
              <p className="text-fluffy-subtext mt-1 text-xs">
                Two players, one screen — race to pop the bubbles in your own half. Kids get bigger, slower bubbles.
              </p>
              <button type="button" className="btn btn-outline mt-3 w-full" onClick={() => setMode("together")}>
                2 players
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}

function spawnBubble(area, elapsed, progress) {
  const width = area?.clientWidth ?? 320;
  const height = area?.clientHeight ?? 420;
  const rise = height + 100;
  const type = pickType();
  const margin = type.size + 10;
  // With reduced motion the rise animation is off (see index.css), so bubbles
  // appear in place at a random height instead of all sitting on the floor.
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return {
    id: ++bubbleUid,
    x: margin + Math.random() * Math.max(0, width - margin * 2),
    y: still ? 10 + Math.random() * Math.max(0, height - type.size - 70) : 0,
    type,
    item: pickRandom(type.items),
    lifetime: Math.max(MIN_LIFETIME, BASE_LIFETIME - progress * 1.1),
    rise,
    bornAt: elapsed,
  };
}
