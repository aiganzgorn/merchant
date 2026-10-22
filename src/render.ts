// Terrain rendering: chunks are prerendered once and blitted with the camera.
import { CHUNK, PRERENDER_TILE, BIOME_COLORS } from "./config.ts";
import { BIOME, type World } from "./world.ts";
import { CHUNKS_X, CHUNKS_Y, visibleChunks, worldToScreen, type Camera } from "./camera.ts";

const RIVER_COLOR = "#1d4b74";
const PX = CHUNK * PRERENDER_TILE;

export function paintChunk(world: World, cx: number, cy: number, ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = BIOME_COLORS[BIOME.water];
  ctx.fillRect(0, 0, PX, PX);

  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  let last = "";
  for (let y = 0; y < CHUNK; y++) {
    for (let x = 0; x < CHUNK; x++) {
      const i = (y0 + y) * world.w + x0 + x;
      const color = world.river[i] ? RIVER_COLOR : BIOME_COLORS[world.biome[i]];
      if (color !== last) { ctx.fillStyle = color; last = color; }
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

export function draw(
  ctx: CanvasRenderingContext2D, chunks: HTMLCanvasElement[], cam: Camera, vw: number, vh: number,
): void {
  ctx.fillStyle = "#0d0f16";
  ctx.fillRect(0, 0, vw, vh);

  const { cx0, cy0, cx1, cy1 } = visibleChunks(cam, vw, vh);
  const size = CHUNK * cam.zoom;
  ctx.imageSmoothingEnabled = false;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const p = worldToScreen(cam, vw, vh, cx * CHUNK, cy * CHUNK);
      // one extra pixel of overlap hides seams between chunks at fractional zoom
      ctx.drawImage(chunks[cy * CHUNKS_X + cx], Math.round(p.x), Math.round(p.y), Math.ceil(size) + 1, Math.ceil(size) + 1);
    }
  }
}
