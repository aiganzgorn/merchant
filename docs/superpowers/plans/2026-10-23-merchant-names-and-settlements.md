# merchant: имена краёв и живой мир — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Мир получает имена и время: края со своим звучанием, поселения с населением, строениями и потребностями, суточный тик, производство из точек интереса, стартовый выбор поселения.

**Architecture:** Три новых чистых модуля ядра — `src/names.ts` (края и генератор имён), `src/settlements.ts` (уровни, потребности, производство, рост), `src/sim.ts` (часы и скорость). Всё это работает без DOM и детерминировано от seed. Браузерный слой — `src/ui.ts` (стартовый оверлей, часы, карточка поселения, лента) плюс правки `main.ts`, `render.ts`, `index.html`.

**Tech Stack:** Vite + TypeScript, Canvas2D, ноль рантайм-зависимостей. Проверки: `node tools/test.mjs` (Node 24) и `npm run build`.

**Spec:** `docs/superpowers/specs/2026-10-23-merchant-names-and-settlements-design.md`

## Global Constraints

- Ядро чистое: `src/gen.ts`, `src/world.ts`, `src/names.ts`, `src/settlements.ts`, `src/sim.ts` не знают про DOM, canvas, `window`.
- Рендер только читает: `src/render.ts` не меняет состояние мира.
- Детерминизм: никаких `Math.random()`, `Date.now()`, глобального состояния. Случайность — только `mulberry32` из `src/rng.ts`.
- Имена генератора имён берут отдельный поток: `mulberry32(seed + 12000)`, чтобы не сдвигать уже существующие последовательности рельефа.
- Все числовые настройки — в `src/config.ts`. Комментарии в коде по-английски, интерфейс и документация по-русски.
- Никаких новых зависимостей.
- Не ломать контракт скрытой руды: `known: false`, не рисуется, не выбирается кликом.
- День = 60 с реального времени при ×1; скорости 0, ×1, ×2, ×4.
- `node tools/test.mjs` и `npm run build` зелёные — иначе работа не закончена.

## Review Focus

- **Поселение у воды и без неё:** игрок видит «нет воды» в карточке и понимает, почему люди уходят. Тест: поселение с `water: false` теряет население даже при полной еде.
- **Имена без повторов на большом мире:** 500 имён подряд не повторяются, все кириллицей, 4–14 символов. Тест в задаче 1.
- **Края дырявые:** каждая клетка суши принадлежит краю, краёв 3–7. Тест в задаче 1.
- **Голод не убивает мгновенно и не игнорируется:** за день население падает, но не обнуляется; за 30 дней без еды город пустеет. Тест в задаче 3.
- **Время не ускоряется само и не теряет дни:** при ×4 за 15 секунд проходит ровно один день, при паузе — ни одного. Тест в задаче 3.
- **Стартовый список не пустой:** видны имена, ступень, население, до трёх ресурсов; клик открывает карту на этом поселении. Проверка глазами в браузере в задаче 5.

---

### Task 1: Края и генератор имён

**Files:**
- Create: `src/names.ts`
- Modify: `src/world.ts` (добавить `regionOf`, `cultures`)
- Modify: `src/config.ts` (культуры и параметры имён)
- Modify: `src/gen.ts` (вызвать `buildRegions` и раздать имена поселениям — пока только края)
- Test: `tools/test.mjs`

**Interfaces:**
- Consumes: `World` (`biome`, `river`, `water`, `seed`), `mulberry32`/`int` из `src/rng.ts`.
- Produces:
  - `export type CultureRegion = { id: number; name: string; tiles: number; endings: string[]; onset: string[]; vowel: string[]; coda: string[]; roots: string[]; genitive: string }`
  - `export function buildRegions(world: World): { regionOf: Int16Array; cultures: CultureRegion[] }` — `regionOf[i]` = id края для суши, `-1` для воды, гор и рек.
  - `export type Namer = { settlement(region: number): string; enterprise(kind: string, settlement: string, region: number): string; state(region: number): string }`
  - `export function createNamer(seed: number, cultures: CultureRegion[]): Namer`
  - `World.regionOf: Int16Array`, `World.cultures: CultureRegion[]`, `World.namer: Namer`
  - `export const CULTURES: CultureRegionTemplate[]` в `src/config.ts`

- [ ] **Step 1: Написать падающий тест**

В `tools/test.mjs`, после блока POI (генератор уже импортирован выше — новых `import` для него не нужно):

```js
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
console.log("ok — края и имена: покрытие, 500 имён, окончания, детерминизм");
```

- [ ] **Step 2: Прогнать тест и увидеть падение**

Run: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24; node tools/test.mjs`
Expected: FAIL — `w1.cultures` is undefined.

- [ ] **Step 3: Добавить культуры в `src/config.ts`**

Восемь характеров, каждый — набор согласных, гласных, финалей, окончаний, корней и формы родительного падежа. Наборы не должны пересекаться по окончаниям: так имя выдаёт край. Начать с такого состава (дополнять своими звуками можно, но окончания должны оставаться различимыми):

```ts
export type CultureRegionTemplate = {
  name: string;         // «шипящий», «твёрдый» — для отладки
  onset: string[]; vowel: string[]; coda: string[];
  endings: string[];    // по одному из них кончается ≥80% имён края
  roots: string[];
  genitive: string;     // чем имя кончается в родительном падеже
};

export const CULTURES: CultureRegionTemplate[] = [
  { name: "шипящий", onset: ["ш", "щ", "ж", "ч", "с"], vowel: ["а", "и", "е"], coda: ["ш", "щ", "ч"], endings: ["ша", "щи", "жи"], roots: ["Шар", "Чиж", "Шуш"], genitive: "а" },
  { name: "твёрдый", onset: ["р", "г", "к", "т", "д"], vowel: ["о", "а", "у"], coda: ["р", "г", "к"], endings: ["гар", "рок", "дор"], roots: ["Гар", "Дор", "Кур"], genitive: "а" },
  { name: "плавный", onset: ["л", "м", "н", "в"], vowel: ["и", "е", "а"], coda: ["л", "н", "м"], endings: ["эль", "иль", "ан"], roots: ["Лан", "Мил", "Вел"], genitive: "я" },
  { name: "свистящий", onset: ["с", "з", "ц", "ч"], vowel: ["а", "ы", "у"], coda: ["с", "з", "ц"], endings: ["са", "зы", "ца"], roots: ["Сав", "Зыр", "Цал"], genitive: "ы" },
  { name: "гортанный", onset: ["х", "г", "к", "б"], vowel: ["а", "о", "э"], coda: ["х", "г", "б"], endings: ["ха", "го", "ба"], roots: ["Хаг", "Бор", "Гор"], genitive: "а" },
  { name: "мягкий", onset: ["л", "нь", "рь", "й"], vowel: ["я", "е", "и"], coda: ["ль", "нь", "рь"], endings: ["ль", "нь", "я"], roots: ["Ли", "Нье", "Рья"], genitive: "и" },
  { name: "северный", onset: ["т", "в", "с", "к"], vowel: ["о", "э", "и"], coda: ["ст", "рн", "льд"], endings: ["стад", "борг", "вик"], roots: ["Тор", "Вик", "Стар"], genitive: "а" },
  { name: "южный", onset: ["м", "н", "ар", "са"], vowel: ["а", "и", "о"], coda: ["р", "н", "м"], endings: ["мар", "нат", "ри"], roots: ["Ам", "Сан", "Нат"], genitive: "и" },
];

export const MAX_REGIONS = 7;        // больше краёв не нужно — сведём мелочь в соседей
export const MIN_REGION_SHARE = 0.02; // край меньше 2% суши приклеивается к соседу
export const NAME_MIN = 4;            // минимальная длина имени
export const NAME_MAX = 14;           // максимальная длина имени
export const NAME_TRIES = 50;         // попыток до систематического обхода
```

- [ ] **Step 4: Написать `src/names.ts`**

Алгоритм:
1. `buildRegions`: пометить «стенки» — вода, `river`, биомы `hill`/`mountain`. Заливкой (стек, 4-соседство) пометить всё остальное в края, нумеруя их по порядку. Затем: пока краёв больше `MAX_REGIONS`, сливать самый маленький край в сосед с самой длинной общей границей; края меньше `MIN_REGION_SHARE` доли суши сливать первыми, независимо от счёта. Край получает характер `CULTURES[k % CULTURES.length]`, где `k` — номер появления края, а `id` края — его индекс в массиве.
2. `createNamer(seed, cultures)`: `const rng = mulberry32(seed + 12000)`, внутри `used: Set<string>`. `settlement(region)`: собрать имя из `onset`+`vowel`(+`coda`) и окончания; 40% имён — двусоставные через дефис; собрать до 50 раз, пока не вышло уникальное; после 50 — систематический обход (перебирать корни и окончания по порядку, потом добавить лишний слог); регистр — первая буква заглавная, остальные строчные. Длина вне `NAME_MIN..NAME_MAX` — считать неудачей и пробовать снова.
3. `enterprise(kind, settlement, region)`: `${kind} ${settlement}${genitive}` — тип приходит словом («Мельница», «Рудник»), родительный падеж берётся из `culture.genitive`.
4. `state(region)`: корень + «ия» / «ство», тоже через `used`.

Записать результат в `World`: `regionOf` и `cultures` заполняются в `gen.ts` сразу после `placePoi`, `namer` кладётся в `World` полем `namer` (тип — возврат `createNamer`).

- [ ] **Step 5: Прогнать тест**

Run: `node tools/test.mjs`
Expected: PASS, строка `ok — края и имена...`

- [ ] **Step 6: Сборка, CHANGELOG, коммит**

Run: `npm run build`
Expected: success.
В `CHANGELOG.md` — раздел `## 0.1.6 — <дата>` с одной строкой про края и генератор имён.

```bash
git add src/names.ts src/world.ts src/config.ts src/gen.ts tools/test.mjs CHANGELOG.md
git commit -m "feat: края и генератор имён поселений"
```

---

### Task 2: Поселения как объекты

**Files:**
- Modify: `src/world.ts` (тип `Settlement`)
- Modify: `src/gen.ts` (имя, население, вода, владение точками)
- Modify: `src/config.ts` (пороги уровней, стартовое население, радиусы)
- Test: `tools/test.mjs`

**Interfaces:**
- Consumes: `createNamer`, `World.cultures`, `World.regionOf`.
- Produces:
  - `export type Settlement = { x: number; y: number; name: string; region: number; population: number; level: number; abandoned: boolean; water: boolean; stock: Float32Array; buildings: { houses: number; admin: number; industry: number; trade: number }; pois: number[] }`
  - `stock` — длина `RESOURCE_COUNT` (=10), индекс = значение из `RESOURCE`.
  - `export const LEVEL_POP = [20, 120, 600, 2500, 6000, 20000]` и `export const LEVEL_NAMES = ["хутор", "деревня", "село", "посад", "город", "столица"]` в `src/config.ts`
  - `export const START_POP_MIN = 20`, `START_POP_MAX = 60`, `WATER_REACH = 12`, `POI_OWN_RANGE = 40`, `RESOURCE_COUNT = 10`

- [ ] **Step 1: Падающий тест**

Вверху `tools/test.mjs` дописать в существующий импорт из `../src/config.ts`: `SETTLEMENT_COUNT`.

```js
const ws = generateWorld(42);
assert.ok(ws.settlements.length >= 12 && ws.settlements.length <= SETTLEMENT_COUNT, `поселений ${ws.settlements.length}`);
for (const s of ws.settlements) {
  assert.ok(s.name.length >= 4, "у поселения есть имя");
  assert.ok(s.population >= 20 && s.population <= 60, `стартовое население ${s.population}`);
  assert.equal(s.level, 0, "все начинают хуторами");
  assert.equal(s.abandoned, false);
  assert.equal(s.stock.length, 10, "склад по числу ресурсов");
  assert.ok(Array.isArray(s.pois));
}
const names = ws.settlements.map((s) => s.name);
assert.equal(new Set(names).size, names.length, "имена поселений не повторяются");
assert.ok(ws.settlements.every((s) => s.water), "каждое поселение у воды");
assert.ok(ws.settlements.some((s) => s.pois.length > 0), "у кого-то есть точки");
for (const p of ws.poi) {
  if (!p.known) continue;
  const owner = ws.settlements.findIndex((s) => s.pois.includes(ws.poi.indexOf(p)));
  assert.ok(owner >= 0, `у видимой точки есть хозяин (${p.kind})`);
}
console.log("ok — поселения: имена, население, вода, владение точками");
```

- [ ] **Step 2: Прогнать и увидеть падение**

Run: `node tools/test.mjs`
Expected: FAIL — `s.name` is undefined.

- [ ] **Step 3: Расширить тип и генерацию**

В `src/world.ts` — новый тип `Settlement` (см. Interfaces). В `gen.ts` после расстановки поселений:
1. Присвоить имена: `namer.settlement(regionOf[tile])`, если край `-1` — ближайший край, найденный поиском в радиусе 8 тайлов (поселение на стыке).
2. Население — `START_POP_MIN + int(rng, START_POP_MAX - START_POP_MIN + 1)`, `level = 0`, `abandoned = false`, склад — нули, строения — `houses = Math.ceil(pop / HOUSES_PER_POP)`, остальные 0.
3. `water` — есть ли вода (биом `water` или `river === 1`) в пределах `WATER_REACH` по суше (BFS по 4-соседству, не пересекая `hill`/`mountain`).
   **Правка расстановки:** в `gen.ts` при выборе тайла под поселение отбрасывать варианты без воды в `WATER_REACH` — так гарантия из спеки («поселение ставится только там, где вода в пределах `WATER_REACH`») держится, а тест `every(s => s.water)` не падает на лесных якорях. Если после фильтра вариантов не осталось, поселение не ставится (счётчик поселений может оказаться меньше `SETTLEMENT_COUNT` — это допустимо и фиксируется в CHANGELOG).
4. Владение точками: для каждой известной точки — ближайшее поселение в пределах `POI_OWN_RANGE`; `settlement.pois.push(index)`.
   **Уточнение к спеке:** рудники (`known: false`) тоже получают хозяина — они существуют в мире, просто неизвестны игроку. Владение не делает их видимыми.
5. Порядок вызовов rng: имена берут свой поток, поэтому остальные последовательности не сдвигаются; население берёт `rng` мира (это новые вызовы в конце генерации — допустимо).

- [ ] **Step 4: Прогнать тест**

Run: `node tools/test.mjs`
Expected: PASS, строка `ok — поселения...`

- [ ] **Step 5: Сборка, CHANGELOG, коммит**

Run: `npm run build`
```bash
git add src/world.ts src/gen.ts src/config.ts tools/test.mjs CHANGELOG.md
git commit -m "feat: поселения с именами, населением и владением точками"
```

---

### Task 3: Сутки, потребности, производство

**Files:**
- Create: `src/settlements.ts`
- Create: `src/sim.ts`
- Modify: `src/world.ts` (`Poi.reserveMax`)
- Modify: `src/gen.ts` (записать `reserveMax`)
- Modify: `src/config.ts` (потребности, ступени, коэффициенты)
- Test: `tools/test.mjs`

**Interfaces:**
- Consumes: `World` с поселениями и точками, `RESOURCE`, `POI`, `LEVEL_POP`.
- Produces:
  - `src/sim.ts`: `export type Speed = 0 | 1 | 2 | 4`; `export type Sim = { day: number; speed: Speed; acc: number }`; `export const DAY_SECONDS = 60`; `export function dayLength(speed: Speed): number` (возвращает `Infinity` при 0); `export function advance(sim: Sim, dtSec: number): Sim` — копит и увеличивает `day`, `Infinity` при паузе.
  - `src/settlements.ts`:
    - `export type Need = { label: string; resources: number[]; perCapita: number; water?: boolean }`
    - `export const NEED_TIERS: Need[][]` — четыре ступени (см. конфиг).
    - `export function levelOf(population: number): number`
    - `export const NEED_TIER_FROM_LEVEL = [0, 1, 2, 4]` — с какого уровня открывается ступень; роскошь открывается только у города
    - `export function availableTiers(level: number): number` — сколько ступеней открыто: столько, у скольких `fromLevel <= level`
    - `export function settlementCard(s: Settlement): { levelName: string; needs: { label: string; ok: boolean; have: number; need: number }[] }`
    - `export function stepDay(world: World): string[]` — один день: производство, потребление, рост/убыль, опустение; возвращает события словами для ленты.
  - Конфиг: `GROWTH_RATE = 0.02`, `BOOM_FACTOR = 1.8`, `DECLINE_RATE = 0.015`, `PRODUCE_PER_DAY = 8`, `REGEN_RATE = 0.01`, `ABANDON_POP = 20`, `HOUSES_PER_POP = 50`, `FEED_MAX = 60`

- [ ] **Step 1: Падающий тест**

```js
import { stepDay, levelOf, availableTiers, NEED_TIERS } from "../src/settlements.ts";
import { advance, DAY_SECONDS } from "../src/sim.ts";

assert.equal(levelOf(20), 0);
assert.equal(levelOf(120), 1);
assert.equal(levelOf(19999), 4);
assert.equal(levelOf(20000), 5);
assert.equal(availableTiers(0), 1);
assert.equal(availableTiers(3), 3);
assert.equal(availableTiers(4), 4, "роскошь открывается у города");
assert.equal(availableTiers(5), 4);
assert.equal(NEED_TIERS.length, 4);

// день прихода без еды: население падает, но не обнуляется
// (точки в этих сценариях отключаем: поселение с фермой голодом не убить)
const hungry = generateWorld(7);
for (const s of hungry.settlements) { s.stock.fill(0); s.water = true; s.pois = []; }
const before = hungry.settlements.map((s) => s.population);
stepDay(hungry);
const after = hungry.settlements.map((s) => s.population);
for (let i = 0; i < before.length; i++) assert.ok(after[i] < before[i], "голод уменьшает население");
for (let i = 0; i < before.length; i++) assert.ok(after[i] > before[i] * 0.9, "за день теряется меньше 10%");

// сытый хутор растёт
const fed = generateWorld(8);
for (const s of fed.settlements) { s.stock[4] = 10_000; s.water = true; } // зерно
const fedBefore = fed.settlements.map((s) => s.population);
stepDay(fed);
for (let i = 0; i < fedBefore.length; i++) assert.ok(fed.settlements[i].population > fedBefore[i], "с едой население растёт");

// без воды — тоже убыль, даже при полной еде
const dry = generateWorld(9);
for (const s of dry.settlements) { s.stock[4] = 10_000; s.water = false; s.pois = []; }
const dryBefore = dry.settlements.map((s) => s.population);
stepDay(dry);
for (let i = 0; i < dryBefore.length; i++) assert.ok(dry.settlements[i].population < dryBefore[i], "без воды население падает");

// голод идёт годами: за 30 дней теряется больше трети, за 60 — всё пустеет
const starved = generateWorld(10);
for (const s of starved.settlements) { s.stock.fill(0); s.water = false; s.pois = []; }
const startPop = starved.settlements.map((s) => s.population);
for (let d = 0; d < 30; d++) stepDay(starved);
for (let i = 0; i < startPop.length; i++) {
  if (!starved.settlements[i].abandoned) {
    assert.ok(starved.settlements[i].population < startPop[i] * 0.7, "за месяц без еды и воды теряется больше трети");
  }
}
for (let d = 0; d < 30; d++) stepDay(starved);
assert.ok(starved.settlements.every((s) => s.abandoned), "за два месяца без еды и воды всё пустеет");

// точки истощаются: берём каменоломню, у которой есть хозяин
const mine = generateWorld(11);
const owner = mine.settlements.find((s) => s.pois.some((i) => mine.poi[i].kind === 6));
assert.ok(owner, "у каменоломни есть хозяин");
const quarryIdx = owner.pois.find((i) => mine.poi[i].kind === 6);
const quarry = mine.poi[quarryIdx];
const beforeReserve = quarry.reserve;
mine.settlements.forEach((s) => { s.stock[6] = 10_000; s.water = true; if (s !== owner) s.pois = []; });
stepDay(mine);
assert.ok(quarry.reserve < beforeReserve, "каменоломня истощается");

// часы: ×1 — день за 60 с, ×4 — за 15, пауза не идёт
let sim = { day: 0, speed: 1, acc: 0 };
sim = advance(sim, DAY_SECONDS);
assert.equal(sim.day, 1, "×1: день за 60 с");
sim = { day: 0, speed: 4, acc: 0 };
sim = advance(sim, DAY_SECONDS / 4);
assert.equal(sim.day, 1, "×4: день за 15 с");
sim = { day: 0, speed: 0, acc: 0 };
sim = advance(sim, 10_000);
assert.equal(sim.day, 0, "пауза не идёт");
console.log("ok — сутки: уровни, голод, рост, истощение, часы");
```

- [ ] **Step 2: Прогнать и увидеть падение**

Run: `node tools/test.mjs`
Expected: FAIL — модуль `src/settlements.ts` не найден.

- [ ] **Step 3: Конфиг потребностей**

```ts
export const NEED_TIERS: { label: string; resources: number[]; perCapita: number; water?: boolean }[][] = [
  [ { label: "еда", resources: [RESOURCE.fish, RESOURCE.grain, RESOURCE.livestock], perCapita: 0.02 },
    { label: "вода", resources: [], perCapita: 0, water: true } ],
  [ { label: "древесина и камень", resources: [RESOURCE.wood, RESOURCE.stone], perCapita: 0.01 } ],
  [ { label: "инструмент", resources: [RESOURCE.copper, RESOURCE.iron], perCapita: 0.004 } ],
  [ { label: "роскошь", resources: [RESOURCE.salt, RESOURCE.silver], perCapita: 0.002 } ],
];
```

- [ ] **Step 4: Написать `src/sim.ts` и `src/settlements.ts`**

`advance`: если `speed === 0` — вернуть как есть; иначе `acc += dtSec * speed`, пока `acc >= DAY_SECONDS` — `day++`, `acc -= DAY_SECONDS`.

`stepDay(world)`, порядок на каждое поселение:
1. Производство: для каждого `poi` хозяина — `amount = PRODUCE_PER_DAY * yield`; `stock[resource] += amount`; `reserve = max(0, reserve - amount)`; для биоресурсов (`logging`, `hunting`, `fishing`, `farm`, `pasture`) `reserve = min(reserveMax, reserve + reserveMax * REGEN_RATE)`. Каменоломня и рудник не восстанавливаются.
   Для этого в `src/world.ts` в тип `Poi` добавляется `reserveMax: number`, и `gen.ts` пишет туда стартовый запас (`reserveMax` и `reserve` равны при рождении).
2. Потребности: `open = availableTiers(level)`; для каждой ступени от 0 до `open-1`: для каждой потребности — `need = population * perCapita`; вода — `s.water`; иначе искать ресурс из списка, где `stock[r] >= need`, списать `need` и запомнить «закрыто».
3. Голод: за каждую незакрытую потребность **нулевой** ступени — `population *= 1 - DECLINE_RATE`.
4. Рост: `satisfied = закрытых / всего открытых`; `population *= 1 + GROWTH_RATE * satisfied * (satisfied === 1 ? BOOM_FACTOR : 1)`.
5. `level = levelOf(population)`; `houses = ceil(population / HOUSES_PER_POP)`, `admin` — минимум 1 при населении ≥ 60 иначе 0, `industry = pois.length`, `trade = level >= 3 ? level - 2 : 0`.
6. Опустение: `population < ABANDON_POP` → `abandoned = true`, `population = 0`, событие.
7. События: смена уровня («Таргэль стал деревней»), опустение («Таргэль покинут»), голод первый день («в Таргэле не хватает еды»). Не чаще одного события на поселение в день.

Восстановление не поднимает запас выше стартового (`reserveMax`) — осознанное упрощение, отмечено комментарием `shortcut:`.

- [ ] **Step 5: Прогнать тест**

Run: `node tools/test.mjs`
Expected: PASS, строка `ok — сутки...`

- [ ] **Step 6: Сборка, CHANGELOG, коммит**

Run: `npm run build`
```bash
git add src/settlements.ts src/sim.ts src/config.ts tools/test.mjs CHANGELOG.md
git commit -m "feat: суточный тик, потребности, производство и рост"
```

---

### Task 4: Иконки поселений и карточка

**Files:**
- Modify: `src/render.ts` (`drawSettlements`, `settlementAt`)
- Create: `src/ui.ts`
- Modify: `src/main.ts` (клик: сначала поселение, потом точка)
- Modify: `index.html` (стили карточки)
- Test: `tools/test.mjs`

**Interfaces:**
- Consumes: `World.settlements` с новым типом, `settlementCard` из `src/settlements.ts`.
- Produces:
  - `export function drawSettlements(ctx, world, camera, vw, vh): void` — рисует после точек, тем же экранным масштабом.
  - `export function settlementAt(world, camera, vw, vh, sx, sy): Settlement | null` — в пределах `POI_HIT_PX + 4` пикселей, ближайшее.
  - `src/ui.ts`: `export function settlementCardHtml(world: World, s: Settlement): string` — чистая функция, без DOM.
  - `export function showSettlement(s: Settlement | null): void` — заполняет `#deals-body`, `null` возвращает капитал.

- [ ] **Step 1: Падающий тест**

```js
import { settlementCardHtml } from "../src/ui.ts";
const w = generateWorld(42);
const s = w.settlements[0];
const html = settlementCardHtml(w, s);
assert.ok(html.includes(s.name), "в карточке имя");
assert.ok(html.includes("хутор"), "в карточке ступень");
assert.ok(html.includes("население"), "в карточке население");
assert.ok(html.includes("еда"), "в карточке потребности");
console.log("ok — карточка поселения: имя, ступень, население, потребности");
```

- [ ] **Step 2: Прогнать и увидеть падение**

Run: `node tools/test.mjs`
Expected: FAIL — `src/ui.ts` не найден.

- [ ] **Step 3: Рендер поселений**

`drawSettlements`: для каждого не заброшенного поселения — домик (треугольная крыша + квадрат) цветом `SETTLEMENT_COLOR`, радиус как у иконок POI (та же формула от `cam.zoom`, пол 4 px), обводка `POI_GLYPH_STROKE`. Заброшенные — серый контур без заливки. Константы в конфиг: `SETTLEMENT_COLOR = "#ffd76e"`, `SETTLEMENT_ABANDONED = "#59618a"`.

- [ ] **Step 4: Карточка и клик**

`main.ts` в обработчике клика: `const s = settlementAt(...); if (s) { showSettlement(s); return; } const p = poiAt(...); showCard(p);`. `settlementCardHtml` собирает строки той же разметкой, что карточка точки: `<div class="row">` и `<b>`.

- [ ] **Step 5: Прогнать и проверить глазами**

Run: `node tools/test.mjs`, затем `npm run build`, поднять `dist` и сделать снимок `?seed=42&zoom=6`.
Expected: у поселений жёлтые домики, клик по домику открывает карточку с именем и потребностями.

- [ ] **Step 6: Коммит**

```bash
git add src/render.ts src/ui.ts src/main.ts index.html src/config.ts tools/test.mjs CHANGELOG.md
git commit -m "feat: иконки поселений и карточка с потребностями"
```

---

### Task 5: Стартовый выбор, часы и лента

**Files:**
- Modify: `index.html` (оверлей `#start`, часы `#clock`, кнопки скорости, стили ленты)
- Modify: `src/ui.ts` (`renderStart`, `renderClock`, `pushEvent`)
- Modify: `src/main.ts` (цикл: тик симуляции, стартовый оверлей)
- Test: `tools/test.mjs` (чистые части — только если появились), плюс проверка глазами

**Interfaces:**
- Consumes: `Sim`, `advance`, `stepDay`, `World.settlements`.
- Produces:
  - `src/ui.ts`: `export function startListHtml(world: World): string` — список поселений по убыванию населения: имя, ступень, население, до трёх ресурсов из владений.
  - `export function clockText(sim: Sim): string` — «день 3 · ×2».
  - `export function pushEvent(text: string): void` — кладёт в `#feed` сверху, держит не больше `FEED_MAX`.

- [ ] **Step 1: Разметка**

`#start` — центрированный оверлей на весь экран, поверх карты, со списком `.start-item` (кнопки), заголовком и подписью. `#hud` дополняется `<span id="clock">день 1 · ×1</span>` и группой кнопок `.hud-btn` («‖», «×1», «×2», «×4»), у активной `aria-pressed="true"`.

- [ ] **Step 2: Логика**

В `main.ts`: `let sim: Sim = { day: 1, speed: 1, acc: 0 }`; `requestAnimationFrame` копит `dt`, вызывает `advance`, а если `day` вырос — по разу `stepDay(world)` за каждый прошедший день и `pushEvent` на каждое событие; затем `draw`. Стартовый оверлей показывает список; клик по поселению — `cam = clampCamera({ x: s.x, y: s.y, zoom: 6 }, view.w, view.h)`, оверлей `hidden`. Скорость по умолчанию — ×1, пауза и ×2/×4 — кнопки.

- [ ] **Step 3: Проверить глазами (обязательно)**

Run: `npm run build`, поднять `dist`, открыть `?seed=42`.
Expected, по пунктам: (1) оверлей со списком имён — не пустой, имена читаются; (2) клик по имени центрирует карту и закрывает оверлей; (3) в HUD идут дни; (4) ×4 ускоряет вдвое-вчетверо, пауза останавливает; (5) в ленте появляются записи с днями. Снимок каждого состояния сохранить и посмотреть.

- [ ] **Step 4: Тест чистых функций**

```js
import { clockText, startListHtml } from "../src/ui.ts";
const w = generateWorld(42);
assert.ok(clockText({ day: 3, speed: 2, acc: 0 }).includes("день 3"));
assert.ok(clockText({ day: 3, speed: 2, acc: 0 }).includes("×2"));
const list = startListHtml(w);
assert.ok(list.includes(w.settlements[0].name));
assert.ok(list.split("start-item").length - 1 === w.settlements.length, "в списке все поселения");
console.log("ok — стартовый список и часы");
```

- [ ] **Step 5: Сборка, CHANGELOG, коммит и пуш**

Run: `npm run build`, `node tools/test.mjs`.
```bash
git add index.html src/ui.ts src/main.ts tools/test.mjs CHANGELOG.md
git commit -m "feat: стартовый выбор поселения, часы и живая лента"
git push origin main
```

---

## Проверка после всех задач

- [ ] `node tools/test.mjs` — все группы зелёные, без предупреждений.
- [ ] `npm run build` — без ошибок.
- [ ] Глазами: `?seed=42` — оверлей, выбор поселения, часы, ×4, карточка поселения, лента с событиями; `?seed=8` и `?seed=1000` — имена не повторяются, края звучат по-разному.
- [ ] `CHANGELOG.md` — по строке на изменение, `package.json` версия = разделу.
