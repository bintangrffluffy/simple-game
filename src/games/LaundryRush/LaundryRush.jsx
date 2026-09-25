import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import ColorShape from "@/games/components/ColorShape";
import DailyModeButton from "@/games/components/DailyModeButton";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { formatTime } from "@/games/utils/format";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { CATEGORY_RULE, colorRule, nextItem } from "@/games/sorting/sortingCore";

const ROUND_SECONDS = 60;
// The rule flips (type <-> color) after this many items.
const RULE_EVERY = 10;
const SWIPE_DISTANCE = 40;
const FEEDBACK_SECONDS = 0.28;
const BANNER_SECONDS = 1.4;
// Each item must be sorted before its ring runs out; it speeds up slowly.
function itemSeconds(sorted) {
  return Math.max(1.6, 3.2 - sorted * 0.04);
}
function pointsFor(combo) {
  return 10 + Math.min(20, Math.floor(combo / 5) * 5);
}

// Bins sit left / bottom / right; a swipe in that direction sorts into it.
const DIRECTIONS = ["left", "down", "right"];
const DIRECTION_ICONS = { left: ArrowLeft, down: ArrowDown, right: ArrowRight };
const KEYS = { ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 };

export default function LaundryRush({ onGameComplete }) {
  const [daily, setDaily] = useState(false);
  const [rule, setRule] = useState(CATEGORY_RULE);
  const [item, setItem] = useState(() => nextItem(CATEGORY_RULE));
  // item -> feedback -> item ...; every RULE_EVERY items: banner -> item
  const [phase, setPhase] = useState("item");
  const [phaseUntil, setPhaseUntil] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);

  const rngRef = useRef(Math.random);
  const statsRef = useRef({ sorted: 0, misses: 0, bestCombo: 0 });
  const countRef = useRef(0);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const swipeRef = useRef(null);

  const [highScore, setHighScore] = useHighScore("laundry-rush");
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("laundry-rush"));
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "laundry-rush",
    onComplete: onGameComplete,
  });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > (daily ? dailyBest : highScore);
    if (daily) setDailyBest(finalScore);
    setHighScore(finalScore);
    finish({
      score: finalScore,
      level: statsRef.current.sorted,
      mode: daily ? "daily" : "classic",
      date: daily ? todayKey() : undefined,
      isNewBest,
      ...statsRef.current,
    });
  };
  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: () => endGameRef.current() });
  const elapsed = ROUND_SECONDS - timer.time;

  const sort = useCallback(
    (binIndex, timedOut = false) => {
      if (status !== "playing" || phase !== "item") return;
      const bin = rule.bins[binIndex];
      const correct = !timedOut && bin?.id === item.bin;
      const stats = statsRef.current;
      if (correct) {
        comboRef.current += 1;
        stats.sorted += 1;
        stats.bestCombo = Math.max(stats.bestCombo, comboRef.current);
        scoreRef.current += pointsFor(comboRef.current);
        setScore(scoreRef.current);
        navigator.vibrate?.(10);
      } else {
        comboRef.current = 0;
        stats.misses += 1;
        navigator.vibrate?.([20, 40, 20]);
      }
      setCombo(comboRef.current);
      setFeedback({ binIndex: timedOut ? -1 : binIndex, correct, timedOut, answer: rule.bins.findIndex((b) => b.id === item.bin) });
      setPhase("feedback");
      setPhaseUntil(elapsed + FEEDBACK_SECONDS * (correct ? 1 : 2));
    },
    [elapsed, item, phase, rule, status],
  );

  // Phase transitions and the per-item countdown run on round time, so
  // pausing freezes them too.
  useEffect(() => {
    if (status !== "playing" || elapsed < phaseUntil) return;
    const rng = rngRef.current;
    if (phase === "item") {
      sort(-1, true);
    } else if (phase === "feedback") {
      countRef.current += 1;
      setFeedback(null);
      if (countRef.current % RULE_EVERY === 0) {
        const nextRule = rule.id === "category" ? colorRule(rng) : CATEGORY_RULE;
        setRule(nextRule);
        setItem(nextItem(nextRule, rng));
        setPhase("banner");
        setPhaseUntil(elapsed + BANNER_SECONDS);
      } else {
        setItem((current) => nextItem(rule, rng, current.asset.id));
        setPhase("item");
        setPhaseUntil(elapsed + itemSeconds(statsRef.current.sorted));
      }
    } else if (phase === "banner") {
      setPhase("item");
      setPhaseUntil(elapsed + itemSeconds(statsRef.current.sorted));
    }
  }, [elapsed, phase, phaseUntil, rule, sort, status]);

  // Stable handle for input handlers: `sort` changes every frame (it reads
  // round time), the listeners below shouldn't.
  const sortRef = useRef(sort);
  sortRef.current = sort;

  // Optional keyboard enhancement; swipes and bin taps are the real controls.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key in KEYS) {
        e.preventDefault();
        sortRef.current(KEYS[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const swipe = usePointerInput({
    onStart: useCallback((point) => {
      swipeRef.current = { ...point, done: false };
    }, []),
    onMove: useCallback((point) => {
      const s = swipeRef.current;
      if (!s || s.done) return;
      const dx = point.x - s.x;
      const dy = point.y - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_DISTANCE) return;
      s.done = true;
      if (Math.abs(dx) > Math.abs(dy)) sortRef.current(dx < 0 ? 0 : 2);
      else if (dy > 0) sortRef.current(1);
    }, []),
    onEnd: useCallback(() => {
      swipeRef.current = null;
    }, []),
  });

  const beginGame = useCallback(
    (isDaily) => {
      const rng = isDaily ? dailyRandom("laundry-rush") : Math.random;
      rngRef.current = rng;
      setDaily(isDaily);
      setRule(CATEGORY_RULE);
      setItem(nextItem(CATEGORY_RULE, rng));
      setFeedback(null);
      setPhase("item");
      setPhaseUntil(itemSeconds(0));
      countRef.current = 0;
      scoreRef.current = 0;
      comboRef.current = 0;
      statsRef.current = { sorted: 0, misses: 0, bestCombo: 0 };
      setScore(0);
      setCombo(0);
      timer.reset(ROUND_SECONDS);
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

  const best = daily ? dailyBest : highScore;
  const ringLeft = phase === "item" ? Math.max(0, (phaseUntil - elapsed) / itemSeconds(statsRef.current.sorted)) : 1;
  const flyDir = feedback?.correct ? DIRECTIONS[feedback.binIndex] : null;

  return (
    <GameShell
      title="Laundry Rush"
      score={score}
      best={best}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={best}
            isNewBest={result.isNewBest}
            title="Laundry sorted!"
            emoji="🧺"
            celebrate={result.isNewBest}
            stats={[
              { label: "Sorted", value: result.sorted },
              { label: "Missed", value: result.misses },
              { label: "Best combo", value: result.bestCombo },
            ]}
            shareText={
              result.mode === "daily"
                ? `Laundry Rush · Daily ${result.date}: ${result.score} points, ${result.bestCombo}× best combo 🧺 Same items for everyone today!`
                : undefined
            }
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex gap-3" aria-hidden="true">
              {CATEGORY_RULE.bins.map((bin) => (
                <img key={bin.id} src={bin.asset.src} alt="" className="h-12 w-12" draggable={false} />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Sort it fast!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Swipe each item toward its bin — left, down or right — or tap the bin. Every {RULE_EVERY} items the rule
              flips between sorting by type and by color. One mistake breaks your combo!
            </p>
            <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
              Play
            </button>
            <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />
          </div>
        ) : (
          <div className="flex w-full max-w-[420px] flex-1 flex-col gap-3" {...swipe}>
            <div className="flex items-center justify-between">
              <span className="bg-fluffy-bg text-fluffy-text rounded-full px-3 py-1 text-xs font-bold shadow-sm">{rule.title}</span>
              <span className={cn("rounded-full px-3 py-1 text-xs font-bold", combo >= 5 ? "bg-fluffy-primary text-white" : "text-fluffy-subtext")}>
                Combo ×{combo}
              </span>
            </div>

            <div className="relative grid flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[1fr_auto] items-center gap-2">
              <Bin bin={rule.bins[0]} dir="left" feedback={feedback} index={0} onPick={sort} className="row-start-1" />
              <div className="relative row-start-1 flex min-h-56 items-center justify-center">
                {phase === "banner" ? (
                  <div className="font-poppins find-item-banner bg-fluffy-primary rounded-3xl px-5 py-4 text-center text-white shadow-lg" aria-live="polite">
                    <div className="text-xs font-bold tracking-widest uppercase opacity-80">New rule</div>
                    <div className="text-xl font-extrabold">{rule.title}!</div>
                  </div>
                ) : (
                  <div
                    key={`${countRef.current}-${item.asset.id}`}
                    className={cn(
                      "bg-fluffy-bg relative flex h-40 w-36 flex-col items-center justify-center gap-2 rounded-3xl shadow-md transition-[transform,opacity] duration-200",
                      flyDir === "left" && "-translate-x-24 scale-50 opacity-0",
                      flyDir === "right" && "translate-x-24 scale-50 opacity-0",
                      flyDir === "down" && "translate-y-24 scale-50 opacity-0",
                      feedback && !feedback.correct && "animate-[shake_0.3s_ease-in-out]",
                    )}
                    aria-live="polite"
                  >
                    <TimerRing fraction={ringLeft} danger={ringLeft < 0.35} />
                    <img src={item.asset.src} alt="" draggable={false} className="pointer-events-none h-20 w-20 object-contain" />
                    <span className="text-fluffy-text text-sm font-bold">{item.asset.name}</span>
                    {feedback && !feedback.correct && (
                      <span className="bg-fluffy-danger absolute -top-3 rounded-full px-3 py-0.5 text-xs font-bold text-white">
                        {feedback.timedOut ? "Too slow!" : "Oops!"}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Bin bin={rule.bins[2]} dir="right" feedback={feedback} index={2} onPick={sort} className="row-start-1" />
              <Bin bin={rule.bins[1]} dir="down" feedback={feedback} index={1} onPick={sort} className="col-span-3 row-start-2 mx-auto w-40" />
            </div>
            <p className="text-fluffy-subtext text-center text-xs">Swipe toward a bin, or tap it</p>
          </div>
        )}
      </div>
    </GameShell>
  );
}

function Bin({ bin, dir, index, feedback, onPick, className }) {
  const Arrow = DIRECTION_ICONS[dir];
  const isAnswer = feedback && !feedback.correct && feedback.answer === index;
  const isHit = feedback?.correct && feedback.binIndex === index;
  return (
    <button
      type="button"
      onPointerDown={(e) => {
        e.stopPropagation();
        onPick(index);
      }}
      aria-label={`${bin.label} bin`}
      className={cn(
        "bg-fluffy-bg ring-fluffy-border flex min-h-24 touch-manipulation flex-col items-center justify-center gap-1 rounded-2xl p-2 shadow-sm ring-2 transition-[box-shadow,transform]",
        isHit && "ring-fluffy-success scale-105",
        isAnswer && "ring-fluffy-warning",
        className,
      )}
    >
      {bin.asset ? (
        <img src={bin.asset.src} alt="" draggable={false} className="pointer-events-none h-10 w-10" />
      ) : (
        <ColorShape shape={bin.shape} hex={bin.hex} size={36} />
      )}
      <span className="text-fluffy-text pointer-events-none text-sm font-bold">{bin.label}</span>
      <Arrow size={14} className="text-fluffy-subtext pointer-events-none" aria-hidden="true" />
    </button>
  );
}

function TimerRing({ fraction, danger }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)]"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="92" height="92" rx="20" fill="none" stroke="var(--color-fluffy-border)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx="20"
        fill="none"
        vectorEffect="non-scaling-stroke"
        pathLength={c}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - fraction)}
        stroke={danger ? "var(--color-fluffy-danger)" : "var(--color-fluffy-primary)"}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
