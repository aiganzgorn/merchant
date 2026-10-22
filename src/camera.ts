// Camera and chunk maths — pure, no DOM.
import { MAP_W, MAP_H, STRIP_H, MAP_MIN_H, ZOOM_MIN, ZOOM_MAX, CHUNK } from "./config.ts";

export type Camera = {
  x: number;      // viewport centre, tiles
  y: number;
  zoom: number;   // screen px per tile
};

export const CHUNKS_X = MAP_W / CHUNK;
export const CHUNKS_Y = MAP_H / CHUNK;

// The map gets whatever is left above the strip, but never disappears.
export function mapViewport(winW: number, winH: number): { w: number; h: number } {
  return { w: Math.max(1, winW), h: Math.max(MAP_MIN_H, winH - STRIP_H) };
}

export function worldToScreen(cam: Camera, vw: number, vh: number, wx: number, wy: number): { x: number; y: number } {
  return { x: (wx - cam.x) * cam.zoom + vw / 2, y: (wy - cam.y) * cam.zoom + vh / 2 };
}

export function screenToWorld(cam: Camera, vw: number, vh: number, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - vw / 2) / cam.zoom + cam.x, y: (sy - vh / 2) / cam.zoom + cam.y };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function clampCamera(cam: Camera, vw: number, vh: number): Camera {
  const zoom = clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX);
  const clampAxis = (v: number, map: number, view: number): number => {
    if (map * zoom <= view) return map / 2;                 // the whole map fits: centre it
    const half = view / 2 / zoom;
    return clamp(v, half, map - half);
  };
  return { x: clampAxis(cam.x, MAP_W, vw), y: clampAxis(cam.y, MAP_H, vh), zoom };
}

// Zoom about a screen point: whatever is under the cursor stays under it.
export function zoomAt(cam: Camera, vw: number, vh: number, sx: number, sy: number, factor: number): Camera {
  const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const wx = (sx - vw / 2) / cam.zoom + cam.x;
  const wy = (sy - vh / 2) / cam.zoom + cam.y;
  return clampCamera({ x: wx - (sx - vw / 2) / zoom, y: wy - (sy - vh / 2) / zoom, zoom }, vw, vh);
}

export function visibleChunks(cam: Camera, vw: number, vh: number): { cx0: number; cy0: number; cx1: number; cy1: number } {
  const halfW = vw / 2 / cam.zoom, halfH = vh / 2 / cam.zoom;
  const chunk = (v: number, max: number): number => clamp(Math.floor(v / CHUNK), 0, max - 1);
  return {
    cx0: chunk(cam.x - halfW, CHUNKS_X),
    cy0: chunk(cam.y - halfH, CHUNKS_Y),
    cx1: chunk(cam.x + halfW, CHUNKS_X),
    cy1: chunk(cam.y + halfH, CHUNKS_Y),
  };
}

// Wheel delta normalised to pixels: Firefox reports lines (1) or pages (2), not pixels (0).
export function wheelFactor(deltaY: number, deltaMode: number, pageHeight: number): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * pageHeight : deltaY;
  return Math.exp(-px * 0.0015);
}
