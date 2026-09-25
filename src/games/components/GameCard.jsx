import { Link } from "react-router-dom";
import { Play, Clock } from "lucide-react";
import { ICONS } from "@/games/assets/icons";
import { gameAssets } from "@/games/assets/gameAssets";

export default function GameCard({ game, featured = false }) {
  const Icon = ICONS[game.icon];
  const cover = gameAssets.gameCovers[game.id];

  return (
    <Link
      to={`/games/${game.id}`}
      className={`fluffy-card group flex flex-col hover:shadow-md ${featured ? "sm:flex-row sm:items-stretch" : ""}`}
    >
      <div
        className={`flex shrink-0 items-center justify-center ${featured ? "h-40 sm:h-auto sm:w-56" : "h-32"}`}
        style={{ background: `${game.accent}1a` }}
      >
        {cover ? (
          <img
            src={cover.src}
            alt=""
            draggable={false}
            className={`object-contain drop-shadow-sm transition-transform duration-200 group-hover:scale-110 ${featured ? "h-24 w-24" : "h-16 w-16"}`}
          />
        ) : (
          Icon && <Icon size={featured ? 56 : 40} color={game.accent} strokeWidth={1.8} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-poppins text-fluffy-text text-base font-bold">{game.title}</h3>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
            style={{ background: `${game.accent}1a`, color: game.accent }}
          >
            {game.difficulty}
          </span>
        </div>

        <p className="text-fluffy-subtext text-sm">{game.tagline}</p>

        <div className="mt-auto flex items-center justify-between pt-2">
          <div className="text-fluffy-subtext flex items-center gap-1 text-xs font-semibold">
            <Clock size={14} /> {game.duration}
          </div>
          <span className="bg-fluffy-primary text-fluffy-bg inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold">
            <Play size={14} /> Play
          </span>
        </div>
      </div>
    </Link>
  );
}
