// The shape that pairs with each color in gameAssets.colorGroups, so no game
// ever relies on hue alone (colorblind-safe). Shared by Color Match and
// Follow Me.
const SHAPE_PATHS = {
  square: "M8 8h32v32H8z",
  diamond: "M24 3l21 21-21 21L3 24z",
  triangle: "M24 5l21 37H3z",
  star: "M24 3l6.2 13.3 14.6 1.7-10.8 10 2.9 14.4L24 35.2 11.1 42.4 14 28 3.2 18l14.6-1.7z",
  hexagon: "M24 3l18.2 10.5v21L24 45 5.8 34.5v-21z",
  heart: "M24 43S4 30.5 4 17.5C4 10.6 9.2 6 15 6c4 0 7.3 2.3 9 5.5C25.7 8.3 29 6 33 6c5.8 0 11 4.6 11 11.5C44 30.5 24 43 24 43z",
};

export default function ColorShape({ shape, hex, size }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className="shrink-0 drop-shadow-sm" aria-hidden="true">
      {shape === "circle" ? (
        <circle cx="24" cy="24" r="20" fill={hex} stroke="#fff" strokeWidth="3" />
      ) : (
        <path d={SHAPE_PATHS[shape]} fill={hex} stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
      )}
    </svg>
  );
}
