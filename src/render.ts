// Terrain rendering: chunks are prerendered once and blitted with the camera.
import { CHUNK, PRERENDER_TILE, BIOME_COLORS, RIVER_WAVE, RIVER_WAVE_AMP } from "./config.ts";
import type { World } from "./world.ts";
import { CHUNKS_X, CHUNKS_Y, visibleChunks, worldToScreen, type Camera } from "./camera.ts";

const RIVER_COLOR = "#2b6ea8";
const PX = CHUNK * PRERENDER_TILE;
const SHADES = 8;

// A stable per-tile hash, so flat biomes get a little texture instead of one colour.
function tileHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const ramps = new Map<number, string[]>();

function shade(biome: number, k: number): string {
  let ramp = ramps.get(biome);
  if (!ramp) {
    const n = parseInt(BIOME_COLORS[biome].slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    ramp = Array.from({ length: SHADES }, (_, i) => {
      const f = 0.93 + (i / (SHADES - 1)) * 0.14;
      const c = (v: number): number => Math.min(255, Math.round(v * f));
      return `rgb(${c(r)},${c(g)},${c(b)})`;
    });
    ramps.set(biome, ramp);
  }
  return ramp[k];
}

export function paintChunk(world: World, cx: number, cy: number, ctx: CanvasRenderingContext2D): void {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const i = (y0 + y) * world.w + x0 + x;
      // river tiles keep their biome: the river itself is stroked on top, not painted as water
      ctx.fillStyle = shade(world.biome[i], Math.floor(tileHash(x0 + x, y0 + y) * SHADES));
      ctx.fillRect(x * PRERENDER_TILE, y * PRERENDER_TILE, PRERENDER_TILE, PRERENDER_TILE);
    }
  }
}

export function prerender(world: World): HTMLCanvasElement[] {
  const chunks: HTMLCanvasElement[] = [];
  for (let cy = 0; cy < CHUNKS_Y; cy++) {
    for (let cx = 0; cx < CHUNKS_X; cx++) {
      const c = document.createElement("canvas");
      c.width = PX;
      c.height = PX;
      paintChunk(world, cx, cy, c.getContext("2d")!);
      chunks.push(c);
    }
  }
  return chunks;
}

// Rivers are stroked in screen space, so they stay hair-thin when zoomed out and
// become ribbons up close instead of a staircase of squares. Width follows catchment.
function drawRivers(ctx: CanvasRenderingContext2D, world: World, cam: Camera, vw: number, vh: number): void {
  ctx.strokeStyle = RIVER_COLOR;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const chain of world.riverChains) {
    const pts = chainPoints(world, cam, vw, vh, chain);
    if (pts.length < 2) continue;
    // width grows towards the mouth: stroke the chain in runs of one width class, each run
    // ending on a shared point so the river never breaks into dashes
    const cls = (k: number): number => widthClass(world.streamSize[chain[k]]);
    let from = 0;
    for (let k = 1; k <= chain.length; k++) {
      if (k === chain.length || cls(k) !== cls(from)) {
        strokeRun(ctx, pts, from, Math.min(k, pts.length - 1), cls(from), cam.zoom);
        from = k;
      }
    }
  }
}

const STEPS = 4;                                 // four widths, so the whole net is a few strokes
const widthClass = (streamSize: number): number =>
  Math.min(STEPS - 1, Math.floor(Math.log2(1 + streamSize / 40)));

// Tile centres of one river, nudged sideways by a slow wave. The wave is what keeps a river
// from turning into a ruler-straight diagonal when the terrain under it happens to be flat.
function chainPoints(
  world: World, cam: Camera, vw: number, vh: number, chain: number[],
): { x: number; y: number }[] {
  const w = world.w;
  const pts = chain.map((i) => worldToScreen(cam, vw, vh, (i % w) + 0.5, ((i / w) | 0) + 0.5));
  const wavePx = RIVER_WAVE * cam.zoom;
  const ampPx = RIVER_WAVE_AMP * cam.zoom;
  let along = 0;
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], c = pts[Math.min(pts.length - 1, k + 1)];
    const dx = c.x - a.x, dy = c.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = Math.sin((along / wavePx) * Math.PI * 2) * ampPx;
    pts[k] = { x: pts[k].x - (dy / len) * off, y: pts[k].y + (dx / len) * off };
    if (k + 1 < pts.length) along += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].y - pts[k].y);
  }
  return pts;
}

function strokeRun(
  ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[],
  from: number, to: number, cls: number, zoom: number,
): void {
  if (to <= from) return;
  ctx.lineWidth = Math.min(16, Math.max(1.2, zoom * (0.28 + 0.09 * cls)));
  ctx.beginPath();
  ctx.moveTo(pts[from].x, pts[from].y);
  for (let k = from + 1; k + 1 <= to; k++) {
    ctx.quadraticCurveTo(pts[k].x, pts[k].y, (pts[k].x + pts[k + 1].x) / 2, (pts[k].y + pts[k + 1].y) / 2);
  }
  ctx.lineTo(pts[to].x, pts[to].y);
  ctx.stroke();
}

export function draw(
  ctx: CanvasRenderingContext2D, world: World, chunks: HTMLCanvasElement[],
  cam: Camera, vw: number, vh: number,
): void {
  ctx.fillStyle = "#0d0f16";
  ctx.fillRect(0, 0, vw, vh);

  const { cx0, cy0, cx1, cy1 } = visibleChunks(cam, vw, vh);
  const size = CHUNK * cam.zoom;
  // Zoomed out, smooth the grain away; zoomed in, keep tiles crisp.
  ctx.imageSmoothingEnabled = cam.zoom < PRERENDER_TILE;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const p = worldToScreen(cam, vw, vh, cx * CHUNK, cy * CHUNK);
      // one extra pixel of overlap hides seams between chunks at fractional zoom
      ctx.drawImage(chunks[cy * CHUNKS_X + cx], Math.round(p.x), Math.round(p.y), Math.ceil(size) + 1, Math.ceil(size) + 1);
    }
  }

  drawRivers(ctx, world, cam, vw, vh);
}
