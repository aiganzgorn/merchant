// Browser entry point: canvas, camera, wheel zoom, drag pan, the bottom strip.
import { STRIP_H, MAP_W, MAP_H, ZOOM_START } from "./config.ts";
import { generateWorld, seedFromQuery } from "./gen.ts";
import { prerender, draw } from "./render.ts";
import { mapViewport, clampCamera, screenToWorld, zoomAt, wheelFactor, type Camera } from "./camera.ts";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

document.documentElement.style.setProperty("--strip", `${STRIP_H}px`);

const seed = seedFromQuery(location.search);
const world = generateWorld(seed);
const chunks = prerender(world);

$("seed").textContent = `seed ${seed}`;

// ?zoom=8 opens the world at a given scale — handy for looking at the whole map.
const zoomParam = Number(new URLSearchParams(location.search).get("zoom"));
let cam: Camera = { x: MAP_W / 2, y: MAP_H / 2, zoom: zoomParam > 0 ? zoomParam : ZOOM_START };let view = mapViewport(innerWidth, innerHeight);

function resize(): void {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  view = mapViewport(innerWidth, innerHeight);
  canvas.width = Math.round(view.w * dpr);
  canvas.height = Math.round(view.h * dpr);
  canvas.style.width = view.w + "px";
  canvas.style.height = view.h + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cam = clampCamera(cam, view.w, view.h);
  $("zoom").textContent = `zoom ${cam.zoom.toFixed(1)}`;
  draw(ctx, world, chunks, cam, view.w, view.h);
}

// --- input -------------------------------------------------------------------
const cursorEl = $("tile");

function showTile(clientX: number, clientY: number): void {
  if (clientX < 0 || clientY < 0 || clientX > view.w || clientY > view.h) {
    cursorEl.textContent = "тайл —";
    return;
  }
  const w = screenToWorld(cam, view.w, view.h, clientX, clientY);
  const tx = Math.floor(w.x), ty = Math.floor(w.y);
  // outside the map itself (letterboxed at min zoom) there is no tile to name
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) {
    cursorEl.textContent = "тайл —";
    return;
  }
  cursorEl.textContent = `тайл ${tx},${ty}`;
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam = zoomAt(cam, view.w, view.h, e.clientX, e.clientY, wheelFactor(e.deltaY, e.deltaMode, view.h));
  $("zoom").textContent = `zoom ${cam.zoom.toFixed(1)}`;
  showTile(e.clientX, e.clientY);
  draw(ctx, world, chunks, cam, view.w, view.h);
}, { passive: false });

let dragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("drag");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    // move by the step since the last event, so a wheel zoom mid-drag does not snap back
    cam = clampCamera({
      x: cam.x - (e.clientX - lastX) / cam.zoom,
      y: cam.y - (e.clientY - lastY) / cam.zoom,
      zoom: cam.zoom,
    }, view.w, view.h);
    lastX = e.clientX;
    lastY = e.clientY;
    draw(ctx, world, chunks, cam, view.w, view.h);
  }
  showTile(e.clientX, e.clientY);
});

function endDrag(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove("drag");
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("pointerleave", () => { cursorEl.textContent = "тайл —"; });

addEventListener("resize", resize);
resize();
