import { gameAssets, pickRandom, shuffle } from "@/games/assets/gameAssets";

// Shared sorting core for Laundry Rush (solo, competitive) and Tidy
// Together (co-op). A rule is a set of bins plus a pool of items that each
// belong to exactly one bin. Every rng parameter accepts Math.random or a
// daily seeded rng (utils/seededRandom.js).

function uniqueById(entries) {
  const seen = new Set();
  return entries.filter(({ asset }) => !seen.has(asset.id) && seen.add(asset.id));
}

const byId = (list, id) => list.find((a) => a.id === id);

// Sort by kind of thing: clothes / toys / food.
export const CATEGORY_RULE = {
  id: "category",
  title: "Sort by type",
  bins: [
    { id: "clothes", label: "Clothes", asset: byId(gameAssets.products, "shirt") },
    { id: "toys", label: "Toys", asset: byId(gameAssets.toys, "teddy-bear") },
    { id: "food", label: "Food", asset: byId(gameAssets.treats, "cupcake") },
  ],
  pool: uniqueById([
    ...gameAssets.products.map((asset) => ({ asset, bin: "clothes" })),
    ...gameAssets.toys.map((asset) => ({ asset, bin: "toys" })),
    ...[...gameAssets.treats, ...gameAssets.fruits].map((asset) => ({ asset, bin: "food" })),
  ]),
};

// Sort by color: three color groups, each bin showing color + shape + name
// (colorblind-safe), items picked because their color is commonly known.
export function colorRule(rng = Math.random) {
  const groups = shuffle(gameAssets.colorGroups, rng).slice(0, 3);
  return {
    id: `color-${groups.map((g) => g.id).join("-")}`,
    title: "Sort by color",
    bins: groups.map((g) => ({ id: g.id, label: g.name, hex: g.hex, shape: g.shape })),
    pool: uniqueById(groups.flatMap((g) => g.items.map((asset) => ({ asset, bin: g.id })))),
  };
}

// Next item for a rule, avoiding an immediate repeat of the same picture.
export function nextItem(rule, rng = Math.random, previousId) {
  const options = rule.pool.filter((entry) => entry.asset.id !== previousId);
  return pickRandom(options, rng);
}
