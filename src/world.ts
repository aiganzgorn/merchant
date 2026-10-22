// The world as flat typed arrays — one value per tile, index = y * w + x.
export type World = {
  seed: number;
  w: number;
  h: number;
  elev: Float32Array;      // 0..1, ocean to peak
  moist: Float32Array;     // 0..1
  biome: Uint8Array;       // BIOME value
  water: Uint8Array;       // 1 = ocean or lake
  river: Uint8Array;       // 1 = river bed
  flow: Int32Array;        // index of the next tile downstream, -1 = ends here
  rivers: number;          // how many rivers were laid
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

export const idx = (w: World, x: number, y: number): number => y * w.w + x;
