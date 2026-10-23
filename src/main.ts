// Browser entry point: canvas, camera, wheel zoom, drag pan, the bottom strip.
import { STRIP_H, MAP_W, MAP_H, ZOOM_START } from "./config.ts";
import { generateWorld, seedFromQuery } from "./gen.ts";
import { prerender, draw, poiAt } from "./render.ts";
import { mapViewport, clampCamera, screenToWorld, zoomAt, wheelFactor, type Camera } from "./camera.ts";
import { poiCard, isClick } from "./poi-card.ts";
import type { Poi } from "./world.ts";

const canvas = document.getElementById("map") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let zones = true;
const zonesBtn = $("zones");

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
  draw(ctx, world, chunks, cam, view.w, view.h, zones);
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
  draw(ctx, world, chunks, cam, view.w, view.h, zones);
}, { passive: false });

const CLICK_DRAG_THRESHOLD = 4; // px: movement below this is a click, not a drag
let dragging = false;
let lastX = 0, lastY = 0;
let dragStartX = 0, dragStartY = 0;

zonesBtn.addEventListener("click", () => {
  zones = !zones;
  zonesBtn.setAttribute("aria-pressed", String(zones));
  draw(ctx, world, chunks, cam, view.w, view.h, zones);
});

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
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
    draw(ctx, world, chunks, cam, view.w, view.h, zones);
  }
  showTile(e.clientX, e.clientY);
});

function endDrag(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  canvas.classList.remove("drag");
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
}

canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  const wasClick = isClick(dx, dy, CLICK_DRAG_THRESHOLD);
  endDrag(e);
  if (wasClick) {
    const p = poiAt(world, cam, view.w, view.h, e.clientX, e.clientY);
    showCard(p);
  }
});
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("pointerleave", () => { cursorEl.textContent = "тайл —"; });

function declPoints(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "точек";
  if (last === 1) return "точка";
  if (last >= 2 && last <= 4) return "точки";
  return "точек";
}

function showCard(poi: Poi | null): void {
  const body = $("deals-body");
  if (!poi) {
    body.innerHTML = `<div class="row"><b>капитал</b> 12 480</div><div class="note">сделки, предприятия и рынок — позже</div>`;
    return;
  }
  const info = poiCard(world, poi);
  const yieldPct = Math.round(info.yield * 100);
  const dist = info.nearestSettlement ? `${Math.round(info.nearestSettlement.dist)} тайлов` : "нет поселений";
  body.innerHTML = `
    <div class="row"><b>${info.kindName}</b> · ${info.resourceName}</div>
    <div class="row">урожайность ${yieldPct}% · запас ${info.reserve}</div>
    <div class="row">ближайшее поселение · ${dist}</div>
    <div class="row">в зоне ${info.sameKindInZone} ${declPoints(info.sameKindInZone)} этого вида</div>
  `;
}

addEventListener("resize", resize);
resize();
