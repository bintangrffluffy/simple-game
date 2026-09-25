import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useTallStage } from "@/games/hooks/useTallStage";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets } from "@/games/assets/gameAssets";
import AssetIcon from "@/games/components/AssetIcon";

const STAGE_WIDTH = 320;
const STAGE_HEIGHT = 460;
const WALL_THICKNESS = 10;
const FLOOR_Y = STAGE_HEIGHT - WALL_THICKNESS;
const DANGER_Y = 66;
const DANGER_HOLD = 1.4;
const DANGER_GRACE = 1;
const GRAVITY = 2200;
// Tiny custom circle solver (see note above TIER_SIZES). Sub-steps plus a
// few position iterations keep a tall pile from sinking into itself.
const SUBSTEPS = 4;
const SOLVER_ITERATIONS = 3;
const RESTITUTION = 0.08;
const FRICTION = 0.35;
const WALL_FRICTION = 0.97;
const AIR_DAMPING = 0.9995;
const DROP_COOLDOWN = 0.4;
// Same-tier fruits merge as soon as they touch. The contact solver keeps touching circles at exactly r1+r2 apart, so the merge check needs a
// little slack past "touching" — requiring real overlap meant resting pairs
// could sit side by side forever without merging.
const MERGE_SLOP = 3;
// Each sprite is cropped to its visible pixels (see loadFruitCanvases), so
// the art fills the physics circle and "looks touching" == "is touching".
const SPRITE_SCALE = 1.04;
const SPRITE_RES = 256;

// Kaboom's body() component is built for platformer gravity (jump/ground),
// not free circle-stacking, so it tends to jitter here. Instead we drive
// gravity/weight/collision ourselves each frame and use Kaboom purely for
// the scene graph, rendering, particles, timers and input.
const TIER_SIZES = [
  { r: 15, points: 2 },
  { r: 20, points: 4 },
  { r: 26, points: 8 },
  { r: 32, points: 14 },
  { r: 39, points: 24 },
  { r: 47, points: 40 },
  { r: 56, points: 65 },
  { r: 65, points: 100 },
];
const TIERS = TIER_SIZES.map((size, i) => ({
  ...size,
  fruit: gameAssets.fruits[i],
  sprite: `fruit-${i}`,
}));
const DROPPABLE_TIERS = [0, 1, 2, 3];

// SVGs load into an <img> at their intrinsic 32px, which looks blurry once
// scaled up. Rasterize each one onto a larger canvas once (cached across
// mounts) and hand Kaboom the canvas instead. The emoji art has uneven
// padding (an apple fills its square, cherries don't), so each one is also
// cropped to a square around its visible pixels.
function cropToContent(src) {
  const { width, height } = src;
  const { data } = src.getContext("2d").getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src;
  const side = Math.max(maxX - minX, maxY - minY) + 1;
  const sx = (minX + maxX + 1) / 2 - side / 2;
  const sy = (minY + maxY + 1) / 2 - side / 2;
  const out = document.createElement("canvas");
  out.width = SPRITE_RES;
  out.height = SPRITE_RES;
  out
    .getContext("2d")
    .drawImage(src, sx, sy, side, side, 0, 0, SPRITE_RES, SPRITE_RES);
  return out;
}
let fruitCanvasesPromise = null;
function loadFruitCanvases() {
  if (!fruitCanvasesPromise) {
    fruitCanvasesPromise = Promise.all(
      TIERS.map(
        (tier) =>
          new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = SPRITE_RES;
              canvas.height = SPRITE_RES;
              canvas
                .getContext("2d", { willReadFrequently: true })
                .drawImage(img, 0, 0, SPRITE_RES, SPRITE_RES);
              resolve(cropToContent(canvas));
            };
            img.onerror = reject;
            img.src = tier.fruit.src;
          }),
      ),
    ).catch((err) => {
      fruitCanvasesPromise = null;
      throw err;
    });
  }
  return fruitCanvasesPromise;
}

function pickNextTier(k) {
  return DROPPABLE_TIERS[k.randi(DROPPABLE_TIERS.length)];
}

export default function FruitMerge({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const dropRef = useRef(() => {});

  const [score, setScore] = useState(0);
  const [nextTier, setNextTier] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [highScore, setHighScore] = useHighScore("fruit-merge");

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "fruit-merge",
    onComplete: onGameComplete,
  });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    finish({ score: finalScore, level: 1, won: true, isNewBest });
  };

  const timer = useGameTimer({ mode: "up" });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const handleScore = useCallback((points) => {
    scoreRef.current += points;
    setScore(scoreRef.current);
  }, []);
  const handleScoreRef = useRef(handleScore);
  handleScoreRef.current = handleScore;

  const handleGameOver = useCallback(() => {
    timer.pause();
    endGameRef.current();
  }, [timer]);
  const handleGameOverRef = useRef(handleGameOver);
  handleGameOverRef.current = handleGameOver;

  const handleNextTierChange = useCallback((tier) => setNextTier(tier), []);
  const handleNextTierRef = useRef(handleNextTierChange);
  handleNextTierRef.current = handleNextTierChange;

  // The box keeps its 320×460 shape (its height is gameplay: how much room
  // the stack has) and is just scaled up to fill the screen.
  const { areaRef, height: stageHeight, pixelDensity, boxStyle } = useTallStage({
    width: STAGE_WIDTH,
    baseHeight: STAGE_HEIGHT,
    canResize: status === "idle",
  });

  const setup = useCallback((k) => {
    // Kaboom pins the canvas to W×H CSS px; let it follow the fitted box.
    k.canvas.style.width = "100%";
    k.canvas.style.height = "100%";
    loadFruitCanvases()
      .then((canvases) => {
        // useKaboomStage detaches the canvas synchronously on unmount
        // (k.onCleanup only fires a frame later), so this is the reliable
        // "this instance is already gone" check under StrictMode remounts.
        if (!k.canvas.isConnected) return;
        canvases.forEach((canvas, i) => k.loadSprite(TIERS[i].sprite, canvas));
        buildScene();
        setAssetsReady(true);
      })
      .catch((err) =>
        console.error("Fruit Merge: failed to load fruit art", err),
      );

    function buildScene() {
      const innerLeft = WALL_THICKNESS;
      const innerRight = STAGE_WIDTH - WALL_THICKNESS;
      let totalTime = 0;
      let dangerTimer = 0;
      let cooldown = 0;
      let nextTierIndex = pickNextTier(k);
      handleNextTierRef.current(nextTierIndex);

      // Container walls (visual only — physics below uses innerLeft/innerRight directly).
      k.add([
        k.pos(0, 0),
        k.rect(WALL_THICKNESS, STAGE_HEIGHT),
        k.color(k.rgb("#d6e9f8")),
      ]);
      k.add([
        k.pos(STAGE_WIDTH - WALL_THICKNESS, 0),
        k.rect(WALL_THICKNESS, STAGE_HEIGHT),
        k.color(k.rgb("#d6e9f8")),
      ]);
      k.add([
        k.pos(0, FLOOR_Y),
        k.rect(STAGE_WIDTH, WALL_THICKNESS),
        k.color(k.rgb("#d6e9f8")),
      ]);
      const dangerLine = k.add([
        k.pos(WALL_THICKNESS, DANGER_Y),
        k.rect(STAGE_WIDTH - WALL_THICKNESS * 2, 2),
        k.color(k.rgb("#e08ba0")),
        k.opacity(0.5),
      ]);

      function fruitSprite(tierIndex) {
        const size = TIERS[tierIndex].r * 2 * SPRITE_SCALE;
        return k.sprite(TIERS[tierIndex].sprite, { width: size, height: size });
      }

      const aim = k.add([
        k.pos(STAGE_WIDTH / 2, 34),
        fruitSprite(nextTierIndex),
        k.opacity(0.6),
        k.anchor("center"),
        k.z(5),
      ]);

      function setAimTier(tierIndex) {
        aim.use(fruitSprite(tierIndex));
      }

      function clampAimX(x) {
        const r = TIERS[nextTierIndex].r;
        return Math.min(Math.max(x, innerLeft + r), innerRight - r);
      }

      function moveAim(x) {
        aim.pos.x = clampAimX(x);
      }

      k.onMouseMove((pos) => moveAim(pos.x));
      k.onTouchMove((pos) => moveAim(pos.x));
      k.onKeyDown("left", () => moveAim(aim.pos.x - 6));
      k.onKeyDown("right", () => moveAim(aim.pos.x + 6));

      function spawnFruit(x, y, tierIndex, vx = 0, vy = 0) {
        return k.add([
          k.pos(x, y),
          fruitSprite(tierIndex),
          k.scale(1),
          k.anchor("center"),
          k.z(1),
          "fruit",
          {
            tierIndex,
            vx,
            vy,
            merging: false,
            spawnedAt: totalTime,
          },
        ]);
      }

      function burst(pos, colorObj, count = 10) {
        for (let i = 0; i < count; i++) {
          const angle = k.rand(0, Math.PI * 2);
          const speed = k.rand(50, 160);
          k.add([
            k.pos(pos),
            k.circle(k.rand(2, 4)),
            k.color(colorObj),
            k.opacity(1),
            k.lifespan(0.45, { fade: 0.35 }),
            k.z(20),
            "particle",
            { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
          ]);
        }
      }
      k.onUpdate("particle", (p) => {
        p.pos.x += p.vx * k.dt();
        p.pos.y += p.vy * k.dt();
      });

      function doDrop() {
        if (statusRef.current !== "playing") return;
        if (cooldown > 0) return;
        spawnFruit(aim.pos.x, aim.pos.y, nextTierIndex);
        cooldown = DROP_COOLDOWN;
        aim.opacity = 0;
        k.wait(DROP_COOLDOWN, () => {
          nextTierIndex = pickNextTier(k);
          setAimTier(nextTierIndex);
          handleNextTierRef.current(nextTierIndex);
          aim.opacity = 0.6;
        });
      }
      dropRef.current = doDrop;

      k.onMousePress(doDrop);
      k.onTouchStart(() => doDrop());
      k.onKeyPress("space", doDrop);

      k.onUpdate(() => {
        if (statusRef.current !== "playing") {
          return;
        }

        const dt = Math.min(k.dt(), 1 / 30);
        totalTime += dt;
        if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);

        const fruits = k.get("fruit").filter((f) => !f.merging);
        const h = dt / SUBSTEPS;

        for (let step = 0; step < SUBSTEPS; step++) {
          // Integrate gravity.
          for (const f of fruits) {
            f.vy += GRAVITY * h;
            f.vx *= AIR_DAMPING;
            f.vy *= AIR_DAMPING;
            f.pos.x += f.vx * h;
            f.pos.y += f.vy * h;
          }

          // Circle-circle contacts. Mass grows with area, so a big fruit
          // shoves small ones aside instead of the other way around.
          // Low restitution kills the bounce and Coulomb friction lets fruit
          // roll/slide into gaps, so the pile packs tight instead of
          // hovering or sinking into itself.
          for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
            for (let i = 0; i < fruits.length; i++) {
              const a = fruits[i];
              const ra = TIERS[a.tierIndex].r;
              const invA = 1 / (ra * ra);
              for (let j = i + 1; j < fruits.length; j++) {
                const b = fruits[j];
                const rb = TIERS[b.tierIndex].r;
                const dx = b.pos.x - a.pos.x;
                const dy = b.pos.y - a.pos.y;
                const minDist = ra + rb;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq) || 0.001;
                const nx = dx / dist;
                const ny = dy / dist;
                const invB = 1 / (rb * rb);
                const invSum = invA + invB;

                const correction = (minDist - dist) / invSum;
                a.pos.x -= nx * correction * invA;
                a.pos.y -= ny * correction * invA;
                b.pos.x += nx * correction * invB;
                b.pos.y += ny * correction * invB;

                if (iter > 0) continue;
                const rvx = b.vx - a.vx;
                const rvy = b.vy - a.vy;
                const vn = rvx * nx + rvy * ny;
                if (vn >= 0) continue;
                const jn = (-(1 + RESTITUTION) * vn) / invSum;
                const tx = -ny;
                const ty = nx;
                const vt = rvx * tx + rvy * ty;
                const jtMax = FRICTION * jn;
                const jt = Math.max(-jtMax, Math.min(jtMax, -vt / invSum));
                const ix = nx * jn + tx * jt;
                const iy = ny * jn + ty * jt;
                a.vx -= ix * invA;
                a.vy -= iy * invA;
                b.vx += ix * invB;
                b.vy += iy * invB;
              }
            }

            // Walls + floor.
            for (const f of fruits) {
              const r = TIERS[f.tierIndex].r;
              if (f.pos.x - r < innerLeft) {
                f.pos.x = innerLeft + r;
                if (f.vx < 0) f.vx *= -RESTITUTION;
                f.vy *= WALL_FRICTION;
              } else if (f.pos.x + r > innerRight) {
                f.pos.x = innerRight - r;
                if (f.vx > 0) f.vx *= -RESTITUTION;
                f.vy *= WALL_FRICTION;
              }
              if (f.pos.y + r > FLOOR_Y) {
                f.pos.y = FLOOR_Y - r;
                if (f.vy > 0) f.vy *= -RESTITUTION;
                f.vx *= WALL_FRICTION;
              }
            }
          }
        }

        // Merge detection, once per frame after the pile has been solved.
        for (let i = 0; i < fruits.length; i++) {
          const a = fruits[i];
          if (a.merging) continue;
          for (let j = i + 1; j < fruits.length; j++) {
            const b = fruits[j];
            if (b.merging || a.tierIndex !== b.tierIndex) continue;

            const dx = b.pos.x - a.pos.x;
            const dy = b.pos.y - a.pos.y;
            const mergeDist = TIERS[a.tierIndex].r * 2 + MERGE_SLOP;
            if (dx * dx + dy * dy >= mergeDist * mergeDist) continue;

            a.merging = true;
            b.merging = true;
            const midX = (a.pos.x + b.pos.x) / 2;
            const midY = (a.pos.y + b.pos.y) / 2;
            const mergedColor = k.rgb(TIERS[a.tierIndex].fruit.color);
            burst({ x: midX, y: midY }, mergedColor, 12);
            k.destroy(a);
            k.destroy(b);

            const nextIndex = a.tierIndex + 1;
            if (nextIndex < TIERS.length) {
              const created = spawnFruit(
                midX,
                midY,
                nextIndex,
                (a.vx + b.vx) / 2,
                0,
              );
              created.pos.x = Math.min(
                Math.max(created.pos.x, innerLeft + TIERS[nextIndex].r),
                innerRight - TIERS[nextIndex].r,
              );
              // Small "pop" as the bigger fruit appears.
              created.scale = k.vec2(0.7);
              k.tween(
                0.7,
                1,
                0.18,
                (v) => (created.scale = k.vec2(v)),
                k.easings.easeOutBack,
              );
              handleScoreRef.current(TIERS[a.tierIndex].points);
            } else {
              handleScoreRef.current(TIERS[a.tierIndex].points * 2);
            }
            // `a` is gone — stop pairing it, or it could merge a second
            // time with another neighbour in this same pass.
            break;
          }
        }

        // Danger line: any fruit that has had time to fall past it (grace
        // period covers the drop itself) but still pokes above it counts.
        // No "must be at rest" check — a crowded pile never fully stops
        // jiggling, which used to let an overflowing box go on forever. The
        // timer decays instead of resetting so one-frame wobbles don't
        // restart the countdown.
        const hasOverflow = fruits.some(
          (f) =>
            !f.merging &&
            totalTime - f.spawnedAt > DANGER_GRACE &&
            f.pos.y - TIERS[f.tierIndex].r < DANGER_Y,
        );
        dangerTimer = hasOverflow
          ? dangerTimer + dt
          : Math.max(0, dangerTimer - dt * 2);
        dangerLine.opacity =
          dangerTimer > 0 ? 0.55 + 0.45 * Math.sin(totalTime * 14) : 0.5;
        if (dangerTimer >= DANGER_HOLD) {
          dangerTimer = 0;
          handleGameOverRef.current();
        }
      });
    }
  }, []);

  const { containerRef, kRef } = useKaboomStage({
    width: STAGE_WIDTH,
    // Undefined until measured, so Kaboom mounts once, at the right density.
    height: stageHeight,
    background: "#eaf4fb",
    setup,
    pixelDensity,
  });

  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  const beginGame = useCallback(() => {
    scoreRef.current = 0;
    setScore(0);
    timer.reset(0);
    timer.start();
    start();
    kRef.current?.destroyAll("fruit");
    kRef.current?.destroyAll("particle");
  }, [kRef, start, timer]);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      pause();
      timer.pause();
    }
  };

  const previewTier = TIERS[nextTier];

  return (
    <GameShell
      title="Fruit Merge"
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
            title="Stack complete!"
            emoji="🍇"
            celebrate={result.isNewBest}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div ref={areaRef} className="absolute inset-0 flex items-center justify-center">
        <div className="relative overflow-hidden framed:rounded-2xl" style={boxStyle}>
          <div ref={containerRef} className="absolute inset-0" />

          {status === "playing" && (
            <div className="pointer-events-none absolute top-2 right-2 flex items-center gap-1.5 rounded-full bg-white/70 px-2 py-1 text-[10px] font-bold text-fluffy-subtext">
              Next
              <AssetIcon asset={previewTier.fruit} className="h-5 w-5" />
            </div>
          )}

          {status === "idle" && (
            <div className="bg-fluffy-cream/95 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">
                Merge them all!
              </h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Tap to drop a fruit. Two of the same fruit merge into a bigger
                one — don&apos;t let the stack cross the line!
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={beginGame}
                disabled={!assetsReady}
              >
                {assetsReady ? "Start" : "Loading…"}
              </button>
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}
