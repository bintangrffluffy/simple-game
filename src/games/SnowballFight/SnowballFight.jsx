import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import PlayerZone from "@/games/components/PlayerZone";
import { useFitStage } from "@/games/hooks/useFitStage";
import { useGameResult } from "@/games/hooks/useGameResult";
import { drawDoubleBanner, phaseBannerText } from "@/games/utils/canvasBanner";
import { drawFluffy } from "@/games/characters/drawFluffy";
import { STAGE_NOTICES, fortsOf, hitFort, makeLayout, queueLayout, stageFor, stepLayout } from "./forts";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";

const W = 360;
const H = 640;
const WIN_HITS = 5;
const COUNTDOWN_SECONDS = 3;
const LANE_Y = [H - 64, 64];
const BALL_R = 9;
const MOVE_SPEED = 420;
const TAP_MS = 250;
const TAP_PX = 12;
// Forward flick speed (px/s, table units) that counts as a throw.
const FLICK_SPEED = 380;
// Throws can angle at most this far from straight ahead.
const MAX_ANGLE = Math.PI / 4;
const INVULNERABLE = 0.45;
// Kid: smaller hitbox, faster snowballs, shorter reload.
const TUNING = {
  kid: { hitbox: 17, ballSpeed: 540, cooldown: 0.4 },
  grownup: { hitbox: 23, ballSpeed: 430, cooldown: 0.6 },
};
const NOTICE_SECONDS = 1.6;
// After every hit both Fluffies go back to the middle of their lanes and play
// pauses this long, so the reset is easy to see.
const HIT_PAUSE = 1;
// Power-ups drift along the center line (same distance from both players)
// and are claimed by hitting them with a snowball.
const POWERUP_FIRST = 5;
const POWERUP_EVERY = 7;
const POWERUP_LIFE = 9;
const POWERUP_R = 18;
const RAPID_SECONDS = 5;
const RAPID_FACTOR = 0.4;
const TRIPLE_SHOTS = 3;
const SPREAD = 0.28;
const scene = (id) => gameAssets.sceneItems.find((item) => item.id === id);
const POWERUPS = {
  shield: { label: "a shield", asset: scene("gloves") },
  rapid: { label: "rapid fire", asset: scene("hot-beverage") },
  triple: { label: "triple shot", asset: gameAssets.decorative.logo },
};
const POWERUP_KINDS = Object.keys(POWERUPS);
const PLAYER_COLORS = ["#0477b6", "#d9a85b"];

let uid = 0;

function makeWorld(levels) {
  return {
    levels,
    balls: [],
    splashes: [],
    // Forts escalate with total hits (see forts.js); notice = "Forts are moving!" etc.
    layout: makeLayout(0),
    notice: null,
    time: 0,
    powerup: null,
    nextPowerupAt: POWERUP_FIRST,
    fluffies: [0, 1].map((i) => ({
      x: W / 2,
      tx: W / 2,
      y: LANE_Y[i],
      reload: 0,
      reloadMax: 1,
      hitFlash: 0,
      shield: false,
      rapidUntil: 0,
      triple: 0,
    })),
  };
}

// Same-device snowball fight: slide your Fluffy along your edge, flick
// toward the other side (or just tap) to throw. Forts block snowballs.
export default function SnowballFight({ onGameComplete }) {
  const tableRef = useRef(null);
  const canvasRef = useRef(null);
  const worldRef = useRef(makeWorld(["grownup", "kid"]));
  const phaseRef = useRef({ name: "countdown", time: 0, until: COUNTDOWN_SECONDS });
  const hitsRef = useRef([0, 0]);
  const gestureRef = useRef([null, null]);
  const statusRef = useRef("idle");
  const imagesRef = useRef({});

  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [hits, setHits] = useState([0, 0]);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "snowball-fight",
    onComplete: onGameComplete,
  });
  const { areaRef, size } = useFitStage(W, H, status !== "idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    loadAssetCanvases(POWERUP_KINDS.map((k) => POWERUPS[k].asset), { size: 64 }).then((c) => {
      if (!cancelled) imagesRef.current = c;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const [a, b] = hitsRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: 1, mode: "together", hits: hitsRef.current, winner: a > b ? 1 : 2 });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.width) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    const ctx = canvas.getContext("2d");
    const scale = (size.width / W) * dpr;
    let raf;
    let last = null;

    const tick = (now) => {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      const phase = phaseRef.current;
      if (statusRef.current === "playing") {
        phase.time += dt;
        if ((phase.name === "countdown" || phase.name === "point") && phase.time >= phase.until) {
          phaseRef.current = { name: "play", time: 0, until: Infinity };
        }
        update(world, dt, phaseRef.current.name === "play", (thrower) => {
          const next = hitsRef.current.map((n, i) => (i === thrower ? n + 1 : n));
          hitsRef.current = next;
          setHits(next);
          navigator.vibrate?.([25, 30, 25]);
          // Every couple of hits the forts step up: sliding, more, shuffling.
          const stage = stageFor(next[0] + next[1]);
          if (stage > world.layout.stage && Math.max(...next) < WIN_HITS) {
            queueLayout(world.layout, makeLayout(stage));
            world.notice = { text: STAGE_NOTICES[stage], life: NOTICE_SECONDS };
          }
          // A hit resets the round: both back to the middle, the one who got
          // hit loses their power-ups, fingers still down are ignored.
          resetAfterHit(world, 1 - thrower);
          gestureRef.current = [null, null];
          if (next[thrower] >= WIN_HITS && phaseRef.current.name === "play") {
            phaseRef.current = { name: "over", time: 0, until: Infinity, scorer: thrower };
            setTimeout(() => endGameRef.current(), 1000);
          } else if (phaseRef.current.name === "play") {
            phaseRef.current = { name: "point", time: 0, until: HIT_PAUSE, scorer: thrower };
          }
        });
      }
      draw(ctx, scale, world, phaseRef.current, hitsRef.current, imagesRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const toTable = (point) => {
    const rect = tableRef.current.getBoundingClientRect();
    return { x: ((point.x - rect.left) * W) / rect.width, y: ((point.y - rect.top) * H) / rect.height };
  };

  const throwBall = (player, dirX, dirY) => {
    const world = worldRef.current;
    const f = world.fluffies[player];
    if (phaseRef.current.name !== "play" || f.reload > 0) return;
    const forward = player === 0 ? -1 : 1;
    // Clamp the angle so snowballs always head toward the other side.
    let angle = Math.atan2(dirX, dirY * forward);
    angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
    const tune = TUNING[world.levels[player]];
    // Triple shot fans out three snowballs.
    const angles = f.triple > 0 ? [angle - SPREAD, angle, angle + SPREAD] : [angle];
    if (f.triple > 0) f.triple -= 1;
    angles.forEach((a) =>
      world.balls.push({
        id: ++uid,
        owner: player,
        x: f.x,
        y: f.y + forward * 30,
        vx: Math.sin(a) * tune.ballSpeed,
        vy: Math.cos(a) * tune.ballSpeed * forward,
      }),
    );
    f.reload = tune.cooldown * (world.time < f.rapidUntil ? RAPID_FACTOR : 1);
    f.reloadMax = f.reload;
  };

  const onStart = useCallback((player, point, e) => {
    if (statusRef.current !== "playing" || !tableRef.current) return;
    const p = toTable(point);
    gestureRef.current[player] = { start: { ...p, t: e.timeStamp }, samples: [{ ...p, t: e.timeStamp }] };
    worldRef.current.fluffies[player].tx = p.x;
  }, []);
  const onMove = useCallback((player, point, e) => {
    const g = gestureRef.current[player];
    if (!g || !tableRef.current) return;
    const p = toTable(point);
    g.samples.push({ ...p, t: e.timeStamp });
    worldRef.current.fluffies[player].tx = p.x;
  }, []);
  const onEnd = useCallback((player, point, e) => {
    const g = gestureRef.current[player];
    gestureRef.current[player] = null;
    if (!g || statusRef.current !== "playing") return;
    const lastSample = g.samples[g.samples.length - 1];
    const moved = Math.hypot(lastSample.x - g.start.x, lastSample.y - g.start.y);
    if (moved < TAP_PX && e.timeStamp - g.start.t < TAP_MS) {
      throwBall(player, 0, player === 0 ? -1 : 1); // tap = straight throw
      return;
    }
    // Flick: velocity over the last ~90ms of movement, toward the other side.
    const recent = g.samples.find((s) => lastSample.t - s.t <= 90) ?? g.samples[0];
    const dt = Math.max(16, lastSample.t - recent.t) / 1000;
    const vx = (lastSample.x - recent.x) / dt;
    const vy = (lastSample.y - recent.y) / dt;
    const forwardSpeed = player === 0 ? -vy : vy;
    if (forwardSpeed > FLICK_SPEED && e.timeStamp - lastSample.t < 80) throwBall(player, vx, vy);
  }, []);

  const beginGame = useCallback(() => {
    worldRef.current = makeWorld(levels);
    phaseRef.current = { name: "countdown", time: 0, until: COUNTDOWN_SECONDS };
    hitsRef.current = [0, 0];
    gestureRef.current = [null, null];
    setHits([0, 0]);
    statusRef.current = "playing";
    start();
  }, [levels, start]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Snowball Fight"
      score={`${hits[0]} · ${hits[1]}`}
      scoreLabel="P1 · P2"
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={`Player ${result.winner} wins!`}
            emoji="☃️"
            scoreLabel="Hits"
            score={`${result.hits[0]} – ${result.hits[1]}`}
            stats={[{ label: "First to", value: WIN_HITS }]}
            shareText={`We had a Snowball Fight on Fluffy Play — Player ${result.winner} won ${Math.max(...result.hits)}–${Math.min(...result.hits)}! ☃️`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="text-5xl" aria-hidden="true">
            ☃️
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Snowball fight!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Slide your finger to move your Fluffy along your side. Flick toward the other side to throw — or just tap to
              throw straight. Hide behind the snow forts — they crumble after 3 hits, and slide, multiply and shuffle as the fight heats up. Hit the power-ups in the middle for a shield, rapid fire or triple shot! First to {WIN_HITS} hits wins.
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">Kids are harder to hit and throw faster.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : (
        // sm:pb-10 keeps the table clear of GameShell's ~32px overflow on desktop.
        <div className="touch-none-game absolute inset-0 p-2 sm:pb-10">
          <div ref={areaRef} className="flex h-full w-full items-center justify-center">
            <div ref={tableRef} className="relative" style={{ width: size.width, height: size.height }}>
              <canvas ref={canvasRef} className="block" style={{ width: size.width, height: size.height }} />
              <PlayerZone player={1} onStart={onStart} onMove={onMove} onEnd={onEnd} />
              <PlayerZone player={0} onStart={onStart} onMove={onMove} onEnd={onEnd} />
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function update(world, dt, playing, onHit) {
  world.fluffies.forEach((f) => {
    const dx = f.tx - f.x;
    f.x += Math.max(-MOVE_SPEED * dt, Math.min(MOVE_SPEED * dt, dx));
    f.x = Math.max(28, Math.min(W - 28, f.x));
    f.reload = Math.max(0, f.reload - dt);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
  });
  world.splashes = world.splashes.filter((s) => (s.life -= dt) > 0);
  if (world.notice && (world.notice.life -= dt) <= 0) world.notice = null;
  if (!playing) return;
  world.time += dt;
  world.layout = stepLayout(world.layout, dt);
  const forts = fortsOf(world.layout).filter((f) => f.solid);
  updatePowerup(world, dt);

  const survivors = [];
  world.balls.forEach((b) => {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < BALL_R || b.x > W - BALL_R) b.vx *= -1; // bounce off the side walls
    const fort = forts.find((f) => Math.hypot(b.x - f.x, b.y - f.y) < f.r + BALL_R);
    if (fort) {
      const crumbled = hitFort(world.layout, fort.id);
      world.splashes.push({ x: b.x, y: b.y, life: crumbled ? 0.6 : 0.35, hex: crumbled ? "#a9d2f2" : "#ffffff", big: crumbled });
      return;
    }
    const pu = world.powerup;
    if (pu && Math.hypot(b.x - pu.x, b.y - pu.y) < POWERUP_R + BALL_R) {
      claimPowerup(world, b.owner);
      world.splashes.push({ x: pu.x, y: pu.y, life: 0.5, hex: "#fed23a", big: true });
      return;
    }
    const targetIndex = 1 - b.owner;
    const target = world.fluffies[targetIndex];
    const hitbox = TUNING[world.levels[targetIndex]].hitbox;
    if (target.hitFlash <= 0 && Math.hypot(b.x - target.x, b.y - target.y) < hitbox + BALL_R) {
      target.hitFlash = INVULNERABLE;
      if (target.shield) {
        // The shield soaks up this one.
        target.shield = false;
        world.splashes.push({ x: b.x, y: b.y, life: 0.45, hex: "#a9d2f2", big: true });
        return;
      }
      world.splashes.push({ x: b.x, y: b.y, life: 0.45, hex: PLAYER_COLORS[b.owner] });
      onHit(b.owner);
      return;
    }
    if (b.y > -20 && b.y < H + 20) survivors.push(b);
  });
  world.balls = survivors;
}

function resetAfterHit(world, loser) {
  world.balls = [];
  world.fluffies.forEach((f) => {
    f.x = W / 2;
    f.tx = W / 2;
    f.reload = 0;
  });
  const f = world.fluffies[loser];
  f.shield = false;
  f.rapidUntil = 0;
  f.triple = 0;
}

function updatePowerup(world, dt) {
  const pu = world.powerup;
  if (pu) {
    pu.x += pu.vx * dt;
    if (pu.x < POWERUP_R + 8 || pu.x > W - POWERUP_R - 8) pu.vx *= -1;
    if (world.time - pu.born > POWERUP_LIFE) {
      world.powerup = null;
      world.nextPowerupAt = world.time + POWERUP_EVERY;
    }
    return;
  }
  if (world.time < world.nextPowerupAt) return;
  const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
  world.powerup = {
    kind,
    x: POWERUP_R + 20 + Math.random() * (W - 2 * POWERUP_R - 40),
    y: H / 2,
    vx: (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 30),
    born: world.time,
  };
}

function claimPowerup(world, player) {
  const f = world.fluffies[player];
  const { kind } = world.powerup;
  if (kind === "shield") f.shield = true;
  if (kind === "rapid") f.rapidUntil = world.time + RAPID_SECONDS;
  if (kind === "triple") f.triple = TRIPLE_SHOTS;
  world.powerup = null;
  world.nextPowerupAt = world.time + POWERUP_EVERY;
  world.notice = { text: `Player ${player + 1} got ${POWERUPS[kind].label}!`, life: NOTICE_SECONDS };
  navigator.vibrate?.(15);
}

function draw(ctx, s, world, phase, hits, images) {
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#eef6fc";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 22);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.stroke();
  // Each player's lane, clipped to the table's rounded inner edge.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 18);
  ctx.clip();
  [0, 1].forEach((i) => {
    ctx.fillStyle = `${PLAYER_COLORS[i]}14`;
    ctx.fillRect(4, i === 0 ? H - 110 : 4, W - 8, 106);
  });
  ctx.restore();
  ctx.strokeStyle = "#d6e9f8";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(10, H / 2);
  ctx.lineTo(W - 10, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Snow forts: soft mounds with a highlight (faded while they move away).
  ctx.globalAlpha = world.layout.alpha;
  fortsOf(world.layout).forEach((f) => {
    if (f.broken) return;
    ctx.fillStyle = "rgba(75, 85, 99, 0.12)";
    ctx.beginPath();
    ctx.arc(f.x, f.y + 5, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d6e9f8";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#e3f0fa";
    ctx.beginPath();
    ctx.arc(f.x - f.r * 0.3, f.y + f.r * 0.25, f.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (f.hp < 1) {
      // Cracks show a fort that's about to crumble.
      ctx.strokeStyle = "#b9d5ea";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(f.x - f.r * 0.5, f.y - f.r * 0.2);
      ctx.lineTo(f.x - f.r * 0.1, f.y + f.r * 0.05);
      ctx.lineTo(f.x + f.r * 0.15, f.y - f.r * 0.35);
      if (f.hp < 0.5) {
        ctx.moveTo(f.x + f.r * 0.1, f.y + f.r * 0.1);
        ctx.lineTo(f.x + f.r * 0.5, f.y + f.r * 0.35);
      }
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;

  // Power-up: a pulsing badge drifting along the center line.
  const pu = world.powerup;
  if (pu) {
    const left = POWERUP_LIFE - (world.time - pu.born);
    ctx.globalAlpha = left < 2 && Math.floor(left * 6) % 2 === 0 ? 0.4 : 1;
    const pulse = 1 + Math.sin(world.time * 6) * 0.08;
    ctx.fillStyle = "rgba(254, 210, 58, 0.35)";
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, (POWERUP_R + 7) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(pu.x, pu.y, POWERUP_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fed23a";
    ctx.lineWidth = 3;
    ctx.stroke();
    const img = images[POWERUPS[pu.kind].asset.id];
    if (img) ctx.drawImage(img, pu.x - 13, pu.y - 13, 26, 26);
    ctx.globalAlpha = 1;
  }

  // Hit counters as snowflake dots on each side.
  [0, 1].forEach((i) => {
    for (let k = 0; k < WIN_HITS; k++) {
      const x = W / 2 + (k - 2) * 20;
      const y = i === 0 ? H - 16 : 16;
      ctx.fillStyle = k < hits[i] ? PLAYER_COLORS[i] : "rgba(75,85,99,0.15)";
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  world.fluffies.forEach((f, i) => {
    ctx.globalAlpha = f.hitFlash > 0 && Math.floor(f.hitFlash * 20) % 2 === 0 ? 0.35 : 1;
    drawFluffy(ctx, f.x, f.y, 22, PLAYER_COLORS[i], i === 0);
    ctx.globalAlpha = 1;
    // Reload ring.
    if (f.reload > 0) {
      ctx.strokeStyle = `${PLAYER_COLORS[i]}88`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - f.reload / f.reloadMax));
      ctx.stroke();
    }
    drawPowerState(ctx, f, i, world.time, images);
  });

  world.balls.forEach((b) => {
    ctx.fillStyle = "rgba(75, 85, 99, 0.18)";
    ctx.beginPath();
    ctx.arc(b.x, b.y + 4, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[b.owner];
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  world.splashes.forEach((sp) => {
    ctx.fillStyle = sp.hex;
    const bits = sp.big ? 10 : 6;
    for (let k = 0; k < bits; k++) {
      const a = (Math.PI * 2 * k) / bits;
      const d = (0.6 - sp.life) * (sp.big ? 90 : 60) + 6;
      ctx.beginPath();
      ctx.arc(sp.x + Math.cos(a) * d, sp.y + Math.sin(a) * d, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (world.notice) drawNotice(ctx, world.notice.text, Math.min(1, world.notice.life * 3));

  const text = phaseBannerText(phase, { point: (ph) => `Hit! Point for Player ${ph.scorer + 1}` });
  if (text) drawDoubleBanner(ctx, W, H, text, phase.scorer !== undefined ? PLAYER_COLORS[phase.scorer] : "#0477b6");
}

// Shield bubble, rapid-fire cocoa and a "×3" badge, so both players can see
// who holds what. Icons sit on the side facing the center of the table.
function drawPowerState(ctx, f, player, time, images) {
  if (f.shield) {
    ctx.fillStyle = "rgba(169, 210, 242, 0.3)";
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  const side = f.x > W / 2 ? -1 : 1;
  const badges = [];
  if (time < f.rapidUntil) badges.push("rapid");
  if (f.triple > 0) badges.push("triple");
  badges.forEach((kind, k) => {
    const bx = f.x + side * (46 + k * 30);
    const by = f.y;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bx, by, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PLAYER_COLORS[player];
    ctx.lineWidth = 2;
    ctx.stroke();
    const img = images[POWERUPS[kind].asset.id];
    if (img) ctx.drawImage(img, bx - 9, by - 9, 18, 18);
    if (kind === "triple") {
      ctx.save();
      ctx.translate(bx + 10, by + (player === 0 ? -10 : 10));
      if (player === 1) ctx.rotate(Math.PI);
      ctx.font = "800 11px Poppins, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = PLAYER_COLORS[player];
      ctx.fillText(`×${f.triple}`, 0, 0);
      ctx.restore();
    }
  });
}

// Small pill by the center line, once per player (one rotated), so it
// doesn't cover the field for long.
function drawNotice(ctx, text, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = "800 15px Poppins, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(text).width + 24;
  [
    [H / 2 + 44, 0],
    [H / 2 - 44, Math.PI],
  ].forEach(([y, rotation]) => {
    ctx.save();
    ctx.translate(W / 2, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#0477b6";
    ctx.beginPath();
    ctx.roundRect(-width / 2, -15, width, 30, 15);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  });
  ctx.restore();
}
