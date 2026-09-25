import { cn } from "@/lib/utils";
import { ICONS } from "@/games/assets/icons";

// Renders any asset descriptor from gameAssets.js — icon-based today,
// image-based (product photo / illustration) once a real catalog is wired
// in. Games only ever import this component, never a raw icon or URL.
export default function AssetIcon({ asset, size = 28, className }) {
  if (!asset) return null;

  if (asset.type === "image" || asset.type === "svg") {
    const img = (
      <img
        src={asset.src}
        alt={asset.name ?? ""}
        className={asset.bg ? "h-[70%] w-[70%] object-contain" : className}
        draggable={false}
      />
    );
    if (!asset.bg) return img;
    return (
      <div className={cn("flex items-center justify-center rounded-xl", className)} style={{ background: asset.bg }}>
        {img}
      </div>
    );
  }

  const Icon = ICONS[asset.icon];
  if (!Icon) return null;

  return (
    <div className={cn("flex items-center justify-center rounded-xl", className)} style={{ background: asset.bg }}>
      <Icon color={asset.color} size={size} strokeWidth={2.2} />
    </div>
  );
}
