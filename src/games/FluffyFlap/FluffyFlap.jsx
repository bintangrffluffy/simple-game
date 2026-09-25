import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import DailyModeButton from "@/games/components/DailyModeButton";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";
import { addFluffy } from "@/games/characters/fluffyCharacter";
import { createScenery } from "./flapScenery";

const STAGE_WIDTH = 380;
// Width is fixed; the height stretches to the device (see fitStage), never
// below the original 560 and capped so very tall screens stay playable.
const BASE_HEIGHT = 560;
const MAX_HEIGHT = 900;
const GRAVITY = 1400;
const JUMP_FORCE = 430;
const PLAYER_R = 15;
const PLAYER_X = 110;
const HITBOX = 22;
// Generous gap + gentle speed ramp: this genre gets frustrating fast, and
// the audience is families/kids.
const GAP = 155;
const GATE_WIDTH = 62;
const GATE_SPACING = 210;
const START_SPEED = 130;
const MAX_SPEED = 210;
const SPEED_RAMP = 1.4; // px/s gained per second survived
const MAX_GAP_SHIFT = 150; // how far one gap may move from the previous one
// Treats float in some gaps (offset up/down so they take a little aim).
const TREAT_CHANCE = 0.4;
const TREAT_POINTS = 2;
const TREAT_SIZE = 30;
// How long the bonk stays on screen before the result card.
const DEATH_REVEAL = 0.7;

// Logical stage size for the measured game area: as tall as the area allows
// at a fixed 380 width (wide screens keep the 380×560 shape, full height).
function fitStage({ width, height }) {
  const displayWidth = Math.min(width, (height * STAGE_WIDTH) / BASE_HEIGHT);
  const logical = Math.round((STAGE_WIDTH * height) / displayWidth);
  const stageHeight = Math.min(MAX_HEIGHT, Math.max(BASE_HEIGHT, logical));
  const displayScale = Math.min(width / STAGE_WIDTH, height / stageHeight);
  const dpr = window.devicePixelRatio || 1;
  return {
    height: stageHeight,
    pixelDensity: Math.min(3, Math.max(1, dpr * displayScale)),
  };
}

const GATE_COLORS = ["#a9d2f2", "#f4c7d3", "#cfe8a6", "#ffe1a8"];

export default function FluffyFlap({ onGameComplete }) {
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const statsRef = useRef({ gates: 0, treats: 0 });
  const resetSceneRef = useRef(() => {});
  const onSceneChangeRef = useRef(() => {});
  // Gate layout + treats come from this rng: Math.random, or the daily seed
  // (same gates for everyone today).
  const rngRef = useRef(Math.random);
  const dailyRef = useRef(false);

  const [score, setScore] = useState(0);
  const [assetsReady, setAssetsReady] = useState(false);
  // HUD chip shown briefly whenever the season / time of day changes.
  const [sceneLabel, setSceneLabel] = useState(null);
  onSceneChangeRef.current = ({ season, night }) => {
    setSceneLabel({
      key: `${season.id}-${night}-${Date.now()}`,
      text: `${season.emoji} ${season.name} · ${night ? "Night" : "Day"}`,
    });
  };
  const [highScore, setHighScore] = useHighScore("fluffy-flap");
  const [daily, setDaily] = useState(false);
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("fluffy-flap"));

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "fluffy-flap",
    onComplete: onGameComplete,
  });

  const timer = useGameTimer({ mode: "up" });

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    statusRef.current = "result";
    timer.pause();
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
      ...statsRef.current,
    });
  };

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const addPointsRef = useRef(() => {});
  addPointsRef.current = (points, kind) => {
    scoreRef.current += points;
    statsRef.current[kind] += 1;
    setScore(scoreRef.current);
  };

  // The stage fills the game area's height. Its logical height (and pixel
  // density) is only re-picked on the idle screen: changing it remounts
  // Kaboom, which must never happen mid-run. While playing, a resize just
  // rescales the frozen stage to fit.
  const areaRef = useRef(null);
  const [area, setArea] = useState(null);
  const [stage, setStage] = useState(null);
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        setArea({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!area || status !== "idle") return;
    const next = fitStage(area);
    // Ignore small jitter (e.g. a phone's address bar sliding in/out).
    setStage((cur) =>
      cur && Math.abs(cur.height - next.height) < 16 ? cur : next,
    );
  }, [area, status]);
  const stageHeight = stage?.height;
  const scale =
    area && stage
      ? Math.min(area.width / STAGE_WIDTH, area.height / stage.height)
      : 0;

  // setup() runs once per Kaboom mount, so everything it needs from React
  // goes through the refs above.
  const setup = useCallback(
    (k) => {
      // A remount (new stage height) must not reuse the old instance's scene.
      setAssetsReady(false);
      resetSceneRef.current = () => {};
      // Kaboom pins the canvas to W×H CSS px; let it follow the fitted box.
      k.canvas.style.width = "100%";
      k.canvas.style.height = "100%";
      loadAssetCanvases(gameAssets.treats, { crop: true })
        .then((canvases) => {
          // useKaboomStage detaches the canvas synchronously on unmount.
          if (!k.canvas.isConnected) return;
          Object.entries(canvases).forEach(([id, canvas]) =>
            k.loadSprite(id, canvas),
          );
          buildScene(canvases);
          setAssetsReady(true);
        })
        .catch((err) => console.error("Fluffy Flap: failed to load art", err));

      function buildScene(canvases) {
        k.setGravity(GRAVITY);

        // Seasons + day/night background (sky, sun/moon, stars, clouds,
        // hills, falling petals/leaves/snow), drawn behind everything.
        const scenery = createScenery(k, {
          width: STAGE_WIDTH,
          height: stageHeight,
          reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches,
        });
        scenery.reset();
        k.add([k.z(-100), { draw: () => scenery.draw() }]);

        // The Fluffy (shared with Cloud Hop, see characters/fluffyCharacter.js).
        const player = addFluffy(k, {
          pos: k.vec2(PLAYER_X, stageHeight / 2),
          radius: PLAYER_R,
          comps: [
            // Kaboom 3000.1 only collides rect/polygon areas (a Circle shape
            // throws), so use a centered square slightly inside the drawn
            // circle: near-misses should feel like misses.
            k.area({ shape: new k.Rect(k.vec2(0), HITBOX, HITBOX) }),
            k.body({ jumpForce: JUMP_FORCE }),
            k.z(10),
            "player",
          ],
        });

        const state = {
          speed: START_SPEED,
          distance: 0,
          elapsed: 0,
          lastGapY: stageHeight / 2,
          dead: false,
          colorIndex: 0,
          gates: 0,
        };

        function spawnGate() {
          const minY = GAP / 2 + 50;
          const maxY = stageHeight - GAP / 2 - 50;
          const rng = rngRef.current;
          const gapY = k.clamp(
            state.lastGapY + (rng() * 2 - 1) * MAX_GAP_SHIFT,
            minY,
            maxY,
          );
          state.lastGapY = gapY;
          const color = k.rgb(
            GATE_COLORS[state.colorIndex++ % GATE_COLORS.length],
          );
          const top = gapY - GAP / 2;
          const bottom = gapY + GAP / 2;

          // Top/bottom gate, score zone and treat are children of one group
          // that moves as a unit, so the two halves can never drift apart.
          // Off-screen groups are recycled rather than destroyed: Kaboom 3000.1
          // updates children with a forEach over the live array, and
          // destroy() splices it, so destroying mid-update skips the next
          // object for a frame — which used to nudge the next top gate a few
          // px out of line right as the player reached it.
          const group =
            gatePool.find((g) => g.pos.x < -GATE_WIDTH - 20) ?? addGateGroup();
          group.removeAll();
          group.pos = k.vec2(STAGE_WIDTH + 10, 0);

          // Top gate starts above the stage so only its bottom corners show rounded.
          group.add([
            k.pos(0, -30),
            k.rect(GATE_WIDTH, top + 30, { radius: 18 }),
            k.color(color),
            k.outline(3, k.rgb(255, 255, 255)),
            k.area(),
            "gate",
          ]);
          group.add([
            k.pos(0, bottom),
            k.rect(GATE_WIDTH, stageHeight - bottom + 30, { radius: 18 }),
            k.color(color),
            k.outline(3, k.rgb(255, 255, 255)),
            k.area(),
            "gate",
          ]);
          group.add([
            k.pos(GATE_WIDTH / 2, top),
            k.rect(4, GAP),
            k.area(),
            k.opacity(0),
            "scoreZone",
          ]);

          // Winter gates wear a little snow on the edges around the gap
          // (decoration only — no area, so it never changes collisions).
          if (scenery.currentSeason().id === "winter") {
            group.add([
              k.pos(-3, top - 11),
              k.rect(GATE_WIDTH + 6, 13, { radius: 6 }),
              k.color(255, 255, 255),
            ]);
            group.add([
              k.pos(-3, bottom - 3),
              k.rect(GATE_WIDTH + 6, 13, { radius: 6 }),
              k.color(255, 255, 255),
            ]);
            [12, 30, 48].forEach((dx) =>
              group.add([
                k.pos(dx, top + 1),
                k.circle(4),
                k.color(255, 255, 255),
              ]),
            );
          }

          if (rng() < TREAT_CHANCE) {
            const treat =
              gameAssets.treats[Math.floor(rng() * gameAssets.treats.length)];
            const { width, height } = canvases[treat.id];
            const scale = TREAT_SIZE / Math.max(width, height);
            group.add([
              k.pos(
                GATE_WIDTH / 2,
                gapY + (rng() < 0.5 ? -1 : 1) * (28 + rng() * 20),
              ),
              k.sprite(treat.id, {
                width: width * scale,
                height: height * scale,
              }),
              k.anchor("center"),
              k.area(),
              k.z(1),
              "treat",
            ]);
          }
        }

        const gatePool = [];
        function addGateGroup() {
          const group = k.add([k.pos(-1000, 0), k.z(5), "gateGroup"]);
          gatePool.push(group);
          return group;
        }

        function burst(pos, hex) {
          for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8 + k.rand(-0.2, 0.2);
            const speed = k.rand(60, 140);
            k.add([
              k.pos(pos),
              k.circle(3),
              k.color(k.rgb(hex)),
              k.opacity(1),
              k.lifespan(0.4, { fade: 0.3 }),
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

        function die() {
          if (state.dead) return;
          state.dead = true;
          burst(player.pos, "#0477b6");
          navigator.vibrate?.([40, 60, 40]);
          k.wait(DEATH_REVEAL, () => endGameRef.current());
        }

        // Tap/click anywhere on the stage. touchToMouse is on in
        // useKaboomStage, so a touch arrives here as a mouse press too —
        // one handler covers both without double-jumping.
        k.onMousePress(() => {
          if (statusRef.current !== "playing" || state.dead) return;
          player.jump(JUMP_FORCE);
        });
        // Optional keyboard enhancement only; the game never requires it.
        k.onKeyPress("space", () => {
          if (statusRef.current !== "playing" || state.dead) return;
          player.jump(JUMP_FORCE);
        });

        k.onUpdate(() => {
          if (statusRef.current !== "playing") return;
          const dt = k.dt();

          // Soft ceiling: stop at the top instead of dying there.
          if (player.pos.y < PLAYER_R) {
            player.pos.y = PLAYER_R;
            if (player.vel.y < 0) player.vel.y = 0;
          }
          player.angle = k.clamp(player.vel.y / 12, -25, 70);
          if (player.pos.y > stageHeight + 30) die();
          if (state.dead) return;

          state.elapsed += dt;
          state.speed = Math.min(
            MAX_SPEED,
            START_SPEED + state.elapsed * SPEED_RAMP,
          );
          const changed = scenery.update(dt, state.speed);
          if (changed) onSceneChangeRef.current(changed);
          state.distance += state.speed * dt;
          if (state.distance >= GATE_SPACING) {
            state.distance -= GATE_SPACING;
            spawnGate();
          }
        });

        k.onUpdate("gateGroup", (group) => {
          if (statusRef.current !== "playing" || state.dead) return;
          // Parked (off-screen) groups stay put until spawnGate() reuses them.
          if (group.pos.x >= -GATE_WIDTH - 20)
            group.pos.x -= state.speed * k.dt();
        });

        player.onCollide("gate", die);
        player.onCollide("scoreZone", (zone) => {
          k.destroy(zone);
          if (state.dead) return;
          addPointsRef.current(1, "gates");
          state.gates += 1;
          scenery.setProgress(state.gates);
        });
        player.onCollide("treat", (treat) => {
          burst(treat.pos, "#fed23a");
          k.destroy(treat);
          if (!state.dead) addPointsRef.current(TREAT_POINTS, "treats");
        });

        resetSceneRef.current = () => {
          // Runs from React, outside Kaboom's update loop, so clearing is safe here.
          gatePool.forEach((group) => {
            group.removeAll();
            group.pos = k.vec2(-1000, 0);
          });
          k.destroyAll("particle");
          scenery.reset(rngRef.current);
          Object.assign(state, {
            speed: START_SPEED,
            distance: GATE_SPACING - 60,
            elapsed: 0,
            lastGapY: stageHeight / 2,
            dead: false,
            gates: 0,
          });
          player.pos = k.vec2(PLAYER_X, stageHeight / 2);
          player.vel = k.vec2(0, 0);
          player.angle = 0;
          player.jump(JUMP_FORCE);
        };
      }
    },
    [stageHeight],
  );

  const { containerRef, kRef } = useKaboomStage({
    width: STAGE_WIDTH,
    height: stageHeight,
    background: "#eaf4fb",
    setup,
    pixelDensity: stage?.pixelDensity,
  });

  // Pause the Kaboom loop whenever we're not actively playing (idle preview,
  // manual pause, result overlay) so gravity never runs invisibly.
  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  const beginGame = useCallback(
    (isDaily = false) => {
      dailyRef.current = isDaily;
      setDaily(isDaily);
      rngRef.current = isDaily ? dailyRandom("fluffy-flap") : Math.random;
      scoreRef.current = 0;
      statsRef.current = { gates: 0, treats: 0 };
      setScore(0);
      timer.reset();
      timer.start();
      statusRef.current = "playing";
      start();
      resetSceneRef.current();
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

  return (
    <GameShell
      title="Fluffy Flap"
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
            title={result.gates > 0 ? "What a flight!" : "Bonk! Try again"}
            emoji="☁️"
            celebrate={result.isNewBest}
            stats={[
              { label: "Gates", value: result.gates },
              { label: "Treats", value: result.treats },
            ]}
            shareText={
              result.mode === "daily"
                ? `Fluffy Flap · Daily ${result.date}: ${result.gates} gates, ${result.score} points ☁️ Same gates for everyone today!`
                : undefined
            }
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div
        ref={areaRef}
        className="absolute inset-0 flex items-center justify-center"
      >
        <div
          className="relative overflow-hidden framed:rounded-2xl"
          style={{
            width: STAGE_WIDTH * scale,
            height: (stageHeight ?? BASE_HEIGHT) * scale,
          }}
        >
          <div ref={containerRef} className="absolute inset-0" />

          {sceneLabel && status !== "idle" && (
            <div
              key={sceneLabel.key}
              className="flap-scene-chip font-poppins text-fluffy-text pointer-events-none absolute top-3 left-1/2 rounded-full bg-white/85 px-3 py-1 text-xs font-bold whitespace-nowrap shadow-sm"
              aria-live="polite"
            >
              {sceneLabel.text}
            </div>
          )}

          {status === "idle" && (
            <div className="bg-fluffy-cream/90 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">
                Help Fluffy fly!
              </h2>
              <p className="text-fluffy-subtext max-w-xs text-sm">
                Tap anywhere to flap. Glide through the gaps and grab the treats
                for bonus points.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => beginGame(false)}
                disabled={!assetsReady}
              >
                {assetsReady ? "Start" : "Loading…"}
              </button>
              {assetsReady && (
                <DailyModeButton
                  onClick={() => beginGame(true)}
                  best={dailyBest || null}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </GameShell>
  );
}
