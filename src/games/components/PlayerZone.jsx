import { useCallback } from "react";
import { usePointerInput } from "@/games/hooks/usePointerInput";

const SPOTS = {
  // Players facing each other across a table: Player 1 bottom, Player 2 top.
  vertical: [
    { bottom: 0, left: 0, right: 0, height: "50%" },
    { top: 0, left: 0, right: 0, height: "50%" },
  ],
  // Players side by side: Player 1 left, Player 2 right.
  horizontal: [
    { top: 0, bottom: 0, left: 0, width: "50%" },
    { top: 0, bottom: 0, right: 0, width: "50%" },
  ],
};

// One player's half of a shared stage, as a transparent pointer overlay.
// Each zone has its own usePointerInput (and so its own captured pointer),
// which is what lets two people touch the same screen at the same time.
export default function PlayerZone({ player, layout = "vertical", onStart, onMove, onEnd }) {
  const pointer = usePointerInput({
    onStart: useCallback((point, e) => onStart?.(player, point, e), [onStart, player]),
    onMove: useCallback((point, e) => onMove?.(player, point, e), [onMove, player]),
    onEnd: useCallback((point, e) => onEnd?.(player, point, e), [onEnd, player]),
  });
  return (
    <div
      {...pointer}
      aria-label={`Player ${player + 1} area`}
      className="absolute touch-none"
      style={SPOTS[layout][player]}
    />
  );
}
