/**
 * CONFIG — the single home for app-level configuration constants.
 *
 * Admission rule for where a value lives:
 *  - site-anchored, generated geodata (window bounds, origin, camera
 *    presets, structure footprints, tree register, heightmap) → site.json,
 *    written by tools/prepare_site.py — never hand-edit, it is regenerated
 *  - an app tunable someone might want to adjust (density, colours,
 *    durations, site-anchored hand-tuned paths like the bird flight) → here
 *  - an algorithm-internal number inside one helper (mesh construction
 *    micro-dimensions, curve maths) → local constant with a comment
 *
 * Sections mirror the consuming module. Values are transcribed verbatim
 * from the modules they came from; behaviour must not change when they move.
 */
/** One sky condition preset (values see CONFIG.SKY.CONDITIONS) */
export type SkyCondition = {
  LABEL: string;
  DOME_TOP: number;
  DOME_HORIZON: number;
  CLOUD_COUNT: number;
  CLOUD_TINT: number;
  CLOUD_OPACITY_MIN: number;
  CLOUD_OPACITY_JITTER: number;
  FOG: number;
  SUN_FACTOR: number;
  HEMI_FACTOR: number;
  AMBIENT_FACTOR: number;
};

export const CONFIG = {
  /** debug/testing hooks */
  DEBUG: {
    /** stamped on window.__buildId by main.ts; bump when the module graph changes */
    BUILD_ID: 'v3magenta-20261106',
  },

  /** midday sun + shadow (main.ts) */
  SUN: {
    /** site latitude (orchard centre) for the solar declination */
    LATITUDE_DEG: 48.9899,
    /** solar declination: 23.44° obliquity, phase 284 d, 365 d year */
    DECL_OBLIQUITY_DEG: 23.44,
    DECL_PHASE_DAYS: 284,
    YEAR_DAYS: 365,
    /** sun pivot = orchard centre; y ≈ site ground level (see SKY.GROUND_Y) */
    ANCHOR: [10, 117, 0] as [number, number, number],
    /** sun placed this far from the anchor along the season elevation */
    ORBIT_R: 400,
    /** intensity = BASE + AMP · sin(altitude) */
    INTENSITY_BASE: 0.3,
    INTENSITY_AMP: 0.5,
    COLOR: 0xffffff,
    /** the DirectionalLight's own (pre-season) intensity */
    BASE_INTENSITY: 0.7,
    SHADOW: {
      MAP_SIZE: 2048,
      /** ortho frustum half-extent around the anchor */
      EXTENT: 90,
      NEAR: 50,
      FAR: 600,
      BIAS: -0.0005,
    },
  },

  /** scene background / fog / global lights (main.ts) */
  SCENE: {
    FOG_NEAR: 400,
    FOG_FAR: 1600,
    HEMI: { SKY: 0xe8eef2, GROUND: 0x62604e, INTENSITY: 1.0 },
    AMBIENT: { COLOR: 0xffffff, INTENSITY: 0.25 },
  },

  /** camera rig + the preset button labels (camera.ts) */
  CAMERA: {
    FOV: 55,
    NEAR: 0.5,
    FAR: 4000,
    DAMPING: 0.08,
    /** maxPolarAngle = PI/2 - this (keep the camera above ground) */
    POLAR_MARGIN: 0.02,
    /** UI labels for the site.json cameraPresets (German site language) */
    PRESET_LABELS: {
      southEnd: 'Südende',
      erhoeht: 'Erhöht',
      nordwest: 'Nordwest',
      vergleich: 'Fotostandpunkt',
    },
  },

  /** "Vogelflug" bird glide (flight.ts). Waypoints are local metres
   *  (x east, y up, z south); y is filled from the DGM at start() as
   *  terrain(x, z) + clearance — the start sits ~1.5 m above the crown of
   *  the NE ridge tree (bk01345, 11 m tall on the ~121 m ridge). */
  FLIGHT: {
    WAYPOINTS: [
      [66, 12.5, -45], // the elevated NE tree's crown (bk01345)
      [50, 13.5, -38], // off the ridge, skimming the crown tops
      [30, 14, -22], // NE meadow corner (clears bk02868)
      [17, 14, -1], // over the Hocksitzcafe towers (clears bk02839)
      [3, 14.5, 18], // mid-meadow pass (clears bk01274)
      [6, 13.5, 40], // south meadow, ends above open grass
    ] as [number, number, number][],
    /** ~4 m/s glide */
    DURATION_S: 36,
    BOB_AMP_M: 0.35, // wing-beat vertical float
    BOB_HZ: 0.9,
    SWAY_AMP_M: 0.5, // slow lateral drift
    SWAY_HZ: 0.11,
    /** gaze anchored this far ahead along the path tangent */
    LOOK_AHEAD_M: 12,
    /** slight downward gaze, keeps the horizon in frame */
    LOOK_DIP_M: 2.5,
    /** gaze inertia: heading lags the tangent like a banking bird */
    YAW_TAU_S: 2.0,
  },

  /** procedural sky dome + cloud billboards (sky.ts) */
  SKY: {
    /** cloud drift wrap bounds, local metres from origin */
    CLOUD_SPAN: 1000,
    /** approximate site ground level (terrain 111–123 m). NOTE: SUN.ANCHOR
     *  y implies 117 — known wart, collected here but deliberately not
     *  unified by the config extraction (no behaviour change). */
    GROUND_Y: 115,
    DOME_RADIUS: 1500,
    /** cloud sprite band above ground: GROUND_Y + BASE + rand·JITTER */
    CLOUD_ALT_BASE: 80,
    CLOUD_ALT_JITTER: 40,
    /** number of shared cloud textures */
    TEXTURES: 3,
    /** condition active on load (key of CONDITIONS) */
    DEFAULT_CONDITION: 'leichtBedeckt',
    /**
     * Sky condition presets — the single home for every sky/weather look
     * value. Dome colours + cloud count/tint/opacity + fog/background +
     * light factors (multipliers on the seasonal light bases) switch
     * together. leichtBedeckt MUST hold the pre-preset look exactly
     * (12 clouds, opacity 0.55+0.30, white tint, dome 0xbfcdd8/0xe8ecef,
     * fog 0xb9c6d0, all light factors 1.0) — the default load is
     * pixel-verified against that baseline.
     */
    CONDITIONS: {
      klar: {
        LABEL: 'Klar',
        DOME_TOP: 0x3d7fd6, DOME_HORIZON: 0xcfe8ff,
        CLOUD_COUNT: 2, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.25, CLOUD_OPACITY_JITTER: 0.2,
        FOG: 0xcfe8ff,
        SUN_FACTOR: 1.2, HEMI_FACTOR: 0.9, AMBIENT_FACTOR: 1.0,
      },
      heiter: {
        LABEL: 'Heiter',
        DOME_TOP: 0x6f9fd8, DOME_HORIZON: 0xdce9f5,
        CLOUD_COUNT: 6, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.45, CLOUD_OPACITY_JITTER: 0.25,
        FOG: 0xdce9f5,
        SUN_FACTOR: 1.1, HEMI_FACTOR: 0.95, AMBIENT_FACTOR: 1.0,
      },
      leichtBedeckt: {
        LABEL: 'Leicht bedeckt',
        DOME_TOP: 0xbfcdd8, DOME_HORIZON: 0xe8ecef,
        CLOUD_COUNT: 12, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.55, CLOUD_OPACITY_JITTER: 0.3,
        FOG: 0xb9c6d0,
        SUN_FACTOR: 1.0, HEMI_FACTOR: 1.0, AMBIENT_FACTOR: 1.0,
      },
      gewitter: {
        LABEL: 'Gewitter',
        DOME_TOP: 0x414b55, DOME_HORIZON: 0x828c96,
        CLOUD_COUNT: 18, CLOUD_TINT: 0x5f6873,
        CLOUD_OPACITY_MIN: 0.75, CLOUD_OPACITY_JITTER: 0.2,
        FOG: 0x828c96,
        SUN_FACTOR: 0.35, HEMI_FACTOR: 0.55, AMBIENT_FACTOR: 0.9,
      },
    } as const satisfies Record<string, SkyCondition>,
  },

  /** instanced grass blades (grass.ts) */
  GRASS: {
    COUNT: 90000,
    BLADE_W: 0.085,
    /** blade height = MIN + rand·RANGE */
    BLADE_H_MIN: 0.22,
    BLADE_H_RANGE: 0.55,
    /** off-white the blades fade toward under patchy snow */
    SNOW_TINT: 0xdfe4e8,
    /** per-season grass blade tint */
    SEASON_TINT: {
      winter: 0x8a8a72,
      spring: 0x86a84a,
      summer: 0x6f9440,
      earlyAutumn: 0xa89a4a,
      midAutumn: 0xa89a4a,
      autumn: 0xa89a4a,
      lateAutumn: 0x8a8a72,
      dormant: 0x8a8a72,
    },
  },

  /** dense thicket west of the orchard (thicket.ts): instanced canopy
   *  blobs rejection-sampled from dark vegetation in the aerial orthophoto
   *  inside this band — static shapes, season tint only */
  THICKET: {
    /** surrounding polygon of the bush strip in local metres (x east,
     *  z south) — traced from the red "Bushes" outline in
     *  newimages/wiese-gebuesch.png (DOP tile 4555426). Edit these
     *  vertices to grow/shrink/move the strip; blobs are scattered
     *  inside with a seeded rng. */
    POLYGON: [
      [7, -64], [-8, -62], [-30, 4], [-27, 11],
      [-9, 17], [1, 16], [10, -14], [15, -54],
    ],
    COUNT: 700,
    RADIUS_MIN: 1.6,
    RADIUS_MAX: 3.4,
    /** blob y squash (bushes are wider than tall) */
    SQUASH: 0.65,
    /** keep this far from the individually rendered orchard trees */
    TREE_CLEARANCE: 5,
    SEED: 4711,
    /** multipliers over the aerial canopy texture — the texture already
     *  carries the foliage colour, so these are bright casts (summer ~white
     *  with a green bias, autumn warm, winter grey desaturating) */
    SEASON_TINT: {
      winter: 0x8a8a7c,
      spring: 0xc8dcb0,
      summer: 0xdce8cc,
      earlyAutumn: 0xd0d8a8,
      midAutumn: 0xd0c890,
      autumn: 0xd0b888,
      lateAutumn: 0xc8b090,
      dormant: 0x8a8a7c,
    },
  },

  /** season table (seasons.ts): day-of-year anchor, leaf density, canopy
   *  tint. Leaf-fall calendar: canopies stay full until Oct 1, then thin
   *  continuously through October/November (baked variants at ~2-week
   *  steps) and are bare from Dec 1 (wrap to winter). */
  SEASONS: [
    { key: 'winter', day: 15, leafFactor: 0, tint: 0x9ac95e },
    { key: 'spring', day: 110, leafFactor: 0.55, tint: 0x9ac95e },
    { key: 'summer', day: 190, leafFactor: 1, tint: 0x5f8f3e },
    { key: 'earlyAutumn', day: 274, leafFactor: 1, tint: 0x5f8f3e },
    { key: 'midAutumn', day: 290, leafFactor: 0.7, tint: 0xb08a3e },
    { key: 'autumn', day: 305, leafFactor: 0.45, tint: 0xc77f3a },
    { key: 'lateAutumn', day: 320, leafFactor: 0.2, tint: 0xc77f3a },
    { key: 'dormant', day: 335, leafFactor: 0, tint: 0x9ac95e },
  ],

  /** Hocksitzcafe structures: shared materials + dimensions (structures.ts).
   *  Per-builder deck/rail ratios stay local to their builder functions —
   *  they are that structure's geometry detail. */
  STRUCTURES: {
    WOOD: 0x4a3728,
    CREAM: 0xd8cfae,
    SNOW: 0xe8edf2,
    TARP: 0x3f6f96,
    FABRIC: 0x6a4a9c,
    /** post cross-sections (thin poles / heavy corner posts) */
    POST_R: 0.07,
    POST_R_HEAVY: 0.08,
    /** rails and slats ride this far above the deck */
    RAIL_ABOVE_DECK: 0.6,
    SLAT_ABOVE_DECK: 0.3,
  },

  /** fallback for OSM trees without a calibrated height, in metres (trees.ts) */
  TREES: {
    SIZE_SCALE: { small: 4.5, medium: 6.0, large: 7.5 },
    /** when even the size class is missing */
    DEFAULT_HEIGHT: 6.0,
  },

  /** building roofs take the DOP pixels as-is (buildings.ts) */
  BUILDINGS: {
    ROOF_TINT: 0xffffff,
  },

  /** walking cat (cat.ts): seeded patrol loop between the tree rows */
  CAT: {
    /** hidden by default; "Katze" checkbox in the season panel */
    ENABLED: false,
    /** calm walk speed, m/s */
    SPEED: 0.8,
    /** real-size cat: normalized body length in metres (× SCALE) */
    BODY_LENGTH: 0.5,
    SCALE: 1,
    /** patrol path seed (hash → mulberry32) */
    SEED: 'katzenwedel',
    /** min clearance to any orchard tree, m */
    CLEARANCE: 3,
    /** chase cam: distance behind (along -heading) and above, m */
    FOLLOW: { BACK: 4, UP: 2.2 },
  },

  /** German site-language label tables (main.ts, compare.ts) */
  UI: {
    MONTHS: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    /** non-leap year lengths for the day-of-year → date mapping */
    MONTH_LENGTHS: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
    SEASON_LABELS: {
      winter: 'Winter',
      spring: 'Frühling',
      summer: 'Sommer',
      earlyAutumn: 'Frühherbst',
      midAutumn: 'Mittherbst',
      autumn: 'Herbst',
      lateAutumn: 'Spätherbst',
      dormant: 'Vegetationsruhe',
    },
  },
} as const;
