import { useMemo, useState } from "react";
import { games } from "@/games/config/games";
import GameCard from "@/games/components/GameCard";
import DailyChallengeBanner from "@/games/components/DailyChallengeBanner";
import AchievementsPanel from "@/games/components/AchievementsPanel";

const FILTERS = ["All", "Quick", "Puzzle", "Classic", "Family", "Together"];

export default function GameHub() {
  const [filter, setFilter] = useState("All");
  const featured = games.find((g) => g.featured) ?? games[0];

  const filtered = useMemo(() => {
    if (filter === "All") return games;
    return games.filter((g) => g.tags.includes(filter));
  }, [filter]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="text-center">
        <span className="bg-fluffy-cream text-fluffy-gold inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-black tracking-widest uppercase">
          Fluffy Play
        </span>
        <h1 className="font-poppins text-fluffy-text mt-3 text-3xl font-black sm:text-4xl">Little games, big smiles.</h1>
        <p className="text-fluffy-subtext mx-auto mt-2 max-w-md text-sm sm:text-base">
          Quick, cozy games for the whole family — pick one up any time you have a few spare minutes.
        </p>
      </div>

      <DailyChallengeBanner />
      <AchievementsPanel />

      <section className="mt-10">
        <h2 className="font-poppins text-fluffy-text mb-3 text-lg font-bold">Featured Game</h2>
        <GameCard game={featured} featured />
      </section>

      <section className="mt-10">
        <h2 className="font-poppins text-fluffy-text mb-4 text-lg font-bold">Quick Games</h2>

        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setFilter(tag)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                filter === tag
                  ? "bg-fluffy-primary text-fluffy-bg"
                  : "bg-fluffy-cream text-fluffy-subtext hover:text-fluffy-text"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </div>
  );
}
