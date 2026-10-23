# Точки интереса и поселения — план

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** на карте появляются точки интереса по биомам со своими ресурсом и запасом, рядом с водой и лесом встают первые поселения; точки видны иконками, зона отключается, скрытая руда лежит в данных, но не рисуется.

**Architecture:** генерация точек — чистая функция в `src/gen.ts`, результат лежит в `World` (`poi`, `settlements`). Рендер только читает: иконки рисуются в экранных координатах поверх чанков. `main.ts` ловит клик, находит точку и заполняет карточку в полосе.

**Tech Stack:** Vite + TypeScript + Canvas2D, ноль зависимостей. Тесты — `tools/test.mjs` (node, headless).

**Spec:** `docs/superpowers/specs/2026-10-22-merchant-design.md` (§8 Мир; в этой итерации — только земля и точки, без цен, денег и роста).

## Global Constraints

- Ядро чистое: `gen.ts`, `world.ts` не знают про DOM и canvas.
- Детерминизм: только `world.rng` / `mulberry32`, никакого `Math.random()`.
- `npm test` и `npm run build` зелёные; CHANGELOG одной строкой на пункт; пуш в `origin/main`.
- Числа — в `src/config.ts`. Комментарии в коде — по-английски, текст интерфейса — по-русски.

## Review Focus

- Точка не должна стоять на воде, на горе и на чужой точке — проверяется тестом по биому и расстоянию.
- Скрытая руда не должна протекать в рендер ни иконкой, ни «?» — проверяется фильтром `visiblePois`.
- Поселение не должно оказаться в воде или на круче — проверяется тестом.
- Две генерации одного seed должны давать одинаковые точки — проверяется тестом.
- Иконки не должны налезать друг на друга на дальнем зуме — проверяется скриншотом на zoom 1.2.

---

### Task 1: Данные и генерация точек

**Files:**
- Modify: `src/world.ts`, `src/config.ts`, `src/gen.ts`, `tools/test.mjs`

**Interfaces:**
- Produces:
  - `POI = { logging: 0, hunting: 1, fishing: 2, salt: 3, farm: 4, pasture: 5, quarry: 6, mine: 7 }`
  - `RESOURCE = { wood: 0, fur: 1, fish: 2, salt: 3, grain: 4, livestock: 5, stone: 6, copper: 7, iron: 8, silver: 9 }`
  - `type Poi = { kind: number; resource: number; x: number; y: number; yield: number; reserve: number; known: boolean }`
  - `type Settlement = { x: number; y: number }`
  - `World.poi: Poi[]`, `World.settlements: Settlement[]`
  - `config`: `POI_COUNTS: Record<number, number>`, `POI_MIN_GAP = 10`, `POI_ZONE = 40`, `SETTLEMENT_COUNT = 24`, `SETTLEMENT_REACH = 6`, `POI_BIOMES: Record<number, number[]>`

- [ ] **Step 1: Failing test** — в `tools/test.mjs`:

```js
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
  // settlements stand next to water or forest, on dry land
  assert.ok(w.settlements.length >= 12, `поселений ${w.settlements.length}`);
  for (const s of w.settlements) {
    assert.ok(!w.water[s.y * w.w + s.x], "поселение в воде");
    assert.ok(w.poi.some((p) => (p.kind === POI.fishing || p.kind === POI.logging)
      && Math.max(Math.abs(p.x - s.x), Math.abs(p.y - s.y)) <= SETTLEMENT_REACH), "поселение без воды и леса рядом");
  }
  assert.deepEqual(generateWorld(42).poi, w.poi, "точки должны быть детерминированы");
});
```

- [ ] **Step 2: Run** — `node tools/test.mjs`, ожидание: `POI is not defined`.

- [ ] **Step 3: Implement** — типы и константы как в Interfaces; в `gen.ts` после рек — `placePoi(...)`:

  Для каждого вида из `POI_COUNTS` пробовать до `count * 40` раз: взять случайный тайл через `rng`, принять, если его биом в `POI_BIOMES[kind]` и ни одна уже поставленная точка того же вида не ближе `POI_MIN_GAP`. `yield` = `0.45 + rng()*0.55`, `reserve` = `160 + floor(rng()*640)`. Руда: `resource` = `copper`, `iron` или `silver` по `fbm(seed+9100, x, y, 40, 2)` (первый — меди, второй — железу, третий — серебру), `known = false`. Затем поселения: `SETTLEMENT_COUNT` раз взять случайную известную точку вида `fishing` или `logging`, встать на сушу в пределах `SETTLEMENT_REACH`; если места нет — пропустить.

- [ ] **Step 4: Run** — `node tools/test.mjs`, все строки `ok`.

- [ ] **Step 5: Commit** — `git commit -m "Точки интереса и поселения в генерации мира"`.

---

### Task 2: Иконки и зона

**Files:**
- Modify: `src/render.ts`, `src/config.ts`, `tools/test.mjs`

**Interfaces:**
- Consumes: `World.poi` из Task 1.
- Produces:
  - `visiblePois(world: World): Poi[]` — экспорт из `render.ts`, отдаёт только `known`.
  - `drawPois(ctx, world, cam, vw, vh, zones: boolean): void` и `poiAt(world, cam, vw, vh, sx, sy): Poi | null` (радиус попадания 12 px).
  - `config`: `POI_ICON_PX = 9`, `POI_HIT_PX = 12`, `POI_ZONE_ALPHA = 0.10`, `POI_COLORS: Record<number, string>`

- [ ] **Step 1: Failing test** — `visiblePois(world)` не содержит скрытых руд и содержит все остальные; `poiAt` по центру точки возвращает её, по пустому месту — `null`.

- [ ] **Step 2: Run** — ожидание: `visiblePois is not a function`.

- [ ] **Step 3: Implement** — в `drawRivers` после: `drawPois`. Иконка — круг-бейдж радиусом `POI_ICON_PX` с обводкой и одним глифом: лесосека — ёлка (треугольник), охота — рога (две дуги), рыбалка — рыба (две дуги + хвост), соль — ромб, пашня — три колоса (три линии с зерном), пастбище — голова с рогами (полукруг + два штриха), каменоломня — кирка (две линии и дуга). Глифы — функция `glyph(ctx, kind, x, y, r)`, всё в экранных координатах, цвет из `POI_COLORS`. Зона — `ctx.arc` радиусом `POI_ZONE * cam.zoom` с `POI_ZONE_ALPHA`, только при `zones === true`. `poiAt` перебирает `visiblePois`, считает экранные координаты через `worldToScreen` и берёт ближайшую в `POI_HIT_PX`.

- [ ] **Step 4: Run** — `node tools/test.mjs` зелёный, `npm run build` зелёный, скриншот `?seed=42&zoom=1.2` и `zoom=6`: иконки читаются, не налезают, зон не видно.

- [ ] **Step 5: Commit** — `git commit -m "Иконки точек интереса и слой зоны"`.

---

### Task 3: Зона по кнопке и карточка точки

**Files:**
- Modify: `index.html`, `src/main.ts`, `src/config.ts`

**Interfaces:**
- Consumes: `drawPois`, `poiAt`, `World.poi`, `World.settlements`.
- Produces: `showCard(world, poi)` в `main.ts`; кнопка `#zones` в HUD с `aria-pressed`.

- [ ] **Step 1: Implement** — в HUD кнопка «зоны» (включена по умолчанию), `pointer-events: auto` только у неё. Клик по карте (не перетаскивание — проверять, что сдвиг меньше 4 px): `poiAt` → карточка в `#deals`: имя вида по-русски, ресурс, урожайность, остаток запаса, ближайшее поселение и расстояние, число точек этого вида в радиусе `POI_ZONE`. Клик по пустому месту — карточка возвращается к «капитал 12 480».
- [ ] **Step 2: Verify** — `npm run build`; скриншоты: зона включена, зона выключена, карточка лесосеки.

### Task 4: CHANGELOG, тесты, сборка, пуш

- [ ] Запись в `CHANGELOG.md` (0.1.5) списком: точки по биомам, скрытая руда, поселения у воды и леса, иконки, зона, карточка.
- [ ] `npm test && npm run build`, затем `git push origin main`.
