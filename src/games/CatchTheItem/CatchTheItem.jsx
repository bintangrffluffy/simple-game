import { useCallback, useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";

const STAGE_WIDTH = 380;
const STAGE_HEIGHT = 560;
// Endless: no round timer. The run lasts until all lives are gone, and the
// fall speed + spawn rate ramp up with elapsed time so it gets harder.
const SPEED_RAMP_SECONDS = 30; // +100% fall speed every this many seconds...
const MAX_SPEED_FACTOR = 2.4; // ...capped so it stays catchable
const LEVEL_SECONDS = 15;
const START_LIVES = 5;
const BASKET_WIDTH = 100;

// "Weight" is the whole point of using Kaboom here: heavier items get a
// higher gravityScale so they visibly fall faster, and are worth more.
// `size` is the sprite's longest side in px.
const TIERS = [
  { key: "light", size: 34, color: "#a9d2f2", gravityScale: 0.75, points: 10, weight: 55 },
  { key: "medium", size: 42, color: "#0477b6", gravityScale: 1.05, points: 20, weight: 32 },
  { key: "heavy", size: 52, color: "#d9a85b", gravityScale: 1.4, points: 35, weight: 13 },
].map((tier) => ({ ...tier, items: gameAssets.catchItems[tier.key] }));

const SPRITE_ASSETS = [gameAssets.decorative.basket, ...TIERS.flatMap((tier) => tier.items)].filter(
  (asset, i, all) => all.findIndex((a) => a.id === asset.id) === i,
);

function speedFactor(elapsed) {
  return Math.min(1 + elapsed / SPEED_RAMP_SECONDS, MAX_SPEED_FACTOR);
}

function pickTier(k) {
  const total = TIERS.reduce((sum, t) => sum + t.weight, 0);
  let roll = k.rand(0, total);
  for (const tier of TIERS) {
    if (roll < tier.weight) return tier;
    roll -= tier.weight;
  }
  return TIERS[0];
}

export default function CatchTheItem({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const livesRef = useRef(START_LIVES);
  const elapsedRef = useRef(0);
  const spawnItemRef = useRef(() => {});

  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [assetsReady, setAssetsReady] = useState(false);
  const [highScore, setHighScore] = useHighScore("catch");

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "catch",
    onComplete: onGameComplete,
  });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const finalScore = scoreRef.current;
    const isNewBest = finalScore > highScore;
    if (isNewBest) setHighScore(finalScore);
    const level = Math.floor(elapsedRef.current / LEVEL_SECONDS) + 1;
    finish({ score: finalScore, level, won: true, isNewBest });
  };

  const timer = useGameTimer({ mode: "up" });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    if (status === "playing") elapsedRef.current = timer.time;
  }, [timer.time, status]);

  const handleCatch = useCallback((points) => {
    scoreRef.current += points;
    setScore(scoreRef.current);
  }, []);
  const handleCatchRef = useRef(handleCatch);
  handleCatchRef.current = handleCatch;

  const handleMiss = useCallback(() => {
    livesRef.current = Math.max(0, livesRef.current - 1);
    setLives(livesRef.current);
    if (livesRef.current <= 0) {
      timer.pause();
      endGameRef.current();
    }
  }, [timer]);
  const handleMissRef = useRef(handleMiss);
  handleMissRef.current = handleMiss;

  const setup = useCallback((k) => {
    loadAssetCanvases(SPRITE_ASSETS, { crop: true })
      .then((canvases) => {
        // useKaboomStage detaches the canvas synchronously on unmount, so
        // this is the reliable "instance already gone" check (StrictMode).
        if (!k.canvas.isConnected) return;
        Object.entries(canvases).forEach(([id, canvas]) => k.loadSprite(id, canvas));
        buildScene(canvases);
        setAssetsReady(true);
      })
      .catch((err) => console.error("Catch the Item: failed to load art", err));

    // Sprite options that fit the art's longest side to `size`, keeping its
    // aspect ratio.
    function fit(canvases, id, size) {
      const { width, height } = canvases[id];
      const scale = size / Math.max(width, height);
      return { width: width * scale, height: height * scale };
    }

    function buildScene(canvases) {
      k.setGravity(1650);
      const pointerX = { current: STAGE_WIDTH / 2 };

      const basketSize = fit(canvases, "basket", BASKET_WIDTH);
      const basket = k.add([
        k.pos(STAGE_WIDTH / 2, STAGE_HEIGHT - 8),
        k.sprite("basket", basketSize),
        // Catch zone is the top ~45% (the opening), not the whole sprite.
        // Kaboom offsets a custom Rect area by the anchor using the area's own
        // size, so y = -(H - rimHeight) puts its top edge at the basket's top.
        k.area({
          shape: new k.Rect(k.vec2(0, -basketSize.height * 0.55), basketSize.width * 0.9, basketSize.height * 0.45),
        }),
        k.anchor("bot"),
        k.z(10),
        "basket",
      ]);

      k.add([k.pos(0, STAGE_HEIGHT - 2), k.rect(STAGE_WIDTH, 6), k.area(), k.opacity(0), "floor"]);

      k.onMouseMove((pos) => {
        pointerX.current = pos.x;
      });
      k.onTouchMove((pos) => {
        pointerX.current = pos.x;
      });
      k.onKeyDown("left", () => {
        pointerX.current -= 8;
      });
      k.onKeyDown("right", () => {
        pointerX.current += 8;
      });

      k.onUpdate(() => {
        if (statusRef.current !== "playing") return;
        const half = BASKET_WIDTH / 2;
        const target = Math.min(Math.max(pointerX.current, half), STAGE_WIDTH - half);
        basket.pos.x += (target - basket.pos.x) * Math.min(k.dt() * 12, 1);
      });

      k.onUpdate("particle", (p) => {
        p.pos.x += p.vx * k.dt();
        p.pos.y += p.vy * k.dt();
      });

      function burst(pos, colorObj) {
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8 + k.rand(-0.2, 0.2);
          const speed = k.rand(60, 140);
          k.add([
            k.pos(pos),
            k.circle(3),
            k.color(colorObj),
            k.opacity(1),
            k.lifespan(0.4, { fade: 0.3 }),
            k.z(20),
            "particle",
            { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed },
          ]);
        }
      }

      k.onCollide("item", "basket", (item) => {
        burst(item.pos, item.tierColor);
        k.destroy(item);
        handleCatchRef.current(item.points);
      });

      k.onCollide("item", "floor", (item) => {
        k.destroy(item);
        handleMissRef.current();
      });

      function spawnItem() {
        const s = statusRef.current;
        if (s === "idle" || s === "result") return;

        if (s === "playing") {
          const tier = pickTier(k);
          const colorObj = k.rgb(tier.color);
          const asset = tier.items[k.randi(tier.items.length)];
          const x = k.rand(30, STAGE_WIDTH - 30);
          k.add([
            k.pos(x, -30),
            k.sprite(asset.id, fit(canvases, asset.id, tier.size)),
            k.rotate(k.rand(-15, 15)),
            k.area(),
            k.body({ gravityScale: tier.gravityScale * speedFactor(elapsedRef.current) }),
            k.anchor("center"),
            "item",
            { points: tier.points, tierColor: colorObj },
          ]);
        }

        const delay = Math.max(380, 1050 - elapsedRef.current * 8);
        k.wait(delay / 1000, spawnItem);
      }
      spawnItemRef.current = () => {
        k.wait(0.6, spawnItem);
      };
    }
  }, []);

  const { containerRef, kRef } = useKaboomStage({
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    background: "#eaf4fb",
    setup,
  });

  // Auto-pause the Kaboom loop for every non-playing state (idle preview,
  // manual pause, and the result overlay) so it never runs invisibly.
  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  const beginGame = useCallback(() => {
    scoreRef.current = 0;
    livesRef.current = START_LIVES;
    elapsedRef.current = 0;
    setScore(0);
    setLives(START_LIVES);
    timer.reset();
    timer.start();
    start();
    kRef.current?.destroyAll("item");
    kRef.current?.destroyAll("particle");
    spawnItemRef.current();
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

  return (
    <GameShell
      title="Catch the Item"
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
            title="Nice catch!"
            emoji="🧺"
            celebrate={result.isNewBest}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <div className="relative aspect-[19/28] w-full max-w-[380px] overflow-hidden rounded-2xl">
          <div ref={containerRef} className="absolute inset-0" />

          {status !== "idle" && (
            <div className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 gap-1">
              {Array.from({ length: START_LIVES }).map((_, i) => (
                <Heart
                  key={i}
                  size={18}
                  className={i < lives ? "fill-fluffy-danger text-fluffy-danger" : "text-fluffy-border"}
                />
              ))}
            </div>
          )}

          {status === "idle" && (
            <div className="bg-fluffy-cream/95 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Catch every Fluffy item!</h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Move the basket to catch falling items. They fall faster the longer you last — don&apos;t drop 5!
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
