import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import PlayerZone from "@/games/components/PlayerZone";
import { useFitStage } from "@/games/hooks/useFitStage";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { drawDoubleBanner, phaseBannerText } from "@/games/utils/canvasBanner";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";

const W = 360;
const H = 640;
const ROUND_SECONDS = 45;
const COUNTDOWN_SECONDS = 3;
const SNACK_R = 16;
const MAX_SNACKS = 11;
const SPAWN_EVERY = 0.4;
const GOLDEN_CHANCE = 0.12;
// A chomp: lunge out, hold, pull back, then a short cooldown.
const OUT = 0.16;
const HOLD = 0.06;
const BACK = 0.18;
const TUNING = {
  kid: { mouth: 40, cooldown: 0.12 },
  grownup: { mouth: 30, cooldown: 0.3 },
};
// How far a chomper can reach: up to just short of the center line.
const REACH = H / 2 - 18;
const PLAYER_COLORS = ["#0477b6", "#d9a85b"];
const SNACKS = gameAssets.fruits;
const GOLDEN = gameAssets.decorative.gift;

let uid = 0;

function makeWorld(levels) {
  return {
    levels,
    snacks: [],
    sinceSpawn: SPAWN_EVERY,
    chompers: [0, 1].map(() => ({ x: W / 2, t: Infinity, eatenFlash: 0 })),
  };
}

// Chomper head position (distance from its own edge) at time t into a chomp.
function reachAt(t) {
  if (t < OUT) return REACH * (t / OUT);
  if (t < OUT + HOLD) return REACH;
  if (t < OUT + HOLD + BACK) return REACH * (1 - (t - OUT - HOLD) / BACK);
  return 0;
}

// Resting heads sit fully inside the table, just off the player's edge.
function headOf(player, chomper, mouth) {
  const d = mouth + 6 + reachAt(chomper.t);
  return { x: chomper.x, y: player === 0 ? H - d : d };
}

// Same-device snack grab: fruit rolls around the table; tap your half and
// your chomper lunges to that x and snaps up whatever is in reach.
export default function SnackSnap({ onGameComplete }) {
  const tableRef = useRef(null);
  const canvasRef = useRef(null);
  const worldRef = useRef(makeWorld(["grownup", "kid"]));
  const phaseRef = useRef({ name: "countdown", time: 0, until: COUNTDOWN_SECONDS });
  const scoreRef = useRef([0, 0]);
  const imagesRef = useRef({});
  const statusRef = useRef("idle");

  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [scores, setScores] = useState([0, 0]);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "snack-snap",
    onComplete: onGameComplete,
  });
  const { areaRef, size } = useFitStage(W, H, status !== "idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    loadAssetCanvases([...SNACKS, GOLDEN], { size: 96 }).then((c) => {
      if (!cancelled) imagesRef.current = c;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const [a, b] = scoreRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: 1, mode: "together", snacks: scoreRef.current, winner: a === b ? 0 : a > b ? 1 : 2 });
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
        if (phase.name === "countdown" && phase.time >= phase.until) phaseRef.current = { name: "play", time: 0, until: ROUND_SECONDS };
        if (phaseRef.current.name === "play") {
          const play = phaseRef.current;
          update(world, dt, scoreRef, setScores);
          setTimeLeft(Math.max(0, Math.ceil(ROUND_SECONDS - play.time)));
          if (play.time >= ROUND_SECONDS) {
            const [a, b] = scoreRef.current;
            phaseRef.current = { name: "over", time: 0, until: Infinity, scorer: a === b ? undefined : a > b ? 0 : 1 };
            setTimeout(() => endGameRef.current(), 900);
          }
        }
      }
      draw(ctx, scale, world, phaseRef.current, scoreRef.current, imagesRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const chomp = useCallback((player, point) => {
    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect || statusRef.current !== "playing" || phaseRef.current.name !== "play") return;
    const world = worldRef.current;
    const c = world.chompers[player];
    const busyFor = OUT + HOLD + BACK + TUNING[world.levels[player]].cooldown;
    if (c.t < busyFor) return;
    const mouth = TUNING[world.levels[player]].mouth;
    c.x = Math.max(mouth, Math.min(W - mouth, ((point.x - rect.left) * W) / rect.width));
    c.t = 0;
  }, []);

  const beginGame = useCallback(() => {
    worldRef.current = makeWorld(levels);
    phaseRef.current = { name: "countdown", time: 0, until: COUNTDOWN_SECONDS };
    scoreRef.current = [0, 0];
    setScores([0, 0]);
    setTimeLeft(ROUND_SECONDS);
    statusRef.current = "playing";
    start();
  }, [levels, start]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Snack Snap"
      score={`${scores[0]} · ${scores[1]}`}
      scoreLabel="P1 · P2"
      timeLabel={status !== "idle" ? formatTime(timeLeft) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={result.winner ? `Player ${result.winner} wins!` : "It's a tie!"}
            emoji="🍉"
            scoreLabel="Snacks"
            score={`${result.snacks[0]} – ${result.snacks[1]}`}
            stats={[{ label: "Round", value: `${ROUND_SECONDS}s` }]}
            shareText={`We played Snack Snap on Fluffy Play — ${result.winner ? `Player ${result.winner} won` : "it's a tie"} (${result.snacks[0]}–${result.snacks[1]})! 🍉`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="flex gap-2" aria-hidden="true">
            {SNACKS.slice(2, 6).map((s) => (
              <img key={s.id} src={s.src} alt="" className="h-10 w-10" draggable={false} />
            ))}
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Snap up the snacks!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Fruit rolls around the table. Tap anywhere in your half and your chomper lunges there to snap it up. Gifts
              are worth 3. Most snacks in {ROUND_SECONDS} seconds wins!
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">Kids get a bigger mouth that snaps back faster.</p>
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
              <PlayerZone player={1} onStart={chomp} />
              <PlayerZone player={0} onStart={chomp} />
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function update(world, dt, scoreRef, setScores) {
  // Spawn from the middle, rolling in a random direction.
  world.sinceSpawn += dt;
  if (world.snacks.length < MAX_SNACKS && world.sinceSpawn >= SPAWN_EVERY) {
    world.sinceSpawn = 0;
    const angle = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 70;
    const golden = Math.random() < GOLDEN_CHANCE;
    world.snacks.push({
      id: ++uid,
      x: W / 2 + (Math.random() - 0.5) * 60,
      y: H / 2 + (Math.random() - 0.5) * 60,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      golden,
      item: golden ? GOLDEN.id : SNACKS[Math.floor(Math.random() * SNACKS.length)].id,
      spin: Math.random() * Math.PI * 2,
    });
  }

  world.snacks.forEach((s) => {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.spin += dt * (s.vx > 0 ? 2 : -2);
    if (s.x < SNACK_R || s.x > W - SNACK_R) {
      s.vx *= -1;
      s.x = Math.max(SNACK_R, Math.min(W - SNACK_R, s.x));
    }
    if (s.y < SNACK_R || s.y > H - SNACK_R) {
      s.vy *= -1;
      s.y = Math.max(SNACK_R, Math.min(H - SNACK_R, s.y));
    }
  });

  world.chompers.forEach((c, player) => {
    c.t += dt;
    c.eatenFlash = Math.max(0, c.eatenFlash - dt);
    if (c.t > OUT + HOLD + BACK) return;
    const mouth = TUNING[world.levels[player]].mouth;
    const head = headOf(player, c, mouth);
    const eaten = world.snacks.filter((s) => Math.hypot(s.x - head.x, s.y - head.y) < mouth + SNACK_R * 0.6);
    if (!eaten.length) return;
    const points = eaten.reduce((sum, s) => sum + (s.golden ? 3 : 1), 0);
    world.snacks = world.snacks.filter((s) => !eaten.includes(s));
    scoreRef.current = scoreRef.current.map((n, i) => (i === player ? n + points : n));
    setScores(scoreRef.current);
    c.eatenFlash = 0.3;
    navigator.vibrate?.(10);
  });
}

function draw(ctx, s, world, phase, scores, images) {
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fdf6ec";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 22);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.strokeStyle = "#f1e4cf";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(10, H / 2);
  ctx.lineTo(W - 10, H / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Big faint scores facing each player.
  ctx.font = "800 64px Poppins, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(4, 119, 182, 0.13)";
  ctx.fillText(String(scores[0]), W / 2, H * 0.64);
  ctx.save();
  ctx.translate(W / 2, H * 0.36);
  ctx.rotate(Math.PI);
  ctx.fillStyle = "rgba(217, 168, 91, 0.2)";
  ctx.fillText(String(scores[1]), 0, 0);
  ctx.restore();

  world.snacks.forEach((snack) => {
    const img = images[snack.item];
    ctx.save();
    ctx.translate(snack.x, snack.y);
    if (snack.golden) {
      ctx.fillStyle = "rgba(254, 210, 58, 0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, SNACK_R + 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.rotate(snack.spin);
    if (img) ctx.drawImage(img, -SNACK_R - 2, -SNACK_R - 2, SNACK_R * 2 + 4, SNACK_R * 2 + 4);
    ctx.restore();
  });

  // Chompers: a neck from the player's edge to a round head with a mouth,
  // clipped inside the table's white rim so the neck never pokes past it.
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 8, 18);
  ctx.clip();
  world.chompers.forEach((c, player) => {
    const mouth = TUNING[world.levels[player]].mouth;
    const head = headOf(player, c, mouth);
    const edgeY = player === 0 ? H : 0;
    const color = PLAYER_COLORS[player];
    ctx.strokeStyle = color;
    ctx.lineWidth = mouth * 0.9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(head.x, edgeY);
    ctx.lineTo(head.x, head.y);
    ctx.stroke();
    ctx.save();
    ctx.translate(head.x, head.y);
    if (player === 1) ctx.rotate(Math.PI);
    const open = c.t < OUT + HOLD ? 0.55 : 0.12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, mouth, -Math.PI / 2 + open, -Math.PI / 2 - open + Math.PI * 2);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = c.eatenFlash > 0 ? "#fed23a" : "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    // eyes
    ctx.fillStyle = "#ffffff";
    [-mouth * 0.4, mouth * 0.4].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex, mouth * 0.25, mouth * 0.18, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#4b5563";
    [-mouth * 0.4, mouth * 0.4].forEach((ex) => {
      ctx.beginPath();
      ctx.arc(ex, mouth * 0.22, mouth * 0.08, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });
  ctx.restore();

  const text = phaseBannerText(phase);
  if (text) drawDoubleBanner(ctx, W, H, phase.name === "over" && phase.scorer === undefined ? "It's a tie!" : text, phase.scorer !== undefined ? PLAYER_COLORS[phase.scorer] : "#0477b6");
}
