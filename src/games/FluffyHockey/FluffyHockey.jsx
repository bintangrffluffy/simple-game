import { useCallback, useEffect, useRef, useState } from "react";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import { useGameResult } from "@/games/hooks/useGameResult";
import PlayerZone from "@/games/components/PlayerZone";
import { useFitStage } from "@/games/hooks/useFitStage";
import { drawDoubleBanner, phaseBannerText } from "@/games/utils/canvasBanner";
import { gameAssets, loadAssetCanvases } from "@/games/assets/gameAssets";
import { GOAL_W, H, PUCK_R, W, clampTarget, makeWorld, serve, step } from "./hockeyPhysics";

const WIN_GOALS = 5;
const COUNTDOWN_SECONDS = 3;
const GOAL_PAUSE = 1.2;
const SUBSTEP = 1 / 240;
const PLAYER_COLORS = ["#0477b6", "#d9a85b"];
const PUCK_ITEM = gameAssets.treats.find((t) => t.id === "cookie");

// Same-device air hockey. Player 1 defends the bottom goal, Player 2 the top
// (their score and labels are drawn rotated to face them across a table).
// Each half of the table is its own pointer zone with its own
// usePointerInput, so both paddles can be dragged at the same time.
export default function FluffyHockey({ onGameComplete }) {
  const tableRef = useRef(null);
  const canvasRef = useRef(null);
  const worldRef = useRef(makeWorld(["grownup", "kid"]));
  const phaseRef = useRef({ name: "countdown", until: COUNTDOWN_SECONDS, time: 0 });
  const goalsRef = useRef([0, 0]);
  const puckImageRef = useRef(null);
  const statusRef = useRef("idle");

  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [goals, setGoals] = useState([0, 0]);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "air-hockey",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    loadAssetCanvases([PUCK_ITEM], { size: 96 }).then((c) => {
      if (!cancelled) puckImageRef.current = c[PUCK_ITEM.id];
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { areaRef, size: tableSize } = useFitStage(W, H, status !== "idle");

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const [a, b] = goalsRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: 1, mode: "together", goals: goalsRef.current, winner: a > b ? 1 : 2 });
  };

  // Simulation + drawing loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tableSize.width) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = tableSize.width * dpr;
    canvas.height = tableSize.height * dpr;
    const ctx = canvas.getContext("2d");
    const scale = (tableSize.width / W) * dpr;
    let raf;
    let last = null;
    let acc = 0;

    const tick = (now) => {
      const dt = last == null ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      const world = worldRef.current;
      const phase = phaseRef.current;
      if (statusRef.current === "playing") {
        phase.time += dt;
        if (phase.name === "play") {
          acc += dt;
          while (acc >= SUBSTEP) {
            acc -= SUBSTEP;
            const events = step(world, SUBSTEP);
            if (events.goal !== undefined) {
              const next = goalsRef.current.map((g, i) => (i === events.goal ? g + 1 : g));
              goalsRef.current = next;
              setGoals(next);
              navigator.vibrate?.([30, 40, 30]);
              if (next[events.goal] >= WIN_GOALS) {
                phaseRef.current = { name: "over", time: 0, until: Infinity, scorer: events.goal };
                setTimeout(() => endGameRef.current(), 900);
              } else {
                phaseRef.current = { name: "point", time: 0, until: GOAL_PAUSE, scorer: events.goal };
              }
              acc = 0;
              break;
            }
          }
        } else {
          // Paddles still follow fingers during countdown / goal pauses.
          world.paddles.forEach((p) => {
            p.x = p.tx;
            p.y = p.ty;
          });
          if (phase.time >= phase.until) {
            if (phase.name === "point") serve(world, 1 - phase.scorer);
            if (phase.name === "countdown" || phase.name === "point") phaseRef.current = { name: "play", time: 0, until: Infinity };
          }
        }
      }
      draw(ctx, scale, world, phaseRef.current, goalsRef.current, puckImageRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tableSize]);

  const moveTo = useCallback((player, point) => {
    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect || statusRef.current !== "playing") return;
    clampTarget(worldRef.current, player, ((point.x - rect.left) * W) / rect.width, ((point.y - rect.top) * H) / rect.height);
  }, []);

  const beginGame = useCallback(() => {
    worldRef.current = makeWorld(levels);
    phaseRef.current = { name: "countdown", time: 0, until: COUNTDOWN_SECONDS };
    goalsRef.current = [0, 0];
    setGoals([0, 0]);
    statusRef.current = "playing";
    start();
  }, [levels, start]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Fluffy Hockey"
      score={`${goals[0]} · ${goals[1]}`}
      scoreLabel="P1 · P2"
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={`Player ${result.winner} wins!`}
            emoji="🏒"
            scoreLabel="Goals"
            score={`${result.goals[0]} – ${result.goals[1]}`}
            stats={[{ label: "First to", value: WIN_GOALS }]}
            shareText={`We played Fluffy Hockey on Fluffy Play — Player ${result.winner} won ${Math.max(...result.goals)}–${Math.min(...result.goals)}! 🏒`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {status === "idle" ? (
        <div className="from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-linear-to-b p-6 text-center">
          <div className="relative h-24 w-16 rounded-2xl border-4 border-white bg-fluffy-cream shadow-sm" aria-hidden="true">
            <span className="absolute top-2 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full" style={{ background: PLAYER_COLORS[1] }} />
            <img src={PUCK_ITEM.src} alt="" className="absolute top-1/2 left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2" draggable={false} />
            <span className="absolute bottom-2 left-1/2 h-6 w-6 -translate-x-1/2 rounded-full" style={{ background: PLAYER_COLORS[0] }} />
          </div>
          <div>
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Air hockey for two!</h2>
            <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
              Each player drags their paddle in their own half and knocks the cookie into the other goal. First to{" "}
              {WIN_GOALS} wins. Kids get a bigger paddle and a smaller goal to defend.
            </p>
            <p className="text-fluffy-subtext mt-2 text-xs">Best on a tablet lying flat between you.</p>
          </div>
          <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 text-left ring-1">
            <PlayerLevelPicker levels={levels} onChange={setLevels} />
            <p className="text-fluffy-subtext mt-2 text-xs">Player 1 plays from the bottom, Player 2 from the top.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={beginGame}>
            Start
          </button>
        </div>
      ) : (
        // sm:pb-10 keeps the table clear of GameShell's ~32px overflow on desktop.
        <div className="touch-none-game absolute inset-0 p-2 sm:pb-10">
          {/* Measured (no padding of its own) so the table always fits inside. */}
          <div ref={areaRef} className="flex h-full w-full items-center justify-center">
            <div ref={tableRef} className="relative" style={{ width: tableSize.width, height: tableSize.height }}>
              <canvas ref={canvasRef} className="block h-full w-full" style={{ width: tableSize.width, height: tableSize.height }} />
              <PlayerZone player={1} onStart={moveTo} onMove={moveTo} />
              <PlayerZone player={0} onStart={moveTo} onMove={moveTo} />
            </div>
          </div>
        </div>
      )}
    </GameShell>
  );
}

function draw(ctx, s, world, phase, goals, puckImage) {
  const { levels, puck, paddles } = world;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Table.
  ctx.fillStyle = "#eaf4fb";
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 22);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.strokeStyle = "#d6e9f8";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, H / 2);
  ctx.lineTo(W - 10, H / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 46, 0, Math.PI * 2);
  ctx.stroke();

  // Goals (colored by who defends them) + creases.
  [
    { y: 0, defender: 1 },
    { y: H, defender: 0 },
  ].forEach(({ y, defender }) => {
    const half = GOAL_W[levels[defender]] / 2;
    ctx.fillStyle = PLAYER_COLORS[defender];
    ctx.fillRect(W / 2 - half, y === 0 ? 0 : H - 8, half * 2, 8);
    ctx.strokeStyle = `${PLAYER_COLORS[defender]}55`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(W / 2, y, half * 0.9, y === 0 ? 0 : Math.PI, y === 0 ? Math.PI : Math.PI * 2);
    ctx.stroke();
  });

  // Big faint scores, each facing its player.
  ctx.font = "800 64px Poppins, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(4, 119, 182, 0.14)";
  ctx.fillText(String(goals[0]), W / 2, H * 0.62);
  ctx.save();
  ctx.translate(W / 2, H * 0.38);
  ctx.rotate(Math.PI);
  ctx.fillStyle = "rgba(217, 168, 91, 0.2)";
  ctx.fillText(String(goals[1]), 0, 0);
  ctx.restore();

  // Paddles.
  paddles.forEach((p, i) => {
    ctx.fillStyle = "rgba(75, 85, 99, 0.15)";
    ctx.beginPath();
    ctx.arc(p.x, p.y + 4, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PLAYER_COLORS[i];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Puck: a cookie.
  ctx.fillStyle = "rgba(75, 85, 99, 0.18)";
  ctx.beginPath();
  ctx.arc(puck.x, puck.y + 3, PUCK_R, 0, Math.PI * 2);
  ctx.fill();
  if (puckImage) {
    ctx.drawImage(puckImage, puck.x - PUCK_R - 2, puck.y - PUCK_R - 2, PUCK_R * 2 + 4, PUCK_R * 2 + 4);
  } else {
    ctx.fillStyle = "#d9a85b";
    ctx.beginPath();
    ctx.arc(puck.x, puck.y, PUCK_R, 0, Math.PI * 2);
    ctx.fill();
  }

  // Banners: countdown, goal, winner — readable from both ends.
  const text = phaseBannerText(phase, { point: (ph) => `Goal for Player ${ph.scorer + 1}!` });
  if (text) drawDoubleBanner(ctx, W, H, text, phase.scorer !== undefined ? PLAYER_COLORS[phase.scorer] : "#0477b6");
}
