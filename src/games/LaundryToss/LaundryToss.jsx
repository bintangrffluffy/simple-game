import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useTallStage } from "@/games/hooks/useTallStage";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { formatTime } from "@/games/utils/format";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";

const STAGE_WIDTH = 380;
// Width is fixed; the height stretches to the device (useTallStage), never
// below 560 and capped so very tall screens stay playable.
const BASE_HEIGHT = 560;
const MAX_HEIGHT = 900;
const ROUND_SECONDS = 60;
const GRAVITY = 1500;
const SPAWN = { x: STAGE_WIDTH / 2, y: 470 };
// Where a held item may be dragged before the flick (the "throwing zone").
const HOLD_ZONE = { minX: 40, maxX: STAGE_WIDTH - 40, minY: 380, maxY: 520 };
const ITEM_SIZE = 56;
const BASKET_SIZE = 128;
const BASKET_Y = 150;
// The rim's opening, relative to the basket sprite: an item has to drop
// through this line from above to count.
const RIM_OFFSET = -18;
const RIM_HALF = BASKET_SIZE * 0.36;
// Flick velocity: pointer speed (stage px/s) × gain, capped.
const FLICK_GAIN = 0.9;
const MAX_LAUNCH = 1400;
const MIN_UP_SPEED = 300;
const FLICK_WINDOW_MS = 90;
// Held still this long before lifting = a drop, not a throw.
const STOP_MS = 80;
const POINTS = 10;
// Wind starts after this many baskets, then changes with every basket.
const WIND_AFTER = 5;
const MAX_WIND = 140;

export default function LaundryToss({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const statsRef = useRef({ baskets: 0, throws: 0, bestStreak: 0 });
  const apiRef = useRef(null);
  const samplesRef = useRef([]);

  const [score, setScore] = useState(0);
  const [wind, setWind] = useState(0);
  const [hasThrown, setHasThrown] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [highScore, setHighScore] = useHighScore("laundry-toss");
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "laundry-toss",
    onComplete: onGameComplete,
  });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level: statsRef.current.baskets, won: true, isNewBest, ...statsRef.current });
  };
  const timer = useGameTimer({ mode: "down", duration: ROUND_SECONDS, onExpire: () => endGameRef.current() });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const onScoreRef = useRef(() => {});
  onScoreRef.current = (points, nextWind) => {
    scoreRef.current += points;
    setScore(scoreRef.current);
    setWind(nextWind);
  };

  // Full-height stage; frozen during a run (a new height remounts Kaboom).
  const { areaRef, height: stageHeight, pixelDensity, boxStyle } = useTallStage({
    width: STAGE_WIDTH,
    baseHeight: BASE_HEIGHT,
    maxHeight: MAX_HEIGHT,
    canResize: status === "idle",
  });

  const setup = useCallback((k) => {
    // Kaboom pins the canvas to W×H CSS px; let it follow the fitted box.
    k.canvas.style.width = "100%";
    k.canvas.style.height = "100%";
    // A remount (new stage height) must wait for its own scene.
    setAssetsReady(false);
    loadAssetCanvases([...gameAssets.products, gameAssets.decorative.basket], { crop: true, size: 160 })
      .then((canvases) => {
        if (!k.canvas.isConnected) return;
        Object.entries(canvases).forEach(([id, canvas]) => k.loadSprite(id, canvas));
        buildScene(canvases);
        setAssetsReady(true);
      })
      .catch((err) => console.error("Laundry Toss: failed to load art", err));

    function spriteFor(id, canvases, size) {
      const { width, height } = canvases[id];
      const scale = size / Math.max(width, height);
      return k.sprite(id, { width: width * scale, height: height * scale });
    }

    // Extra height (a tall phone) goes above the scene as more wall, so the
    // throw — spawn to basket — stays exactly the same distance.
    const dy = stageHeight - BASE_HEIGHT;
    const spawn = { x: SPAWN.x, y: SPAWN.y + dy };
    const holdZone = { ...HOLD_ZONE, minY: HOLD_ZONE.minY + dy, maxY: HOLD_ZONE.maxY + dy };
    const basketY = BASKET_Y + dy;

    function buildScene(canvases) {
      k.setGravity(GRAVITY);
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      // Soft laundry-room backdrop: wall, floor, a window — drawn, not objects.
      k.add([
        k.z(-100),
        {
          draw() {
            k.drawRect({ pos: k.vec2(0, 0), width: STAGE_WIDTH, height: stageHeight, color: k.rgb("#eaf4fb") });
            k.drawRect({ pos: k.vec2(0, 330 + dy), width: STAGE_WIDTH, height: stageHeight - 330 - dy, color: k.rgb("#fdf6ec") });
            k.drawRect({ pos: k.vec2(0, 326 + dy), width: STAGE_WIDTH, height: 6, color: k.rgb("#d6e9f8") });
            k.drawRect({ pos: k.vec2(26, 40 + dy), width: 90, height: 70, radius: 10, color: k.rgb("#ffffff") });
            k.drawRect({ pos: k.vec2(32, 46 + dy), width: 78, height: 58, radius: 6, color: k.rgb("#cfe6f7") });
            k.drawEllipse({ pos: k.vec2(spawn.x, 505 + dy), radiusX: 70, radiusY: 12, color: k.rgb("#d6e9f8"), opacity: 0.8 });
          },
        },
      ]);

      const basket = k.add([k.pos(STAGE_WIDTH / 2, basketY), spriteFor("basket", canvases, BASKET_SIZE), k.anchor("center"), k.z(5)]);
      k.add([
        k.z(1),
        {
          draw() {
            k.drawEllipse({ pos: k.vec2(basket.pos.x, basketY + BASKET_SIZE * 0.42), radiusX: 46, radiusY: 8, color: k.rgb("#4b5563"), opacity: 0.12 });
          },
        },
      ]);

      // One recycled laundry item (never destroyed mid-update — see
      // CLAUDE.md's Kaboom note). gravityScale 0 = held / waiting.
      const item = k.add([
        k.pos(spawn.x, spawn.y),
        spriteFor(gameAssets.products[0].id, canvases, ITEM_SIZE),
        k.anchor("center"),
        k.area(),
        k.body({ gravityScale: 0 }),
        k.rotate(0),
        k.scale(1),
        k.opacity(1),
        k.z(10),
        "laundry",
      ]);

      // mode: ready (waiting / held) -> flying -> done (scored or missed)
      const state = { mode: "ready", time: 0, baskets: 0, streak: 0, wind: 0, prevY: spawn.y, spin: 0 };

      function popup(text, pos, hex) {
        k.add([k.pos(pos), k.text(text, { size: 22 }), k.color(k.rgb(hex)), k.anchor("center"), k.opacity(1), k.lifespan(0.7, { fade: 0.4 }), k.z(30), "popup"]);
      }
      k.onUpdate("popup", (p) => {
        if (!reduceMotion) p.pos.y -= 40 * k.dt();
      });

      function nextItem() {
        const product = gameAssets.products[k.randi(gameAssets.products.length)];
        item.use(spriteFor(product.id, canvases, ITEM_SIZE));
        item.pos = k.vec2(spawn.x, spawn.y);
        item.vel = k.vec2(0, 0);
        item.gravityScale = 0;
        item.angle = 0;
        item.scale = k.vec2(1);
        item.opacity = 1;
        item.z = 10;
        state.mode = "ready";
      }

      function settle(scored) {
        state.mode = "done";
        item.gravityScale = 0;
        item.vel = k.vec2(0, 0);
        if (scored) {
          state.baskets += 1;
          state.streak += 1;
          const points = POINTS + Math.min(10, (state.streak - 1) * 2);
          if (state.baskets >= WIND_AFTER) state.wind = Math.round(k.rand(-MAX_WIND, MAX_WIND));
          const stats = statsRef.current;
          stats.baskets = state.baskets;
          stats.bestStreak = Math.max(stats.bestStreak, state.streak);
          onScoreRef.current(points, state.wind);
          popup(`+${points}`, k.vec2(basket.pos.x, basketY - 60), "#60bb8f");
          item.opacity = 0;
          navigator.vibrate?.(15);
        } else {
          state.streak = 0;
          popup("Miss", k.vec2(k.clamp(item.pos.x, 40, STAGE_WIDTH - 40), 300 + dy), "#6b7280");
        }
        k.wait(0.45, nextItem);
      }

      k.onUpdate(() => {
        if (statusRef.current !== "playing") return;
        const dt = k.dt();
        state.time += dt;

        // The basket drifts side to side, a little faster with every basket.
        const speed = Math.min(1.6, 0.6 + state.baskets * 0.08);
        const x = STAGE_WIDTH / 2 + Math.sin(state.time * speed) * (STAGE_WIDTH / 2 - BASKET_SIZE / 2 - 12);
        basket.pos.x = x;

        if (state.mode !== "flying") return;
        item.vel.x += state.wind * dt;
        item.angle += state.spin * dt;
        // Fake depth: the item shrinks as it flies "away" toward the basket.
        const depth = k.clamp((spawn.y - item.pos.y) / (spawn.y - basketY), 0, 1);
        item.scale = k.vec2(1 - depth * 0.35);
        // Past the top of the arc it drops behind the basket's front.
        if (item.vel.y > 0) item.z = 4;

        const rimY = basket.pos.y + RIM_OFFSET;
        const crossedRim = state.prevY < rimY && item.pos.y >= rimY && item.vel.y > 0;
        if (crossedRim && Math.abs(item.pos.x - basket.pos.x) < RIM_HALF) settle(true);
        else if (item.pos.y > stageHeight + 60 || item.pos.x < -80 || item.pos.x > STAGE_WIDTH + 80) settle(false);
        state.prevY = item.pos.y;
      });

      const toStage = (point) => {
        const rect = k.canvas.getBoundingClientRect();
        return k.vec2(((point.x - rect.left) * STAGE_WIDTH) / rect.width, ((point.y - rect.top) * stageHeight) / rect.height);
      };

      apiRef.current = {
        canHold: () => state.mode === "ready",
        hold(point) {
          const p = toStage(point);
          item.pos = k.vec2(k.clamp(p.x, holdZone.minX, holdZone.maxX), k.clamp(p.y, holdZone.minY, holdZone.maxY));
        },
        // velocity in client px/s -> stage px/s
        release(velocity) {
          const rect = k.canvas.getBoundingClientRect();
          let v = k.vec2((velocity.x * STAGE_WIDTH) / rect.width, (velocity.y * stageHeight) / rect.height).scale(FLICK_GAIN);
          if (v.y > -MIN_UP_SPEED) {
            item.pos = k.vec2(spawn.x, spawn.y);
            return false;
          }
          if (v.len() > MAX_LAUNCH) v = v.unit().scale(MAX_LAUNCH);
          item.vel = v;
          item.gravityScale = 1;
          state.spin = v.x * 0.4;
          state.prevY = item.pos.y;
          state.mode = "flying";
          statsRef.current.throws += 1;
          return true;
        },
        reset() {
          k.destroyAll("popup");
          Object.assign(state, { time: 0, baskets: 0, streak: 0, wind: 0 });
          nextItem();
        },
      };
    }
  }, [stageHeight]);

  const { containerRef, kRef } = useKaboomStage({
    width: STAGE_WIDTH,
    height: stageHeight,
    background: "#eaf4fb",
    setup,
    pixelDensity,
  });

  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  // Flick input: drag the item around the throwing zone, release to throw.
  // Velocity comes from the last ~90ms of pointer movement.
  const pointer = usePointerInput({
    onStart: useCallback((point, event) => {
      if (statusRef.current !== "playing" || !apiRef.current?.canHold()) return;
      samplesRef.current = [{ ...point, t: event.timeStamp }];
      apiRef.current.hold(point);
    }, []),
    onMove: useCallback((point, event) => {
      if (!samplesRef.current.length) return;
      samplesRef.current.push({ ...point, t: event.timeStamp });
      apiRef.current.hold(point);
    }, []),
    onEnd: useCallback((point, event) => {
      const samples = samplesRef.current;
      samplesRef.current = [];
      if (!samples.length || statusRef.current !== "playing") return;
      // pointerup usually repeats the last move's position, so measure up to
      // the last *move*; a finger that paused before lifting didn't flick.
      const last = samples[samples.length - 1];
      const paused = event.timeStamp - last.t > STOP_MS;
      const first = samples.find((s) => last.t - s.t <= FLICK_WINDOW_MS) ?? samples[0];
      const dt = Math.max(16, last.t - first.t) / 1000;
      const thrown = apiRef.current.release(paused ? { x: 0, y: 0 } : { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt });
      if (thrown) setHasThrown(true);
    }, []),
  });

  const beginGame = useCallback(() => {
    scoreRef.current = 0;
    statsRef.current = { baskets: 0, throws: 0, bestStreak: 0 };
    setScore(0);
    setWind(0);
    setHasThrown(false);
    timer.reset(ROUND_SECONDS);
    timer.start();
    statusRef.current = "playing";
    start();
    apiRef.current?.reset();
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

  const windLabel = wind === 0 ? null : `${wind < 0 ? "←" : "→"} ${Math.abs(wind) > 90 ? "Strong" : Math.abs(wind) > 40 ? "Breezy" : "Light"} wind`;

  return (
    <GameShell
      title="Laundry Toss"
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
            title={result.baskets > 0 ? "Laundry day done!" : "Almost! Try again"}
            emoji="🧺"
            celebrate={result.isNewBest}
            stats={[
              { label: "Baskets", value: result.baskets },
              { label: "Throws", value: result.throws },
              { label: "Best streak", value: result.bestStreak },
            ]}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div ref={areaRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative overflow-hidden framed:rounded-2xl" style={boxStyle}>
          <div ref={containerRef} className="touch-none-game absolute inset-0" {...pointer} />

          {windLabel && status === "playing" && (
            <div
              className="font-poppins text-fluffy-text pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/85 px-3 py-1 text-xs font-bold shadow-sm"
              aria-live="polite"
            >
              💨 {windLabel}
            </div>
          )}
          {status === "playing" && !hasThrown && (
            <div className="text-fluffy-subtext pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-bold">
              Swipe the clothes up into the basket
            </div>
          )}

          {status === "idle" && (
            <div className="bg-fluffy-cream/90 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Toss the laundry!</h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Flick the clothes up into the basket — it moves, so aim ahead. After a few baskets the wind starts to
                blow. You have {ROUND_SECONDS} seconds.
              </p>
              <button type="button" className="btn btn-primary" onClick={beginGame} disabled={!assetsReady}>
                {assetsReady ? "Start" : "Loading…"}
              </button>
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}
