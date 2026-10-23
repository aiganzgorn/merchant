// Every tunable number of the project lives here — change them in one place.

// map
export const MAP_W = 512;        // tiles across
export const MAP_H = 512;        // tiles down

// layout (C: map above, strip below)
export const STRIP_H = 220;      // bottom strip height, px
export const MAP_MIN_H = 120;    // the map never shrinks below this, px

// terrain
export const ELEV_SCALE = 96;       // tiles across the first noise octave
export const MOIST_SCALE = 64;
export const OCTAVES = 5;
export const EDGE_FALLOFF = 0.1;    // share of the map that sinks to ocean
export const COAST_SCALE = 80;      // tiles across the noise that bends the shoreline
export const COAST_WARP = 130;      // tiles the coastline wanders — bays and headlands
export const LAND_SHARE = 0.78;     // how much of the map is dry land — ocean hugs the rim
export const SAND_LEVEL = 0.03;     // band above water that is beach
export const HILL_LEVEL = 0.42;     // foothills start here
export const MOUNTAIN_LEVEL = 0.66; // rocky crest
export const FIELD_MOIST = 0.62;
export const FOREST_MOIST = 0.48;

// tectonic seams — mountains run along them
export const PLATE_GRID = 4;        // 4×4 plate seeds
export const PLATE_JITTER = 0.7;    // how far a plate seed wanders from its grid cell
export const PLATE_WARP = 140;      // tiles a seam is bent by noise
export const PLATE_SEAM = 9;        // half-width of the uplift band, tiles
export const PLATE_PEAKS = 18;      // scale of the noise that breaks a ridge into peaks
export const PLATE_SCALE = 140;     // scale of the seam-warping noise
export const RIDGE_HEIGHT = 0.72;    // how much of the elevation comes from uplift
export const PLATE_PASS = 0.42;     // crest noise below this opens a pass through the range
export const PLATE_PASS_WIDTH = 0.12; // how quickly the range falls away into a pass

// rivers
export const RIVER_COUNT = 24;        // how many rivers to try
export const RIVER_MIN_CATCHMENT = 60; // land tiles a river must drain to be drawn
export const RIVER_MEANDER = 0.06;    // height wobble that makes a river wind instead of ruling
                              // a straight diagonal across a smooth slope
export const RIVER_MEANDER_SCALE = 12; // tiles across that wobble
export const LAKE_SHARE = 0.012;     // share of the map that pools into the deepest basins
export const LAKE_MAX_RISE = 0.35;   // lakes sit below this height above the sea, not on ridges
export const LAKE_MIN_AREA = 16;     // smaller pools are wetlands, not lakes
export const RIVER_MIN_LEN = 10;      // shorter than this is not worth counting

// points of interest and settlements
import { BIOME, POI, RESOURCE } from "./world.ts";

export type CultureRegionTemplate = {
  name: string;         // debug label, e.g. "шипящий", "твёрдый"
  onset: string[]; vowel: string[]; coda: string[];
  endings: string[];    // ≥80% of this culture's settlement names end with one of these
  roots: string[];
  genitive: string;     // suffix used in the genitive case for enterprise names
};

export const CULTURES: CultureRegionTemplate[] = [
  {
    name: "шипящий",
    onset: ["ш", "щ", "ч", "ж"], vowel: ["а", "и", "е", "о"],
    coda: [], endings: ["ша", "щи", "чье", "жи", "шак", "щер"],
    roots: ["Шар", "Чиж", "Шуш", "Щел"], genitive: "а",
  },
  {
    name: "твёрдый",
    onset: ["г", "д", "к", "т", "р", "б", "м"], vowel: ["о", "а", "у", "ы"],
    coda: ["р", "д", "г", "к", "т", "н"], endings: ["дор", "гар", "рок", "тук", "дак", "рум"],
    roots: ["Гар", "Дор", "Кур", "Тук"], genitive: "а",
  },
  {
    name: "плавный",
    onset: ["л", "м", "н", "в", "р"], vowel: ["и", "е", "а", "о"],
    coda: ["л", "н", "м", "в", "р"], endings: ["эль", "иль", "оль", "уар", "анд", "орм"],
    roots: ["Лан", "Мил", "Вел", "Нол"], genitive: "я",
  },
  {
    name: "мягкий",
    onset: ["л", "нь", "рь", "мь", "вь"], vowel: ["я", "е", "и", "ю"],
    coda: ["ль", "нь", "рь"], endings: ["мя", "нье", "рье", "юнь", "ань", "ель"],
    roots: ["Ли", "Нье", "Рья", "Мю"], genitive: "и",
  },
  {
    name: "северный",
    onset: ["т", "в", "с", "к", "х", "ф"], vowel: ["о", "э", "и", "а"],
    coda: ["ст", "г", "в", "н", "р"], endings: ["стад", "борг", "вик", "фьорд", "даль", "хольм"],
    roots: ["Тор", "Вик", "Стар", "Фьор"], genitive: "а",
  },
  {
    name: "оседлый",
    onset: ["б", "в", "г", "д", "з", "л", "р", "с"], vowel: ["а", "о", "е", "и", "у"],
    coda: ["р", "н", "л", "в", "д", "к"], endings: ["ово", "ино", "ка", "ец", "ица", "ы"],
    roots: ["Бор", "Вел", "Гор", "Дуб"], genitive: "а",
  },
  {
    name: "степной",
    onset: ["б", "к", "п", "т", "с", "ч"], vowel: ["а", "о", "у", "ы"],
    coda: ["р", "н", "к", "т", "л"], endings: ["ск", "град", "ичи", "ецк", "тай", "бад"],
    roots: ["Бел", "Кам", "Пол", "Тих"], genitive: "а",
  },
];

export const MAX_REGIONS = 7;        // upper bound on the number of regions after merging
export const MIN_REGION_SHARE = 0.02; // small regions get merged first while more than 3 regions remain
export const NAME_MIN = 4;            // minimum settlement/state name length
export const NAME_MAX = 14;           // maximum settlement/state name length
export const NAME_TRIES = 50;         // random attempts before switching to the systematic fallback

export const POI_COUNTS: Record<number, number> = {
  0: 6, // logging
  1: 6, // hunting
  2: 10, // fishing
  3: 4, // salt
  4: 10, // farm
  5: 10, // pasture
  6: 6, // quarry
  7: 6, // mine
};
export const POI_MIN_GAP = 10;    // tiles between POIs of the same kind
export const POI_ZONE = 22;       // radius drawn around a POI and used by its card, tiles
export const SETTLEMENT_COUNT = 24; // first towns to seed the map
export const SETTLEMENT_MIN_GAP = 14; // Chebyshev tiles a town must stand from every other town
export const START_POP_MIN = 20;
export const START_POP_MAX = 60;
export const WATER_REACH = 12; // tiles a settlement looks for fresh water over land
export const POI_OWN_RANGE = 90; // tiles within which a POI is owned by the nearest settlement
export const RESOURCE_COUNT = 10;
export const LEVEL_POP = [20, 120, 600, 2500, 6000, 20000];
export const LEVEL_NAMES = ["хутор", "деревня", "село", "посад", "город", "столица"];
export const LEVEL_NAMES_INSTRUMENTAL = ["хутором", "деревней", "селом", "посадом", "городом", "столицей"];
export const NEED_TIER_FROM_LEVEL = [0, 1, 2, 4];
export const HOUSES_PER_POP = 50; // people per house, rounded up

// daily economy
export const GROWTH_RATE = 0.02;
export const BOOM_FACTOR = 1.8;
export const DECLINE_RATE = 0.015;
export const PRODUCE_PER_DAY = 8;
export const REGEN_RATE = 0.01;
export const ABANDON_POP = 20;

// settlements on the map
export const SETTLEMENT_LABEL_COLOR = "#ffe9a8"; // settlement name ink, lighter than the roof
export const SETTLEMENT_COLOR = "#ffd76e";     // a living town
export const SETTLEMENT_ABANDONED = "#59618a"; // an abandoned one — outline only
export const SETTLEMENT_ICON_MAX = 14;         // px radius cap when zoomed in
export const LABEL_FONT_PX = 12;                // settlement name size, px
export const LABEL_SUB_FONT_PX = 10;            // population line under the name, px
export const LABEL_LINE_GAP = 1;                // gap between the two label lines, px
export const LABEL_SUB_COLOR = "#d8cba4";       // population line ink, dimmer than the name
export const LABEL_OFFSET = 13;                 // px between a house and its name
export const LABEL_ZOOM_MIN = 4;                // below this zoom names would be a wall of text

// city layout (tiles)
export const CITY_CELL = 0.5;          // block pitch of a town plan, tiles
export const CITY_HOUSE = 0.32;        // house footprint inside a block, tiles
export const CITY_MAIN_STREET = 0.35;  // how far the main street reaches outside the blocks
export const CITY_ZOOM = 10;           // px per tile from which a town is drawn as blocks, not an icon
export const CITY_HOUSE_COLOR = "#101014";
export const CITY_STREET_COLOR = "#6f5236";

// roads between towns
export const ROAD_TILES_PER_DAY = 12;  // terrain-costed tiles a caravan covers per day
export const ROAD_SEARCH_MARGIN = 40;  // tiles of search box around two towns
export const ROAD_RIVER_COST = 5;      // fording a river
export const ROAD_BIOME_COST = [Infinity, 1.8, 1, 1, 1.5, 3.5, 8]; // water, sand, steppe, field, forest, hill, mountain
export const ROAD_REUSE_COST = 0.45;  // a tile another road already crosses is this much cheaper: roads merge instead of running side by side
export const ROAD_COLOR = "#8a6a44";
export const ROAD_THIN_ZOOM = 12;      // px per tile above which a road is drawn wider

// world time
export const MAX_FRAME_SECONDS = 0.25; // a frame longer than this (tab was hidden) does not fast-forward the world
export const ZOOM_PICK = 6;           // zoom when the player picks a town from the start list

// strip
export const FEED_MAX = 40;           // most event rows kept in the feed

export const NEED_TIERS: { label: string; resources: number[]; perCapita: number; water?: boolean }[][] = [
  [ { label: "еда", resources: [RESOURCE.fish, RESOURCE.grain, RESOURCE.livestock], perCapita: 0.02 },
    { label: "вода", resources: [], perCapita: 0, water: true } ],
  [ { label: "древесина и камень", resources: [RESOURCE.wood, RESOURCE.stone], perCapita: 0.01 } ],
  [ { label: "инструмент", resources: [RESOURCE.copper, RESOURCE.iron], perCapita: 0.004 } ],
  [ { label: "роскошь", resources: [RESOURCE.salt, RESOURCE.silver], perCapita: 0.002 } ],
];

export const POI_BIOMES: Record<number, number[]> = {
  [0]: [BIOME.forest],          // logging
  [1]: [BIOME.forest],          // hunting
  [2]: [BIOME.water],           // fishing
  [3]: [BIOME.water, BIOME.sand], // salt
  [4]: [BIOME.field],           // farm
  [5]: [BIOME.steppe],          // pasture
  [6]: [BIOME.hill, BIOME.mountain], // quarry
  [7]: [BIOME.mountain],        // mine
};

export const POI_ICON_PX = 9;      // base badge radius; scales with zoom up to POI_ICON_MAX
export const POI_ICON_MAX = 13;    // badge radius cap when zoomed in
export const POI_HIT_PX = 12;      // screen-pixel radius for mouse selection
export const POI_ZONE_ALPHA = 0.14; // placement-zone fill transparency
export const POI_COLORS: Record<number, string> = {
  [0]: "#5d8a4e", // logging — forest green
  [1]: "#8b5a3a", // hunting — hide brown
  [2]: "#4b8bb8", // fishing — water blue
  [3]: "#c4b9c2", // salt — pale crystal
  [4]: "#d4a843", // farm — ripe grain
  [5]: "#a68958", // pasture — dry grass
  [6]: "#7a7a7a", // quarry — stone grey
  [7]: "#a05050", // mine — rusted ore
};
export const POI_FALLBACK_COLOR = "#999999"; // for POI kinds without an explicit colour
export const POI_GLYPH_STROKE = "#0d0f16";   // badge outline and glyph ink

export const POI_NAMES: Record<number, string> = {
  [POI.logging]: "лесосека",
  [POI.hunting]: "охотничьи угодья",
  [POI.fishing]: "рыбалка",
  [POI.salt]: "соляные промыслы",
  [POI.farm]: "пашня",
  [POI.pasture]: "пастбище",
  [POI.quarry]: "каменоломня",
  [POI.mine]: "рудник",
};

export const RESOURCE_NAMES: Record<number, string> = {
  [RESOURCE.wood]: "древесина",
  [RESOURCE.fur]: "мех",
  [RESOURCE.fish]: "рыба",
  [RESOURCE.salt]: "соль",
  [RESOURCE.grain]: "зерно",
  [RESOURCE.livestock]: "скот",
  [RESOURCE.stone]: "камень",
  [RESOURCE.copper]: "медь",
  [RESOURCE.iron]: "железо",
  [RESOURCE.silver]: "серебро",
};

// camera
export const ZOOM_MIN = 1.2;       // px per tile, farthest — the whole 512 map fits
export const ZOOM_MAX = 48;      // px per tile, closest
export const ZOOM_START = 20;
export const RIVER_WAVE = 6;      // tiles per sideways wave of a drawn river
export const RIVER_WAVE_AMP = 0.4; // tiles the wave swings — a river winds instead of ruling a line
export const PRERENDER_TILE = 8; // px per tile in the prerendered chunks
export const CHUNK = 32;         // tiles per chunk side


export const BIOME_COLORS: Record<number, string> = {
  0: "#12324f", 1: "#c2ab6b", 2: "#4a5636", 3: "#77864a",
  4: "#2b5233", 5: "#54504a", 6: "#6d6a63",
};
