// Headless self-check of the pure core: no DOM, no canvas.
import assert from "node:assert/strict";

// --- rng ---------------------------------------------------------------------
import { mulberry32, int } from "../src/rng.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const a = mulberry32(42), b = mulberry32(42);
const seqA = Array.from({ length: 8 }, a), seqB = Array.from({ length: 8 }, b);
assert.deepEqual(seqA, seqB, "один seed — одна последовательность");
for (const v of seqA) assert.ok(v >= 0 && v < 1, `значение ${v} в [0,1)`);
assert.notDeepEqual(seqA, Array.from({ length: 8 }, mulberry32(43)), "другой seed — другая");

const r = mulberry32(1);
for (let i = 0; i < 200; i++) {
  const v = int(r, 7);
  assert.ok(Number.isInteger(v) && v >= 0 && v < 7, `int даёт 0..6, а не ${v}`);
}

console.log("ok — rng: детерминизм и диапазон");

// --- terrain, moisture, biomes -----------------------------------------------
import { generateWorld, seedFromQuery } from "../src/gen.ts";
import { BIOME, idx } from "../src/world.ts";
import { MAP_W, MAP_H } from "../src/config.ts";

const seedA = generateWorld(42), seedB = generateWorld(42);
assert.deepEqual(seedA.biome, seedB.biome, "один seed — один рельеф");
assert.deepEqual(seedA.elev, seedB.elev, "и одна высота");
assert.notDeepEqual(generateWorld(43).biome, seedA.biome, "другой seed — другой мир");
assert.equal(seedA.biome.length, MAP_W * MAP_H, "карта 512×512");

const share = (v) => Array.from(seedA.biome).filter(x => x === v).length / seedA.biome.length;
assert.ok(share(BIOME.water) > 0.05 && share(BIOME.water) < 0.6, `воды ${(share(BIOME.water) * 100).toFixed(0)}%`);
for (let i = 0; i < seedA.elev.length; i++) {
  const v = seedA.elev[i];
  assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `высота ${v} в 0..1`);
}

// every land biome shows up somewhere across the first five seeds
const seen = new Set();
for (let s = 1; s <= 5; s++) for (const v of generateWorld(s).biome) seen.add(v);
for (const v of [BIOME.water, BIOME.sand, BIOME.steppe, BIOME.field, BIOME.forest, BIOME.hill, BIOME.mountain]) {
  assert.ok(seen.has(v), `биом ${v} встречается`);
}

// the map edge is ocean, so the world does not run into a wall
for (let x = 0; x < MAP_W; x++) {
  assert.equal(seedA.biome[idx(seedA, x, 0)], BIOME.water, "верхний край — вода");
  assert.equal(seedA.biome[idx(seedA, x, MAP_H - 1)], BIOME.water, "нижний край — вода");
}
for (let y = 0; y < MAP_H; y++) {
  assert.equal(seedA.biome[idx(seedA, 0, y)], BIOME.water, "левый край — вода");
  assert.equal(seedA.biome[idx(seedA, MAP_W - 1, y)], BIOME.water, "правый край — вода");
}

assert.equal(seedFromQuery(""), 1, "без seed — 1");
assert.equal(seedFromQuery("?seed=7"), 7, "число из строки");
assert.equal(seedFromQuery("?seed=abc"), 1, "мусор — запасной seed");
assert.equal(seedFromQuery("?seed=-4"), 1, "отрицательный — запасной seed");
assert.equal(seedFromQuery("?seed=0"), 1, "ноль — запасной seed");

console.log(`ok — рельеф: воды ${(share(BIOME.water) * 100).toFixed(0)}%, биомы все`);

// --- rivers and lakes ---------------------------------------------------------
import { RIVER_COUNT } from "../src/config.ts";

const rw = generateWorld(42);
assert.ok(rw.rivers > 0, `проложено рек: ${rw.rivers}`);
assert.ok(rw.rivers <= RIVER_COUNT, "не больше попыток");

let riverTiles = 0;
for (let i = 0; i < rw.river.length; i++) {
  if (!rw.river[i]) continue;
  riverTiles++;
  const nx = rw.flow[i];
  if (nx < 0) {
    assert.equal(rw.water[i], 1, "река кончается только в воде");
    continue;
  }
  assert.ok(nx >= 0 && nx < rw.river.length, "сток внутри карты");
  assert.ok(rw.water[nx] === 1 || rw.filled[nx] <= rw.filled[i] + 1e-6,
    `река не течёт вверх (${rw.filled[i]} → ${rw.filled[nx]})`);
}
assert.ok(riverTiles > 100, `речных клеток ${riverTiles}`);
assert.ok(riverTiles > 1000, `реки должны быть длинными: ${riverTiles} клеток на карту`);

// lakes exist somewhere in the first five seeds — most rivers simply reach the sea
let lakes = 0;
for (let s = 1; s <= 5; s++) {
  const w = generateWorld(s);
  assert.ok(w.rivers > 0, `seed ${s}: реки есть`);
  lakes += w.lakes;
}
assert.ok(lakes > 0, "хотя бы одно озеро на пяти картах");

// no river tile is on the map edge
for (let i = 0; i < rw.river.length; i++) {
  if (!rw.river[i]) continue;
  const x = i % MAP_W, y = (i / MAP_W) | 0;
  assert.ok(x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1, `река не на краю: ${x},${y}`);
}

// a river never climbs: walking downstream always ends at water or a lake
for (let start = 0; start < rw.river.length; start++) {
  if (!rw.river[start]) continue;
  let cur = start, steps = 0;
  while (rw.flow[cur] >= 0 && steps++ < 500) cur = rw.flow[cur];
  assert.ok(rw.water[cur] === 1 || rw.flow[cur] === -1, `река от ${start} куда-то приходит`);
  assert.equal(rw.water[cur], 1, `река от ${start} приходит в воду`);
}

console.log(`ok — реки: ${rw.rivers} рек, ${riverTiles} клеток`);

// --- camera -------------------------------------------------------------------
import {
  mapViewport, clampCamera, worldToScreen, screenToWorld, zoomAt, visibleChunks,
} from "../src/camera.ts";
import { CHUNK, STRIP_H, MAP_MIN_H, ZOOM_MIN, ZOOM_MAX } from "../src/config.ts";

const cam = { x: 100, y: 100, zoom: 20 };
assert.deepEqual(worldToScreen(cam, 800, 600, 100, 100), { x: 400, y: 300 }, "центр мира — центр экрана");
const back = screenToWorld(cam, 800, 600, 400, 300);
assert.ok(near(back.x, 100) && near(back.y, 100), "экран → мир возвращает центр");
const corner = screenToWorld(cam, 800, 600, 0, 0);
const cornerBack = worldToScreen(cam, 800, 600, corner.x, corner.y);
assert.ok(near(cornerBack.x, 0) && near(cornerBack.y, 0), "левый верхний угол туда и обратно");

// zoom keeps the point under the cursor
const before = screenToWorld(cam, 800, 600, 123, 456);
const zoomed = zoomAt(cam, 800, 600, 123, 456, 2);
const after = screenToWorld(zoomed, 800, 600, 123, 456);
assert.ok(near(before.x, after.x) && near(before.y, after.y), "точка под курсором не съезжает");
assert.ok(zoomed.zoom > cam.zoom, "приблизились");
assert.equal(zoomAt({ ...cam, zoom: ZOOM_MAX }, 800, 600, 400, 300, 4).zoom, ZOOM_MAX, "потолок зума");
assert.equal(zoomAt({ ...cam, zoom: ZOOM_MIN }, 800, 600, 400, 300, 0.25).zoom, ZOOM_MIN, "пол зума");

// the viewport never leaves the map when the map is bigger than the screen
const far = clampCamera({ x: -500, y: 99999, zoom: 20 }, 800, 600);
assert.ok(near(far.x, 800 / 2 / 20), `левый край прижат: ${far.x}`);
assert.ok(near(far.y, MAP_H - 600 / 2 / 20), `нижний край прижат: ${far.y}`);
assert.deepEqual(clampCamera({ x: 100, y: 100, zoom: 20 }, 800, 600), { x: 100, y: 100, zoom: 20 }, "внутри — не трогаем");

// a map narrower than the screen is centred
const wide = clampCamera({ x: 0, y: 0, zoom: 1 }, 4096, 4096);
assert.ok(near(wide.x, MAP_W / 2) && near(wide.y, MAP_H / 2), "карта уже экрана — по центру");

// the strip is subtracted, and a tiny window still gets a map
assert.deepEqual(mapViewport(1200, 900), { w: 1200, h: 900 - STRIP_H }, "полоса вычтена");
assert.equal(mapViewport(1200, 200).h, MAP_MIN_H, "минимум высоты карты держится");
assert.equal(mapViewport(0, 900).w, 1, "нулевая ширина не ломает счёт");

// chunks cover the whole viewport
const v = visibleChunks({ x: 256, y: 256, zoom: 20 }, 800, 600);
assert.equal(v.cx0, 7); assert.equal(v.cx1, 8);
assert.equal(v.cy0, 7); assert.equal(v.cy1, 8);
assert.ok(v.cx0 >= 0 && v.cy0 >= 0 && v.cx1 < MAP_W / CHUNK && v.cy1 < MAP_H / CHUNK, "чанки внутри карты");

// a camera at the map corner still asks for chunks that exist
const edgeChunks = visibleChunks(clampCamera({ x: 0, y: 0, zoom: 20 }, 800, 600), 800, 600);
assert.ok(edgeChunks.cx0 >= 0 && edgeChunks.cy0 >= 0, "у края чанки не отрицательные");

console.log("ok — камера: зум к курсору, края, чанки");
