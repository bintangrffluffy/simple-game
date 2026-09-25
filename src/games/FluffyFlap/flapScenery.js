// Fluffy Flap's living background: the four seasons, each with a day and a
// night, advancing as the player clears gates. Everything here is decoration drawn
// from plain JS arrays in a single draw() — no Kaboom game objects are
// created or destroyed, so it can never disturb the gates' update loop
// (see the recycling note in FluffyFlap.jsx).

// Gates to clear per scene (e.g. "Spring · Day" -> "Spring · Night"), so a
// full season is 2 x GATES_PER_SCENE gates. Progress is earned, not timed:
// hovering in place never changes the scenery. Each change then cross-fades
// over BLEND_SECONDS.
export const GATES_PER_SCENE = 5;
const BLEND_SECONDS = 2.5;
// Particles from the previous scene (e.g. autumn leaves once winter starts)
// fade out over this long instead of drifting through the new season.
const OUTGOING_FADE = 1.5;

// Sky colors are kept clear of the gate/player colors so gates always read
// well against every scene.
export const SEASONS = [
  {
    id: "spring",
    name: "Spring",
    emoji: "🌸",
    day: { skyTop: "#bfe3f7", skyBottom: "#fde8ef", hillBack: "#bfe6c4", hillFront: "#94d3a2", cloud: "#ffffff" },
    night: { skyTop: "#2c3e6b", skyBottom: "#6a5d8f", hillBack: "#4c6f78", hillFront: "#3f5f5a", cloud: "#8e9cc4" },
  },
  {
    id: "summer",
    name: "Summer",
    emoji: "☀️",
    day: { skyTop: "#7cc6f2", skyBottom: "#e3f6ff", hillBack: "#a3dc8c", hillFront: "#6fc26b", cloud: "#ffffff" },
    night: { skyTop: "#1d3461", skyBottom: "#3f5c8c", hillBack: "#3d6a55", hillFront: "#2f5847", cloud: "#7f90b8" },
  },
  {
    id: "autumn",
    name: "Autumn",
    emoji: "🍂",
    day: { skyTop: "#ffc28f", skyBottom: "#fff0e0", hillBack: "#f0b77a", hillFront: "#dd8f4e", cloud: "#fff7ef" },
    night: { skyTop: "#3a2f5b", skyBottom: "#8a5a6b", hillBack: "#7a5a4a", hillFront: "#644636", cloud: "#9a86a8" },
  },
  {
    id: "winter",
    name: "Winter",
    emoji: "❄️",
    day: { skyTop: "#c4def2", skyBottom: "#f5fbff", hillBack: "#f2f7fc", hillFront: "#ffffff", cloud: "#ffffff" },
    night: { skyTop: "#1f2d50", skyBottom: "#4b5f8a", hillBack: "#b4c3dc", hillFront: "#d3deee", cloud: "#8a9bc2" },
  },
];

const PARTICLE_COLORS = {
  petal: ["#f7b6c8", "#fbd3df", "#f49ab4"],
  leaf: ["#e8843c", "#d9a85b", "#c8553d", "#f2b134"],
  snow: ["#ffffff"],
  pollen: ["#fff4c2"],
  firefly: ["#fff29a"],
};

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

export function createScenery(k, { width, height, reducedMotion = false }) {
  const SNOW_RIM = k.rgb("#b9d3ea");
  const palettes = SEASONS.map((s) => ({
    day: Object.fromEntries(Object.entries(s.day).map(([key, hex]) => [key, k.rgb(hex)])),
    night: Object.fromEntries(Object.entries(s.night).map(([key, hex]) => [key, k.rgb(hex)])),
  }));
  const stars = Array.from({ length: 34 }, () => ({
    x: k.rand(0, width),
    y: k.rand(0, height * 0.6),
    r: k.rand(0.8, 2),
    twinkle: k.rand(0, Math.PI * 2),
  }));
  const clouds = Array.from({ length: 4 }, (_, i) => ({
    x: (width / 4) * i + k.rand(0, 60),
    y: k.rand(50, height * 0.55),
    speed: k.rand(10, 22),
    scale: k.rand(0.8, 1.2),
  }));
  let particles = [];
  const spawnRate = reducedMotion ? 1.5 : 6; // particles per second
  const motion = reducedMotion ? 0.4 : 1;

  // `from` -> `to` is the scene cross-fade in progress (t: 0..1); when
  // settled, from === to. `announced` is the last scene handed to the HUD.
  const view = { start: 0, from: 0, to: 0, t: 1, distance: 0, clock: 0, spawnDebt: 0, announced: -1 };

  function sceneOf(index) {
    const season = SEASONS[Math.floor(index / 2) % SEASONS.length];
    return { season, seasonIndex: SEASONS.indexOf(season), night: index % 2 === 1 };
  }

  // Current colors plus a 0..1 "nightness", cross-faded near scene ends.
  function mix() {
    const blend = smoothstep(view.t);
    const a = sceneOf(view.from);
    const b = sceneOf(view.to);
    const pa = palettes[a.seasonIndex][a.night ? "night" : "day"];
    const pb = palettes[b.seasonIndex][b.night ? "night" : "day"];
    const colors = {};
    for (const key of Object.keys(pa)) colors[key] = pa[key].lerp(pb[key], blend);
    const night = (a.night ? 1 : 0) * (1 - blend) + (b.night ? 1 : 0) * blend;
    return { colors, night, scene: blend < 0.5 ? a : b };
  }

  function particleKind(seasonId, night) {
    if (seasonId === "spring") return "petal";
    if (seasonId === "autumn") return "leaf";
    if (seasonId === "winter") return "snow";
    return night ? "firefly" : "pollen";
  }

  function spawnParticle(kind) {
    const colors = PARTICLE_COLORS[kind];
    const base = { kind, out: 0, color: k.rgb(colors[k.randi(colors.length)]), spin: k.rand(-2, 2), angle: k.rand(0, 360), sway: k.rand(0, Math.PI * 2) };
    if (kind === "firefly" || kind === "pollen") {
      return { ...base, x: k.rand(0, width + 40), y: k.rand(40, height - 40), vx: k.rand(-8, 8), vy: kind === "pollen" ? k.rand(-14, -6) : k.rand(-6, 6), size: kind === "firefly" ? 2.2 : 1.6, life: 0, maxLife: k.rand(4, 7) };
    }
    return {
      ...base,
      x: k.rand(0, width + 60),
      y: -10,
      vx: k.rand(-12, 4),
      vy: kind === "snow" ? k.rand(28, 55) : k.rand(30, 50),
      size: kind === "snow" ? k.rand(1.5, 3.5) : kind === "leaf" ? k.rand(5, 7) : k.rand(3.5, 5),
      life: 0,
      maxLife: 20,
    };
  }

  // A puffy cloud from four overlapping circles.
  function drawCloud(cloud, color, opacity) {
    const { x, y, scale } = cloud;
    [
      [0, 0, 20],
      [20, -8, 24],
      [42, 0, 18],
      [20, 6, 20],
    ].forEach(([dx, dy, r]) => k.drawCircle({ pos: k.vec2(x + dx * scale, y + dy * scale), radius: r * scale, color, opacity }));
  }

  function hills(color, radius, spacing, baseY, parallax) {
    const offset = (view.distance * parallax) % spacing;
    for (let x = -offset - spacing; x < width + spacing; x += spacing) {
      k.drawCircle({ pos: k.vec2(x, baseY), radius, color });
    }
  }

  return {
    // Picks a random starting season (always daytime) for a fresh run;
    // `rng` lets a daily run start everyone in the same season.
    reset(rng = Math.random) {
      view.start = Math.floor(rng() * SEASONS.length) * 2;
      view.from = view.start;
      view.to = view.start;
      view.t = 1;
      view.distance = 0;
      view.announced = -1;
      particles = [];
    },

    // Called with the number of gates cleared so far this run.
    setProgress(gates) {
      const target = view.start + Math.floor(gates / GATES_PER_SCENE);
      if (target === view.to) return;
      // A new change mid-fade (only possible with a tiny GATES_PER_SCENE)
      // starts from wherever the current fade has got to.
      view.from = view.t < 0.5 ? view.from : view.to;
      view.to = target;
      view.t = 0;
    },

    // Returns the new scene once when it changes (for the HUD label), else null.
    update(dt, speed) {
      view.t = Math.min(1, view.t + dt / BLEND_SECONDS);
      view.distance += speed * dt;
      view.clock += dt;

      clouds.forEach((cloud) => {
        cloud.x -= (cloud.speed + speed * 0.08) * dt;
        if (cloud.x < -90) {
          cloud.x = width + k.rand(10, 80);
          cloud.y = k.rand(50, height * 0.55);
        }
      });

      const { night, scene } = mix();
      const kind = particleKind(scene.season.id, night > 0.5);
      // Capped so a full screen doesn't bank a burst for later.
      view.spawnDebt = Math.min(3, view.spawnDebt + spawnRate * dt);
      while (view.spawnDebt >= 1 && particles.length < 70) {
        particles.push(spawnParticle(kind));
        view.spawnDebt -= 1;
      }
      particles = particles.filter((p) => {
        p.life += dt;
        if (p.kind !== kind) p.out += dt;
        p.sway += dt * 2;
        p.angle += p.spin * 60 * dt;
        p.x += (p.vx + Math.sin(p.sway) * 14 - speed * 0.25) * dt * motion;
        p.y += p.vy * dt * motion;
        return p.life < p.maxLife && p.out < OUTGOING_FADE && p.y < height + 20 && p.x > -20;
      });

      if (view.to !== view.announced) {
        view.announced = view.to;
        return sceneOf(view.to);
      }
      return null;
    },

    // The scene being moved to, so freshly spawned gates already match it.
    currentSeason() {
      return sceneOf(view.to).season;
    },

    draw() {
      const { colors, night } = mix();
      const day = 1 - night;

      k.drawRect({ pos: k.vec2(0, 0), width, height, gradient: [colors.skyTop, colors.skyBottom] });

      if (night > 0.01) {
        stars.forEach((s) => {
          const twinkle = 0.55 + 0.45 * Math.sin(view.clock * 2.2 + s.twinkle);
          k.drawCircle({ pos: k.vec2(s.x, s.y), radius: s.r, color: k.rgb(255, 250, 230), opacity: night * twinkle });
        });
      }

      // Sun by day, a crescent moon by night, cross-fading with the sky.
      const orb = k.vec2(width - 72, 86);
      if (day > 0.01) {
        k.drawCircle({ pos: orb, radius: 42, color: k.rgb("#fff1b8"), opacity: 0.35 * day });
        k.drawCircle({ pos: orb, radius: 27, color: k.rgb("#ffd966"), opacity: day });
      }
      if (night > 0.01) {
        k.drawCircle({ pos: orb, radius: 30, color: k.rgb("#fff6d8"), opacity: 0.15 * night });
        k.drawCircle({ pos: orb, radius: 21, color: k.rgb("#fff6d8"), opacity: night });
        const skyAtOrb = colors.skyTop.lerp(colors.skyBottom, orb.y / height);
        k.drawCircle({ pos: orb.add(-9, -6), radius: 18, color: skyAtOrb, opacity: night });
      }

      clouds.forEach((cloud) => drawCloud(cloud, colors.cloud, 0.55 + 0.25 * day));

      hills(colors.hillBack, 120, 190, height + 42, 0.12);
      hills(colors.hillFront, 90, 150, height + 38, 0.25);

      particles.forEach((p) => {
        // Fireflies/pollen appear mid-air, so fade them in and out.
        const fade = Math.min(1, p.life, p.maxLife - p.life) * (1 - p.out / OUTGOING_FADE);
        if (p.kind === "firefly") {
          const glow = 0.5 + 0.5 * Math.sin(view.clock * 3 + p.sway);
          k.drawCircle({ pos: k.vec2(p.x, p.y), radius: p.size * 3.5, color: p.color, opacity: 0.2 * glow * fade });
          k.drawCircle({ pos: k.vec2(p.x, p.y), radius: p.size, color: p.color, opacity: (0.6 + 0.4 * glow) * fade });
        } else if (p.kind === "petal" || p.kind === "leaf") {
          k.drawEllipse({
            pos: k.vec2(p.x, p.y),
            radiusX: p.size,
            radiusY: p.size * 0.55,
            angle: p.angle,
            color: p.color,
            opacity: (0.9 - night * 0.3) * (1 - p.out / OUTGOING_FADE),
          });
        } else {
          k.drawCircle({
            pos: k.vec2(p.x, p.y),
            radius: p.size,
            color: p.color,
            opacity: p.kind === "pollen" ? 0.7 * fade : 0.9 * (1 - p.out / OUTGOING_FADE),
            // A faint blue rim keeps white snow visible against the pale winter sky.
            outline: p.kind === "snow" ? { width: 1, color: SNOW_RIM } : undefined,
          });
        }
      });
    },
  };
}
