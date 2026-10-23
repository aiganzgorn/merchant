// The world as flat typed arrays — one value per tile, index = y * w + x.
export type World = {
  seed: number;
  w: number;
  h: number;
  elev: Float32Array;      // 0..1, ocean to peak
  filled: Float32Array;    // elevation with depressions filled — what water actually drains along
  moist: Float32Array;     // 0..1
  biome: Uint8Array;       // BIOME value
  water: Uint8Array;       // 1 = ocean or lake
  river: Uint8Array;       // 1 = river bed
  flow: Int32Array;        // index of the next tile downstream, -1 = ends here
  streamSize: Int32Array;  // catchment behind each river tile — makes big rivers wide
  rivers: number;          // how many rivers were laid
  riverLength: number;     // summed length of the rivers in tiles
  riverChains: number[][]; // each river as an ordered list of tiles, source → mouth
  lakes: number;           // standing-water tiles beyond the ocean
  waterLevel: number;      // elevation below which a tile is sea
  poi: Poi[];              // points of interest: resources and hidden ore
  settlements: Settlement[]; // first towns placed near water or forest
  roads: Road[];           // paths between towns, with their journey in days
  regionOf: Int16Array;    // region id per tile, -1 for walls and water
  cultures: CultureRegion[]; // regions with their naming character
  namer: Namer;            // deterministic settlement / enterprise / state namer
};

export type Road = { a: number; b: number; tiles: number[]; days: number };

export type CultureRegion = {
  id: number;
  name: string;
  tiles: number;
  endings: string[];
  onset: string[];
  vowel: string[];
  coda: string[];
  roots: string[];
  genitive: string;
};

export type Namer = {
  settlement(region: number): string;
  enterprise(kind: string, settlement: string, region: number): string;
  state(region: number): string;
};

export const BIOME = {
  water: 0,
  sand: 1,
  steppe: 2,
  field: 3,
  forest: 4,
  hill: 5,
  mountain: 6,
} as const;

export type Biome = (typeof BIOME)[keyof typeof BIOME];

// Things the player can discover and exploit.
export const POI = {
  logging: 0,
  hunting: 1,
  fishing: 2,
  salt: 3,
  farm: 4,
  pasture: 5,
  quarry: 6,
  mine: 7,
} as const;

export const RESOURCE = {
  wood: 0,
  fur: 1,
  fish: 2,
  salt: 3,
  grain: 4,
  livestock: 5,
  stone: 6,
  copper: 7,
  iron: 8,
  silver: 9,
} as const;

export type Poi = {
  kind: number;
  resource: number;
  x: number;
  y: number;
  yield: number;
  reserve: number;
  reserveMax: number;
  known: boolean;
};

export type Settlement = {
  x: number;
  y: number;
  name: string;
  region: number;
  population: number;
  level: number;
  abandoned: boolean;
  water: boolean;
  stock: Float32Array;
  buildings: { houses: number; admin: number; industry: number; trade: number };
  pois: number[];
};

export const idx = (w: World, x: number, y: number): number => y * w.w + x;
