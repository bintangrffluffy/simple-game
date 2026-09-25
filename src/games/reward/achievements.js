// Local achievements. No backend yet — same shape as dailyChallenge.js, so a
// future service can replace storage without touching games: games only
// call finish(); GamePage feeds every result through evaluateAchievements().
//
// Client-side and trivially editable in devtools: fine for fun/bragging,
// never attach redeemable Fluffy Points or prizes to these.
import { games } from "@/games/config/games";
import { todayKey } from "@/games/utils/seededRandom";

const HISTORY_KEY = "fluffy_game_history";
const UNLOCKED_KEY = "fluffy_game_achievements";
// Enough days to evaluate any streak achievement below.
const MAX_DAYS_KEPT = 60;

const solo = (result) => result.mode !== "together";

// check(result, history): `history` already includes `result`. Mix skill and
// participation/streak goals so kids can unlock plenty too.
export const achievements = [
  {
    id: "first-game",
    title: "First Play",
    description: "Finish any game",
    emoji: "🌱",
    check: (_, h) => h.plays >= 1,
  },
  {
    id: "together",
    title: "Better Together",
    description: "Finish a game in Play Together mode",
    emoji: "🤝",
    check: (r) => r.mode === "together",
  },
  {
    id: "explorer",
    title: "Explorer",
    description: "Play every game in Fluffy Play once",
    emoji: "🧭",
    check: (_, h) => games.every((g) => h.gamesPlayed[g.id]),
  },
  {
    id: "three-days",
    title: "Daily Habit",
    description: "Play on 3 days in a row",
    emoji: "📅",
    check: (_, h) => h.streak >= 3,
  },
  {
    id: "seven-days",
    title: "Fluffy Week",
    description: "Play on 7 days in a row",
    emoji: "🗓️",
    check: (_, h) => h.streak >= 7,
  },
  {
    id: "fan-25",
    title: "Fluffy Fan",
    description: "Finish 25 games",
    emoji: "💙",
    check: (_, h) => h.plays >= 25,
  },
  {
    id: "stack-20",
    title: "Sky High",
    description: "Stack Tower: stack 20 blocks",
    emoji: "🏗️",
    check: (r) => r.gameId === "stack" && r.level >= 20,
  },
  {
    id: "reflex-250",
    title: "Lightning Paws",
    description: "Fluffy Reflex: average under 250 ms",
    emoji: "⚡",
    check: (r) => r.gameId === "reflex" && r.score > 0 && r.score < 250,
  },
  {
    id: "follow-10",
    title: "Memory Maestro",
    description: "Follow Me: repeat a 10-step pattern",
    emoji: "🎵",
    check: (r) => r.gameId === "follow-me" && solo(r) && r.level >= 10,
  },
  {
    id: "guess-10",
    title: "Eagle Eye",
    description: "Guess the Box: find the teddy 10 times in one game",
    emoji: "🧸",
    check: (r) => r.gameId === "guess-box" && solo(r) && r.level >= 10,
  },
  {
    id: "snake-100",
    title: "Treat Collector",
    description: "Snake: score 100 points",
    emoji: "🍪",
    check: (r) => r.gameId === "snake" && r.score >= 100,
  },
  {
    id: "flap-10",
    title: "Cloud Glider",
    description: "Fluffy Flap: fly through 10 gates",
    emoji: "☁️",
    check: (r) => r.gameId === "fluffy-flap" && r.gates >= 10,
  },
  {
    id: "rush-30",
    title: "Combo King",
    description: "Laundry Rush: a 30-item combo",
    emoji: "🧺",
    check: (r) => r.gameId === "laundry-rush" && r.bestCombo >= 30,
  },
  {
    id: "blocks-500",
    title: "Master Quilter",
    description: "Fluffy Blocks: score 500 points",
    emoji: "🧵",
    check: (r) => r.gameId === "blocks" && r.score >= 500,
  },
  {
    id: "toss-10",
    title: "Nothing But Basket",
    description: "Laundry Toss: 10 baskets in one game",
    emoji: "👕",
    check: (r) => r.gameId === "laundry-toss" && r.baskets >= 10,
  },
  {
    id: "sudoku-6",
    title: "Fruit Master",
    description: "Fruit Sudoku: solve a 6×6 puzzle",
    emoji: "🍇",
    check: (r) => r.gameId === "fruit-sudoku" && r.size === 6,
  },
  {
    id: "connect-pack",
    title: "Joined Up",
    description: "Connect Pairs: finish all 5 puzzles",
    emoji: "🔗",
    check: (r) => r.gameId === "connect-pairs",
  },
  {
    id: "hop-100",
    title: "Head in the Clouds",
    description: "Cloud Hop: climb 100 m",
    emoji: "🌤️",
    check: (r) => r.gameId === "cloud-hop" && r.height >= 100,
  },
  {
    id: "odd-15",
    title: "Spot On",
    description: "Odd One Out: spot 15 in one game",
    emoji: "🔍",
    check: (r) => r.gameId === "find-item" && r.mode === "odd-one-out" && r.rounds >= 15,
  },
];

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode / disabled) — fail silently
  }
}

// Consecutive days, ending today, on which at least one game was finished.
function streakFrom(days, today) {
  const set = new Set(days);
  let streak = 0;
  const cursor = new Date(`${today}T12:00:00`);
  while (set.has(todayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getUnlocked() {
  return read(UNLOCKED_KEY, {});
}

/**
 * Records a finished game and returns the achievements it newly unlocked.
 * @returns {{ id: string, title: string, description: string, emoji: string }[]}
 */
export function evaluateAchievements(result, now = new Date()) {
  const today = todayKey(now);
  const stored = read(HISTORY_KEY, { plays: 0, gamesPlayed: {}, days: [] });
  const days = stored.days.includes(today) ? stored.days : [...stored.days, today].slice(-MAX_DAYS_KEPT);
  const history = {
    plays: stored.plays + 1,
    gamesPlayed: { ...stored.gamesPlayed, [result.gameId]: (stored.gamesPlayed[result.gameId] ?? 0) + 1 },
    days,
  };
  write(HISTORY_KEY, history);

  const unlocked = getUnlocked();
  const context = { ...history, streak: streakFrom(days, today) };
  const fresh = achievements.filter((a) => !unlocked[a.id] && a.check(result, context));
  if (fresh.length) {
    const stamp = now.toISOString();
    fresh.forEach((a) => (unlocked[a.id] = stamp));
    write(UNLOCKED_KEY, unlocked);
  }
  return fresh.map(({ id, title, description, emoji }) => ({ id, title, description, emoji }));
}
