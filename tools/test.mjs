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
import { BIOME, idx, POI, RESOURCE } from "../src/world.ts";
import { MAP_W, MAP_H, POI_COUNTS, POI_MIN_GAP, SETTLEMENT_COUNT, POI_OWN_RANGE } from "../src/config.ts";

const test = (name, fn) => fn();

const seedA = generateWorld(42), seedB = generateWorld(42);
assert.deepEqual(seedA.biome, seedB.biome, "один seed — один рельеф");
assert.deepEqual(seedA.elev, seedB.elev, "и одна высота");
assert.notDeepEqual(generateWorld(43).biome, seedA.biome, "другой seed — другой мир");
assert.equal(seedA.biome.length, MAP_W * MAP_H, "карта 512×512");

const share = (v) => Array.from(seedA.biome).filter(x => x === v).length / seedA.biome.length;
assert.ok(share(BIOME.water) > 0.15 && share(BIOME.water) < 0.38, `воды ${(share(BIOME.water) * 100).toFixed(0)}% — должно быть меньше трети`);


// mountains must form chains, not blobs — and a range must not wall a region off
function largestComponent(biome, w, h, type) {
  const seen = new Uint8Array(w * h);
  let best = { size: 0, w: 0, h: 0 };
  let count = 0, total = 0;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || biome[i] !== type) continue;
    const queue = [i];
    seen[i] = 1;
    let size = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
    while (queue.length) {
      const j = queue.pop();
      size++;
      const x = j % w, y = (j / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!seen[k] && biome[k] === type) { seen[k] = 1; queue.push(k); }
      }
    }
    count++;
    total += size;
    if (size > best.size) best = { size, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  return { ...best, count, total };
}

const mountains = largestComponent(seedA.biome, MAP_W, MAP_H, BIOME.mountain);
assert.ok(share(BIOME.mountain) > 0.015, `гор ${(share(BIOME.mountain) * 100).toFixed(1)}% — гор должно быть видно`);
assert.ok(share(BIOME.mountain) < 0.06, `гор ${(share(BIOME.mountain) * 100).toFixed(1)}% — гор не должно быть слишком много`);
assert.ok(mountains.size > 300, `крупнейшая горная гряда ${mountains.size} тайлов`);
assert.ok(mountains.w * mountains.h > 0, "гряда занимает площадь");
assert.ok(mountains.size / (mountains.w * mountains.h) < 0.5,
  `гряда должна быть вытянутой, а не пятном: заполнение ${(mountains.size / (mountains.w * mountains.h)).toFixed(2)}`);
// passes: the ranges are cut into separate pieces instead of one continuous wall
assert.ok(mountains.count >= 12, `гряд ${mountains.count} — хребет должен прерываться на перевалы`);
assert.ok(mountains.size < 0.45 * mountains.total,
  `крупнейшая гряда ${(mountains.size / mountains.total * 100).toFixed(0)}% всех гор — хребет не должен быть сплошным`);

// a person can walk from one end of the land to the other: mountains never cut it in two
function largestWalkable(world) {
  const w = world.w, h = world.h;
  const seen = new Uint8Array(w * h);
  const open = (i) => !world.water[i] && world.biome[i] !== BIOME.mountain;
  let total = 0, best = 0;
  for (let i = 0; i < w * h; i++) if (open(i)) total++;
  for (let i = 0; i < w * h; i++) {
    if (seen[i] || !open(i)) continue;
    const queue = [i];
    seen[i] = 1;
    let size = 0;
    while (queue.length) {
      const j = queue.pop();
      size++;
      const x = j % w, y = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const k = ny * w + nx;
        if (!seen[k] && open(k)) { seen[k] = 1; queue.push(k); }
      }
    }
    if (size > best) best = size;
  }
  return { best, total };
}
const walk = largestWalkable(seedA);
assert.ok(walk.best / walk.total > 0.97,
  `пешком проходимо ${(walk.best / walk.total * 100).toFixed(1)}% суши — горы не должны разрезать мир на куски`);

// the coastline wanders: not a rectangle with a frame of ocean
{
  const lefts = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (seedA.biome[y * MAP_W + x] !== BIOME.water) { lefts.push(x); break; }
    }
  }
  const mean = lefts.reduce((s, v) => s + v, 0) / lefts.length;
  const sd = Math.sqrt(lefts.reduce((s, v) => s + (v - mean) ** 2, 0) / lefts.length);
  assert.ok(sd > 8, `берег изрезан слабо: разброс ${sd.toFixed(1)} тайлов — мир выглядит квадратным`);
}

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
import { RIVER_COUNT, LAKE_MAX_RISE } from "../src/config.ts";

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
  // 1e-5 covers float32 ties on a filled flat, where the flood level is equal by construction
  assert.ok(rw.water[nx] === 1 || rw.filled[nx] <= rw.filled[i] + 1e-5,
    `река не течёт вверх (${rw.filled[i]} → ${rw.filled[nx]})`);
}
assert.ok(riverTiles > 100, `речных клеток ${riverTiles}`);
assert.ok(riverTiles > 1000, `реки должны быть длинными: ${riverTiles} клеток на карту`);

// rivers never jump: every step is one tile long and lands on river or water. A jump drew a
// straight line across the map (the "strange rivers"), and a step onto dry land ended a river
// in the middle of a field.
{
  let jumps = 0, dryEnds = 0;
  for (let i = 0; i < rw.river.length; i++) {
    if (!rw.river[i]) continue;
    const nx = rw.flow[i];
    if (nx < 0) { dryEnds++; continue; }
    const step = Math.max(Math.abs((i % MAP_W) - (nx % MAP_W)),
      Math.abs(((i / MAP_W) | 0) - ((nx / MAP_W) | 0)));
    if (step > 1) jumps++;
    if (!rw.river[nx] && !rw.water[nx]) dryEnds++;
  }
  assert.equal(jumps, 0, `река не должна прыгать через тайлы: ${jumps} прыжков`);
  assert.equal(dryEnds, 0, `река не должна кончаться на суше: ${dryEnds} обрывов`);
}

// lakes stay in the lowlands — a filled pit high in the ridges would drown the passes
{
  const lakeTop = rw.waterLevel + LAKE_MAX_RISE * (1 - rw.waterLevel);
  let highest = -1;
  for (let i = 0; i < rw.water.length; i++) {
    if (!rw.water[i] || rw.elev[i] <= rw.waterLevel) continue;   // sea, not a lake
    if (rw.filled[i] > highest) highest = rw.filled[i];
  }
  assert.ok(highest <= lakeTop + 1e-6,
    `озеро на высоте ${highest.toFixed(3)} — потолок ${lakeTop.toFixed(3)}`);
}

// rivers must not flood a region: no 32×32 window may be more than a quarter river
{
  let densest = 0;
  for (let cy = 0; cy + 32 <= MAP_H; cy += 32) {
    for (let cx = 0; cx + 32 <= MAP_W; cx += 32) {
      let c = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (rw.river[(cy + y) * MAP_W + cx + x]) c++;
      if (c > densest) densest = c;
    }
  }
  assert.ok(densest < 256, `плотность рек ${densest}/1024 — река не должна заливать район`);
}

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
  while (rw.flow[cur] >= 0 && steps++ < 5000) cur = rw.flow[cur];
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

// --- review fixes: wheel scaling, map bounds, camera fuzz ---------------------
import { wheelFactor } from "../src/camera.ts";

// a mouse notch on Chrome (~100 px) and on Firefox line mode (3 lines) must feel similar
const chromeNotch = wheelFactor(100, 0, 680);
const firefoxNotch = wheelFactor(3, 1, 680);
assert.ok(chromeNotch > 0.8 && chromeNotch < 0.95, `колесо Chrome: ${chromeNotch.toFixed(3)}`);
assert.ok(firefoxNotch > 0.88 && firefoxNotch < 0.99, `колесо Firefox: ${firefoxNotch.toFixed(3)}`);
assert.ok(Math.abs(chromeNotch - firefoxNotch) < 0.09, "нотки в двух браузерах близки");
assert.ok(wheelFactor(1, 2, 900) < chromeNotch, "страничный режим прокручивается сильнее");

// zoom pinned in the corner keeps the corner tile
for (const corner of [[0, 0], [800, 600], [0, 600], [800, 0]]) {
  const pinned = clampCamera({ x: -1e9, y: -1e9, zoom: 20 }, 800, 600);
  const under = screenToWorld(pinned, 800, 600, corner[0], corner[1]);
  const z = zoomAt(pinned, 800, 600, corner[0], corner[1], 4);
  const after = screenToWorld(z, 800, 600, corner[0], corner[1]);
  assert.ok(near(under.x, after.x, 1e-6) && near(under.y, after.y, 1e-6),
    `угол ${corner} не съезжает при приближении`);
}

// random pan and zoom never leaves the map while the map is bigger than the viewport
{
  let rp = mulberry32(9), c = clampCamera({ x: 256, y: 256, zoom: 20 }, 900, 680);
  for (let i = 0; i < 400; i++) {
    if (rp() < 0.5) c = clampCamera({ x: c.x + (rp() - 0.5) * 200, y: c.y + (rp() - 0.5) * 200, zoom: c.zoom }, 900, 680);
    else c = zoomAt(c, 900, 680, rp() * 900, rp() * 680, 0.5 + rp());
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.zoom), "камера конечна");
    assert.ok(c.zoom >= ZOOM_MIN && c.zoom <= ZOOM_MAX, `зум ${c.zoom} в пределах`);
    const halfW = 900 / 2 / c.zoom, halfH = 680 / 2 / c.zoom;
    if (MAP_W * c.zoom > 900) assert.ok(c.x >= halfW - 1e-9 && c.x <= MAP_W - halfW + 1e-9, `x ${c.x} внутри`);
    else assert.ok(near(c.x, MAP_W / 2), "узкая карта по центру");
    if (MAP_H * c.zoom > 680) assert.ok(c.y >= halfH - 1e-9 && c.y <= MAP_H - halfH + 1e-9, `y ${c.y} внутри`);
    else assert.ok(near(c.y, MAP_H / 2), "низкая карта по центру");
  }
}

// empty telltales: ?seed= (nothing after the =) also falls back
assert.equal(seedFromQuery("?seed="), 1, "пустой seed — 1");
assert.equal(seedFromQuery("?seed=1e999"), 1, "бесконечность — 1");

// every river reaches water, on ten seeds, not just one
for (let s = 1; s <= 10; s++) {
  const w = generateWorld(s);
  for (let i = 0; i < w.river.length; i++) {
    if (!w.river[i]) continue;
    let cur = i, steps = 0;
    while (!w.water[cur] && w.flow[cur] >= 0 && steps++ < 5000) cur = w.flow[cur];
    assert.ok(w.water[cur] === 1, `seed ${s}: река от ${i} приходит в воду`);
  }
}

console.log("ok — крайние случаи: колесо, углы, случайные панорамы, реки на десяти seed-ах");

// --- points of interest and settlements ---------------------------------------

test("точки: биом, запасы, скрытая руда, поселения", () => {
  const w = generateWorld(42);
  const allowed = { [POI.logging]: [BIOME.forest], [POI.hunting]: [BIOME.forest],
    [POI.fishing]: [BIOME.water], [POI.salt]: [BIOME.water, BIOME.sand],
    [POI.farm]: [BIOME.field], [POI.pasture]: [BIOME.steppe],
    [POI.quarry]: [BIOME.hill, BIOME.mountain], [POI.mine]: [BIOME.mountain] };
  assert.ok(w.poi.length > 40, `точек ${w.poi.length}`);
  for (const p of w.poi) {
    assert.ok(allowed[p.kind].includes(w.biome[p.y * w.w + p.x]), `точка ${p.kind} не на своём биоме`);
    assert.ok(p.reserve > 0 && p.yield > 0 && p.yield <= 1);
  }
  for (const kind of [POI.logging, POI.hunting, POI.fishing, POI.salt, POI.farm, POI.pasture, POI.quarry]) {
    assert.ok(w.poi.filter((p) => p.kind === kind).length > 0, `нет точек вида ${kind}`);
  }
  const mines = w.poi.filter((p) => p.kind === POI.mine);
  assert.ok(mines.length > 0, "руд нет в данных");
  assert.ok(mines.every((p) => !p.known), "руда не должна быть известна");
  assert.ok(w.poi.filter((p) => p.kind !== POI.mine).every((p) => p.known), "остальные точки известны");
  // same kind never crowds
  for (const a of w.poi) for (const b of w.poi) {
    if (a === b || a.kind !== b.kind) continue;
    assert.ok(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) >= POI_MIN_GAP, "две точки одного вида слишком близко");
  }
  // settlements stand on dry flat land
  assert.ok(w.settlements.length >= 12, `поселений ${w.settlements.length}`);
  const settlementTiles = new Set();
  for (const s of w.settlements) {
    assert.ok(!w.water[s.y * w.w + s.x], "поселение в воде");
    const sb = w.biome[s.y * w.w + s.x];
    assert.ok(sb !== BIOME.hill && sb !== BIOME.mountain, "поселение на холме или горе");
    assert.ok(w.river[s.y * w.w + s.x] === 0, "поселение на реке");
    assert.ok(!settlementTiles.has(`${s.x},${s.y}`), "два поселения на одном тайле");
    settlementTiles.add(`${s.x},${s.y}`);
    assert.ok(!w.poi.some((p) => p.x === s.x && p.y === s.y), "поселение на точке интереса");
  }
  // no POI sits on the same tile as its nearest settlement
  for (const p of w.poi) {
    const ns = Math.min(...w.settlements.map((s) => Math.hypot(s.x - p.x, s.y - p.y)), Infinity);
    assert.ok(ns > 0, "ближайшее поселение не на том же тайле, что и точка");
  }
  assert.deepEqual(generateWorld(42).poi, w.poi, "точки должны быть детерминированы");
});

// every kind reaches its target count on the checked seeds
for (const seed of [1, 8, 42, 1000]) {
  const w = generateWorld(seed);
  for (const kind of [POI.logging, POI.hunting, POI.fishing, POI.salt, POI.farm, POI.pasture, POI.quarry, POI.mine]) {
    const count = w.poi.filter((p) => p.kind === kind).length;
    assert.equal(count, POI_COUNTS[kind], `seed ${seed}: вид ${kind} — ${count} вместо ${POI_COUNTS[kind]}`);
  }
}

// all three ore types appear across the first ten seeds, and seed 42 is not single-type
{
  const seen = new Set();
  for (let s = 1; s <= 10; s++) {
    for (const p of generateWorld(s).poi) {
      if (p.kind === POI.mine) seen.add(p.resource);
    }
  }
  assert.ok(seen.has(RESOURCE.copper), "медная руда встречается");
  assert.ok(seen.has(RESOURCE.iron), "железная руда встречается");
  assert.ok(seen.has(RESOURCE.silver), "серебряная руда встречается");

  const ore42 = generateWorld(42).poi.filter((p) => p.kind === POI.mine).map((p) => p.resource);
  assert.ok(new Set(ore42).size > 1, "на seed 42 не один тип руды");
}

console.log("ok — точки интереса и поселения: биомы, запасы, скрытая руда, близость воды/леса");

// --- settlements as objects ---------------------------------------------------
const ws = generateWorld(42);
assert.equal(ws.settlements.length, SETTLEMENT_COUNT, `поселений ${ws.settlements.length}`);
for (const s of ws.settlements) {
  assert.ok(s.name.length >= 4, "у поселения есть имя");
  assert.ok(s.population >= 20 && s.population <= 60, `стартовое население ${s.population}`);
  assert.equal(s.level, 0, "все начинают хуторами");
  assert.equal(s.abandoned, false);
  assert.equal(s.stock.length, 10, "склад по числу ресурсов");
  assert.ok(Array.isArray(s.pois));
}
const settlementNames = ws.settlements.map((s) => s.name);
assert.equal(new Set(settlementNames).size, settlementNames.length, "имена поселений не повторяются");
assert.ok(ws.settlements.every((s) => s.water), "каждое поселение у воды");
assert.ok(ws.settlements.some((s) => s.pois.length > 0), "у кого-то есть точки");

const nearestSettlementDist = (w, p) => {
  let best = Infinity;
  for (const s of w.settlements) {
    const d = Math.hypot(s.x - p.x, s.y - p.y);
    if (d < best) best = d;
  }
  return best;
};

for (const p of ws.poi) {
  if (!p.known) continue;
  const owner = ws.settlements.findIndex((s) => s.pois.includes(ws.poi.indexOf(p)));
  if (nearestSettlementDist(ws, p) <= POI_OWN_RANGE) {
    assert.ok(owner >= 0, `у видимой точки в радиусе ${POI_OWN_RANGE} есть хозяин (${p.kind})`);
  }
}

const knownCount = ws.poi.filter((p) => p.known).length;
const ownedKnown = ws.poi.filter((p) =>
  p.known && ws.settlements.some((s) => s.pois.includes(ws.poi.indexOf(p)))
).length;
assert.ok(ownedKnown / knownCount >= 0.8, `seed 42: owned ${ownedKnown}/${knownCount} known POIs`);

// Mines respect the same ownership cap and stay hidden from the player.
for (const p of ws.poi) {
  if (p.kind !== POI.mine) continue;
  const owner = ws.settlements.findIndex((s) => s.pois.includes(ws.poi.indexOf(p)));
  if (nearestSettlementDist(ws, p) <= POI_OWN_RANGE) {
    assert.ok(owner >= 0, "рудник в радиусе владения получает хозяина");
  }
  assert.ok(!p.known, "рудник остаётся скрытым");
}

for (const seed of [1, 8, 42, 1000]) {
  const w = generateWorld(seed);
  const names = new Set();
  for (const s of w.settlements) {
    assert.ok(s.population >= 20 && s.population <= 60, `seed ${seed}: население ${s.population}`);
    assert.equal(s.level, 0, `seed ${seed}: уровень хутора`);
    assert.ok(s.buildings.houses >= 1, `seed ${seed}: есть дома`);
    names.add(s.name);
  }
  assert.equal(names.size, w.settlements.length, `seed ${seed}: имена поселений уникальны`);
}

// Every town must own at least one point and no point may belong to two towns.
for (const seed of [1, 8, 42, 1000]) {
  const w = generateWorld(seed);
  const seen = new Set();
  for (const s of w.settlements) {
    assert.ok(s.pois.length >= 1, `seed ${seed}: поселение без точек`);
    for (const pi of s.pois) {
      assert.ok(!seen.has(pi), `seed ${seed}: точка ${pi} в двух поселениях`);
      seen.add(pi);
    }
  }
}

console.log("ok — поселения: имена, население, вода, владение точками");

// --- regions and names --------------------------------------------------------
const w1 = generateWorld(42);
assert.ok(w1.cultures.length >= 3 && w1.cultures.length <= 7, `краёв ${w1.cultures.length}, ждём 3..7`);
let unowned = 0;
for (let i = 0; i < w1.biome.length; i++) {
  const b = w1.biome[i];
  const land = b !== 0 && b !== 5 && b !== 6 && w1.river[i] === 0;
  if (land && w1.regionOf[i] < 0) unowned++;
}
assert.equal(unowned, 0, "у каждой пахотной клетки есть край");

const namer = w1.namer;
const names = new Set();
for (let i = 0; i < 500; i++) {
  const r = i % w1.cultures.length;
  const n = namer.settlement(r);
  assert.ok(n.length >= 4 && n.length <= 14, `длина имени ${n}`);
  assert.ok(/^[А-ЯЁа-яё-]+$/.test(n), `только кириллица: ${n}`);
  names.add(n);
}
assert.equal(names.size, 500, "500 имён без повторов");

for (const c of w1.cultures) {
  let hit = 0, total = 0;
  for (let i = 0; i < 40; i++) {
    const n = namer.settlement(c.id);
    total++;
    if (c.endings.some((e) => n.endsWith(e))) hit++;
  }
  assert.ok(hit / total >= 0.8, `окончания края ${c.name}: ${hit}/${total}`);
}

const w1b = generateWorld(42);
assert.deepEqual(w1.settlements.map((s) => s.name), w1b.settlements.map((s) => s.name), "имена детерминированы");

for (let a = 0; a < w1.cultures.length; a++) {
  for (let b = 0; b < w1.cultures.length; b++) {
    if (a === b) continue;
    for (const ea of w1.cultures[a].endings) {
      for (const eb of w1.cultures[b].endings) {
        assert.ok(!ea.endsWith(eb) && !eb.endsWith(ea),
          `окончания краёв ${w1.cultures[a].name} и ${w1.cultures[b].name} пересекаются: ${ea}, ${eb}`);
      }
    }
  }
}
console.log("ok — края и имена: покрытие, 500 имён, окончания, детерминизм, уникальность окончаний");

// exercise the fallback path hard: more names than any one world will ever need
{
  const w3k = generateWorld(7);
  const names3k = new Set();
  for (let i = 0; i < 3000; i++) {
    const r = i % w3k.cultures.length;
    const n = w3k.namer.settlement(r);
    assert.ok(n.length >= 4 && n.length <= 14, `длина fallback-имени ${n}`);
    assert.ok(/^[А-ЯЁа-яё-]+$/.test(n), `fallback-имя только кириллица: ${n}`);
    assert.ok(!names3k.has(n), `имя повторилось на шаге ${i}: ${n}`);
    names3k.add(n);
  }
  assert.equal(names3k.size, 3000, "3000 имён без повторов");
  console.log("ok — края и имена: 3000 уникальных кириллических имён");
}

// --- POI rendering ------------------------------------------------------------
import { visiblePois, poiAt } from "../src/render.ts";

test("POI render: visiblePois returns only known points", () => {
  const w = generateWorld(42);
  const visible = visiblePois(w);
  assert.ok(visible.every((p) => p.known), "visiblePois contains only known points");
  assert.ok(w.poi.filter((p) => p.known).every((p) => visible.includes(p)), "every known POI is visible");
  assert.equal(visible.filter((p) => p.kind === POI.mine).length, 0, "hidden mines are excluded");
});

test("poiAt finds a POI at its screen centre and returns null in empty space", () => {
  const w = generateWorld(42);
  const cam = { x: w.w / 2, y: w.h / 2, zoom: 20 };
  const vw = 800, vh = 600;
  const p = w.poi.find((p) => p.known);
  assert.ok(p, "there is at least one known POI");
  const s = worldToScreen(cam, vw, vh, p.x + 0.5, p.y + 0.5);
  const hit = poiAt(w, cam, vw, vh, s.x, s.y);
  assert.equal(hit?.x, p.x, "poiAt hits POI centre");
  assert.equal(hit?.y, p.y, "poiAt hits POI centre y");
  assert.equal(poiAt(w, cam, vw, vh, 0, 0), null, "poiAt misses empty corner");
});

test("poiAt ignores hidden mines", () => {
  const w = generateWorld(42);
  const mine = w.poi.find((p) => p.kind === POI.mine && !p.known);
  assert.ok(mine, "there is a hidden mine");
  const cam = { x: w.w / 2, y: w.h / 2, zoom: 20 };
  const s = worldToScreen(cam, 800, 600, mine.x + 0.5, mine.y + 0.5);
  assert.equal(poiAt(w, cam, 800, 600, s.x, s.y), null, "hidden mine has no hit target");
});

console.log("ok — POI рендеринг: видимые точки, попадание по экранным координатам");

// --- POI card and click detection --------------------------------------------
import { poiCard, isClick, declPoints, declTiles, nearestSettlement, sameKindInZone } from "../src/poi-card.ts";
import { POI_NAMES, RESOURCE_NAMES, POI_ZONE } from "../src/config.ts";

test("isClick distinguishes taps from drags", () => {
  assert.equal(isClick(0, 0, 4), true, "no movement is a click");
  assert.equal(isClick(2, 2, 4), true, "small move under threshold is a click");
  assert.equal(isClick(4, 0, 4), false, "move at exact threshold is a drag");
  assert.equal(isClick(10, 0, 4), false, "long horizontal move is a drag");
});

test("declPoints declines точка for 1/2/5/11", () => {
  assert.equal(declPoints(1), "точка");
  assert.equal(declPoints(2), "точки");
  assert.equal(declPoints(5), "точек");
  assert.equal(declPoints(11), "точек");
  assert.equal(declPoints(21), "точка");
  assert.equal(declPoints(22), "точки");
  assert.equal(declPoints(25), "точек");
});

test("declTiles declines тайл for 1/2/5/11", () => {
  assert.equal(declTiles(1), "тайл");
  assert.equal(declTiles(2), "тайла");
  assert.equal(declTiles(5), "тайлов");
  assert.equal(declTiles(11), "тайлов");
  assert.equal(declTiles(21), "тайл");
  assert.equal(declTiles(22), "тайла");
  assert.equal(declTiles(25), "тайлов");
});

test("nearestSettlement finds the closest town", () => {
  const poi = { kind: POI.logging, resource: RESOURCE.wood, x: 100, y: 100, yield: 0.5, reserve: 200, known: true };
  const settlements = [{ x: 90, y: 90 }, { x: 110, y: 110 }, { x: 50, y: 50 }];
  const w = { ...generateWorld(42), settlements };
  const ns = nearestSettlement(poi, w);
  assert.ok(ns, "nearest settlement exists");
  assert.equal(ns.x, 90, "closest x");
  assert.equal(ns.y, 90, "closest y");
  assert.ok(Math.abs(ns.dist - Math.hypot(10, 10)) < 1e-9, "distance is Euclidean");
});

test("sameKindInZone counts same-kind POIs within POI_ZONE and excludes distant ones", () => {
  const anchor = { kind: POI.logging, resource: RESOURCE.wood, x: 100, y: 100, yield: 0.5, reserve: 200, known: true };
  const inside = { kind: POI.logging, resource: RESOURCE.wood, x: 100 + POI_ZONE - 1, y: 100, yield: 0.5, reserve: 200, known: true };
  const outside = { kind: POI.logging, resource: RESOURCE.wood, x: 100 + POI_ZONE + 1, y: 100, yield: 0.5, reserve: 200, known: true };
  const otherKind = { kind: POI.fishing, resource: RESOURCE.fish, x: 100 + 2, y: 100, yield: 0.5, reserve: 200, known: true };
  const w = { ...generateWorld(42), poi: [anchor, inside, outside, otherKind] };
  const count = sameKindInZone(w, anchor);
  const expected = w.poi.filter((p) => p.kind === anchor.kind && Math.hypot(p.x - anchor.x, p.y - anchor.y) <= POI_ZONE).length;
  assert.equal(count, expected, "count matches independent filter");
  assert.equal(count, 2, "anchor + one same-kind neighbour inside zone");
});

test("poiCard returns Russian labels and settlement distance", () => {
  const w = generateWorld(42);
  const p = w.poi.find((p) => p.known);
  assert.ok(p, "there is a known POI");
  const card = poiCard(w, p);
  assert.equal(card.kindName, POI_NAMES[p.kind], "kind name is Russian");
  assert.equal(card.resourceName, RESOURCE_NAMES[p.resource], "resource name is Russian");
  assert.ok(card.yield > 0 && card.yield <= 1, "yield in range");
  assert.ok(card.reserve > 0, "reserve positive");
  assert.ok(card.nearestSettlement, "settlement distance present");
  const expectedDist = Math.min(...w.settlements.map((s) => Math.hypot(s.x - p.x, s.y - p.y)));
  assert.ok(Math.abs(card.nearestSettlement.dist - expectedDist) < 1e-9, "distance matches independent minimum");
});

console.log("ok — карточка точки и клик: подписи, расстояние, счётчик в зоне");
