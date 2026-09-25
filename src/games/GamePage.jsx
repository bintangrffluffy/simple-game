import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getGameById } from "@/games/config/games";
import {
  emitGameComplete,
  onGameCompleteEvent,
} from "@/games/reward/gameEvents";
import { checkDailyChallenge } from "@/games/reward/dailyChallenge";
import { evaluateAchievements } from "@/games/reward/achievements";
import AchievementToast from "@/games/components/AchievementToast";

function GameLoading() {
  return (
    <div className="bg-fluffy-cream flex min-h-[100dvh] items-center justify-center">
      <div className="border-fluffy-blush border-t-fluffy-primary h-10 w-10 animate-spin rounded-full border-4" />
    </div>
  );
}

export default function GamePage() {
  const { gameId } = useParams();
  const game = getGameById(gameId);
  const [unlocked, setUnlocked] = useState([]);
  const clearUnlocked = useCallback(() => setUnlocked([]), []);

  useEffect(
    () =>
      onGameCompleteEvent((result) => {
        const fresh = evaluateAchievements(result);
        if (fresh.length) setUnlocked(fresh);
      }),
    [],
  );

  if (!game) return <Navigate to="/" replace />;

  function handleComplete(result) {
    emitGameComplete(result);
    checkDailyChallenge(result);
  }

  const GameComponent = game.component;

  return (
    <>
      <Suspense fallback={<GameLoading />}>
        <GameComponent game={game} onGameComplete={handleComplete} />
      </Suspense>
      <AchievementToast items={unlocked} onDone={clearUnlocked} />
    </>
  );
}
