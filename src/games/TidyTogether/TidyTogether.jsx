import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { formatTime } from "@/games/utils/format";
import { CATEGORY_RULE, nextItem } from "@/games/sorting/sortingCore";

const TOTAL_ITEMS = 24;
const SPAWN_EVERY = 1.7;
// Slow, relaxed falling — nobody loses, it's a tidy-up, not a race.
const FALL_SPEED = 42;
const FALL_RAMP = 1.2; // px/s faster per item spawned
const ITEM_SIZE = 64;
const DONE_FADE = 0.45;
const LANDED_FADE = 0.9;

let uid = 0;

// Co-op tidy-up: items drift down, both players drag them into the right
// basket at the same time. Each item owns its pointer (one usePointerInput
// per item), so two fingers can carry two items simultaneously.
export default function TidyTogether({ onGameComplete }) {
  const containerRef = useRef(null);
  const basketRefs = useRef([]);
  const itemsRef = useRef([]);
  const worldRef = useRef({ spawned: 0, sinceSpawn: 0, tidied: 0, missed: 0, time: 0, lastAsset: null });
  const statusRef = useRef("idle");
  const [, setFrame] = useState(0);
  const [tidied, setTidied] = useState(0);
  const [wrongBasket, setWrongBasket] = useState(null);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "tidy-together",
    onComplete: onGameComplete,
  });
  const timer = useGameTimer({ mode: "up" });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (wrongBasket === null) return undefined;
    const id = setTimeout(() => setWrongBasket(null), 450);
    return () => clearTimeout(id);
  }, [wrongBasket]);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    statusRef.current = "result";
    timer.pause();
    const { tidied: done, missed } = worldRef.current;
    // Co-op, same contract as the other together modes: flat completion.
    finish({ score: 0, level: done, mode: "together", tidied: done, missed, total: TOTAL_ITEMS, winner: 0 });
  };

  // Simulation loop: spawn, fall, land, fade.
  useEffect(() => {
    let raf;
    let last = null;
    const tick = (now) => {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const container = containerRef.current;
      if (statusRef.current === "playing" && container) {
        const world = worldRef.current;
        world.time += dt;
        const width = container.clientWidth;
        const floor = container.clientHeight - (basketRefs.current[0]?.offsetHeight ?? 110) - 16;

        world.sinceSpawn += dt;
        if (world.spawned < TOTAL_ITEMS && world.sinceSpawn >= SPAWN_EVERY) {
          world.sinceSpawn = 0;
          const entry = nextItem(CATEGORY_RULE, Math.random, world.lastAsset);
          world.lastAsset = entry.asset.id;
          itemsRef.current.push({
            id: ++uid,
            entry,
            x: ITEM_SIZE / 2 + Math.random() * (width - ITEM_SIZE),
            y: -ITEM_SIZE / 2,
            rot: (Math.random() * 2 - 1) * 20,
            speed: FALL_SPEED + world.spawned * FALL_RAMP,
            state: "falling",
            since: world.time,
          });
          world.spawned += 1;
        }

        itemsRef.current.forEach((item) => {
          if (item.state !== "falling") return;
          item.y += item.speed * dt;
          if (item.y >= floor) {
            item.y = floor;
            item.state = "landed";
            item.since = world.time;
            world.missed += 1;
          }
        });
        itemsRef.current = itemsRef.current.filter(
          (item) =>
            !(item.state === "done" && world.time - item.since > DONE_FADE) &&
            !(item.state === "landed" && world.time - item.since > LANDED_FADE),
        );

        if (world.spawned >= TOTAL_ITEMS && itemsRef.current.length === 0) endGameRef.current();
        setFrame((f) => (f + 1) % 1e6);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toLocal = (point) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: point.x - rect.left, y: point.y - rect.top };
  };

  const grab = useCallback((item, point) => {
    if (statusRef.current !== "playing" || item.state !== "falling") return false;
    const local = toLocal(point);
    item.state = "held";
    item.offset = { x: local.x - item.x, y: local.y - item.y };
    return true;
  }, []);

  const drag = useCallback((item, point) => {
    if (item.state !== "held") return;
    const local = toLocal(point);
    const container = containerRef.current;
    item.x = Math.max(ITEM_SIZE / 2, Math.min(container.clientWidth - ITEM_SIZE / 2, local.x - item.offset.x));
    item.y = Math.max(0, Math.min(container.clientHeight - ITEM_SIZE / 2, local.y - item.offset.y));
  }, []);

  const drop = useCallback((item) => {
    if (item.state !== "held") return;
    const container = containerRef.current.getBoundingClientRect();
    const cx = container.left + item.x;
    const cy = container.top + item.y;
    const index = basketRefs.current.findIndex((el) => {
      const r = el?.getBoundingClientRect();
      return r && cx >= r.left - 12 && cx <= r.right + 12 && cy >= r.top - 24 && cy <= r.bottom;
    });
    const world = worldRef.current;
    if (index === -1) {
      item.state = "falling";
      return;
    }
    if (CATEGORY_RULE.bins[index].id === item.entry.bin) {
      item.state = "done";
      item.since = world.time;
      world.tidied += 1;
      setTidied(world.tidied);
      navigator.vibrate?.(12);
    } else {
      // Gentle "not here": pop back up and keep falling.
      item.state = "falling";
      item.y = Math.max(0, item.y - 70);
      setWrongBasket(index);
      navigator.vibrate?.([20, 40, 20]);
    }
  }, []);

  const beginGame = useCallback(() => {
    itemsRef.current = [];
    worldRef.current = { spawned: 0, sinceSpawn: SPAWN_EVERY - 0.4, tidied: 0, missed: 0, time: 0, lastAsset: null };
    setTidied(0);
    timer.reset();
    timer.start();
    statusRef.current = "playing";
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

  const spawned = worldRef.current.spawned;

  return (
    <GameShell
      title="Tidy Together"
      score={`${tidied}/${TOTAL_ITEMS}`}
      scoreLabel="Tidied"
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={result.tidied >= TOTAL_ITEMS * 0.9 ? "Spotless room!" : "Nice teamwork!"}
            emoji="🧹"
            scoreLabel="Tidied together"
            score={`${result.tidied} / ${result.total}`}
            stats={[
              { label: "On the floor", value: result.missed },
              { label: "Time", value: `${result.duration}s` },
            ]}
            shareText={`We tidied ${result.tidied} of ${result.total} things together in Tidy Together on Fluffy Play! 🧹`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div ref={containerRef} className="touch-none-game absolute inset-0 overflow-hidden bg-[#fdf6ec]">
        <div className="bg-fluffy-cream absolute inset-x-0 top-0 h-[45%]" aria-hidden="true" />
        <div className="border-fluffy-bg absolute top-[8%] right-[8%] h-[18%] w-[24%] rounded-xl border-[6px] bg-[#d6ecfa]" aria-hidden="true" />

        {status === "idle" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <div className="flex gap-3" aria-hidden="true">
              {CATEGORY_RULE.bins.map((bin) => (
                <img key={bin.id} src={bin.asset.src} alt="" className="h-12 w-12" draggable={false} />
              ))}
            </div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Tidy up together!</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Things are tumbling down — drag each one into the right basket before it lands. Two people can drag at the
              same time, so team up! Nobody loses; see how tidy you can get the room.
            </p>
            <button type="button" className="btn btn-primary" onClick={beginGame}>
              Start
            </button>
          </div>
        )}

        {status !== "idle" && (
          <div className="text-fluffy-subtext pointer-events-none absolute top-3 left-3 rounded-full bg-white/80 px-3 py-1 text-xs font-bold">
            {Math.max(0, TOTAL_ITEMS - spawned)} left to fall
          </div>
        )}

        {itemsRef.current.map((item) => (
          <FallingItem key={item.id} item={item} onGrab={grab} onDrag={drag} onDrop={drop} />
        ))}

        {/* sm:bottom-10 keeps the baskets clear of GameShell's ~32px overflow on desktop. */}
        <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-3 sm:bottom-10">
          {CATEGORY_RULE.bins.map((bin, index) => (
            <div
              key={bin.id}
              ref={(el) => (basketRefs.current[index] = el)}
              className={cn(
                "bg-fluffy-bg/90 ring-fluffy-border flex h-[110px] flex-col items-center justify-center gap-1 rounded-2xl shadow-sm ring-2 transition-transform",
                wrongBasket === index && "ring-fluffy-warning animate-[shake_0.3s_ease-in-out]",
              )}
            >
              <img src={bin.asset.src} alt="" draggable={false} className="h-10 w-10" />
              <span className="text-fluffy-text text-sm font-bold">{bin.label}</span>
            </div>
          ))}
        </div>
      </div>
    </GameShell>
  );
}

function FallingItem({ item, onGrab, onDrag, onDrop }) {
  const pointer = usePointerInput({
    onStart: useCallback((point) => onGrab(item, point), [item, onGrab]),
    onMove: useCallback((point) => onDrag(item, point), [item, onDrag]),
    onEnd: useCallback(() => onDrop(item), [item, onDrop]),
  });
  const held = item.state === "held";
  return (
    <div
      {...pointer}
      aria-label={item.entry.asset.name}
      className={cn(
        "absolute z-10 flex touch-none items-center justify-center",
        held && "z-20 scale-110 drop-shadow-xl",
        item.state === "done" && "tidy-done pointer-events-none",
        item.state === "landed" && "pointer-events-none opacity-40",
      )}
      style={{
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        left: item.x - ITEM_SIZE / 2,
        top: item.y - ITEM_SIZE / 2,
        transform: held ? "scale(1.12)" : `rotate(${item.rot}deg)`,
      }}
    >
      <img src={item.entry.asset.src} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain drop-shadow-[0_3px_3px_rgba(75,85,99,0.25)]" />
    </div>
  );
}
