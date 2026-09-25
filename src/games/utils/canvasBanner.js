// Draws a pill banner twice — facing Player 1 (lower half) and rotated 180°
// facing Player 2 (upper half) — so both players across a table can read it.
// `ctx` must already be scaled to the stage's W×H units.
export function drawDoubleBanner(ctx, w, h, text, color = "#0477b6") {
  ctx.save();
  ctx.font = `800 ${text.length > 3 ? 22 : 44}px Poppins, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  [
    [h * 0.75, 0],
    [h * 0.25, Math.PI],
  ].forEach(([y, rotation]) => {
    ctx.save();
    ctx.translate(w / 2, y);
    ctx.rotate(rotation);
    const width = ctx.measureText(text).width + 32;
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.roundRect(-width / 2, -28, width, 56, 28);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 2);
    ctx.restore();
  });
  ctx.restore();
}

// Standard two-player phase banner text: countdown, "Go!", goal/point, winner.
export function phaseBannerText(phase, labels = {}) {
  if (phase.name === "countdown") return String(Math.max(1, Math.ceil(phase.until - phase.time)));
  if (phase.name === "play" && phase.time < 0.5) return "Go!";
  if (phase.name === "point") return labels.point?.(phase) ?? `Point for Player ${phase.scorer + 1}!`;
  if (phase.name === "over") return `Player ${phase.scorer + 1} wins!`;
  return null;
}
