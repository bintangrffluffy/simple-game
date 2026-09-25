import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import PlayerZone from "@/games/components/PlayerZone";
import { PLAYER_STYLES } from "@/games/components/players";
import { useKaboomStage } from "@/games/hooks/useKaboomStage";
import { useFitStage } from "@/games/hooks/useFitStage";
import { useGameResult } from "@/games/hooks/useGameResult";
import { addFluffy } from "@/games/characters/fluffyCharacter";

// Landscape court: two players side by side get a wide court each, which a
// portrait phone can't give them (see the rotate prompt below).
const W = 720;
const H = 400;
const GROUND = 350;
const NET_X = W / 2;
const NET_HALF = 5;
const NET_TOP = GROUND - 115;
const GRAVITY = 1400;
const BALL_R = 14;
const BALL_GRAVITY = 520; // floaty, so kids can get under it
const MAX_BALL_SPEED = 720;
const MIN_POP = 380; // every header sends the ball up at least this fast
const MOVE_SPEED = 380;
const WIN_POINTS = 5;
const COUNTDOWN_SECONDS = 3;
const POINT_PAUSE = 1.3;
// Kid: bigger Fluffy (reaches more) and a higher jump.
const TUNING = {
  kid: { r: 30, jump: 640 },
  grownup: { r: 22, jump: 560 },
};

// A phone or tablet held upright: the landscape court would be a thin strip.
const PORTRAIT_TOUCH = "(orientation: portrait) and (pointer: coarse)";
function usePortraitTouch() {
  const [portrait, setPortrait] = useState(() => window.matchMedia?.(PORTRAIT_TOUCH).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(PORTRAIT_TOUCH);
    if (!mq) return undefined;
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return portrait;
}

// Pointer x -> stage x, via the (CSS-scaled) Kaboom canvas.
function stageXOf(area, point) {
  const rect = area?.querySelector("canvas")?.getBoundingClientRect();
  return rect ? ((point.x - rect.left) * W) / rect.width : W / 2;
}

// Same-device volleyball, side view. Player 1 plays the left court, Player 2
// the right — sitting side by side. Touch your half to move there and hop;
// head the ball over the net. It lands on your side: point to the other.
export default function FluffyVolley({ onGameComplete }) {
  const statusRef = useRef("idle");
  const apiRef = useRef(null);
  const pointsRef = useRef([0, 0]);
  const levelsRef = useRef(["grownup", "kid"]);

  const [levels, setLevels] = useState(["grownup", "kid"]);
  const [points, setPoints] = useState([0, 0]);
  const [banner, setBanner] = useState(null);

  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "fluffy-volley",
    onComplete: onGameComplete,
  });
  const { areaRef, size } = useFitStage(W, H);
  const portrait = usePortraitTouch();
  // "Play anyway" for devices whose rotation is locked.
  const [portraitOk, setPortraitOk] = useState(false);
  const askRotate = portrait && !portraitOk;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const endGameRef = useRef(() => {});
  endGameRef.current = () => {
    const [a, b] = pointsRef.current;
    // Flat "played together" completion — never per-player points.
    finish({ score: 0, level: a + b, mode: "together", points: pointsRef.current, winner: a > b ? 1 : 2 });
  };
  const onPointRef = useRef(() => {});
  onPointRef.current = (scorer) => {
    const next = pointsRef.current.map((n, i) => (i === scorer ? n + 1 : n));
    pointsRef.current = next;
    setPoints(next);
    navigator.vibrate?.([30, 40, 30]);
    return next[scorer] >= WIN_POINTS;
  };

  const setup = useCallback((k) => {
    // Kaboom pins the canvas to its W×H in CSS px; stretch it to the fitted
    // (useFitStage) court so the court scales with the screen.
    k.canvas.style.width = "100%";
    k.canvas.style.height = "100%";
    k.setGravity(GRAVITY);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Court: sky, sand, net — drawn, not objects (no collisions needed).
    k.add([
      k.z(-100),
      {
        draw() {
          k.drawRect({ pos: k.vec2(0, 0), width: W, height: GROUND, color: k.rgb("#eaf4fb") });
          k.drawCircle({ pos: k.vec2(W - 170, 70), radius: 30, color: k.rgb("#ffe7a3") });
          k.drawRect({ pos: k.vec2(0, GROUND), width: W, height: H - GROUND, color: k.rgb("#f6e3c3") });
          k.drawRect({ pos: k.vec2(0, GROUND), width: W, height: 4, color: k.rgb("#e8cfa6") });
          k.drawRect({ pos: k.vec2(NET_X - NET_HALF, NET_TOP), width: NET_HALF * 2, height: GROUND - NET_TOP, color: k.rgb("#ffffff"), outline: { width: 2, color: k.rgb("#a9d2f2") } });
          for (let y = NET_TOP + 14; y < GROUND; y += 16) k.drawRect({ pos: k.vec2(NET_X - NET_HALF, y), width: NET_HALF * 2, height: 2, color: k.rgb("#d6e9f8") });
          k.drawCircle({ pos: k.vec2(NET_X, NET_TOP), radius: 7, color: k.rgb("#d9a85b") });
        },
      },
    ]);
    // Static floor the Fluffies land on.
    k.add([k.pos(0, GROUND), k.rect(W, H - GROUND), k.area(), k.body({ isStatic: true }), k.opacity(0)]);

    const COLORS = [
      { color: "#68add3", outline: "#0477b6" },
      { color: "#e7c088", outline: "#b8894a" },
    ];
    let fluffies = [];
    function spawnFluffies(levels) {
      fluffies.forEach((f) => k.destroy(f));
      fluffies = [0, 1].map((i) => {
        const tune = TUNING[levels[i]];
        const f = addFluffy(k, {
          // Start near the back wall, away from the serve spot, so a player
          // who doesn't move doesn't just juggle the serve forever.
          pos: k.vec2(i === 0 ? 60 : W - 60, GROUND - tune.r),
          radius: tune.r,
          ...COLORS[i],
          comps: [
            k.area({ shape: new k.Rect(k.vec2(0), tune.r * 1.8, tune.r * 1.8) }),
            k.body({ jumpForce: tune.jump }),
            // Player 2 is mirrored so both Fluffies face the net.
            k.scale(i === 0 ? 1 : k.vec2(-1, 1)),
            k.z(10),
          ],
        });
        // (Don't name anything `jump` here — that's body()'s jump() method.)
        Object.assign(f, { side: i, r: tune.r, target: f.pos.x, vx: 0, prevX: f.pos.x });
        return f;
      });
    }
    spawnFluffies(levelsRef.current);

    const ball = { pos: k.vec2(W * 0.25, 110), vel: k.vec2(0, 0), spin: 0 };
    k.add([
      k.z(20),
      {
        draw() {
          k.drawEllipse({ pos: k.vec2(ball.pos.x, GROUND + 2), radiusX: 12, radiusY: 4, color: k.rgb("#4b5563"), opacity: 0.12 });
          k.drawCircle({ pos: ball.pos, radius: BALL_R, color: k.rgb(255, 255, 255), outline: { width: 2, color: k.rgb("#e5484d") } });
          const a = ball.spin;
          k.drawLine({ p1: ball.pos.add(k.vec2(Math.cos(a), Math.sin(a)).scale(BALL_R - 2)), p2: ball.pos.sub(k.vec2(Math.cos(a), Math.sin(a)).scale(BALL_R - 2)), width: 2, color: k.rgb("#e5484d") });
        },
      },
    ]);

    // phase: countdown -> play -> point -> play ... -> over
    const state = { phase: "countdown", time: 0, lastShown: null };
    function show(text) {
      if (state.lastShown !== text) {
        state.lastShown = text;
        setBanner(text);
      }
    }
    function serve(side) {
      ball.pos = k.vec2(side === 0 ? W * 0.3 : W * 0.7, 110);
      ball.vel = k.vec2(0, 0);
    }

    function collideFluffy(f) {
      const d = ball.pos.sub(f.pos);
      const dist = d.len();
      const min = f.r + BALL_R;
      if (dist >= min || dist === 0) return;
      const n = d.scale(1 / dist);
      ball.pos = f.pos.add(n.scale(min));
      const fv = k.vec2(f.vx, f.vel.y);
      const rel = ball.vel.sub(fv);
      const along = rel.dot(n);
      if (along < 0) ball.vel = ball.vel.sub(n.scale(1.9 * along));
      // Always pop the ball upward a good amount, nudged by the hit angle.
      ball.vel.y = Math.min(ball.vel.y, -MIN_POP);
      // (Wide court: a harder sideways nudge so headers can reach the net.)
      ball.vel.x += n.x * 160 + f.vx * 0.3;
      navigator.vibrate?.(6);
    }

    function collideNet() {
      const cx = k.clamp(ball.pos.x, NET_X - NET_HALF, NET_X + NET_HALF);
      const cy = k.clamp(ball.pos.y, NET_TOP, GROUND);
      const d = ball.pos.sub(k.vec2(cx, cy));
      const dist = d.len();
      if (dist >= BALL_R) return;
      const n = dist === 0 ? k.vec2(ball.pos.x < NET_X ? -1 : 1, 0) : d.scale(1 / dist);
      ball.pos = k.vec2(cx, cy).add(n.scale(BALL_R));
      const along = ball.vel.dot(n);
      if (along < 0) ball.vel = ball.vel.sub(n.scale(1.8 * along));
    }

    k.onUpdate(() => {
      if (statusRef.current !== "playing") return;
      const dt = k.dt();
      state.time += dt;

      fluffies.forEach((f) => {
        const minX = f.side === 0 ? f.r : NET_X + NET_HALF + f.r;
        const maxX = f.side === 0 ? NET_X - NET_HALF - f.r : W - f.r;
        const dx = f.target - f.pos.x;
        f.pos.x = k.clamp(f.pos.x + k.clamp(dx, -MOVE_SPEED * dt, MOVE_SPEED * dt), minX, maxX);
        f.vx = dt > 0 ? (f.pos.x - f.prevX) / dt : 0;
        f.prevX = f.pos.x;
        f.angle = reduceMotion ? 0 : k.clamp(f.vx / 25, -12, 12);
      });

      if (state.phase === "countdown") {
        show(String(Math.max(1, Math.ceil(COUNTDOWN_SECONDS - state.time))));
        if (state.time >= COUNTDOWN_SECONDS) Object.assign(state, { phase: "play", time: 0 });
        return;
      }
      if (state.phase === "point") {
        if (state.time >= POINT_PAUSE) {
          serve(state.serveTo);
          Object.assign(state, { phase: "play", time: 0 });
        }
        return;
      }
      if (state.phase === "over") return;
      show(state.time < 0.5 ? "Go!" : null);

      ball.vel.y += BALL_GRAVITY * dt;
      if (ball.vel.len() > MAX_BALL_SPEED) ball.vel = ball.vel.unit().scale(MAX_BALL_SPEED);
      ball.pos = ball.pos.add(ball.vel.scale(dt));
      ball.spin += ball.vel.x * dt * 0.05;
      if (ball.pos.x < BALL_R) {
        ball.pos.x = BALL_R;
        ball.vel.x = Math.abs(ball.vel.x) * 0.9;
      } else if (ball.pos.x > W - BALL_R) {
        ball.pos.x = W - BALL_R;
        ball.vel.x = -Math.abs(ball.vel.x) * 0.9;
      }
      if (ball.pos.y < BALL_R) {
        ball.pos.y = BALL_R;
        ball.vel.y = Math.abs(ball.vel.y) * 0.8;
      }
      collideNet();
      fluffies.forEach(collideFluffy);

      if (ball.pos.y + BALL_R >= GROUND) {
        ball.pos.y = GROUND - BALL_R;
        const scorer = ball.pos.x < NET_X ? 1 : 0;
        const won = onPointRef.current(scorer);
        if (won) {
          Object.assign(state, { phase: "over", time: 0 });
          show(`Player ${scorer + 1} wins!`);
          k.wait(1, () => endGameRef.current());
        } else {
          // The player who lost the point gets the next serve.
          Object.assign(state, { phase: "point", time: 0, serveTo: 1 - scorer });
          show(`Point for Player ${scorer + 1}!`);
        }
      }
    });

    apiRef.current = {
      touch(player, stageX, jump) {
        const f = fluffies[player];
        if (!f) return;
        f.target = stageX;
        if (jump && f.isGrounded()) f.jump();
      },
      reset(levels) {
        spawnFluffies(levels);
        serve(Math.random() < 0.5 ? 0 : 1);
        Object.assign(state, { phase: "countdown", time: 0, lastShown: null });
      },
    };
  }, []);

  // The court is CSS-scaled up to fill the screen (up to ~3× on a tablet),
  // so render at a higher density to keep it crisp.
  const { containerRef, kRef } = useKaboomStage({ width: W, height: H, background: "#eaf4fb", setup, pixelDensity: 3 });

  useEffect(() => {
    if (kRef.current) kRef.current.debug.paused = status !== "playing";
  }, [status, kRef]);

  const onZoneStart = useCallback(
    (player, point) => {
      if (statusRef.current === "playing") apiRef.current?.touch(player, stageXOf(areaRef.current, point), true);
    },
    [areaRef],
  );
  const onZoneMove = useCallback(
    (player, point) => {
      if (statusRef.current === "playing") apiRef.current?.touch(player, stageXOf(areaRef.current, point), false);
    },
    [areaRef],
  );

  const beginGame = useCallback(() => {
    levelsRef.current = levels;
    pointsRef.current = [0, 0];
    setPoints([0, 0]);
    setBanner(null);
    statusRef.current = "playing";
    start();
    apiRef.current?.reset(levels);
  }, [levels, start]);

  // Turning the device upright mid-rally pauses instead of playing on a strip.
  useEffect(() => {
    if (askRotate && status === "playing") pause();
  }, [askRotate, status, pause]);

  const handlePauseToggle = () => {
    if (status === "paused") resume();
    else if (status === "playing") pause();
  };

  return (
    <GameShell
      title="Fluffy Volley"
      score={`${points[0]} · ${points[1]}`}
      scoreLabel="P1 · P2"
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            title={`Player ${result.winner} wins!`}
            emoji="🏐"
            scoreLabel="Points"
            score={`${result.points[0]} – ${result.points[1]}`}
            stats={[{ label: "First to", value: WIN_POINTS }]}
            shareText={`We played Fluffy Volley on Fluffy Play — Player ${result.winner} won ${Math.max(...result.points)}–${Math.min(...result.points)}! 🏐`}
            onRestart={beginGame}
          />
        ) : null
      }
    >
      {/* framed:pb-10 keeps the court clear of GameShell's ~32px overflow on desktop. */}
      <div className="touch-none-game absolute inset-0 p-2 short:p-1 framed:pb-10">
        <div ref={areaRef} className="flex h-full w-full items-center justify-center">
          <div className="relative overflow-hidden rounded-2xl" style={{ width: size.width, height: size.height }}>
            <div ref={containerRef} className="absolute inset-0" />
            <PlayerZone player={0} layout="horizontal" onStart={onZoneStart} onMove={onZoneMove} />
            <PlayerZone player={1} layout="horizontal" onStart={onZoneStart} onMove={onZoneMove} />

            {status !== "idle" && (
              <>
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={cn("pointer-events-none absolute top-3 rounded-full px-3 py-1 text-xs font-bold", PLAYER_STYLES[i], i === 0 ? "left-3" : "right-3")}
                  >
                    P{i + 1} · {points[i]}
                  </span>
                ))}
                {banner && (
                  <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center" aria-live="polite">
                    <span className="font-poppins text-fluffy-primary rounded-full bg-white/90 px-5 py-2 text-2xl font-extrabold shadow">
                      {banner}
                    </span>
                  </div>
                )}
              </>
            )}

            {status === "idle" && (
              // Landscape stage, so the intro sits beside the picker, not above it.
              <div className="bg-fluffy-cream/95 absolute inset-0 flex items-center justify-center gap-5 overflow-y-auto p-4">
                <div className="max-w-[15rem] text-center">
                  <div className="text-4xl" aria-hidden="true">
                    🏐
                  </div>
                  <h2 className="font-poppins text-fluffy-text mt-1 text-xl font-bold">Fluffy Volley</h2>
                  <p className="text-fluffy-subtext mt-1 text-xs leading-relaxed sm:text-sm">
                    Sit side by side: Player 1 plays the left court, Player 2 the right. Touch your half to run there and
                    hop — head the ball over the net. If it lands on your side, the other player scores. First to{" "}
                    {WIN_POINTS}.
                  </p>
                </div>
                <div className="flex w-full max-w-xs flex-col items-center gap-3">
                  <div className="bg-fluffy-bg ring-fluffy-border w-full rounded-3xl p-3 text-left ring-1">
                    <PlayerLevelPicker levels={levels} onChange={setLevels} />
                    <p className="text-fluffy-subtext mt-2 text-xs">A Kid's Fluffy is bigger and jumps higher.</p>
                  </div>
                  <button type="button" className="btn btn-primary" onClick={beginGame}>
                    Start
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {askRotate && (
          <div className="bg-fluffy-cream absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Smartphone size={56} className="text-fluffy-primary volley-rotate-hint" aria-hidden="true" />
            <h2 className="font-poppins text-fluffy-text text-lg font-bold">Turn your device sideways</h2>
            <p className="text-fluffy-subtext max-w-xs text-sm">
              Fluffy Volley is played in landscape, so each player gets a wide court of their own.
            </p>
            <button type="button" className="text-fluffy-subtext min-h-11 px-4 text-xs font-semibold underline" onClick={() => setPortraitOk(true)}>
              Play upright anyway
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
