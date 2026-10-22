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
export const BIOME_COLORS: Record<number, string> = {
  0: "#12324f", 1: "#c2ab6b", 2: "#4a5636", 3: "#77864a",
  4: "#2b5233", 5: "#54504a", 6: "#6d6a63",
};
