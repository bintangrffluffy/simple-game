// The Fluffy: a soft round bunny-cloud in brand blue, shared by the Kaboom
// games (Fluffy Flap, Cloud Hop). Ears, face and cheeks are children so
// they tilt with the body. `comps` adds the game's own components (area,
// body, tags, …) to the body object; `color` / `outline` recolor it (e.g.
// Player 2's gold Fluffy in Fluffy Volley).
export const FLUFFY_RADIUS = 15;

export function addFluffy(k, { pos, radius = FLUFFY_RADIUS, comps = [], color = "#68add3", outline = "#0477b6" }) {
  const fluffy = k.add([
    k.pos(pos),
    k.circle(radius),
    k.color(k.rgb(color)),
    k.outline(2, k.rgb(outline)),
    k.rotate(0),
    k.anchor("center"),
    ...comps,
  ]);
  [-6, 6].forEach((x) => {
    fluffy.add([k.pos(x, -radius + 2), k.rect(8, 16, { radius: 4 }), k.anchor("bot"), k.rotate(x * 2), k.color(k.rgb(color)), k.outline(2, k.rgb(outline)), k.z(-1)]);
    fluffy.add([k.pos(x, -radius), k.rect(3, 9, { radius: 2 }), k.anchor("bot"), k.rotate(x * 2), k.color(k.rgb("#f4c7d3"))]);
  });
  fluffy.add([k.pos(3, 1), k.circle(radius - 6), k.color(255, 255, 255), k.opacity(0.9)]);
  fluffy.add([k.pos(1, -3), k.circle(2.2), k.color(k.rgb("#4b5563"))]);
  fluffy.add([k.pos(9, -3), k.circle(2.2), k.color(k.rgb("#4b5563"))]);
  fluffy.add([k.pos(10, 4), k.circle(2.4), k.color(k.rgb("#f4a9b8")), k.opacity(0.8)]);
  return fluffy;
}
