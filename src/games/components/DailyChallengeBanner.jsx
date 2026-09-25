import { Gift } from "lucide-react";
import { Link } from "react-router-dom";
import { getTodayChallenge } from "@/games/reward/dailyChallenge";
import { getGameById } from "@/games/config/games";

export default function DailyChallengeBanner() {
  const challenge = getTodayChallenge();
  if (!challenge) return null;
  const game = getGameById(challenge.gameId);

  return (
    <Link
      to={`/games/${challenge.gameId}`}
      className="from-fluffy-primary to-fluffy-hover text-fluffy-bg mt-8 flex items-center gap-4 rounded-2xl bg-linear-to-r p-4 transition-shadow hover:shadow-md sm:p-5"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
        <Gift size={24} />
      </div>
      <div className="flex-1">
        <div className="text-fluffy-peach text-[10px] font-black tracking-widest uppercase">Today&apos;s Challenge</div>
        <div className="font-poppins text-sm font-bold sm:text-base">
          Play {game?.title ?? "a game"} — {challenge.title}
        </div>
      </div>
      <div className="hidden shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold sm:block">
        {challenge.rewardLabel}
      </div>
    </Link>
  );
}
