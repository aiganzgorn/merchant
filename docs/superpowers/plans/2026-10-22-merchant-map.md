# Merchant — карта (инкременты 0–1) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живая карта мира из seed — биомы, реки, озёра, холмы и горы, — которую можно двигать и приближать, в раскладке C (карта сверху, полоса снизу).

**Architecture:** Чистая генерация (`src/gen.ts`) отдаёт плоский `World` из типизированных массивов; камера — чистая арифметика (`src/camera.ts`); рендер только читает мир, рельеф предрендерится по чанкам в offscreen-канвасы и блитится; `src/main.ts` держит окно, ввод и цикл кадров. Симуляции в этом плане ещё нет.

**Tech Stack:** Vite 7, TypeScript 5.9, Canvas2D, Node 24 для тестов (type stripping — импортируем `.ts` напрямую), ноль рантайм-зависимостей.

**Spec:** `docs/superpowers/specs/2026-10-22-merchant-design.md`

## Global Constraints

- Карта `512 × 512` тайлов; тайл — единица мира, координата мира = номер тайла.
- Детерминизм: `Math.random()`, `Date.now()` и глобальное состояние в `gen.ts` запрещены. Случайность только из seed.
- `src/gen.ts` и `src/camera.ts` не трогают DOM; `src/render.ts` не меняет мир.
- Все настраиваемые числа — в `src/config.ts`, одной строкой с комментарием на русском.
- TypeScript `strict`, `noEmit`; тестовый прогон — `npm test` (Node 24: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24`), сборка — `npm run build`.
- Node type stripping не умеет `enum` и `namespace` — только `const`-объекты и типы.
- Комментарии в коде по-английски, текст интерфейса и документации по-русски, коммиты по-русски.
- Пуш в `origin/main` сразу после каждого зелёного коммита.

## Review Focus

1. `?seed=` отсутствует, пустой, `0`, отрицательный или нечисловой → мир всё равно генерируется (запасной seed `1`), карта не пустая и не из `NaN`.
2. Окно ниже `STRIP_H + 120` или очень широкое/высокое → область карты держит минимум 120 px, камера центрирует карту вместо растягивания.
3. Перетаскивание за край карты или зум до минимума при сдвинутой камере → вьюпорт остаётся внутри карты, пустого поля нет.
4. Зум колесом в самом углу карты при прижатой камере → точка под курсором не прыгает.
5. Изменение размера окна и переезд между экранами с другим DPR → канвас не плывёт, карта не размывается и не обрезается.

---

### Task 1: Репозиторий и скелет

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `index.html`, `src/config.ts`, `src/main.ts`, `AGENTS.md`, `README.md`, `CHANGELOG.md`

**Interfaces:**
- Produces: `npm run dev`, `npm run build`, `npm test`, `npm run preview`; `src/config.ts` со значениями `MAP_W`, `MAP_H`, `STRIP_H`.

- [ ] **Step 1: Создать каркас**

`package.json`:

```json
{
  "name": "merchant",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "node tools/test.mjs"
  },
  "devDependencies": {
    "typescript": "^5.9.0",
    "vite": "^7.0.0"
  }
}
```

`tsconfig.json` — как в evolvarium: `target ES2022`, `module ESNext`, `moduleResolution bundler`, `strict`, `noEmit`, `allowImportingTsExtensions`, `skipLibCheck`, `lib ["ES2022","DOM","DOM.Iterable"]`, `include ["src"]`.

`.gitignore`:

```
node_modules/
dist/
.superpowers/
```

`src/config.ts` — пока только карта и раскладка:

```ts
// Every tunable number of the project lives here — change them in one place.

// map
export const MAP_W = 512;        // tiles across
export const MAP_H = 512;        // tiles down

// layout (C: map above, strip below)
export const STRIP_H = 220;      // bottom strip height, px
export const MAP_MIN_H = 120;    // the map never shrinks below this, px
```

`src/main.ts` — минимальный вход: канвас на всю область карты, в полосе снизу — два подписанных блока «лента» и «мои дела», пока с заглушками.

`index.html` — `canvas#map` сверху (`display:block`) и `div#strip` снизу высотой `var(--strip)`, которую выставляет `src/main.ts` из `STRIP_H`; полоса из двух колонок, у каждой видимая подпись. Шрифт и палитра как в evolvarium (`ui-monospace`, фон `#0d0f16`, текст `#cdd6ff`, акцент `#ffd76e`). Подключить `/src/main.ts` как `type="module"`. Высоту и ширину канваса тоже ставит `src/main.ts` по `mapViewport`. Раскладка на `flex` в колонку, `html, body { margin:0; height:100%; overflow:hidden }`.

`AGENTS.md` — правила репозитория: чистое ядро, рендер только читает, детерминизм, ничего лишнего, `npm test` и `npm run build` зелёные, CHANGELOG одной строкой, пуш в `origin/main` сразу. `README.md` — две строки о проекте. `CHANGELOG.md` — заголовок и секция `## 0.1.0 — 2026-10-22` с первой записью.

- [ ] **Step 2: Установить и собрать**

Run: `npm install && npm run build; echo "exit=$?"`
Expected: `exit=0`, появился `dist/`.

- [ ] **Step 3: Проверить в браузере**

Run: `npm run dev` (в фоне), открыть `http://localhost:5173`
Expected: тёмная страница, сверху область карты, снизу полоса с двумя читаемыми подписями, ни одна не перекрыта.

- [ ] **Step 4: Репозиторий и первый пуш**

```bash
git init -b main
git add -A
git commit -m "Скелет проекта: Vite, TS, канвас и полоса интерфейса"
gh repo create aiganzgorn/merchant --public --source=. --remote=origin --push
```

---

### Task 2: RNG и тестовый прогон

**Files:**
- Create: `src/rng.ts`, `tools/test.mjs`

**Interfaces:**
- Produces: `type Rng = () => number`, `mulberry32(seed: number): Rng`, `int(rng: Rng, maxExclusive: number): number`. Тестовый файл печатает `ok — <что проверено>` и выходит с кодом 1 на первом провале.

- [ ] **Step 1: Написать падающий тест**

`tools/test.mjs`:

```js
import assert from "node:assert/strict";
import { mulberry32, int } from "../src/rng.ts";

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
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node tools/test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` для `../src/rng.ts`.

- [ ] **Step 3: Написать `src/rng.ts`**

`mulberry32` — один в один как в evolvarium. `int(rng, maxExclusive)` возвращает `Math.floor(rng() * maxExclusive)`.

- [ ] **Step 4: Прогнать тест**

Run: `node tools/test.mjs`
Expected: `ok — rng: детерминизм и диапазон`.

- [ ] **Step 5: Коммит**

```bash
git add src/rng.ts tools/test.mjs
git commit -m "Детерминированный rng и headless-прогон тестов"
```

---

### Task 3: Рельеф, влажность и биомы

**Files:**
- Create: `src/world.ts`, `src/gen.ts`
- Modify: `src/config.ts`
- Test: `tools/test.mjs`

**Interfaces:**
- Produces:
  - `world.ts`: `type World = { seed: number; w: number; h: number; elev: Float32Array; moist: Float32Array; biome: Uint8Array; water: Uint8Array; river: Uint8Array; flow: Int32Array; rivers: number }` — все массивы длиной `w*h`, индекс `y*w+x`; `const BIOME = { water: 0, sand: 1, steppe: 2, field: 3, forest: 4, hill: 5, mountain: 6 }`; `const idx = (w: World, x: number, y: number): number`.
  - `gen.ts`: `generateWorld(seed: number): World`; `seedFromQuery(qs: string): number`.
- Consumes: `mulberry32` из Task 2.

- [ ] **Step 1: Добавить значения в `src/config.ts`**

```ts
// terrain
export const ELEV_SCALE = 96;       // tiles across the first noise octave
export const MOIST_SCALE = 64;
export const OCTAVES = 5;
export const EDGE_FALLOFF = 0.18;   // share of the map that sinks to ocean
export const WATER_LEVEL = 0.42;    // elevation below this is water
export const SAND_LEVEL = 0.03;     // band above water that is beach
export const HILL_LEVEL = 0.68;
export const MOUNTAIN_LEVEL = 0.78;
export const FIELD_MOIST = 0.62;
export const FOREST_MOIST = 0.48;
export const BIOME_COLORS: Record<number, string> = {
  0: "#12324f", 1: "#c2ab6b", 2: "#4a5636", 3: "#77864a",
  4: "#2b5233", 5: "#54504a", 6: "#6d6a63",
};
```

- [ ] **Step 2: Написать падающий тест**

Дописать в `tools/test.mjs` перед `console.log`:

```js
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

assert.equal(seedFromQuery(""), 1, "без seed — 1");
assert.equal(seedFromQuery("?seed=7"), 7, "число из строки");
assert.equal(seedFromQuery("?seed=abc"), 1, "мусор — запасной seed");
assert.equal(seedFromQuery("?seed=-4"), 1, "отрицательный — запасной seed");
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `node tools/test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` для `../src/gen.ts`.

- [ ] **Step 4: Написать `src/world.ts` и генерацию в `src/gen.ts`**

`world.ts` — только типы и `BIOME`, `idx` (никаких функций, трогающих DOM).

`gen.ts`:
- `hash2(seed, x, y) → [0,1)`: целочисленный микс (`Math.imul`), без `Math.random`.
- `valueNoise(seed, x, y)`: четыре угла на целых координатах через `hash2`, `smoothstep` между ними.
- `fbm(seed, x, y, scale, octaves)`: сумма октав `0.5^i * valueNoise(seed + i, x / (scale / 2^i), y / (scale / 2^i))`, делённая на сумму весов → 0..1.
- `elevation`: `raw = fbm(...ELEV_SCALE, OCTAVES)`, **сначала нормировать весь массив в 0..1 по min/max**, потом утопить край: `d = min(x, y, w-1-x, h-1-y) / (EDGE_FALLOFF * min(w, h))`, `f = clamp(d, 0, 1)`, `elev = raw * (0.35 + 0.65 * f * f * (3 - 2 * f))` — после этого край не выше 0.35 и гарантированно вода.
- `moisture`: `fbm(seed + 1000, x, y, MOIST_SCALE, OCTAVES)`.
- биом по правилам: `elev < WATER_LEVEL → water`; `< WATER_LEVEL + SAND_LEVEL → sand`; `> MOUNTAIN_LEVEL → mountain`; `> HILL_LEVEL → hill`; иначе по влажности: `> FIELD_MOIST → field`, `> FOREST_MOIST → forest`, иначе `steppe`. `water[i] = biome[i] === BIOME.water ? 1 : 0`.
- `seed = mulberry32(seed)` — все случайности генерации из него.
- `seedFromQuery(qs)`: `Number(new URLSearchParams(qs).get("seed"))`, нечисловое/отрицательное/дробное → `1`, иначе `Math.floor`.

Рек и `flow`/`river` пока нет — массивы создать нулевыми, `rivers = 0`.

- [ ] **Step 5: Прогнать тест**

Run: `node tools/test.mjs`
Expected: `ok — rng…`, затем строка про рельеф; падений нет.

- [ ] **Step 6: Коммит**

```bash
git add src/world.ts src/gen.ts src/config.ts tools/test.mjs
git commit -m "Процедурный рельеф, биомы и seed из адреса"
```

---

### Task 4: Реки и озёра

**Files:**
- Modify: `src/gen.ts`, `src/config.ts`
- Test: `tools/test.mjs`

**Interfaces:**
- Consumes: `World` из Task 3.
- Produces: заполненные `world.river` (1 на тайле реки), `world.flow` (индекс следующего тайла русла или `-1`), `world.water` (озёра тоже `1`), `world.rivers` (сколько рек удалось проложить).

- [ ] **Step 1: Добавить значения в `src/config.ts`**

```ts
// rivers
export const RIVER_COUNT = 24;        // how many rivers to try
export const RIVER_SOURCE_MIN = 0.6;  // a river starts no lower than this elevation
export const RIVER_MAX_LEN = 400;     // tiles before we give up on one river
export const LAKE_RADIUS = 1;         // a one-tile lake is ugly: stamp (2r+1)²
```

- [ ] **Step 2: Написать падающий тест**

Дописать в `tools/test.mjs`:

```js
import { RIVER_COUNT, RIVER_SOURCE_MIN } from "../src/config.ts";

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
  assert.ok(rw.water[nx] === 1 || rw.elev[nx] <= rw.elev[i] + 1e-6, "река не течёт вверх");
}
assert.ok(riverTiles > 100, `речных клеток ${riverTiles}`);

// lakes exist somewhere in the first five seeds — most rivers simply reach the sea
let lakes = 0;
for (let s = 1; s <= 5; s++) {
  const w = generateWorld(s);
  assert.ok(w.rivers > 0, `seed ${s}: реки есть`);
  for (let i = 0; i < w.water.length; i++) if (w.water[i] && w.river[i]) lakes++;
}
assert.ok(lakes > 0, "хотя бы одно озеро на пяти картах");

// no river tile is on the map edge
for (let i = 0; i < rw.river.length; i++) {
  if (!rw.river[i]) continue;
  const x = i % MAP_W, y = (i / MAP_W) | 0;
  assert.ok(x > 0 && y > 0 && x < MAP_W - 1 && y < MAP_H - 1, `река не на краю: ${x},${y}`);
}
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `node tools/test.mjs`
Expected: `проложено рек: 0` — падение на первом же `assert.ok`.

- [ ] **Step 4: Реализовать реки в `src/gen.ts`**

Для каждой из `RIVER_COUNT` попыток:
1. До 200 раз выбрать случайный тайл (`x = 1 + int(rng, w-2)`, так же `y`), пока `elev >= RIVER_SOURCE_MIN` и не вода.
2. Идти до `RIVER_MAX_LEN` шагов. На каждом: пометить `river[i] = 1`; среди восьми соседей внутри карты (не на краю) выбрать самый низкий тайл, который **не вода и не уже речной** (реки не сливаются — это упрощение, вода и так есть). Если такого соседа нет — это локальный минимум: закрасить квадрат `(2*LAKE_RADIUS+1)²` вокруг текущего тайла как `water = 1`, `biome = BIOME.water`, `flow[i] = -1` и закончить реку.
3. Если самый низкий сосед — вода, поставить `flow[i] = j` (индекс этой воды) и закончить реку: сток показывает, во что она впадает.
4. Иначе `flow[i] = j` и продолжить с `j`.
5. Считать `rivers++` за каждую реку длиннее 10 тайлов.

Инвариант, который проверяет тест: у речной клетки либо есть сток внутри карты, либо она сама стала озером. Вверх река не течёт никогда.

Озёра — `water = 1` и биом `water`, `river` у них не ставить. Держать массив `river` для русла только.

- [ ] **Step 5: Прогнать тест**

Run: `node tools/test.mjs`
Expected: все проверки рек проходят.

- [ ] **Step 6: Коммит**

```bash
git add src/gen.ts src/config.ts tools/test.mjs
git commit -m "Реки со стоком вниз и озёра в локальных низинах"
```

---

### Task 5: Камера и нарезка на чанки

**Files:**
- Create: `src/camera.ts`
- Modify: `src/config.ts`
- Test: `tools/test.mjs`

**Interfaces:**
- Produces:
  - `type Camera = { x: number; y: number; zoom: number }` — `x,y` центр вьюпорта в тайлах, `zoom` — пикселей на тайл.
  - `mapViewport(winW: number, winH: number): { w: number; h: number }`
  - `clampCamera(cam: Camera, vw: number, vh: number): Camera`
  - `worldToScreen(cam, vw, vh, wx, wy): { x: number; y: number }`
  - `screenToWorld(cam, vw, vh, sx, sy): { x: number; y: number }`
  - `zoomAt(cam, vw, vh, sx, sy, factor): Camera`
  - `visibleChunks(cam, vw, vh): { cx0: number; cy0: number; cx1: number; cy1: number }` — включительно.
- Consumes: `MAP_W`, `MAP_H` из `src/config.ts`.

- [ ] **Step 1: Добавить значения в `src/config.ts`**

```ts
// camera
export const ZOOM_MIN = 3;      // px per tile, farthest
export const ZOOM_MAX = 48;     // px per tile, closest
export const ZOOM_START = 20;
export const PRERENDER_TILE = 8; // px per tile in the prerendered chunks
export const CHUNK = 32;         // tiles per chunk side
```

- [ ] **Step 2: Написать падающий тест**

```js
import {
  mapViewport, clampCamera, worldToScreen, screenToWorld, zoomAt, visibleChunks,
} from "../src/camera.ts";
import { CHUNK, STRIP_H, MAP_MIN_H, ZOOM_MIN, ZOOM_MAX } from "../src/config.ts";

const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

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
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `node tools/test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` для `../src/camera.ts`.

- [ ] **Step 4: Написать `src/camera.ts`**

- `mapViewport`: `{ w: Math.max(1, winW), h: Math.max(MAP_MIN_H, winH - STRIP_H) }`.
- `worldToScreen`: `{ x: (wx - cam.x) * cam.zoom + vw / 2, y: (wy - cam.y) * cam.zoom + vh / 2 }`.
- `screenToWorld` — обратное.
- `clampCamera`: зум в `[ZOOM_MIN, ZOOM_MAX]`; по каждой оси, если `MAP_i * zoom <= viewport_i`, координата = `MAP_i / 2`, иначе зажать в `[viewport_i / 2 / zoom, MAP_i - viewport_i / 2 / zoom]`.
- `zoomAt`: `zoom = clamp(cam.zoom * factor)`; мир под курсором до зума (`screenToWorld`), после зума новый центр так, чтобы та же точка осталась под курсором: `x = wx - (sx - vw / 2) / zoom`, `y` аналогично; вернуть `clampCamera`.
- `visibleChunks`: полуразмеры вьюпорта в тайлах `vw / 2 / zoom`, `vh / 2 / zoom`; крайние тайлы через `floor`, делить на `CHUNK`, зажать в `0 .. MAP_W / CHUNK - 1`.

- [ ] **Step 5: Прогнать тест**

Run: `node tools/test.mjs`
Expected: проверки камеры проходят.

- [ ] **Step 6: Коммит**

```bash
git add src/camera.ts src/config.ts tools/test.mjs
git commit -m "Камера: привязка к курсору, края карты и нарезка на чанки"
```

---

### Task 6: Предрендер рельефа и рисование

**Files:**
- Create: `src/render.ts`

**Interfaces:**
- Consumes: `World`, `BIOME_COLORS`, `Camera`, `visibleChunks`, `PRERENDER_TILE`, `CHUNK`.
- Produces:
  - `prerender(world: World): HTMLCanvasElement[]` — индекс `cy * (MAP_W / CHUNK) + cx`, каждый канвас `CHUNK * PRERENDER_TILE` px.
  - `draw(ctx: CanvasRenderingContext2D, chunks: HTMLCanvasElement[], cam: Camera, vw: number, vh: number): void`.
  - `paintChunk(world: World, cx: number, cy: number, ctx: CanvasRenderingContext2D): void` — рисует один чанк, отдельно, чтобы тест мог проверить цвет тайла.

- [ ] **Step 1: Написать `src/render.ts`**

`paintChunk`: залить фон цветом глубокой воды, затем по тайлам `fillRect(x*PRERENDER_TILE, y*PRERENDER_TILE, PRERENDER_TILE, PRERENDER_TILE)` цветом `BIOME_COLORS[biome]`; речной тайл — `#1d4b74`; тайл с `river` и `water` (озеро) — тоже `#1d4b74`.

`prerender`: создать канвасы через `document.createElement("canvas")`, каждому `width = height = CHUNK * PRERENDER_TILE`, вызвать `paintChunk`.

`draw`: очистить, `imageSmoothingEnabled = false`, пройти `visibleChunks` и нарисовать каждый чанк через `drawImage` в прямоугольник `worldToScreen` угла чанка с размером `CHUNK * cam.zoom`.

- [ ] **Step 2: Проверить сборку**

Run: `npm run build; echo "exit=$?"`
Expected: `exit=0`.

- [ ] **Step 3: Коммит**

```bash
git add src/render.ts
git commit -m "Предрендер рельефа по чанкам и рисование с камерой"
```

---

### Task 7: Окно, ввод и живой кадр

**Files:**
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Consumes: всё из Task 3–6.
- Produces: работающую страницу; `?seed=N` в адресе.

- [ ] **Step 1: Собрать `src/main.ts`**

- `const seed = seedFromQuery(location.search)`, `const world = generateWorld(seed)`, `const chunks = prerender(world)`.
- Канвас `#map`: размер по `mapViewport(innerWidth, innerHeight)`, DPR как в evolvarium (`Math.min(devicePixelRatio || 1, 2)`, `setTransform`).
- Камера стартует в `{ x: MAP_W / 2, y: MAP_H / 2, zoom: ZOOM_START }` через `clampCamera`.
- `resize`: пересчитать размеры канваса и `clampCamera`.
- Колесо: `preventDefault`, `zoomAt(cam, vw, vh, e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015))` — координаты канваса совпадают с клиентскими, потому что он прижат к левому верхнему углу.
- Перетаскивание: `pointerdown` → запомнить точку и камеру, `pointermove` → `cam.x = start.x - (e.clientX - downX) / cam.zoom` (то же для `y`), `clampCamera`; `pointerup`/`pointercancel` → отпустить. `canvas.setPointerCapture(e.pointerId)`.
- HUD в левом верхнем углу карты: `seed 42 · zoom 20 · тайл 256,318` (координаты под курсором, обновляются на `pointermove`; вне карты — `—`).
- `requestAnimationFrame`: только `draw`, потому что мир пока статичен.

- [ ] **Step 2: Собрать и проверить вживую**

Run: `npm run build; echo "exit=$?"`, затем `npm run dev`
Expected: `exit=0`; в браузере на `http://localhost:5173/?seed=42` видно материк с водой по краям, реки и озёра, горы и лес; колесо приближает к точке под курсором; перетаскивание двигает карту и упирается в края; внизу полоса с двумя видимыми подписями; HUD читается и не перекрывает карту целиком.

- [ ] **Step 3: Проверить крайние случаи вручную**

- `http://localhost:5173/?seed=abc` → тот же мир, что и `?seed=1`.
- Окно, сжатое по высоте до ~300 px → карта остаётся не меньше 120 px, полоса не наезжает.
- Зум до упора в угол карты → пустого поля за краем нет, точка под курсором не прыгает.

- [ ] **Step 4: Записать в CHANGELOG и запушить**

```bash
git add -A
git commit -m "Живая карта: камера, зум колесом, перетаскивание, HUD и seed из адреса"
git push
```

---

## Что этот план не делает

Инкременты 2–7 из спеки (поселения, цены, дороги, договоры, предприятия, события, сохранение) — отдельные планы. Домов, дорог и городов здесь нет: карта стоит и молчит.

## Самопроверка плана

- Покрытие спеки: §8 мир (рельеф, реки, биомы) — задачи 3–4; §10 карта, зум, панорама, раскладка C — задачи 5–7; §11 архитектура и проверки — задачи 1, 2, 6. Остальное — вне этого плана по определению.
- Типы: `World` один на все задачи; `Camera` и функции камеры не переименовываются; `BIOME` используется и в тестах, и в рендере.
- Ratio: тестовые фрагменты — проверки, не реализация; тела функций описаны словами и алгоритмом, кроме шума и камеры, где слова неоднозначны.
