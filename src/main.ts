// Browser entry point: canvas, camera, wheel zoom, drag pan, the bottom strip.
import { STRIP_H, MAP_W, MAP_H, ZOOM_START } from "./config.ts";
import { generateWorld, seedFromQuery } from "./gen.ts";
import { prerender, draw } from "./render.ts";
import { mapViewport, clampCamera, screenToWorld, zoomAt, type Camera } from "./camera.ts";

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
  cursorEl.textContent = `тайл ${Math.floor(w.x)},${Math.floor(w.y)}`;
}

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  cam = zoomAt(cam, view.w, view.h, e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  $("zoom").textContent = `zoom ${cam.zoom.toFixed(1)}`;
  showTile(e.clientX, e.clientY);
  draw(ctx, world, chunks, cam, view.w, view.h);
}, { passive: false });

let dragging = false;
let downX = 0, downY = 0;
let from: Camera = cam;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  downX = e.clientX;
  downY = e.clientY;
  from = cam;
  canvas.classList.add("drag");
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    cam = clampCamera({
      x: from.x - (e.clientX - downX) / cam.zoom,
      y: from.y - (e.clientY - downY) / cam.zoom,
      zoom: cam.zoom,
    }, view.w, view.h);
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
