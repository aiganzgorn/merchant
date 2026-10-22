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
export const EDGE_FALLOFF = 0.18;   // share of the map that sinks to ocean
export const WATER_LEVEL = 0.42;    // elevation below this is water
export const SAND_LEVEL = 0.03;     // band above water that is beach
export const HILL_LEVEL = 0.68;
export const MOUNTAIN_LEVEL = 0.78;
export const FIELD_MOIST = 0.62;
export const FOREST_MOIST = 0.48;

// rivers
export const RIVER_COUNT = 24;        // how many rivers to try
export const RIVER_SOURCE_MIN = 0.6;  // a river starts no lower than this elevation
export const RIVER_MAX_LEN = 400;     // tiles before we give up on one river
export const LAKE_RADIUS = 1;         // a one-tile lake is ugly: stamp (2r+1)²
export const RIVER_MIN_LEN = 10;      // shorter than this is not worth counting

// camera
export const ZOOM_MIN = 3;       // px per tile, farthest
export const ZOOM_MAX = 48;      // px per tile, closest
export const ZOOM_START = 20;
export const PRERENDER_TILE = 8; // px per tile in the prerendered chunks
export const CHUNK = 32;         // tiles per chunk side


export const BIOME_COLORS: Record<number, string> = {
  0: "#12324f", 1: "#c2ab6b", 2: "#4a5636", 3: "#77864a",
  4: "#2b5233", 5: "#54504a", 6: "#6d6a63",
};
