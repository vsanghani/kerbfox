/** Test double. Visual runs alias src/config/map.ts to this file so MapCanvas never requests tiles. */
export const MAP_STYLE = {
  light: "/visual/blank-style-light.json",
  dark: "/visual/blank-style-dark.json",
} as const;

export const EXPLORE_LAYERS = [] as const;

export const EXPLORE_LAYER_IDS = new Set<string>();
