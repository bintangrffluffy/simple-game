// Daily Challenge contract. No backend/scheduling exists yet — this defines
// the shape a future service can replace outright, while GameHub and
// GamePage already consume it end to end.
export const dailyChallenges = [
  {
    id: "memory-speedrun",
    gameId: "memory",
    title: "Finish under 60 seconds",
    rewardLabel: "+100 Fluffy Points",
    isComplete: (result) => result.gameId === "memory" && result.won && result.duration <= 60,
  },
  {
    id: "stack-ten",
    gameId: "stack",
    title: "Stack a tower 10 blocks high",
    rewardLabel: "+80 Fluffy Points",
    isComplete: (result) => result.gameId === "stack" && result.level >= 10,
  },
  {
    id: "bubble-500",
    gameId: "bubble-pop",
    title: "Score 500 points or more",
    rewardLabel: "+60 Fluffy Points",
    isComplete: (result) => result.gameId === "bubble-pop" && result.score >= 500,
  },
];

export function getTodayChallenge() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return dailyChallenges[dayIndex % dailyChallenges.length];
}

export function checkDailyChallenge(result) {
  const challenge = getTodayChallenge();
  if (challenge && challenge.isComplete(result)) {
    return challenge;
  }
  return null;
}
