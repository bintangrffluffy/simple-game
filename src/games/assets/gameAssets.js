import lookSummer from "./images/look-summer.svg";
import lookRainy from "./images/look-rainy.svg";
import lookSleep from "./images/look-sleep.svg";

// Every Fluent Emoji illustration, keyed by "<folder>/<name>" (e.g.
// "fruits/red-apple"). See images/fluent/CREDITS.md for the license.
// `?no-inline` keeps these as separate files: most are under Vite's 4KB
// inline limit, and base64-inlining all ~140 would bloat the JS bundle.
const fluentFiles = import.meta.glob("./images/fluent/*/*.svg", {
  eager: true,
  query: "?no-inline",
  import: "default",
});

function fluent(key) {
  const src = fluentFiles[`./images/fluent/${key}.svg`];
  if (!src) throw new Error(`gameAssets: missing Fluent illustration "${key}"`);
  return src;
}

function image(id, name, key, extra) {
  return { id, name, type: "image", src: fluent(key), ...extra };
}

// Placeholder asset catalog for Fluffy Play.
//
// Every game reads assets through this module (and the helpers below)
// instead of importing image paths directly. When a real product catalog
// API is ready, replace the arrays here — game components never need to
// change, since they only ever see `{ id, name, type, ... }` descriptors
// rendered through <AssetIcon />.
export const gameAssets = {
  // `bg` gives image assets a soft tile behind them in card/tile layouts.
  products: [
    image("shirt", "Sunny Shirt", "clothes/t-shirt", { bg: "#eaf4fb" }),
    image("dress", "Petal Dress", "clothes/dress", { bg: "#fbeef2" }),
    image("socks", "Cozy Socks", "clothes/socks", { bg: "#fdf3e3" }),
    image("cap", "Little Cap", "clothes/billed-cap", { bg: "#e7f6ef" }),
    image("coat", "Rainy Coat", "clothes/coat", { bg: "#fdf8e3" }),
    image("jeans", "Tiny Jeans", "clothes/jeans", { bg: "#eaf4fb" }),
    image("shoes", "First Steps Shoes", "clothes/running-shoe", { bg: "#fbe9e8" }),
    image("sunhat", "Sunshine Hat", "clothes/womans-hat", { bg: "#fdf3e3" }),
    image("scarf", "Snug Scarf", "clothes/scarf", { bg: "#fbeef2" }),
    image("gloves", "Warm Mittens", "clothes/gloves", { bg: "#e7f6ef" }),
    image("umbrella", "Rainy Day Umbrella", "clothes/closed-umbrella", { bg: "#f1ecfa" }),
    image("backpack", "Little Backpack", "clothes/backpack", { bg: "#fbe9e8" }),
  ],
  // Small treats: Snake food and the contents of Bubble Pop's plain bubbles.
  treats: [
    image("cupcake", "Cupcake", "food/cupcake"),
    image("cookie", "Cookie", "food/cookie"),
    image("doughnut", "Doughnut", "food/doughnut"),
    image("lollipop", "Lollipop", "food/lollipop"),
    image("candy", "Candy", "food/candy"),
    image("ice-cream", "Ice Cream", "food/soft-ice-cream"),
    image("strawberry", "Strawberry", "fruits/strawberry"),
    image("cherries", "Cherries", "fruits/cherries"),
  ],
  toys: [
    image("teddy-bear", "Teddy Bear", "toys/teddy-bear"),
    image("balloon", "Balloon", "toys/balloon"),
    image("kite", "Kite", "toys/kite"),
    image("yo-yo", "Yo-yo", "toys/yo-yo"),
    image("soccer-ball", "Ball", "toys/soccer-ball"),
    image("crayon", "Crayon", "toys/crayon"),
  ],
  // Catch the Item: one pool per weight tier (light -> heavy).
  catchItems: {
    light: [
      image("socks", "Socks", "clothes/socks"),
      image("ribbon", "Ribbon", "clothes/ribbon"),
      image("baby-bottle", "Bottle", "food/baby-bottle"),
      image("gloves", "Mittens", "clothes/gloves"),
    ],
    medium: [
      image("shirt", "Shirt", "clothes/t-shirt"),
      image("dress", "Dress", "clothes/dress"),
      image("cap", "Cap", "clothes/billed-cap"),
      image("shoes", "Shoes", "clothes/running-shoe"),
    ],
    heavy: [
      image("gift", "Gift", "toys/wrapped-gift"),
      image("teddy-bear", "Teddy Bear", "toys/teddy-bear"),
      image("backpack", "Backpack", "clothes/backpack"),
    ],
  },
  decorative: {
    logo: image("logo", "Fluffy", "home/sparkles"),
    basket: image("basket", "Basket", "home/basket"),
    gift: image("gift", "Gift", "toys/wrapped-gift"),
  },
  // Ordered smallest -> biggest: Fruit Merge uses the index as the merge tier.
  fruits: [
    image("blueberries", "Blueberries", "fruits/blueberries", { color: "#8fb2ea" }),
    image("cherries", "Cherries", "fruits/cherries", { color: "#f2a3a8" }),
    image("strawberry", "Strawberry", "fruits/strawberry", { color: "#f7b3b8" }),
    image("tangerine", "Tangerine", "fruits/tangerine", { color: "#ffcf99" }),
    image("red-apple", "Red Apple", "fruits/red-apple", { color: "#f4a9a4" }),
    image("peach", "Peach", "fruits/peach", { color: "#ffc7a8" }),
    image("melon", "Melon", "fruits/melon", { color: "#cfe8a6" }),
    image("watermelon", "Watermelon", "fruits/watermelon", { color: "#a8dcb6" }),
  ],
  // Color Match: every color also has a shape and a name, so the game never
  // relies on hue alone. Items were picked because their color is both
  // clearly visible and commonly known (a banana is yellow), which gives
  // colorblind players a second way to find the answer.
  colorGroups: [
    {
      id: "red", name: "Red", hex: "#e5484d", shape: "circle",
      items: [
        image("red-apple", "Apple", "fruits/red-apple"),
        image("strawberry", "Strawberry", "fruits/strawberry"),
        image("tomato", "Tomato", "food/tomato"),
        image("cherries", "Cherries", "fruits/cherries"),
        image("balloon", "Balloon", "toys/balloon"),
        image("backpack", "Backpack", "clothes/backpack"),
      ],
    },
    {
      id: "yellow", name: "Yellow", hex: "#f5c518", shape: "star",
      items: [
        image("banana", "Banana", "fruits/banana"),
        image("lemon", "Lemon", "fruits/lemon"),
        image("cheese", "Cheese", "food/cheese-wedge"),
        image("light-bulb", "Light Bulb", "home/light-bulb"),
        image("sparkles", "Sparkles", "home/sparkles"),
      ],
    },
    {
      id: "green", name: "Green", hex: "#46a758", shape: "triangle",
      items: [
        image("green-apple", "Green Apple", "fruits/green-apple"),
        image("pear", "Pear", "fruits/pear"),
        image("shirt", "Shirt", "clothes/t-shirt"),
        image("puzzle-piece", "Puzzle Piece", "toys/puzzle-piece"),
      ],
    },
    {
      id: "orange", name: "Orange", hex: "#f1873a", shape: "square",
      items: [
        image("tangerine", "Tangerine", "fruits/tangerine"),
        image("carrot", "Carrot", "food/carrot"),
        image("basketball", "Basketball", "toys/basketball"),
        image("mango", "Mango", "fruits/mango"),
      ],
    },
    {
      id: "blue", name: "Blue", hex: "#3b82f6", shape: "diamond",
      items: [
        image("cap", "Cap", "clothes/billed-cap"),
        image("dress", "Dress", "clothes/dress"),
        image("bucket", "Bucket", "home/bucket"),
        image("necktie", "Necktie", "clothes/necktie"),
      ],
    },
    {
      id: "purple", name: "Purple", hex: "#8e4ec6", shape: "hexagon",
      items: [
        image("gloves", "Mittens", "clothes/gloves"),
        image("yo-yo", "Yo-yo", "toys/yo-yo"),
        image("umbrella", "Umbrella", "clothes/closed-umbrella"),
        image("grapes", "Grapes", "fruits/grapes"),
      ],
    },
    {
      id: "pink", name: "Pink", hex: "#ec6fa9", shape: "heart",
      items: [
        image("ballet-shoes", "Ballet Shoes", "clothes/ballet-shoes"),
        image("blouse", "Blouse", "clothes/womans-clothes"),
        image("soap", "Soap", "home/soap"),
        image("swimsuit", "Swimsuit", "clothes/one-piece-swimsuit"),
        image("purse", "Purse", "clothes/purse"),
      ],
    },
  ],
  // Find the Item: scene clutter. Every entry must look clearly different
  // from the others (no two apples), since each appears at most once per
  // scene and the player has to tell them apart at a glance.
  sceneItems: [
    image("teddy-bear", "Teddy Bear", "toys/teddy-bear"),
    image("balloon", "Balloon", "toys/balloon"),
    image("kite", "Kite", "toys/kite"),
    image("yo-yo", "Yo-yo", "toys/yo-yo"),
    image("soccer-ball", "Soccer Ball", "toys/soccer-ball"),
    image("basketball", "Basketball", "toys/basketball"),
    image("crayon", "Crayon", "toys/crayon"),
    image("game-die", "Dice", "toys/game-die"),
    image("books", "Books", "toys/books"),
    image("puzzle-piece", "Puzzle Piece", "toys/puzzle-piece"),
    image("gift", "Gift", "toys/wrapped-gift"),
    image("nesting-dolls", "Nesting Doll", "toys/nesting-dolls"),
    image("cupcake", "Cupcake", "food/cupcake"),
    image("cookie", "Cookie", "food/cookie"),
    image("doughnut", "Doughnut", "food/doughnut"),
    image("lollipop", "Lollipop", "food/lollipop"),
    image("ice-cream", "Ice Cream", "food/soft-ice-cream"),
    image("pizza", "Pizza", "food/pizza"),
    image("croissant", "Croissant", "food/croissant"),
    image("carrot", "Carrot", "food/carrot"),
    image("cheese", "Cheese", "food/cheese-wedge"),
    image("egg", "Egg", "food/egg"),
    image("baby-bottle", "Baby Bottle", "food/baby-bottle"),
    image("banana", "Banana", "fruits/banana"),
    image("strawberry", "Strawberry", "fruits/strawberry"),
    image("grapes", "Grapes", "fruits/grapes"),
    image("watermelon", "Watermelon", "fruits/watermelon"),
    image("pineapple", "Pineapple", "fruits/pineapple"),
    image("lemon", "Lemon", "fruits/lemon"),
    image("shirt", "Shirt", "clothes/t-shirt"),
    image("dress", "Dress", "clothes/dress"),
    image("socks", "Socks", "clothes/socks"),
    image("cap", "Cap", "clothes/billed-cap"),
    image("shoes", "Sneaker", "clothes/running-shoe"),
    image("glasses", "Sunglasses", "clothes/sunglasses"),
    image("crown", "Crown", "clothes/crown"),
    image("ribbon", "Ribbon", "clothes/ribbon"),
    image("backpack", "Backpack", "clothes/backpack"),
    image("gloves", "Mittens", "clothes/gloves"),
    image("alarm-clock", "Alarm Clock", "home/alarm-clock"),
    image("light-bulb", "Light Bulb", "home/light-bulb"),
    image("toothbrush", "Toothbrush", "home/toothbrush"),
    image("soap", "Soap", "home/soap"),
    image("bucket", "Bucket", "home/bucket"),
    image("hot-beverage", "Hot Cocoa", "home/hot-beverage"),
    image("basket", "Basket", "home/basket"),
    image("potted-plant", "Plant", "home/potted-plant"),
  ],
  jigsaw: [
    { id: "look-summer", name: "Summer Picnic Look", type: "image", src: lookSummer },
    { id: "look-rainy", name: "Rainy Day Look", type: "image", src: lookRainy },
    { id: "look-sleep", name: "Sleepy Time Look", type: "image", src: lookSleep },
  ],
  // Hub card art, keyed by game id (games without an entry fall back to
  // their lucide `icon`).
  gameCovers: {
    memory: image("memory", "Memory Match", "clothes/t-shirt"),
    stack: image("stack", "Stack Tower", "home/package"),
    snake: image("snake", "Snake", "food/cupcake"),
    "tile-match": image("tile-match", "Tile Match", "clothes/dress"),
    "bubble-pop": image("bubble-pop", "Bubble Pop", "home/bubbles"),
    jigsaw: image("jigsaw", "Jigsaw Puzzle", "toys/puzzle-piece"),
    catch: image("catch", "Catch the Item", "home/basket"),
    "fruit-merge": image("fruit-merge", "Fruit Merge", "fruits/watermelon"),
    "whack-a-mole": image("whack-a-mole", "Whack-a-Mole", "toys/teddy-bear"),
    "target-tap": image("target-tap", "Target Tap", "toys/softball"),
    "color-match": image("color-match", "Color Match", "toys/artist-palette"),
    "find-item": image("find-item", "Find the Item", "home/light-bulb"),
    "fluffy-flap": image("fluffy-flap", "Fluffy Flap", "toys/kite"),
    "follow-me": image("follow-me", "Follow Me", "toys/balloon"),
    "guess-box": image("guess-box", "Guess the Box", "toys/wrapped-gift"),
    reflex: image("reflex", "Fluffy Reflex", "home/alarm-clock"),
    tug: image("tug", "Fluffy Tug", "clothes/ribbon"),
    blocks: image("blocks", "Fluffy Blocks", "toys/game-die"),
    "laundry-toss": image("laundry-toss", "Laundry Toss", "clothes/coat"),
    "laundry-rush": image("laundry-rush", "Laundry Rush", "clothes/socks"),
    "tidy-together": image("tidy-together", "Tidy Together", "home/broom"),
    "fruit-sudoku": image("fruit-sudoku", "Fruit Sudoku", "fruits/strawberry"),
    "cloud-hop": image("cloud-hop", "Cloud Hop", "clothes/closed-umbrella"),
    "connect-pairs": image("connect-pairs", "Connect Pairs", "toys/crayon"),
    "air-hockey": image("air-hockey", "Fluffy Hockey", "food/cookie"),
    "snack-snap": image("snack-snap", "Snack Snap", "fruits/cherries"),
    "fluffy-sumo": image("fluffy-sumo", "Fluffy Sumo", "clothes/crown"),
    "snowball-fight": image("snowball-fight", "Snowball Fight", "clothes/gloves"),
    "fluffy-volley": image("fluffy-volley", "Fluffy Volley", "toys/soccer-ball"),
  },
};

// `rng` defaults to Math.random; pass a seeded one (utils/seededRandom.js)
// for daily modes where every player must get the same layout.
export function shuffle(list, rng = Math.random) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function getProductSet(count) {
  return shuffle(gameAssets.products).slice(0, count);
}

export function pickRandom(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

// Trims transparent margins so a sprite's size (and Kaboom collision area)
// matches the visible artwork.
function cropToContent(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext("2d").getImageData(0, 0, width, height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

// For canvas/Kaboom games: rasterizes each asset onto a `size`×`size`
// canvas (the SVGs are only 32px intrinsically, so drawing them straight
// into a scaled sprite looks blurry), optionally trimmed to its content.
// Resolves to { [asset.id]: canvas }.
export function loadAssetCanvases(assets, { size = 128, crop = false } = {}) {
  return Promise.all(
    assets.map(
      (asset) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            canvas.getContext("2d", { willReadFrequently: crop }).drawImage(img, 0, 0, size, size);
            resolve([asset.id, crop ? cropToContent(canvas) : canvas]);
          };
          img.onerror = () => reject(new Error(`Failed to load ${asset.src}`));
          img.src = asset.src;
        }),
    ),
  ).then((entries) => Object.fromEntries(entries));
}
