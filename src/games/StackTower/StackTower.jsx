import { useCallback, useEffect, useRef, useState } from "react";
import Matter from "matter-js";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import DailyModeButton from "@/games/components/DailyModeButton";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";

const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;

// Tetromino-style pieces, each built from 4 square cells on a grid (y down).
// Default orientations favour a flat bottom; the Rotate button turns them.
const TETROMINOES = {
  O: { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: "#d9a85b" },
  I: { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], color: "#a9d2f2" },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#b79ce0" },
  L: { cells: [[0, 0], [0, 1], [0, 2], [1, 2]], color: "#0477b6" },
  J: { cells: [[1, 0], [1, 1], [1, 2], [0, 2]], color: "#5a9fd6" },
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: "#60bb8f" },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: "#e08ba0" },
};
const SHAPES = Object.keys(TETROMINOES);

const SPAWN_GAP = 65;
// Game over means a piece actually fell off the platform: its top edge has
// dropped this far below the platform surface. Tipping over, sliding or
// lying on its side while still on the platform is NOT a fail — tetrominoes
// routinely do that (a vertical I toppling flat turns 90° and drops ~45px).
const FELL_OFF_MARGIN = 10;
const SETTLE_FALLBACK_MS = 2500;
const COLLAPSE_RESULT_DELAY_MS = 1500;
const PERFECT_TOLERANCE = 10;
const CELL = 30;
// The platform floats: it sits well above the bottom edge, with open space
// (and a visible drop) beneath it — overshoot past its edges and there's
// nothing to catch you. Long enough to lay a few pieces side by side.
const PLATFORM_FLOAT = 210;
const PLATFORM_MAX_WIDTH = CELL * 13;
const PLATFORM_SIDE_MARGIN = 24;

// `rng` is Math.random, or the daily seeded rng (same pieces for everyone).
function pickShape(exclude, rng = Math.random) {
  const options = SHAPES.filter((shape) => shape !== exclude);
  return options[Math.floor(rng() * options.length)];
}

function getPlatformWidth(width) {
  return Math.max(CELL * 6, Math.min(PLATFORM_MAX_WIDTH, width - PLATFORM_SIDE_MARGIN * 2));
}

function drawFace(ctx, half) {
  const eyeOffsetX = half * 0.38;
  const eyeY = -half * 0.12;
  const r = Math.max(1.6, Math.min(half * 0.16, 3));
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(-eyeOffsetX, eyeY, r, 0, Math.PI * 2);
  ctx.arc(eyeOffsetX, eyeY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = Math.max(1, r * 0.8);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, eyeY + r * 2, r * 2, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
}

// Draws one square cell centered at the current ctx origin (caller translates/rotates first).
function drawCell(ctx, size, color, withFace) {
  const half = size / 2;
  const inset = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-half + inset, -half + inset, size - inset * 2, size - inset * 2, size * 0.22);
  ctx.fill();

  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.32)";
  ctx.beginPath();
  ctx.ellipse(-half * 0.32, -half * 0.45, half * 0.38, half * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  if (withFace) drawFace(ctx, half);
}

function drawPiece(ctx, body) {
  for (let i = 1; i < body.parts.length; i++) {
    const part = body.parts[i];
    ctx.save();
    ctx.translate(part.position.x, part.position.y);
    ctx.rotate(body.angle);
    drawCell(ctx, body.cellSize, body.color, part === body.facePart);
    ctx.restore();
  }
}

function drawPerfectBadge(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i;
    const radius = i % 2 === 0 ? r : r / 2.4;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// A compound body of plain (unchamfered) square parts: flat edges rest
// still once landed, and the rounded look is purely a drawing concern.
function createPieceBody(shapeType, x, y, cellSize) {
  const partOptions = {
    friction: 0.95,
    frictionStatic: 1.6,
    restitution: 0,
    density: 0.0022,
    label: "cell",
  };
  const { cells } = TETROMINOES[shapeType];
  const cols = Math.max(...cells.map(([cx]) => cx)) + 1;
  const rows = Math.max(...cells.map(([, cy]) => cy)) + 1;
  const parts = cells.map(([cx, cy]) =>
    Bodies.rectangle(x + (cx + 0.5 - cols / 2) * cellSize, y + (cy + 0.5 - rows / 2) * cellSize, cellSize, cellSize, partOptions),
  );
  const body = Body.create({ parts, frictionAir: 0.02, label: "piece" });
  // The face goes on whichever cell sits closest to the centre of mass.
  // (Matter prepends the parent itself to parts, so skip index 0.)
  body.facePart = body.parts.slice(1).reduce((best, part) =>
    Math.hypot(part.position.x - body.position.x, part.position.y - body.position.y) <
    Math.hypot(best.position.x - body.position.x, best.position.y - body.position.y)
      ? part
      : best,
  );
  return body;
}

// Highest point of the settled tower (smallest y), or the platform top.
function getTowerTop(pieces, floorY) {
  let top = floorY;
  for (const body of pieces) {
    if (body.phase === "settled") top = Math.min(top, body.bounds.min.y);
  }
  return top;
}

// Holds the aiming piece at its slider position and rotation, clamped so
// the whole piece stays on screen and its lowest point sits at aimBottom.
function placeAimingBody(body, width) {
  Body.setAngle(body, body.aimAngle);
  const left = body.position.x - body.bounds.min.x;
  const right = body.bounds.max.x - body.position.x;
  const below = body.bounds.max.y - body.position.y;
  body.aimingX = left + (body.aimPct / 100) * Math.max(width - left - right, 0);
  body.aimingY = body.aimBottom - below;
  Body.setPosition(body, { x: body.aimingX, y: body.aimingY });
}

export default function StackTower({ onGameComplete }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const platformWidthRef = useRef(0);

  const engineRef = useRef(null);
  const piecesRef = useRef([]);
  const aimingBodyRef = useRef(null);
  const lastTopBodyRef = useRef(null);
  const settledCountRef = useRef(0);
  const collapseTriggeredRef = useRef(false);
  const settleTimeoutRef = useRef(null);
  const collapseTimeoutRef = useRef(null);
  const cameraRef = useRef(0);
  const comboRef = useRef(0);
  const statusRef = useRef("idle");
  const scoreRef = useRef(0);
  const highScoreRef = useRef(0);
  const finishRef = useRef(null);
  const setHighScoreRef = useRef(null);
  const rngRef = useRef(Math.random);
  const dailyRef = useRef(false);
  const dailyBestRef = useRef(0);
  const setDailyBestRef = useRef(null);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [sliderValue, setSliderValue] = useState(50);
  const [highScore, setHighScore] = useHighScore("stack");
  const [daily, setDaily] = useState(false);
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("stack"));
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "stack",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);
  useEffect(() => {
    highScoreRef.current = highScore;
  }, [highScore]);
  finishRef.current = finish;
  setHighScoreRef.current = setHighScore;
  dailyBestRef.current = dailyBest;
  setDailyBestRef.current = setDailyBest;

  const clearTimers = useCallback(() => {
    if (settleTimeoutRef.current) {
      clearTimeout(settleTimeoutRef.current);
      settleTimeoutRef.current = null;
    }
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
  }, []);

  const triggerCollapse = useCallback(() => {
    if (collapseTriggeredRef.current) return;
    collapseTriggeredRef.current = true;
    clearTimers();
    const finalScore = scoreRef.current;
    const finalLevel = settledCountRef.current;
    const isDaily = dailyRef.current;
    const isNewBest = finalScore > (isDaily ? dailyBestRef.current : highScoreRef.current);
    setHighScoreRef.current(finalScore);
    if (isDaily) setDailyBestRef.current(finalScore);
    collapseTimeoutRef.current = setTimeout(() => {
      finishRef.current({
        score: finalScore,
        level: finalLevel,
        won: false,
        isNewBest,
        mode: isDaily ? "daily" : "classic",
        date: isDaily ? todayKey() : undefined,
      });
    }, COLLAPSE_RESULT_DELAY_MS);
  }, [clearTimers]);

  const spawnAimingPiece = useCallback(() => {
    const { width } = sizeRef.current;
    const floorY = sizeRef.current.height - PLATFORM_FLOAT;
    const prevShape = piecesRef.current[piecesRef.current.length - 1]?.shapeType;
    const shapeType = pickShape(prevShape, rngRef.current);
    const shrink = Math.max(0.8, 1 - settledCountRef.current * 0.012);
    const cellSize = CELL * shrink;

    const body = createPieceBody(shapeType, width / 2, 0, cellSize);
    body.shapeType = shapeType;
    body.color = TETROMINOES[shapeType].color;
    body.cellSize = cellSize;
    body.phase = "aiming";
    body.perfect = false;
    body.hasContacted = false;
    body.aimAngle = 0;
    body.aimPct = 50;
    body.aimBottom = getTowerTop(piecesRef.current, floorY) - SPAWN_GAP;
    placeAimingBody(body, width);

    Composite.add(engineRef.current.world, body);
    piecesRef.current.push(body);
    aimingBodyRef.current = body;
    setSliderValue(50);
  }, []);

  const checkSettle = useCallback(
    (body) => {
      if (collapseTriggeredRef.current || body.phase !== "falling") return;

      // Coming to rest on the platform itself (rather than stacked on the
      // tower) isn't a fail on its own — the piece hasn't fallen, it's just
      // sitting somewhere else on solid ground. Game over is reserved for a
      // piece that actually topples or slides off afterward (see the
      // per-frame settled-piece check below).
      body.phase = "settled";
      settledCountRef.current += 1;

      const refX = lastTopBodyRef.current ? lastTopBodyRef.current.position.x : sizeRef.current.width / 2;
      const offset = Math.abs(body.position.x - refX);
      const isPerfect = offset < PERFECT_TOLERANCE;
      body.perfect = isPerfect;

      const newCombo = isPerfect ? comboRef.current + 1 : 0;
      comboRef.current = newCombo;
      setCombo(newCombo);

      const gained = 10 + (isPerfect ? 40 + newCombo * 10 : 0);
      setScore((s) => s + gained);

      lastTopBodyRef.current = body;
      spawnAimingPiece();
    },
    [spawnAimingPiece],
  );

  const setupGame = useCallback(() => {
    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    if (engineRef.current) {
      Events.off(engineRef.current);
      Composite.clear(engineRef.current.world, false);
      Engine.clear(engineRef.current);
    }
    clearTimers();
    piecesRef.current = [];
    aimingBodyRef.current = null;
    lastTopBodyRef.current = null;
    settledCountRef.current = 0;
    collapseTriggeredRef.current = false;
    cameraRef.current = 0;
    comboRef.current = 0;
    setCombo(0);
    setScore(0);

    const engine = Engine.create();
    engine.enableSleeping = true;
    engine.positionIterations = 12;
    engine.velocityIterations = 8;
    // Default gravity is gentle enough that a just-released piece can sit
    // below Matter's sleep-motion threshold for its first ~1s of falling —
    // long enough to be marked asleep (and thus "settled") before it has
    // actually reached anything. A stronger pull avoids that false sleep.
    engine.gravity.scale = 0.0028;
    engineRef.current = engine;

    const floorY = height - PLATFORM_FLOAT;
    const platformWidth = getPlatformWidth(width);
    platformWidthRef.current = platformWidth;
    const floor = Bodies.rectangle(width / 2, floorY + 20, platformWidth, 36, {
      isStatic: true,
      label: "floor",
      friction: 1,
      chamfer: { radius: 10 },
    });
    // No side walls: on narrow screens the platform nearly spans the width,
    // and walls would let overhanging pieces lean on them instead of falling.
    Composite.add(engine.world, floor);

    Events.on(engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        // Collisions report the individual cells; the piece is their parent.
        const pieceA = pair.bodyA.parent;
        const pieceB = pair.bodyB.parent;
        if (pieceA.label === "piece" && pieceA.phase === "falling") pieceA.hasContacted = true;
        if (pieceB.label === "piece" && pieceB.phase === "falling") pieceB.hasContacted = true;
      }
    });

    spawnAimingPiece();
  }, [clearTimers, spawnAimingPiece]);

  const beginGame = useCallback(
    (isDaily = false) => {
      dailyRef.current = isDaily;
      setDaily(isDaily);
      rngRef.current = isDaily ? dailyRandom("stack") : Math.random;
      setupGame();
      start();
    },
    [setupGame, start],
  );

  useEffect(() => {
    return () => {
      clearTimers();
      if (engineRef.current) {
        Events.off(engineRef.current);
        Composite.clear(engineRef.current.world, false);
        Engine.clear(engineRef.current);
      }
    };
  }, [clearTimers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    function resize() {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!engineRef.current) {
        setupGame();
      }
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [setupGame]);

  // Movement is a dedicated slider (0-100%), not touch/mouse drag over the
  // stage — dragging the thumb sets the aiming piece's position directly.
  // Dropping is a separate, deliberate button press, so neither control can
  // trigger the other by accident.
  const handleSliderChange = useCallback((e) => {
    const pct = Number(e.target.value);
    setSliderValue(pct);
    if (statusRef.current !== "playing" || collapseTriggeredRef.current) return;
    const body = aimingBodyRef.current;
    if (!body) return;
    body.aimPct = pct;
    placeAimingBody(body, sizeRef.current.width);
  }, []);

  const handleRotatePress = useCallback(() => {
    if (statusRef.current !== "playing" || collapseTriggeredRef.current) return;
    const body = aimingBodyRef.current;
    if (!body) return;
    body.aimAngle += Math.PI / 2;
    placeAimingBody(body, sizeRef.current.width);
  }, []);

  const handleDropPress = useCallback(() => {
    if (statusRef.current !== "playing" || collapseTriggeredRef.current) return;
    const body = aimingBodyRef.current;
    if (!body) return;
    aimingBodyRef.current = null;
    body.phase = "falling";
    // Safety net: if the piece never reports as asleep (e.g. it settles into a
    // slow perpetual micro-wobble), force the settle check after a while so
    // the round can't stall forever.
    settleTimeoutRef.current = setTimeout(() => checkSettle(body), SETTLE_FALLBACK_MS);
  }, [checkSettle]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let lastTime = null;
    let accumulator = 0;
    const STEP = 1000 / 60;

    function frame(now) {
      if (lastTime == null) lastTime = now;
      const frameDt = Math.min(now - lastTime, 100);
      lastTime = now;

      const { width, height } = sizeRef.current;
      const engine = engineRef.current;

      if (engine && (statusRef.current === "playing" || collapseTriggeredRef.current)) {
        accumulator += frameDt;
        let steps = 0;
        while (accumulator >= STEP && steps < 5) {
          const aiming = aimingBodyRef.current;
          if (aiming) {
            Body.setPosition(aiming, { x: aiming.aimingX, y: aiming.aimingY });
            Body.setVelocity(aiming, { x: 0, y: 0 });
            Body.setAngularVelocity(aiming, 0);
            if (aiming.angle !== aiming.aimAngle) Body.setAngle(aiming, aiming.aimAngle);
          }
          Engine.update(engine, STEP);
          accumulator -= STEP;
          steps += 1;
        }

        if (!collapseTriggeredRef.current) {
          const floorY = height - PLATFORM_FLOAT;
          for (const body of piecesRef.current) {
            if (body.phase !== "aiming" && body.bounds.min.y > floorY + FELL_OFF_MARGIN) {
              // Entirely below the platform surface — nothing left to catch it.
              triggerCollapse();
              break;
            }
            if (body.phase === "falling") {
              if (!body.hasContacted && body.isSleeping) {
                // Weak gravity can let a just-released piece's motion dip
                // below Matter's sleep threshold before it has actually
                // reached anything — force it back awake so it keeps falling.
                Sleeping.set(body, false);
              } else if (body.hasContacted && body.isSleeping) {
                checkSettle(body);
              }
            }
          }
        }
      }

      const floorY = height - PLATFORM_FLOAT;
      const topOfTowerY = getTowerTop(piecesRef.current, floorY);
      const comfortMargin = 150;
      const targetCamera = Math.max(0, comfortMargin - topOfTowerY);
      cameraRef.current += (targetCamera - cameraRef.current) * Math.min((frameDt / 1000) * 6, 1);

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#eaf4fb";
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      ctx.translate(0, cameraRef.current);

      const platformWidth = platformWidthRef.current;
      const platformX = width / 2 - platformWidth / 2;
      const platformTopH = 20;
      const platformUndersideH = 16;

      // Soft shadow in the open air below — sells the "floating" read.
      ctx.fillStyle = "rgba(4, 119, 182, 0.14)";
      ctx.beginPath();
      ctx.ellipse(width / 2, floorY + platformTopH + platformUndersideH + 22, platformWidth * 0.4, 9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Underside band gives the slab visible thickness and a clear edge —
      // past it on either side is open air, so the safe zone reads at a glance.
      ctx.fillStyle = "#8fc3e0";
      ctx.beginPath();
      ctx.roundRect(platformX, floorY + platformTopH * 0.5, platformWidth, platformTopH * 0.5 + platformUndersideH, 10);
      ctx.fill();

      ctx.fillStyle = "#bcdcee";
      ctx.beginPath();
      ctx.roundRect(platformX, floorY, platformWidth, platformTopH, 10);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.roundRect(platformX + 6, floorY + 3, platformWidth - 12, 4, 3);
      ctx.fill();

      for (const body of piecesRef.current) {
        drawPiece(ctx, body);
        if (body.perfect) {
          drawPerfectBadge(ctx, body.facePart.position.x, body.facePart.position.y - body.cellSize * 0.75, 6);
        }
      }

      ctx.restore();

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [triggerCollapse, checkSettle]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Stack Tower"
      score={score}
      best={daily ? dailyBest : highScore}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={daily ? dailyBest : highScore}
            isNewBest={result.isNewBest}
            title={result.won === false ? "Tower toppled!" : "You did it!"}
            emoji={result.won === false ? "🫠" : "🎉"}
            celebrate={result.isNewBest}
            stats={[{ label: "Height", value: result.level }]}
            shareText={result.mode === "daily" ? `Stack Tower · Daily ${result.date}: ${result.level} blocks high, ${result.score} points 🏗️ Same pieces for everyone today!` : undefined}
            onRestart={() => beginGame(daily)}
          />
        ) : null
      }
    >
      <div ref={containerRef} className="touch-none-game absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" />

        {status === "idle" && (
          <div className="bg-fluffy-cream/95 absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">How high can you stack?</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Use the slider to line up each block, Rotate to turn it, then tap Drop to place it. Keep the tower balanced — tip it
              too far and it all comes down!
            </p>
            <button type="button" className="btn btn-primary" onClick={() => beginGame(false)}>
              Start
            </button>
            <DailyModeButton onClick={() => beginGame(true)} best={dailyBest || null} />
          </div>
        )}

        {combo > 1 && status === "playing" && (
          <div className="bg-fluffy-gold pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white">
            Combo x{combo}
          </div>
        )}

        {status === "playing" && (
          <div className="absolute bottom-6 left-1/2 flex w-[85%] max-w-xs -translate-x-1/2 flex-col items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={sliderValue}
              onChange={handleSliderChange}
              aria-label="Move piece left and right"
              className="accent-fluffy-primary h-11 w-full"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleRotatePress}
                aria-label="Rotate piece"
                className="btn btn-secondary min-h-11 min-w-24 px-5 shadow-lg"
              >
                Rotate
              </button>
              <button type="button" onClick={handleDropPress} className="btn btn-primary min-h-11 min-w-32 px-8 shadow-lg">
                Drop
              </button>
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}
