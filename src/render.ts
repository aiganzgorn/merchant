// Terrain rendering: chunks are prerendered once and blitted with the camera.
import { CHUNK, PRERENDER_TILE, BIOME_COLORS } from "./config.ts";
import { BIOME, type World } from "./world.ts";
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
      const biome = world.river[i] ? BIOME.water : world.biome[i];
      ctx.fillStyle = shade(biome, Math.floor(tileHash(x0 + x, y0 + y) * SHADES));
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
// become ribbons up close instead of a staircase of squares.
function drawRivers(ctx: CanvasRenderingContext2D, world: World, cam: Camera, vw: number, vh: number): void {
  const halfW = vw / 2 / cam.zoom, halfH = vh / 2 / cam.zoom;
  const x0 = Math.max(0, Math.floor(cam.x - halfW) - 1);
  const x1 = Math.min(world.w - 1, Math.ceil(cam.x + halfW) + 1);
  const y0 = Math.max(0, Math.floor(cam.y - halfH) - 1);
  const y1 = Math.min(world.h - 1, Math.ceil(cam.y + halfH) + 1);
  if (x1 < x0 || y1 < y0) return;

  ctx.strokeStyle = RIVER_COLOR;
  ctx.lineWidth = Math.min(10, Math.max(1.2, cam.zoom * 0.45));
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * world.w + x;
      if (!world.river[i]) continue;
      const a = worldToScreen(cam, vw, vh, x + 0.5, y + 0.5);
      const next = world.flow[i];
      const b = next >= 0
        ? worldToScreen(cam, vw, vh, (next % world.w) + 0.5, Math.floor(next / world.w) + 0.5)
        : a;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
  }
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
