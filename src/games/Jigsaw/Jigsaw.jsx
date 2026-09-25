import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff, ImagePlus, Maximize, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";
import GameShell from "@/games/components/GameShell";
import GameResult from "@/games/components/GameResult";
import { gameAssets } from "@/games/assets/gameAssets";
import { useGameTimer } from "@/games/hooks/useGameTimer";
import { useHighScore } from "@/games/hooks/useHighScore";
import { useGameResult } from "@/games/hooks/useGameResult";
import { formatTime } from "@/games/utils/format";
import { CELL, buildPiecePaths, gridFor } from "./jigsawShapes";
import { fileToImage, loadSavedCustomImage, measureAspect, saveCustomImage, toCustomAsset } from "./customImage";

// Target piece counts; the actual rows x cols is picked per picture so the
// board keeps the picture's own proportions and pieces stay near-square.
const DIFFICULTIES = {
  easy: { target: 12 },
  medium: { target: 24 },
  hard: { target: 48 },
  expert: { target: 100 },
  master: { target: 150 },
};

const SNAP_FRACTION = 0.25; // of the smaller cell side
// Rough height of the toolbar + hint line around the SVG, for layout choice.
const CHROME_HEIGHT = 110;
// Camera: big puzzles are played zoomed in. Zoom is relative to "fit all".
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.4;
// While dragging a piece near the stage edge, the view pans that way.
const EDGE_PAN_ZONE = 40; // px
const EDGE_PAN_SPEED = 10; // px per frame at the very edge

function clampView(v, layout) {
  const w = Math.min(layout.vbW, Math.max(layout.vbW / MAX_ZOOM, v.w));
  const h = (w * layout.vbH) / layout.vbW;
  return {
    w,
    h,
    x: Math.min(layout.vbW - w, Math.max(0, v.x)),
    y: Math.min(layout.vbH - h, Math.max(0, v.y)),
  };
}

// Keep a piece's cell inside the scene so it can't get lost off-stage.
function clampPiece(p, x, y, grid, layout) {
  const { cw, ch } = grid;
  const minX = -layout.boardX - p.col * cw;
  const maxX = layout.vbW - layout.boardX - cw - p.col * cw;
  const minY = -layout.boardY - p.row * ch;
  const maxY = layout.vbH - layout.boardY - ch - p.row * ch;
  return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(minY, y)) };
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Board geometry in SVG user units: rows are CELL tall and the board's width
// follows the picture's aspect ratio, so the picture is never cropped.
function makeGrid(level, aspect) {
  const { rows, cols } = gridFor(DIFFICULTIES[level].target, aspect);
  const bh = rows * CELL;
  const bw = bh * aspect;
  const cw = bw / cols;
  const ch = CELL;
  return { rows, cols, cw, ch, bw, bh, aspect, unit: Math.min(cw, ch) };
}

// Tray of loose pieces goes beside the board or below it — whichever lets
// the whole scene render bigger in the space available.
function computeLayout(grid, areaW, areaH) {
  const { rows, cols, cw, ch, bw, bh, unit } = grid;
  const pad = unit * 0.5; // > TAB_REACH so tabs never clip at the edges
  const pitchX = cw + unit * 0.35; // loose pieces get a bit of breathing room
  const pitchY = ch + unit * 0.35;
  const trayW = cols * pitchX;
  const trayH = rows * pitchY;

  const belowW = Math.max(bw, trayW) + 2 * pad;
  const below = {
    vbW: belowW,
    vbH: bh + trayH + 3 * pad,
    boardX: (belowW - bw) / 2,
    boardY: pad,
    trayX: (belowW - trayW) / 2,
    trayY: bh + 2 * pad,
  };
  const besideH = Math.max(bh, trayH) + 2 * pad;
  const beside = {
    vbW: bw + trayW + 3 * pad,
    vbH: besideH,
    boardX: pad,
    boardY: (besideH - bh) / 2,
    trayX: bw + 2 * pad,
    trayY: (besideH - trayH) / 2,
  };
  const scale = (l) => Math.min(areaW / l.vbW, areaH / l.vbH);
  return { ...(scale(beside) > scale(below) ? beside : below), pad, pitchX, pitchY, trayW, trayH };
}

// Each piece stores its offset from its solved position; (0,0) = in place.
function scatterPieces(grid, layout) {
  const { rows, cols, cw, ch, unit } = grid;
  const slots = shuffle(Array.from({ length: rows * cols }, (_, i) => i));
  const jitter = () => (Math.random() - 0.5) * unit * 0.2;
  return slots.map((slot, id) => {
    const row = Math.floor(id / cols);
    const col = id % cols;
    const trayLeft = layout.trayX - layout.boardX + (slot % cols) * layout.pitchX + (layout.pitchX - cw) / 2;
    const trayTop = layout.trayY - layout.boardY + Math.floor(slot / cols) * layout.pitchY + (layout.pitchY - ch) / 2;
    return {
      id,
      row,
      col,
      x: trayLeft + jitter() - col * cw,
      y: trayTop + jitter() - row * ch,
      locked: false,
    };
  });
}

const Piece = memo(function Piece({ piece, path, clipId, imageSrc, boardW, boardH, dragging, onPointerDown }) {
  return (
    <g
      style={{
        transform: `translate(${piece.x}px, ${piece.y}px)`,
        transition: dragging ? "none" : "transform 160ms ease-out",
        filter: dragging ? "drop-shadow(0 6px 8px rgba(75, 85, 99, 0.35))" : undefined,
      }}
    >
      <image href={imageSrc} width={boardW} height={boardH} preserveAspectRatio="none" clipPath={`url(#${clipId})`} />
      <path
        d={path}
        data-piece={piece.id}
        fill="transparent"
        stroke={piece.locked ? "rgba(255,255,255,0.35)" : "rgba(75,85,99,0.45)"}
        strokeWidth={piece.locked ? 0.8 : 1.4}
        onPointerDown={piece.locked ? undefined : onPointerDown}
        className={piece.locked ? undefined : dragging ? "cursor-grabbing" : "cursor-grab"}
      />
    </g>
  );
});

export default function Jigsaw({ onGameComplete }) {
  const clipPrefix = `jig${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const areaRef = useRef(null);
  const svgRef = useRef(null);
  const piecesRef = useRef([]);
  const dragRef = useRef(null);
  const movesRef = useRef(0);

  const [customImage, setCustomImage] = useState(() => {
    const saved = loadSavedCustomImage();
    return saved ? toCustomAsset(saved) : null;
  });
  const [uploadError, setUploadError] = useState("");
  const [image, setImage] = useState(() => customImage ?? gameAssets.jigsaw[0]);
  // Measured width/height of the selected picture, tagged with its src so a
  // stale measurement is never used for a newly picked picture.
  const [aspect, setAspect] = useState(null);
  const [difficulty, setDifficulty] = useState("easy");
  const [puzzle, setPuzzle] = useState(null); // { grid, layout, paths }
  const [pieces, setPieces] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [showGhost, setShowGhost] = useState(true);
  // Visible part of the scene (the SVG viewBox). Mirrored in a ref so the
  // gesture math always works from the latest value between renders.
  const [view, setView] = useState(null);
  const viewRef = useRef(null);
  // Background pointers (pan with one, pinch-zoom with two) and the
  // view/pointer snapshot the current gesture is measured from.
  const gestureRef = useRef({ pointers: new Map(), start: null });

  const [highScore, setHighScore] = useHighScore("jigsaw");
  const timer = useGameTimer({ mode: "up" });
  const { status, result, start, pause, resume, finish } = useGameResult({
    gameId: "jigsaw",
    onComplete: onGameComplete,
  });

  useEffect(() => {
    let alive = true;
    measureAspect(image.src).then((value) => alive && setAspect({ src: image.src, value }));
    return () => {
      alive = false;
    };
  }, [image.src]);

  const aspectReady = aspect?.src === image.src;
  const grid = puzzle?.grid;
  const layout = puzzle?.layout;
  const total = pieces.length;
  const placed = pieces.filter((p) => p.locked).length;

  // Pointer handlers read these through a ref so the memoized pieces keep a
  // stable onPointerDown and don't all re-render on every drag frame.
  const liveRef = useRef({});
  liveRef.current = { status, total, difficulty, highScore, timer, grid, layout };

  const commitPieces = (next) => {
    piecesRef.current = next;
    setPieces(next);
  };

  const beginGame = useCallback(
    (level, picked, pictureAspect) => {
      const nextGrid = makeGrid(level, pictureAspect);
      const rect = areaRef.current?.getBoundingClientRect();
      const nextLayout = computeLayout(nextGrid, rect?.width || 360, Math.max(200, (rect?.height || 640) - CHROME_HEIGHT));
      const initial = scatterPieces(nextGrid, nextLayout);

      setDifficulty(level);
      setImage(picked);
      setPuzzle({ grid: nextGrid, layout: nextLayout, paths: buildPiecePaths(nextGrid) });
      const fullView = { x: 0, y: 0, w: nextLayout.vbW, h: nextLayout.vbH };
      viewRef.current = fullView;
      setView(fullView);
      gestureRef.current = { pointers: new Map(), start: null };
      piecesRef.current = initial;
      setPieces(initial);
      dragRef.current = null;
      setDragId(null);
      movesRef.current = 0;
      timer.reset(0);
      timer.start();
      start();
    },
    [start, timer],
  );

  const restart = () => beginGame(difficulty, image, grid.aspect);

  const handlePauseToggle = () => {
    if (status === "paused") {
      resume();
      timer.start();
    } else if (status === "playing") {
      dragRef.current = null;
      setDragId(null);
      gestureRef.current = { pointers: new Map(), start: null };
      pause();
      timer.pause();
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setUploadError("");
    try {
      const src = await fileToImage(file);
      saveCustomImage(src);
      const asset = toCustomAsset(src);
      setCustomImage(asset);
      setImage(asset);
    } catch {
      setUploadError("That file couldn't be opened as a picture. Try a JPG or PNG.");
    }
  };

  const toSvgPoint = (e) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  // --- Camera -------------------------------------------------------------
  // With preserveAspectRatio="meet" and a viewBox that always keeps the
  // scene's aspect, screen = S0 + scale * (unit - view.x), where S0 (the
  // screen position of the view's top-left) is fixed and scale grows as the
  // view shrinks. Pan and zoom-around-a-point both fall out of that.

  const setViewClamped = useCallback((v) => {
    const next = clampView(v, liveRef.current.layout);
    viewRef.current = next;
    setView(next);
    return next;
  }, []);

  const snapshotGesture = () => {
    const g = gestureRef.current;
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm || g.pointers.size === 0) {
      g.start = null;
      return;
    }
    g.start = {
      view: viewRef.current,
      ctm: { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f },
      pts: [...g.pointers.values()].map((p) => ({ ...p })),
    };
  };

  // Zoom by `factor` so the unit under screen point `from` (measured with the
  // snapshot's view/ctm) ends up under screen point `to`.
  const zoomFromSnapshot = (snap, factor, from, to) => {
    const { view: v0, ctm } = snap;
    const w = Math.min(liveRef.current.layout.vbW, Math.max(liveRef.current.layout.vbW / MAX_ZOOM, v0.w / factor));
    const h = (w * v0.h) / v0.w;
    const a = (ctm.a * v0.w) / w;
    const d = (ctm.d * v0.h) / h;
    const ux = (from.x - ctm.e) / ctm.a;
    const uy = (from.y - ctm.f) / ctm.d;
    const s0x = ctm.a * v0.x + ctm.e;
    const s0y = ctm.d * v0.y + ctm.f;
    return setViewClamped({ w, h, x: ux - (to.x - s0x) / a, y: uy - (to.y - s0y) / d });
  };

  const applyGesture = () => {
    const { pointers, start } = gestureRef.current;
    if (!start) return;
    const pts = [...pointers.values()];
    if (pts.length === 1) {
      const dx = pts[0].x - start.pts[0].x;
      const dy = pts[0].y - start.pts[0].y;
      setViewClamped({ ...start.view, x: start.view.x - dx / start.ctm.a, y: start.view.y - dy / start.ctm.d });
    } else if (pts.length >= 2) {
      const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) || 1;
      const mid = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
      const factor = dist(pts[0], pts[1]) / dist(start.pts[0], start.pts[1]);
      zoomFromSnapshot(start, factor, mid(start.pts[0], start.pts[1]), mid(pts[0], pts[1]));
    }
  };

  const zoomAtScreenPoint = (factor, x, y) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm || !viewRef.current) return;
    const snap = { view: viewRef.current, ctm: { a: ctm.a, d: ctm.d, e: ctm.e, f: ctm.f } };
    zoomFromSnapshot(snap, factor, { x, y }, { x, y });
  };

  const zoomAtCenter = (factor) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) zoomAtScreenPoint(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const fitView = () => {
    if (layout) setViewClamped({ x: 0, y: 0, w: layout.vbW, h: layout.vbH });
  };

  // Mouse wheel / trackpad zoom — an optional extra on top of the buttons
  // and pinch. Native listener because React's wheel handler is passive.
  const zoomRef = useRef(zoomAtScreenPoint);
  zoomRef.current = zoomAtScreenPoint;
  const stageMounted = status !== "idle" && !!puzzle;
  useEffect(() => {
    const svg = svgRef.current;
    if (!stageMounted || !svg) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomRef.current(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [stageMounted]);

  const moveDraggedPiece = (fn) => {
    const drag = dragRef.current;
    const { grid: g, layout: l } = liveRef.current;
    if (!drag || !g) return;
    commitPieces(
      piecesRef.current.map((p) => {
        if (p.id !== drag.id) return p;
        const target = fn(p, drag);
        return { ...p, ...clampPiece(p, target.x, target.y, g, l) };
      }),
    );
  };

  // While a piece is held near the stage edge, pan that way so a zoomed-in
  // player can carry pieces from the tray to far parts of the board.
  useEffect(() => {
    if (dragId === null) return undefined;
    let raf;
    const edge = (v, lo, hi) => {
      if (v < lo + EDGE_PAN_ZONE) return -EDGE_PAN_SPEED * Math.min(1, (lo + EDGE_PAN_ZONE - v) / EDGE_PAN_ZONE);
      if (v > hi - EDGE_PAN_ZONE) return EDGE_PAN_SPEED * Math.min(1, (v - (hi - EDGE_PAN_ZONE)) / EDGE_PAN_ZONE);
      return 0;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag?.lastClient || !svg) return;
      const rect = svg.getBoundingClientRect();
      const vx = edge(drag.lastClient.x, rect.left, rect.right);
      const vy = edge(drag.lastClient.y, rect.top, rect.bottom);
      if (!vx && !vy) return;
      const ctm = svg.getScreenCTM();
      const old = viewRef.current;
      const next = setViewClamped({ ...old, x: old.x + vx / ctm.a, y: old.y + vy / ctm.d });
      const du = next.x - old.x;
      const dv = next.y - old.y;
      // The pointer now sits over a different scene point; carry the piece.
      if (du || dv) moveDraggedPiece((p) => ({ x: p.x + du, y: p.y + dv }));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // moveDraggedPiece only touches refs + stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId, setViewClamped]);

  // --- Pointer input -------------------------------------------------------

  // A second finger landing while a piece is held means "pinch": let go of
  // the piece where it is and zoom with both fingers instead.
  const convertDragToPinch = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    svgRef.current.setPointerCapture?.(e.pointerId);
    const { pointers } = gestureRef.current;
    pointers.set(drag.pointerId, drag.lastClient);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    snapshotGesture();
  };
  const convertRef = useRef(convertDragToPinch);
  convertRef.current = convertDragToPinch;

  const handlePieceDown = useCallback((e) => {
    // Pieces handle their own press; the stage's pan handler must not.
    e.stopPropagation();
    if (liveRef.current.status !== "playing") return;
    if (dragRef.current) {
      if (e.pointerType === "touch" && dragRef.current.pointerId !== e.pointerId) convertRef.current(e);
      return;
    }
    if (gestureRef.current.pointers.size > 0) return; // mid pan/pinch
    const id = Number(e.currentTarget.dataset.piece);
    const piece = piecesRef.current.find((p) => p.id === id);
    const point = toSvgPoint(e);
    if (!piece || piece.locked || !point) return;

    // Capture on the <svg>, not the piece: the piece's DOM node is moved to
    // the end (top of the stack) below, which would drop a capture on it.
    svgRef.current.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startPoint: point,
      startX: piece.x,
      startY: piece.y,
      lastClient: { x: e.clientX, y: e.clientY },
    };
    setDragId(id);

    const rest = piecesRef.current.filter((p) => p.id !== id);
    commitPieces([...rest, piece]);
  }, []);

  const handleStageDown = (e) => {
    if (status !== "playing") return;
    if (dragRef.current) {
      if (e.pointerType === "touch" && dragRef.current.pointerId !== e.pointerId) convertDragToPinch(e);
      return;
    }
    svgRef.current.setPointerCapture?.(e.pointerId);
    gestureRef.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    snapshotGesture();
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      drag.lastClient = { x: e.clientX, y: e.clientY };
      const point = toSvgPoint(e);
      if (point) {
        moveDraggedPiece((p, d) => ({
          x: d.startX + point.x - d.startPoint.x,
          y: d.startY + point.y - d.startPoint.y,
        }));
      }
      return;
    }
    const { pointers } = gestureRef.current;
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      applyGesture();
    }
  };

  const handlePointerUp = (e) => {
    const { pointers } = gestureRef.current;
    if (pointers.delete(e.pointerId)) {
      // Remaining finger (if any) keeps panning from where things are now.
      snapshotGesture();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragId(null);

    const piece = piecesRef.current.find((p) => p.id === drag.id);
    if (!piece) return;
    const moved = piece.x !== drag.startX || piece.y !== drag.startY;
    if (!moved) return;

    movesRef.current += 1;

    if (Math.hypot(piece.x, piece.y) > SNAP_FRACTION * grid.unit) return;

    // Snap into place and sink below the loose pieces.
    const locked = { ...piece, x: 0, y: 0, locked: true };
    const rest = piecesRef.current.filter((p) => p.id !== piece.id);
    const next = [locked, ...rest];
    commitPieces(next);

    if (next.every((p) => p.locked)) {
      const { timer: t, total: count, highScore: best, difficulty: level } = liveRef.current;
      t.pause();
      const elapsed = Math.round(t.time);
      const baseScore = count * 100;
      const timeBonus = Math.max(0, 600 - elapsed * 5);
      const movePenalty = Math.max(0, movesRef.current - count) * 5;
      const finalScore = Math.max(50, baseScore + timeBonus - movePenalty);
      const isNewBest = finalScore > best;
      if (isNewBest) setHighScore(finalScore);
      finish({
        score: finalScore,
        level,
        pieces: count,
        moves: movesRef.current,
        duration: elapsed,
        won: true,
        isNewBest,
      });
    }
  };

  const imageChoices = customImage ? [customImage, ...gameAssets.jigsaw] : gameAssets.jigsaw;

  return (
    <GameShell
      title="Jigsaw Puzzle"
      score={status === "idle" ? undefined : `${placed}/${total}`}
      scoreLabel="Placed"
      best={highScore}
      timeLabel={status !== "idle" ? formatTime(timer.time) : undefined}
      paused={status === "paused"}
      onPauseToggle={handlePauseToggle}
      showPause={status === "playing" || status === "paused"}
      result={
        status === "result" && result ? (
          <GameResult
            score={result.score}
            best={highScore}
            isNewBest={result.isNewBest}
            title="Puzzle complete!"
            emoji="🧩"
            stats={[
              { label: "Moves", value: result.moves },
              { label: "Time", value: `${result.duration}s` },
            ]}
            onRestart={restart}
          />
        ) : null
      }
    >
      <div ref={areaRef} className="absolute inset-0">
        {status === "idle" || !puzzle ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto p-6 text-center">
            <h2 className="font-poppins text-fluffy-text text-xl font-bold">Pick a picture to piece together</h2>

            <div className="flex flex-wrap justify-center gap-3">
              <label
                className="border-fluffy-peach text-fluffy-primary hover:bg-fluffy-cream focus-within:ring-fluffy-primary flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed text-[10px] font-bold focus-within:ring-2 sm:h-20 sm:w-20"
                aria-label="Upload your own picture"
              >
                <ImagePlus size={22} />
                <span>Your photo</span>
                <input type="file" accept="image/*" className="sr-only" onChange={handleUpload} />
              </label>

              {imageChoices.map((look) => (
                <button
                  key={look.id}
                  type="button"
                  onClick={() => setImage(look)}
                  aria-label={look.name}
                  aria-pressed={image.id === look.id}
                  className={cn(
                    "h-16 w-16 overflow-hidden rounded-xl ring-2 transition-all sm:h-20 sm:w-20",
                    image.id === look.id ? "ring-fluffy-primary" : "ring-transparent",
                  )}
                >
                  <img src={look.src} alt="" className="h-full w-full object-cover" draggable={false} />
                </button>
              ))}
            </div>

            {uploadError && <p className="text-fluffy-danger text-xs font-semibold">{uploadError}</p>}

            <div className="flex flex-wrap justify-center gap-2">
              {Object.keys(DIFFICULTIES).map((key) => {
                const option = aspectReady ? makeGrid(key, aspect.value) : null;
                return (
                  <button
                    key={key}
                    type="button"
                    className="btn btn-outline"
                    disabled={!option}
                    onClick={() => beginGame(key, image, aspect.value)}
                  >
                    {option ? `${option.rows * option.cols} pieces` : "…"}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col gap-2 p-3 sm:p-5">
            <div className="flex items-center justify-between text-xs font-bold">
              <button
                type="button"
                className="text-fluffy-primary inline-flex min-h-11 items-center gap-1 px-1"
                onClick={() => setShowGhost((v) => !v)}
                aria-pressed={showGhost}
              >
                {showGhost ? <EyeOff size={14} /> : <Eye size={14} />} {showGhost ? "Hide guide" : "Show guide"}
              </button>
              <div className="flex items-center">
                <button type="button" className="btn-icon" onClick={() => zoomAtCenter(1 / ZOOM_STEP)} aria-label="Zoom out">
                  <ZoomOut size={18} />
                </button>
                <button type="button" className="btn-icon" onClick={() => zoomAtCenter(ZOOM_STEP)} aria-label="Zoom in">
                  <ZoomIn size={18} />
                </button>
                <button type="button" className="btn-icon" onClick={fitView} aria-label="Show whole puzzle">
                  <Maximize size={18} />
                </button>
              </div>
              <button
                type="button"
                className="text-fluffy-primary inline-flex min-h-11 items-center gap-1 px-1"
                onClick={restart}
              >
                <RotateCcw size={14} /> Restart
              </button>
            </div>

            <div className="relative min-h-0 flex-1">
              <svg
                ref={svgRef}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                preserveAspectRatio="xMidYMid meet"
                className="touch-none-game absolute inset-0 h-full w-full cursor-move"
                onPointerDown={handleStageDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                role="img"
                aria-label={`Jigsaw puzzle, ${placed} of ${total} pieces placed`}
              >
                <defs>
                  {puzzle.paths.map((d, id) => (
                    <clipPath key={id} id={`${clipPrefix}-${id}`}>
                      <path d={d} />
                    </clipPath>
                  ))}
                </defs>

                <rect
                  x={layout.trayX - layout.pad / 2}
                  y={layout.trayY - layout.pad / 2}
                  width={layout.trayW + layout.pad}
                  height={layout.trayH + layout.pad}
                  rx={grid.unit * 0.25}
                  fill="var(--color-fluffy-cream)"
                  opacity={0.7}
                />

                <g transform={`translate(${layout.boardX} ${layout.boardY})`}>
                  <rect width={grid.bw} height={grid.bh} rx={6} fill="var(--color-fluffy-blush)" opacity={0.6} />
                  {showGhost && (
                    <>
                      <image href={image.src} width={grid.bw} height={grid.bh} preserveAspectRatio="none" opacity={0.2} />
                      {puzzle.paths.map((d, id) => (
                        <path key={id} d={d} fill="none" stroke="rgba(4,119,182,0.25)" strokeWidth={1} />
                      ))}
                    </>
                  )}

                  {pieces.map((piece) => (
                    <Piece
                      key={piece.id}
                      piece={piece}
                      path={puzzle.paths[piece.id]}
                      clipId={`${clipPrefix}-${piece.id}`}
                      imageSrc={image.src}
                      boardW={grid.bw}
                      boardH={grid.bh}
                      dragging={dragId === piece.id}
                      onPointerDown={handlePieceDown}
                    />
                  ))}
                </g>
              </svg>
            </div>

            <p className="text-fluffy-subtext text-center text-[11px]">
              Drag pieces onto the board — they click into place. Pinch, scroll or use +/− to zoom; drag the background to look around.
            </p>
          </div>
        )}
      </div>
    </GameShell>
  );
}
