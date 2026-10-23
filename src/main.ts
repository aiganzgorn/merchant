// Browser entry point: canvas, camera, wheel zoom, drag pan, the bottom strip.
import { STRIP_H, MAP_W, MAP_H, ZOOM_START, MAX_FRAME_SECONDS, ZOOM_PICK } from "./config.ts";
import { generateWorld, seedFromQuery } from "./gen.ts";
import { prerender, draw, poiAt } from "./render.ts";
import { mapViewport, clampCamera, screenToWorld, zoomAt, wheelFactor, type Camera } from "./camera.ts";
import { poiCard, isClick, declPoints, declTiles } from "./poi-card.ts";
import { advance, type Sim, type Speed } from "./sim.ts";
import { stepDay } from "./settlements.ts";
import { clockText, pushEvent, startListHtml } from "./ui.ts";
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

// Default "мои дела" markup lives in index.html; capture it once for reuse.
const defaultCardHtml = $("deals-body").innerHTML;

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

function showCard(poi: Poi | null): void {
  const body = $("deals-body");
  if (!poi) {
    body.innerHTML = defaultCardHtml;
    return;
  }
  const info = poiCard(world, poi);
  const yieldPct = Math.round(info.yield * 100);
  const dist = info.nearestSettlement ? `${Math.round(info.nearestSettlement.dist)} ${declTiles(Math.round(info.nearestSettlement.dist))}` : "нет поселений";
  body.innerHTML = `
    <div class="row"><b>${info.kindName}</b> · ${info.resourceName}</div>
    <div class="row">урожайность ${yieldPct}% · запас ${info.reserve}</div>
    <div class="row">ближайшее поселение · ${dist}</div>
    <div class="row">этого вида в зоне: ${info.sameKindInZone} ${declPoints(info.sameKindInZone)} (считая эту)</div>
  `;
}

addEventListener("resize", resize);
resize();

// --- world time --------------------------------------------------------------
const sim: Sim = { day: 1, speed: 1, acc: 0 };
const clockEl = $("clock");
const speedBtns = [...document.querySelectorAll<HTMLButtonElement>(".speed-btn")];

function showClock(): void {
  clockEl.textContent = clockText(sim);
}

function setSpeed(speed: Speed): void {
  sim.speed = speed;
  for (const btn of speedBtns) btn.setAttribute("aria-pressed", String(Number(btn.dataset.speed) === speed));
  showClock();
}

for (const btn of speedBtns) btn.addEventListener("click", () => setSpeed(Number(btn.dataset.speed) as Speed));

// --- start overlay -----------------------------------------------------------
const startEl = $("start");
$("start-list").innerHTML = startListHtml(world);
$("start-list").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".start-item");
  if (!btn) return;
  cam = clampCamera({ x: Number(btn.dataset.x), y: Number(btn.dataset.y), zoom: ZOOM_PICK }, view.w, view.h);
  $("zoom").textContent = `zoom ${cam.zoom.toFixed(1)}`;
  startEl.hidden = true;
  draw(ctx, world, chunks, cam, view.w, view.h, zones);
});

// The strip's static placeholders exist so the page is not empty before the first day.
for (const el of $("feed").querySelectorAll(".row, .note")) el.remove();
pushEvent(`мир собран · поселений: ${world.settlements.length}`);
showClock();

let lastFrame = performance.now();
function tick(now: number): void {
  // the cap keeps a background tab from returning with a month of skipping days
  const dt = Math.min((now - lastFrame) / 1000, MAX_FRAME_SECONDS);
  lastFrame = now;
  const next = advance(sim, dt);
  const days = next.day - sim.day;
  const firstDay = sim.day + 1;
  sim.day = next.day;
  sim.acc = next.acc;
  if (days > 0) {
    for (let d = 0; d < days; d++) {
      for (const text of stepDay(world)) pushEvent(`день ${firstDay + d} · ${text}`);
    }
    showClock();
    draw(ctx, world, chunks, cam, view.w, view.h, zones);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
