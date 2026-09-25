import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import DailyModeButton from "@/games/components/DailyModeButton";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { usePointerInput } from "@/games/hooks/usePointerInput";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";
import { addFluffy, FLUFFY_RADIUS } from "@/games/characters/fluffyCharacter";

const STAGE_WIDTH = 380;
const STAGE_HEIGHT = 560;
const GRAVITY = 1300;
// Jump height = JUMP² / (2·GRAVITY) ≈ 222px, comfortably above the widest gap.
const JUMP_FORCE = 760;
const SPRING_BOOST = 1.45;
const R = FLUFFY_RADIUS;
const MOVE_SPEED = 620; // px/s the Fluffy slides toward the finger
const SCROLL_LINE = 230; // the world scrolls once the Fluffy climbs above this
const POOL_SIZE = 12;
const TREAT_CHANCE = 0.18;
const TREAT_POINTS = 25;
const TREAT_SIZE = 26;
const DEATH_REVEAL = 0.6;

// Gaps widen and clouds shrink as you climb; moving / puff / spring clouds
// appear gradually so the start stays easy for kids.
function cloudSpec(height, rng) {
  const t = Math.min(1, height / 6000);
  const gap = 70 + t * 55 + rng() * 25;
  const w = 92 - t * 32 + rng() * 14;
  const roll = rng();
  let kind = "normal";
  if (height > 1200 && roll < 0.22) kind = "moving";
  else if (height > 2500 && roll < 0.34) kind = "puff";
  else if (height > 600 && roll < 0.42) kind = "spring";
  return { gap, w, kind, x: w / 2 + 8 + rng() * (STAGE_WIDTH - w - 16), treat: rng() < TREAT_CHANCE };
}

export default function CloudHop({ onGameComplete }) {
  const statusRef = useRef("idle");
  const apiRef = useRef(null);
  const targetRef = useRef(null);
  const scoreRef = useRef(0);
  const statsRef = useRef({ height: 0, treats: 0 });

  const [daily, setDaily] = useState(false);
  const [score, setScore] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  const [highScore, setHighScore] = useHighScore("cloud-hop");
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("cloud-hop"));
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "cloud-hop",
    onComplete: onGameComplete,
  });
  const dailyRef = useRef(false);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    statusRef.current = "result";
    const finalScore = scoreRef.current;
    const isDaily = dailyRef.current;
    const isNewBest = finalScore > (isDaily ? dailyBest : highScore);
    if (isDaily) setDailyBest(finalScore);
    setHighScore(finalScore);
    finish({
      score: finalScore,
      level: statsRef.current.height,
      mode: isDaily ? "daily" : "classic",
      date: isDaily ? todayKey() : undefined,
      isNewBest,
      ...statsRef.current,
    });
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const onProgressRef = useRef(() => {});
  onProgressRef.current = (height, treats) => {
    statsRef.current = { height: Math.floor(height / 10), treats };
    const next = Math.floor(height / 10) + treats * TREAT_POINTS;
    if (next !== scoreRef.current) {
      scoreRef.current = next;
      setScore(next);
    }
  };

  const setup = useCallback((k) => {
    loadAssetCanvases(gameAssets.treats, { crop: true })
      .then((canvases) => {
        if (!k.canvas.isConnected) return;
        Object.entries(canvases).forEach(([id, canvas]) => k.loadSprite(id, canvas));
        buildScene(canvases);
        setAssetsReady(true);
      })
      .catch((err) => console.error("Cloud Hop: failed to load art", err));

    function buildScene(canvases) {
      k.setGravity(GRAVITY);
      const state = { height: 0, treats: 0, dead: false, rng: Math.random, prevBottom: 0, stars: [] };
      for (let i = 0; i < 40; i++) state.stars.push({ x: Math.random() * STAGE_WIDTH, y: Math.random() * STAGE_HEIGHT, r: Math.random() * 1.4 + 0.4 });

      // Sky shifts from day to sunset to a starry night as you climb.
      const SKY = [k.rgb("#eaf4fb"), k.rgb("#fde3cf"), k.rgb("#c9b8e8"), k.rgb("#2f3b6b")];
      k.add([
        k.z(-100),
        {
          draw() {
            const t = Math.min(SKY.length - 1.001, state.height / 2500);
            const i = Math.floor(t);
            const sky = SKY[i].lerp(SKY[i + 1], t - i);
            k.drawRect({ pos: k.vec2(0, 0), width: STAGE_WIDTH, height: STAGE_HEIGHT, color: sky });
            const night = Math.max(0, t - 1.8) / 1.2;
            if (night > 0) {
              state.stars.forEach((s) => k.drawCircle({ pos: k.vec2(s.x, (s.y + state.height * 0.05) % STAGE_HEIGHT), radius: s.r, color: k.rgb(255, 255, 255), opacity: night }));
            }
          },
        },
      ]);

      const clouds = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const cloud = k.add([
          k.pos(-500, 0),
          k.z(5),
          {
            w: 80,
            kind: "normal",
            vx: 0,
            broken: false,
            squash: 0,
            draw() {
              if (this.broken) return;
              const w = this.w;
              const sq = this.squash * 4;
              const tint = this.kind === "puff" ? k.rgb("#f4f7fb") : k.rgb(255, 255, 255);
              const edge = this.kind === "spring" ? k.rgb("#fed23a") : this.kind === "moving" ? k.rgb("#a9d2f2") : k.rgb("#d6e9f8");
              const opacity = this.kind === "puff" ? 0.75 : 1;
              k.drawRect({ pos: k.vec2(-w / 2, -6 + sq), width: w, height: 16 - sq, radius: 8, color: tint, outline: { width: 2, color: edge }, opacity });
              k.drawCircle({ pos: k.vec2(-w / 5, -6 + sq), radius: w / 6, color: tint, opacity });
              k.drawCircle({ pos: k.vec2(w / 7, -8 + sq), radius: w / 5, color: tint, opacity });
              if (this.kind === "spring") k.drawRect({ pos: k.vec2(-10, -16 + sq), width: 20, height: 8, radius: 4, color: k.rgb("#fed23a") });
              if (this.kind === "puff") [-w / 3, 0, w / 3].forEach((x) => k.drawCircle({ pos: k.vec2(x, 2), radius: 2, color: k.rgb("#a9d2f2") }));
            },
          },
        ]);
        const treat = cloud.add([k.pos(0, -30), k.sprite(gameAssets.treats[0].id), k.anchor("center"), k.opacity(0), { collected: true }]);
        cloud.treat = treat;
        clouds.push(cloud);
      }

      const player = addFluffy(k, {
        pos: k.vec2(STAGE_WIDTH / 2, STAGE_HEIGHT - 120),
        comps: [k.area({ shape: new k.Rect(k.vec2(0), 22, 22) }), k.body({ jumpForce: JUMP_FORCE }), k.z(10), "player"],
      });

      function placeCloud(cloud, y, spec) {
        cloud.pos = k.vec2(spec.x, y);
        cloud.w = spec.w;
        cloud.kind = spec.kind;
        cloud.vx = spec.kind === "moving" ? (state.rng() < 0.5 ? -1 : 1) * (50 + state.rng() * 40) : 0;
        cloud.broken = false;
        cloud.squash = 0;
        const treat = cloud.treat;
        treat.collected = !spec.treat;
        treat.opacity = spec.treat ? 1 : 0;
        if (spec.treat) {
          const item = gameAssets.treats[Math.floor(state.rng() * gameAssets.treats.length)];
          const { width, height } = canvases[item.id];
          const scale = TREAT_SIZE / Math.max(width, height);
          treat.use(k.sprite(item.id, { width: width * scale, height: height * scale }));
        }
      }

      const topCloudY = () => Math.min(...clouds.map((c) => c.pos.y));

      function burst(pos, hex) {
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8;
          const speed = k.rand(50, 120);
          k.add([k.pos(pos), k.circle(3), k.color(k.rgb(hex)), k.opacity(1), k.lifespan(0.4, { fade: 0.3 }), k.z(20), "particle", { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed }]);
        }
      }
      k.onUpdate("particle", (p) => {
        p.pos.x += p.vx * k.dt();
        p.pos.y += p.vy * k.dt();
      });

      function die() {
        if (state.dead) return;
        state.dead = true;
        navigator.vibrate?.([40, 60, 40]);
        k.wait(DEATH_REVEAL, () => endGameRef.current());
      }

      k.onUpdate(() => {
        if (statusRef.current !== "playing" || state.dead) return;
        const dt = k.dt();

        // Slide toward the finger (or keyboard target).
        const target = targetRef.current;
        if (target !== null) {
          const dx = target - player.pos.x;
          player.pos.x += Math.max(-MOVE_SPEED * dt, Math.min(MOVE_SPEED * dt, dx));
        }
        player.pos.x = k.clamp(player.pos.x, R, STAGE_WIDTH - R);
        player.angle = k.clamp(player.vel.y / 30, -12, 18);

        clouds.forEach((c) => {
          if (c.vx) {
            c.pos.x += c.vx * dt;
            if (c.pos.x < c.w / 2 || c.pos.x > STAGE_WIDTH - c.w / 2) c.vx *= -1;
          }
          c.squash = Math.max(0, c.squash - dt * 5);
        });

        // One-way landing: only while falling, and only if the feet crossed
        // the cloud top this frame.
        const bottom = player.pos.y + R;
        if (player.vel.y > 0) {
          for (const c of clouds) {
            if (c.broken) continue;
            const top = c.pos.y - 8;
            if (state.prevBottom <= top && bottom >= top && Math.abs(player.pos.x - c.pos.x) <= c.w / 2 + R * 0.5) {
              player.pos.y = top - R;
              player.jump(c.kind === "spring" ? JUMP_FORCE * SPRING_BOOST : JUMP_FORCE);
              c.squash = 1;
              if (c.kind === "puff") {
                c.broken = true;
                burst(c.pos, "#d6e9f8");
              }
              navigator.vibrate?.(6);
              break;
            }
          }
        }
        state.prevBottom = player.pos.y + R;

        // Treats: collect by touching them.
        clouds.forEach((c) => {
          const t = c.treat;
          if (t.collected || c.broken) return;
          const tx = c.pos.x + t.pos.x;
          const ty = c.pos.y + t.pos.y;
          if (Math.hypot(tx - player.pos.x, ty - player.pos.y) < R + TREAT_SIZE / 2) {
            t.collected = true;
            t.opacity = 0;
            state.treats += 1;
            burst(k.vec2(tx, ty), "#fed23a");
          }
        });

        // Scroll the world instead of the camera once the Fluffy climbs high.
        if (player.pos.y < SCROLL_LINE) {
          const delta = SCROLL_LINE - player.pos.y;
          player.pos.y = SCROLL_LINE;
          state.prevBottom += delta;
          state.height += delta;
          clouds.forEach((c) => (c.pos.y += delta));
        }
        // Recycle clouds that dropped off the bottom (never destroyed).
        clouds.forEach((c) => {
          if (c.pos.y > STAGE_HEIGHT + 30) {
            const spec = cloudSpec(state.height, state.rng);
            placeCloud(c, topCloudY() - spec.gap, spec);
          }
        });
        onProgressRef.current(state.height, state.treats);

        if (player.pos.y > STAGE_HEIGHT + 40) die();
      });

      apiRef.current = {
        toStageX(clientX) {
          const rect = k.canvas.getBoundingClientRect();
          return ((clientX - rect.left) * STAGE_WIDTH) / rect.width;
        },
        reset(rng) {
          k.destroyAll("particle");
          Object.assign(state, { height: 0, treats: 0, dead: false, rng });
          // A wide starter cloud right under the Fluffy, then a ladder upward.
          placeCloud(clouds[0], STAGE_HEIGHT - 60, { x: STAGE_WIDTH / 2, w: 160, kind: "normal", treat: false });
          let y = STAGE_HEIGHT - 60;
          for (let i = 1; i < clouds.length; i++) {
            const spec = cloudSpec(0, rng);
            y -= spec.gap;
            placeCloud(clouds[i], y, spec);
          }
          player.pos = k.vec2(STAGE_WIDTH / 2, STAGE_HEIGHT - 60 - 8 - R);
          player.vel = k.vec2(0, 0);
          state.prevBottom = player.pos.y + R;
          targetRef.current = null;
          player.jump(JUMP_FORCE);
        },
      };
    }
  }, []);

  const { containerRef, kRef } = useKaboomStage({ width: STAGE_WIDTH, height: STAGE_HEIGHT, background: "#eaf4fb", setup });

  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  // Optional keyboard enhancement: arrows nudge the target left/right.
  useEffect(() => {
    const onKey = (e) => {
      if (statusRef.current !== "playing" || !apiRef.current) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      targetRef.current = e.key === "ArrowLeft" ? 0 : STAGE_WIDTH;
    };
    const onKeyUp = (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") targetRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Drag anywhere: the Fluffy slides toward your finger's x position.
  const pointer = usePointerInput({
    onStart: useCallback((point) => {
      if (apiRef.current) targetRef.current = apiRef.current.toStageX(point.x);
    }, []),
    onMove: useCallback((point) => {
      if (apiRef.current) targetRef.current = apiRef.current.toStageX(point.x);
    }, []),
    onEnd: useCallback(() => {
      targetRef.current = null;
    }, []),
  });

  const beginGame = useCallback(
    (isDaily) => {
      dailyRef.current = isDaily;
      setDaily(isDaily);
      scoreRef.current = 0;
      statsRef.current = { height: 0, treats: 0 };
      setScore(0);
      statusRef.current = "playing";
      start();
      apiRef.current?.reset(isDaily ? dailyRandom("cloud-hop") : Math.random);
    },
    [start],
  );

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  const best = daily ? dailyBest : highScore;

  return (
    <GameShell
      title="Cloud Hop"
      score={score}
      best={best}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={best}
            isNewBest={result.isNewBest}
            title="What a climb!"
            emoji="☁️"
            celebrate={result.isNewBest}
            stats={[
              { label: "Height", value: `${result.height} m` },
              { label: "Treats", value: result.treats },
            ]}
            shareText={
              result.mode === "daily"
                ? `Cloud Hop · Daily ${result.date}: climbed ${result.height} m (${result.score} points) ☁️ Same clouds for everyone today!`
                : undefined
            }
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
        <div className="relative aspect-[19/28] w-full max-w-[380px] overflow-hidden rounded-2xl">
          <div ref={containerRef} className="touch-none-game absolute inset-0" {...pointer} />
          {status === "idle" && (
            <div className="bg-fluffy-cream/90 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Hop up the clouds!</h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Fluffy bounces by itself. Hold and slide your finger left or right to steer onto the next cloud. Yellow
                clouds spring you higher; dotted ones puff away after one hop.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => beginGame(false)} disabled={!assetsReady}>
                {assetsReady ? "Play" : "Loading…"}
              </button>
              {assetsReady && <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />}
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}
