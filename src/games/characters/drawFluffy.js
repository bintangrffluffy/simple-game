// The Fluffy (round bunny-cloud) drawn on a plain 2D canvas, for the Canvas
// two-player games (Fluffy Sumo, Snowball Fight). Mirrors the Kaboom
// version in fluffyCharacter.js. `facingUp` false turns it to face a player
// sitting at the top of the table.
export function drawFluffy(ctx, x, y, r, color, facingUp = true) {
  ctx.save();
  ctx.translate(x, y);
  if (!facingUp) ctx.rotate(Math.PI);
  ctx.fillStyle = "rgba(75, 85, 99, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 4, r, 0, Math.PI * 2);
  ctx.fill();
  [-r * 0.4, r * 0.4].forEach((ex) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(ex - r * 0.18, -r * 1.45, r * 0.36, r * 0.8, r * 0.18);
    ctx.fill();
    ctx.fillStyle = "#f4c7d3";
    ctx.beginPath();
    ctx.roundRect(ex - r * 0.07, -r * 1.35, r * 0.14, r * 0.5, r * 0.07);
    ctx.fill();
  });
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(0, r * 0.1, r * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#4b5563";
  [-r * 0.22, r * 0.22].forEach((ex) => {
    ctx.beginPath();
    ctx.arc(ex, -r * 0.05, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#f4a9b8";
  ctx.beginPath();
  ctx.arc(0, r * 0.25, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
