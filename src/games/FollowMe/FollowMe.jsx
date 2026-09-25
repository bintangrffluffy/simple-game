import { useCallback, useEffect, useRef, useState } from "react";
import { Heart, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import ColorShape from "@/games/components/ColorShape";
import PlayerLevelPicker from "@/games/components/PlayerLevelPicker";
import { PLAYER_STYLES } from "@/games/components/players";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { gameAssets } from "@/games/assets/gameAssets";
import DailyModeButton from "@/games/components/DailyModeButton";
import { dailyKey, dailyRandom, todayKey } from "@/games/utils/seededRandom";

// Each pad is a color group: color + shape + item + name, so the pattern can
// be followed without telling hues apart, and without sound.
const PAD_COLORS = ["red", "yellow", "green", "blue", "purple", "pink"];
const PADS = PAD_COLORS.map((id) => {
  const group = gameAssets.colorGroups.find((g) => g.id === id);
  return { id, name: group.name, hex: group.hex, shape: group.shape, item: group.items[0] };
});
// C-major-ish notes so any sequence sounds pleasant.
const TONES = [262, 330, 392, 523, 440, 294];

const POINTS_PER_STEP = 10;
const SOLO_HEARTS = 3;
// Together mode: a "Kid" gets extra tries so a parent never has to lose on
// purpose.
const PLAYER_HEARTS = { kid: 3, grownup: 1 };

// Pads flash faster as the pattern grows, but never below a readable speed.
function flashMs(length) {
  return Math.max(280, 650 - length * 25);
}

// `rng`: Math.random, or the daily seed (same pattern for everyone today).
function randomPad(padCount, rng = Math.random) {
  return Math.floor(rng() * padCount);
}

export default function FollowMe({ onGameComplete }) {
  const [mode, setMode] = useState("solo");
  const [padCount, setPadCount] = useState(4);
  // watch -> input -> correct -> (add, together only) -> turn -> watch ...
  const [phase, setPhase] = useState("watch");
  const [activePad, setActivePad] = useState(null);
  const [sequence, setSequence] = useState([]);
  const [score, setScore] = useState(0);
  const [hearts, setHearts] = useState([SOLO_HEARTS, SOLO_HEARTS]);
  const [player, setPlayer] = useState(0);
  const [playerLevels, setPlayerLevels] = useState(["grownup", "kid"]);
  const [muted, setMuted] = useState(false);

  const phaseRef = useRef(phase);
  const sequenceRef = useRef([]);
  const inputIndexRef = useRef(0);
  const scoreRef = useRef(0);
  const heartsRef = useRef(hearts);
  const playerRef = useRef(0);
  const outOfHeartsRef = useRef(false);
  const flashTimerRef = useRef(null);
  const audioRef = useRef(null);
  const mutedRef = useRef(false);
  const rngRef = useRef(Math.random);
  const dailyRef = useRef(false);

  const [highScore, setHighScore] = useHighScore("follow-me");
  const [daily, setDaily] = useState(false);
  const [dailyBest, setDailyBest] = useHighScore(dailyKey("follow-me"));
  const { status, result, start, finish } = useGameResult({
    gameId: "follow-me",
    onComplete: onGameComplete,
  });

  const goTo = useCallback((next) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const updateSequence = (next) => {
    sequenceRef.current = next;
    setSequence(next);
  };

  const playTone = useCallback((pad, ms) => {
    const ctx = audioRef.current;
    if (mutedRef.current || !ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = TONES[pad];
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + ms / 1000 + 0.05);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(flashTimerRef.current);
      audioRef.current?.close();
    },
    [],
  );

  const endGame = useCallback(() => {
    goTo("over");
    if (mode === "together") {
      // Together mode never competes for points: one flat "played together"
      // completion, the reward system decides what that's worth.
      finish({ score: 0, level: sequenceRef.current.length, mode: "together", winner: 2 - playerRef.current });
      return;
    }
    const finalScore = scoreRef.current;
    const isDaily = dailyRef.current;
    const isNewBest = finalScore > (isDaily ? dailyBest : highScore);
    setHighScore(finalScore);
    if (isDaily) setDailyBest(finalScore);
    finish({
      score: finalScore,
      level: sequenceRef.current.length - 1,
      mode: isDaily ? "daily" : "solo",
      date: isDaily ? todayKey() : undefined,
      pads: padCount,
      isNewBest,
    });
  }, [dailyBest, finish, goTo, highScore, mode, padCount, setDailyBest, setHighScore]);

  // Plays the current pattern back, then hands over to the player.
  useEffect(() => {
    if (status !== "playing" || phase !== "watch") return undefined;
    const seq = sequenceRef.current;
    const flash = flashMs(seq.length);
    const gap = Math.round(flash * 0.5);
    const timers = [];
    let t = 550;
    seq.forEach((pad) => {
      timers.push(setTimeout(() => {
        setActivePad(pad);
        playTone(pad, flash);
      }, t));
      timers.push(setTimeout(() => setActivePad(null), t + flash));
      t += flash + gap;
    });
    timers.push(setTimeout(() => {
      inputIndexRef.current = 0;
      goTo("input");
    }, t));
    return () => timers.forEach(clearTimeout);
  }, [goTo, phase, playTone, status]);

  // Short pauses between phases (feedback banners, turn hand-over).
  useEffect(() => {
    if (status !== "playing") return undefined;
    let timer;
    if (phase === "turn") {
      timer = setTimeout(() => goTo(sequenceRef.current.length ? "watch" : "add"), 1200);
    } else if (phase === "correct") {
      timer = setTimeout(() => {
        if (mode === "together") {
          goTo("add");
        } else {
          updateSequence([...sequenceRef.current, randomPad(padCount, rngRef.current)]);
          goTo("watch");
        }
      }, 700);
    } else if (phase === "mistake") {
      timer = setTimeout(() => (outOfHeartsRef.current ? endGame() : goTo("watch")), 1100);
    }
    return () => clearTimeout(timer);
  }, [endGame, goTo, mode, padCount, phase, status]);

  const flashPad = (pad) => {
    clearTimeout(flashTimerRef.current);
    setActivePad(pad);
    playTone(pad, 220);
    flashTimerRef.current = setTimeout(() => setActivePad(null), 220);
  };

  const handlePad = (pad) => {
    if (status !== "playing") return;
    const current = phaseRef.current;

    if (current === "add") {
      flashPad(pad);
      updateSequence([...sequenceRef.current, pad]);
      playerRef.current = 1 - playerRef.current;
      setPlayer(playerRef.current);
      goTo("turn");
      return;
    }
    if (current !== "input") return;

    flashPad(pad);
    const seq = sequenceRef.current;
    if (pad !== seq[inputIndexRef.current]) {
      navigator.vibrate?.([20, 40, 20]);
      const who = mode === "together" ? playerRef.current : 0;
      const next = [...heartsRef.current];
      next[who] -= 1;
      heartsRef.current = next;
      setHearts(next);
      outOfHeartsRef.current = next[who] <= 0;
      goTo("mistake");
      return;
    }

    inputIndexRef.current += 1;
    if (inputIndexRef.current < seq.length) return;
    navigator.vibrate?.(12);
    if (mode === "solo") {
      scoreRef.current += seq.length * POINTS_PER_STEP;
      setScore(scoreRef.current);
    }
    goTo("correct");
  };

  const beginGame = useCallback(
    (nextMode, nextPadCount, isDaily = false) => {
      dailyRef.current = isDaily;
      setDaily(isDaily);
      rngRef.current = isDaily ? dailyRandom("follow-me") : Math.random;
      // Created on the Start tap (a user gesture) so browsers allow audio.
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioRef.current && AudioCtx) audioRef.current = new AudioCtx();
      audioRef.current?.resume?.();

      const startHearts =
        nextMode === "together" ? playerLevels.map((level) => PLAYER_HEARTS[level]) : [SOLO_HEARTS, SOLO_HEARTS];
      setMode(nextMode);
      setPadCount(nextPadCount);
      heartsRef.current = startHearts;
      setHearts(startHearts);
      scoreRef.current = 0;
      setScore(0);
      playerRef.current = 0;
      setPlayer(0);
      outOfHeartsRef.current = false;
      setActivePad(null);
      if (nextMode === "together") {
        updateSequence([]);
        goTo("turn");
      } else {
        updateSequence([randomPad(nextPadCount, rngRef.current)]);
        goTo("watch");
      }
      start();
    },
    [goTo, playerLevels, start],
  );

  const toggleMuted = () => {
    mutedRef.current = !mutedRef.current;
    setMuted(mutedRef.current);
  };

  const pads = PADS.slice(0, padCount);
  const together = mode === "together";
  const canTap = status === "playing" && (phase === "input" || phase === "add");

  const prompt = {
    watch: "Watch closely…",
    input: "Your turn — play it back!",
    add: together ? "Now add one new step" : "",
    correct: "Nice!",
    mistake: outOfHeartsRef.current ? "Oops! That's the end." : "Oops! Watch again…",
    turn: `Player ${player + 1}'s turn`,
    over: "",
  }[phase];

  return (
    <GameShell
      title="Follow Me"
      score={together ? sequence.length : score}
      scoreLabel={together ? "Length" : "Score"}
      best={together ? undefined : daily ? dailyBest : highScore}
      result={
        status === "result" && result ? (
          together ? (
            <GameResult
              title={`Player ${result.winner} wins!`}
              emoji="🏆"
              scoreLabel="Pattern length"
              score={result.level}
              stats={[{ label: "Played together", value: "2 players" }]}
              shareText={`We played Follow Me together on Fluffy Play — Player ${result.winner} won with a ${result.level}-step pattern! 🎵`}
              onRestart={() => beginGame("together", 4)}
            />
          ) : (
            <GameResult
              score={result.score}
              best={daily ? dailyBest : highScore}
              isNewBest={result.isNewBest}
              title="Great memory!"
              emoji="🎵"
              celebrate={result.isNewBest}
              stats={[{ label: "Longest pattern", value: result.level }]}
              shareText={
                result.mode === "daily"
                  ? `Follow Me · Daily ${result.date}: remembered a ${result.level}-step pattern 🎵 Same pattern for everyone today!`
                  : undefined
              }
              onRestart={() => beginGame("solo", padCount, daily)}
            />
          )
        ) : null
      }
    >
      <div className="touch-none-game from-fluffy-cream to-fluffy-blush absolute inset-0 flex flex-col items-center gap-4 overflow-y-auto bg-linear-to-b p-4 sm:p-6">
        {status === "idle" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="flex gap-2" aria-hidden="true">
              {PADS.slice(0, 4).map((pad) => (
                <ColorShape key={pad.id} shape={pad.shape} hex={pad.hex} size={28} />
              ))}
            </div>
            <div>
              <h2 className="font-poppins text-fluffy-text text-xl font-bold">Follow the pattern!</h2>
              <p className="text-fluffy-subtext mx-auto mt-1 max-w-xs text-sm">
                Watch the pads light up, then tap them in the same order. The pattern grows by one every round.
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => beginGame("solo", 4)}>
                Solo · 4 pads
              </button>
              <button type="button" className="btn btn-outline" onClick={() => beginGame("solo", 6)}>
                Solo · 6 pads
              </button>
            </div>
            <DailyModeButton onClick={() => beginGame("solo", 4, true)} best={dailyBest || null} />

            <div className="bg-fluffy-bg ring-fluffy-border w-full max-w-sm rounded-3xl p-4 ring-1">
              <h3 className="font-poppins text-fluffy-text text-sm font-bold">Play together</h3>
              <p className="text-fluffy-subtext mt-1 text-xs">
                Take turns on one device: repeat the pattern, then add a step for the other player. Kids get 3 tries,
                grown-ups get 1.
              </p>
              <div className="mt-3">
                <PlayerLevelPicker levels={playerLevels} onChange={setPlayerLevels} />
              </div>
              <button type="button" className="btn btn-secondary mt-3 w-full" onClick={() => beginGame("together", 4)}>
                Start together
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex w-full max-w-[420px] items-center justify-between gap-2">
              {together ? (
                <div className="flex gap-2">
                  {[0, 1].map((index) => (
                    <div
                      key={index}
                      className={cn(
                        "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition-opacity",
                        PLAYER_STYLES[index],
                        player !== index && "opacity-40",
                      )}
                    >
                      P{index + 1}
                      <Hearts count={hearts[index]} small />
                    </div>
                  ))}
                </div>
              ) : (
                <Hearts count={hearts[0]} />
              )}
              <button type="button" className="btn-icon bg-fluffy-bg" onClick={toggleMuted} aria-label={muted ? "Sound on" : "Sound off"}>
                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>

            <div
              className={cn(
                "font-poppins min-h-8 text-center text-lg font-extrabold",
                phase === "mistake" ? "text-fluffy-danger" : phase === "correct" ? "text-fluffy-success" : "text-fluffy-text",
              )}
              aria-live="polite"
            >
              {prompt}
            </div>

            <div className={cn("grid w-full max-w-[420px] gap-3 sm:gap-4", padCount > 4 ? "grid-cols-3" : "grid-cols-2")}>
              {pads.map((pad, index) => {
                const isActive = activePad === index;
                return (
                  <button
                    key={pad.id}
                    type="button"
                    onPointerDown={() => handlePad(index)}
                    aria-label={`${pad.name} ${pad.item.name}`}
                    disabled={!canTap}
                    className={cn(
                      "relative flex aspect-square touch-manipulation flex-col items-center justify-center gap-1 rounded-3xl p-2 ring-4 transition-[transform,background-color,box-shadow] duration-150",
                      isActive ? "scale-105 shadow-[0_0_0_6px_#fff,0_8px_24px_rgba(0,0,0,0.18)]" : "shadow-sm",
                      phase === "mistake" && "animate-[shake_0.3s_ease-in-out]",
                    )}
                    style={{
                      background: isActive ? pad.hex : `${pad.hex}26`,
                      "--tw-ring-color": pad.hex,
                    }}
                  >
                    <ColorShape shape={pad.shape} hex={isActive ? "#ffffff" : pad.hex} size={padCount > 4 ? 22 : 28} />
                    <img
                      src={pad.item.src}
                      alt=""
                      draggable={false}
                      className={cn("pointer-events-none object-contain", padCount > 4 ? "h-[40%] w-[40%]" : "h-[46%] w-[46%]")}
                    />
                    <span className={cn("pointer-events-none text-xs font-bold sm:text-sm", isActive ? "text-white" : "text-fluffy-text")}>
                      {pad.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-fluffy-subtext text-xs font-semibold">
              {together ? `Pattern: ${sequence.length} step${sequence.length === 1 ? "" : "s"}` : `Round ${sequence.length}`}
            </p>
          </>
        )}
      </div>
    </GameShell>
  );
}

function Hearts({ count, small = false }) {
  const size = small ? 12 : 20;
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} ${count === 1 ? "try" : "tries"} left`}>
      {Array.from({ length: Math.max(0, count) }, (_, i) => (
        <Heart key={i} size={size} className={small ? "fill-white text-white" : "fill-fluffy-danger text-fluffy-danger"} />
      ))}
    </div>
  );
}
