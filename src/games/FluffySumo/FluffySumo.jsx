import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import PlayerZone from "@/games/components/PlayerZone";
import { useFitStage } from "@/games/hooks/useFitStage";
import { useGameResult } from "@/games/hooks/useGameResult";
import { drawDoubleBanner, phaseBannerText } from "@/games/utils/canvasBanner";
import { drawFluffy } from "@/games/characters/drawFluffy";
import { CENTER, H, RING_R, STICK_RANGE, W, makeRound, ringRadius, step } from "./sumoPhysics";

const WIN_ROUNDS = 3;
const COUNTDOWN_SECONDS = 3;
const POINT_PAUSE = 1.4;
const SUBSTEP = 1 / 240;
const PLAYER_COLORS = ["#0477b6", "#d9a85b"];

// Same-device sumo: drag in your half like a joystick to push your Fluffy;
// bump the other one out of the ring. Each half is its own PlayerZone, so
// both joysticks work at once.
export default function FluffySumo({ onGameComplete }) {
  const tableRef = useRef(null);
  const canvasRef = useRef(null);
  const roundRef = useRef(makeRound(["grownup", "kid"]));
  const phaseRef = useRef({ name: "countdown", time: 0, until: COUNTDOWN_SECONDS });
  const winsRef = useRef([0, 0]);
  const statusRef = useRef("idle");
  const levelsRef = useRef(["grownup", "kid"]);

  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [wins, setWins] = useState([0, 0]);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "fluffy-sumo",
    onComplete: onGameComplete,
  });
  const { areaRef, size } = useFitStage(W, H, status !== "idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const [a, b] = winsRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: a + b, mode: "together", rounds: winsRef.current, winner: a > b ? 1 : 2 });
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
    let acc = 0;

    const tick = (now) => {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const phase = phaseRef.current;
      if (statusRef.current === "playing") {
        phase.time += dt;
        if (phase.name === "play") {
          acc += dt;
          while (acc >= SUBSTEP) {
            acc -= SUBSTEP;
            const events = step(roundRef.current, SUBSTEP);
            if (events.bump) navigator.vibrate?.(8);
            if (events.out !== undefined) {
              const winner = 1 - events.out;
              const next = winsRef.current.map((n, i) => (i === winner ? n + 1 : n));
              winsRef.current = next;
              setWins(next);
              navigator.vibrate?.([30, 40, 30]);
              if (next[winner] >= WIN_ROUNDS) {
                phaseRef.current = { name: "over", time: 0, until: Infinity, scorer: winner };
                setTimeout(() => endGameRef.current(), 1000);
              } else {
                phaseRef.current = { name: "point", time: 0, until: POINT_PAUSE, scorer: winner, loser: events.out };
              }
              acc = 0;
              break;
            }
          }
        } else if (phase.time >= phase.until && (phase.name === "countdown" || phase.name === "point")) {
          const sticks = roundRef.current.fluffies.map((f) => f.stick);
          roundRef.current = makeRound(levelsRef.current);
          // Keep any finger that's still down.
          roundRef.current.fluffies.forEach((f, i) => (f.stick = sticks[i]));
          phaseRef.current = { name: "play", time: 0, until: Infinity };
        }
      }
      draw(ctx, scale, roundRef.current, phaseRef.current, winsRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  const toTable = (point) => {
    const rect = tableRef.current.getBoundingClientRect();
    return { x: ((point.x - rect.left) * W) / rect.width, y: ((point.y - rect.top) * H) / rect.height };
  };
  const stickStart = useCallback((player, point) => {
    if (statusRef.current !== "playing" || !tableRef.current) return;
    const p = toTable(point);
    roundRef.current.fluffies[player].stick = { ax: p.x, ay: p.y, x: p.x, y: p.y };
  }, []);
  const stickMove = useCallback((player, point) => {
    const stick = roundRef.current.fluffies[player].stick;
    if (!stick || !tableRef.current) return;
    const p = toTable(point);
    stick.x = p.x;
    stick.y = p.y;
  }, []);
  const stickEnd = useCallback((player) => {
    roundRef.current.fluffies[player].stick = null;
  }, []);

  const beginGame = useCallback(() => {
    levelsRef.current = levels;
    roundRef.current = makeRound(levels);
    phaseRef.current = { name: "countdown", time: 0, until: COUNTDOWN_SECONDS };
    winsRef.current = [0, 0];
    setWins([0, 0]);
    statusRef.current = "playing";
    start();
  }, [levels, start]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Fluffy Sumo"
      score={`${wins[0]} · ${wins[1]}`}
      scoreLabel="P1 · P2"
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={`Player ${result.winner} wins!`}
            emoji="🤼"
            scoreLabel="Rounds"
            score={`${result.rounds[0]} – ${result.rounds[1]}`}
            stats={[{ label: "First to", value: WIN_ROUNDS }]}
            shareText={`We played Fluffy Sumo on Fluffy Play — Player ${result.winner} won ${Math.max(...result.rounds)}–${Math.min(...result.rounds)}! 🤼`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-fluffy-bg shadow-sm" aria-hidden="true">
            <span className="absolute top-4 h-7 w-7 rounded-full" style={{ background: PLAYER_COLORS[1] }} />
            <span className="absolute bottom-4 h-7 w-7 rounded-full" style={{ background: PLAYER_COLORS[0] }} />
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Bump them off the ice!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Press anywhere in your half and drag like a joystick to push your Fluffy. Knock the other one out of the ring
              to win the round — first to {WIN_ROUNDS}. The ring shrinks if a round goes on too long.
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">A Kid's Fluffy is heavier and harder to push out.</p>
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
              <PlayerZone player={1} onStart={stickStart} onMove={stickMove} onEnd={stickEnd} />
              <PlayerZone player={0} onStart={stickStart} onMove={stickMove} onEnd={stickEnd} />
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function draw(ctx, s, round, phase, wins) {
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);
  // Snowy table.
  ctx.fillStyle = "#dcebf7";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 22);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.stroke();

  // Ring: the full-size edge stays faint so shrinking is visible.
  ctx.strokeStyle = "rgba(4, 119, 182, 0.18)";
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(CENTER.x, CENTER.y, RING_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const radius = ringRadius(round);
  ctx.fillStyle = "#f4f9fd";
  ctx.beginPath();
  ctx.arc(CENTER.x, CENTER.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#a9d2f2";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = "#d6e9f8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CENTER.x - radius + 10, CENTER.y);
  ctx.lineTo(CENTER.x + radius - 10, CENTER.y);
  ctx.stroke();

  // Round wins as dots on each player's side.
  [0, 1].forEach((i) => {
    for (let k = 0; k < WIN_ROUNDS; k++) {
      const x = W / 2 + (k - 1) * 22;
      const y = i === 0 ? H - 36 : 36;
      ctx.fillStyle = k < wins[i] ? PLAYER_COLORS[i] : "rgba(255,255,255,0.8)";
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Joysticks: where each finger went down, and where it is now.
  round.fluffies.forEach((f, i) => {
    if (!f.stick) return;
    let dx = f.stick.x - f.stick.ax;
    let dy = f.stick.y - f.stick.ay;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RANGE) {
      dx *= STICK_RANGE / len;
      dy *= STICK_RANGE / len;
    }
    ctx.strokeStyle = `${PLAYER_COLORS[i]}66`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(f.stick.ax, f.stick.ay, STICK_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = `${PLAYER_COLORS[i]}99`;
    ctx.beginPath();
    ctx.arc(f.stick.ax + dx, f.stick.ay + dy, 18, 0, Math.PI * 2);
    ctx.fill();
  });

  round.fluffies.forEach((f, i) => {
    const out = phase.name === "point" && phase.loser === i;
    ctx.globalAlpha = out ? Math.max(0.2, 1 - phase.time) : 1;
    drawFluffy(ctx, f.x, f.y, f.r, PLAYER_COLORS[i], i === 0);
    ctx.globalAlpha = 1;
  });

  const text = phaseBannerText(phase, { point: (ph) => `Round to Player ${ph.scorer + 1}!` });
  if (text) drawDoubleBanner(ctx, W, H, text, phase.scorer !== undefined ? PLAYER_COLORS[phase.scorer] : "#0477b6");
}
