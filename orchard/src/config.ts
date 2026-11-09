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
    /** console-log camera poses (orbit end, presets, Kamera panel) so a
     *  hand-flown viewpoint can be transcribed into CONFIG.CAMERA */
    LOG_CAMERA: true,
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
    /** wheel/pinch dolly: per-event step = clamp(dist*FACTOR, MIN_STEP,
     *  MAX_STEP) — proportional zoom crawls to a halt near the target, the
     *  MIN_STEP floor keeps near-field motion constant. Once dollying in
     *  would close to under FOLLOW_DIST, the target is carried forward too
     *  (fly-past), so the walk continues through/past the info board. */
    DOLLY: {
      FACTOR: 0.06,
      MIN_STEP: 0.5,
      MAX_STEP: 6,
      FOLLOW_DIST: 1.2,
    },
    /** pinch dolly sensitivity: finger-spread px per dolly step */
    PINCH_PX_PER_STEP: 120,
    /** camera never below terrain + this margin (post-update clamp, m) */
    GROUND_MARGIN: 0.3,
    /** initial camera pose — local metres, y absolute DHHN. Pick a new one
     *  by flying the view and copying the "[kamera]" console line (see
     *  DEBUG.LOG_CAMERA): pos + blick go here. */
    START: {
      POS: [-0.1, 116.4, 22.5],
      TARGET: [62.3, 97.7, -94.3],
    },
    /** UI labels for the preset buttons (German site language). Südende and
     *  Nordwest were dropped per user request — the site.json vantages are
     *  replaced at runtime by CONFIG.CAMERA.PRESETS (see main.ts). */
    PRESET_LABELS: {
      vergleich: 'Fotostandpunkt',
      erhoeht: 'Erhöht',
      tafel: 'Tafel',
    },

    /** runtime preset poses replacing the generated site.json vantages:
     *  "Fotostandpunkt" = the initial camera pose (START above); "Erhöht" =
     *  an ELEVATED vantage at this WGS84 spot (a rise NE of the meadow,
     *  ground ~121.5 m) looking down at the initial view's focus. */
    PRESETS: {
      // 48.990387, 8.387737
      ERHOEHT: {
        LAT: 48.990387,
        LON: 8.387737,
        /** eye above the local ground, m (standing person) */
        EYE_ABOVE_GROUND: 1.6,
      },
    },
  },

  /** "Vogelflug" bird glide (flight.ts). Waypoints are local metres
   *  (x east, y up, z south); y is filled from the DGM at start() as
   *  terrain(x, z) + clearance — the start sits ~1.5 m above the crown of
   *  the NE ridge tree (bk01345, 11 m tall on the ~121 m ridge), the
   *  arrival hovers just above the EAST Hochsitz (osmway124028005, 4.6 m
   *  tall, at (24.7, 5.4)) looking north. */
  FLIGHT: {
    WAYPOINTS: [
      [66, 12.5, -45], // the elevated NE tree's crown (bk01345)
      [50, 13.5, -38], // off the ridge, skimming the crown tops
      [30, 14, -22], // NE meadow corner (clears bk02868)
      [17, 14, -1], // over the Hocksitzcafe towers (clears bk02839)
      [3, 14.5, 18], // mid-meadow pass (clears bk01274)
      [6, 13.5, 40], // south meadow
      [15, 13.5, 44], // swing east along the south edge
      [24, 8.5, 30], // descend, turn north on the east side (levels the final leg)
      [24.7, 5.5, 5.4], // arrive above the east Hochsitz — tangent points north
    ] as [number, number, number][],
    /** ~4 m/s glide over the ~160 m route */
    DURATION_S: 42,
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
      /** Klar: the brightest variant — mostly direct sunlight (strong
       *  shadows), ambient kept low */
      klar: {
        LABEL: 'Klar',
        DOME_TOP: 0x3d7fd6, DOME_HORIZON: 0xcfe8ff,
        CLOUD_COUNT: 2, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.25, CLOUD_OPACITY_JITTER: 0.2,
        FOG: 0xcfe8ff,
        SUN_FACTOR: 2.2, HEMI_FACTOR: 0.55, AMBIENT_FACTOR: 0.7,
      },
      /** Heiter: nearly as bright as Klar but softer — more ambient share */
      heiter: {
        LABEL: 'Heiter',
        DOME_TOP: 0x6f9fd8, DOME_HORIZON: 0xdce9f5,
        CLOUD_COUNT: 6, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.45, CLOUD_OPACITY_JITTER: 0.25,
        FOG: 0xdce9f5,
        SUN_FACTOR: 1.15, HEMI_FACTOR: 1.05, AMBIENT_FACTOR: 1.1,
      },
      /** Bedeckt: little direct sun, flat diffuse light from above */
      leichtBedeckt: {
        LABEL: 'Leicht bedeckt',
        DOME_TOP: 0xbfcdd8, DOME_HORIZON: 0xe8ecef,
        CLOUD_COUNT: 12, CLOUD_TINT: 0xffffff,
        CLOUD_OPACITY_MIN: 0.55, CLOUD_OPACITY_JITTER: 0.3,
        FOG: 0xb9c6d0,
        SUN_FACTOR: 0.4, HEMI_FACTOR: 1.15, AMBIENT_FACTOR: 1.1,
      },
      /** Gewitter: no direct light at all — dome/fog darken, hemi+ambient
       *  keep the scene visible */
      gewitter: {
        LABEL: 'Gewitter',
        DOME_TOP: 0x414b55, DOME_HORIZON: 0x828c96,
        CLOUD_COUNT: 18, CLOUD_TINT: 0x5f6873,
        CLOUD_OPACITY_MIN: 0.75, CLOUD_OPACITY_JITTER: 0.2,
        FOG: 0x828c96,
        SUN_FACTOR: 0.0, HEMI_FACTOR: 0.7, AMBIENT_FACTOR: 1.0,
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
     *  z south) — OSM way 1022385974 (natural=wood, "Katzenwedel"), node
     *  order kept; the concave notch at (-26, 6)…(-11, -48) wraps around
     *  the neighbour's house plot at ~(-30, -15). Edit these vertices to
     *  grow/shrink/move the strip; blobs are rejection-sampled inside. */
    POLYGON: [
      [-31.3, -73.9], [-27.1, -85.7], [8.6, -66.0], [9.3, -59.8],
      [12.9, -51.9], [5.3, -33.7], [7.7, -19.7], [0.4, 8.8],
      [-8.6, 14.0], [-26.2, 5.6], [-10.8, -47.9], [-21.9, -57.7],
      [-31.1, -67.2],
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
    /**
     * Procedural facade kit for LoD2 walls — photo typology from
     * newimages/20261028_164047.jpg (St.-Florian-Straße row): vertical
     * white-framed windows in ~3 m storeys over a dark plinth band.
     * Facade palette colours and the DOP roofs stay as they are.
     */
    FACADE: {
      /** kit applies to buildings at least this tall (m); smaller
       *  structures (garages, sheds) keep their plain colour */
      MIN_HEIGHT: 7,
      /** storey height (m) — German typical ~3 m */
      FLOOR_H: 3.0,
      /** dark plinth band height (m) and its shade (0 = black .. 1 = base) */
      PLINTH_H: 0.7,
      PLINTH_SHADE: 0.45,
      /** window size: width as fraction of the axis pitch, height as
       *  fraction of the storey height */
      WIN_W: 0.44,
      WIN_H: 0.52,
      FRAME: 0xf2f0ea,
      GLASS: 0x39434e,
      /** fraction of windows carrying shutters, and their colours */
      SHUTTER_CHANCE: 0.22,
      SHUTTER_COLOURS: [0xd8d3c8, 0x6b6f66, 0x7a5c44],
      /** per-window chance of a distinctly darker (curtained) pane */
      DARK_PANE_CHANCE: 0.18,
      /** facade tint jitter around the palette colour, drawn per building */
      TINT_JITTER: 0.05,
      /** window axes per wall class [min, max] */
      AXES: { front: [4, 5], back: [4, 5], side: [2, 3] } as Record<
        'front' | 'back' | 'side',
        [number, number]
      >,
      /** front walls get an entrance door on the ground floor */
      FRONT_DOOR: true,
      /** photo-pinned colours: buildings visible in
       *  newimages/20261028_164047.jpg (St.-Florian-Straße row; the image is
       *  newer than the geoportal textures). Matched by centre (nearest
       *  within 8 m): Nr. 7 = the yellow-ochre house (mansard-like roof,
       *  photo left), Nr. 9 = the blue-grey house (large gable + dormers,
       *  photo right), Nr. 11 = the pale house further west. Colours
       *  sampled from the photo with golden-hour blue lift. */
      COLOUR_OVERRIDES: [
        { at: [-38, 28], colour: 0xd2b06a },
        { at: [-48, 21], colour: 0x647a9e },
        { at: [-58, 15], colour: 0xd8d5ce },
        // Nr. 12 (user report): green house, light-blue base on the
        // north-facing side; its silver roof comes from the DOP pixels
        { at: [-59, -16], colour: 0x9aa88a, base: 0xa9c6d8 },
      ] as Array<{
        at: [number, number];
        colour: number;
        /** optional light base-band colour (drawn on north-facing walls) */
        base?: number;
      }>,
      /** pixels per metre for the generated facade textures (capped) */
      PX_PER_M: 24,
      /** noise seed offset (noise itself is seeded per building id) */
      SEED: 20261028,
    },
  },

  /**
   * The Stückle: small private garden plot east of the orchard towards the
   * trail (src/stueckle.ts, aerial newimages/stueckle.png). No LoD data —
   * procedural fence, huts, greenhouse, compost, conifer. Polygon in local
   * metres (x east, z south), traced from the DOP; edit to nudge.
   */
  STUECKLE: {
    /** plot outline - traced from OSM way 1022385982 (landuse=allotments),
     *  converted to local metres (garden centre ~48.98979/8.38792) */
    POLYGON: [
      [31.2, 31.4], [41.8, -12.4], [52.3, -8.0], [54.9, 18.5],
      [44.3, 32.7], [37.2, 34.8],
    ],
    FENCE: {
      HEIGHT: 1.35,
      POST_SPACING: 2.5,
      POST: 0x6b6258,
      MESH: 0x8a857c,
      MESH_OPACITY: 0.35,
    },
    /** tool huts - positions/rotations from OSM ways 124028004 (north)
     *  and 124028003 (south), footprints at 80% of the OSM real estate
     *  (OSM: 7.1x5.5 / 5.6x4.8 m); ROT = yaw in radians */
    HUTS: [
      { pos: [41.2, 4.7], size: [5.7, 4.4], WALL_H: 2.3, ROOF: 0xb9bdbd, WALL: 0xd8d2c4, RIDGE: 'x', ROT: -0.34 },
      { pos: [37.4, 28.9], size: [4.5, 3.8], WALL_H: 2.1, ROOF: 0x4a4f55, WALL: 0xc9c4b8, RIDGE: 'z', ROT: 0.27 },
    ] as Array<{
      pos: [number, number];
      size: [number, number];
      WALL_H: number;
      ROOF: number;
      WALL: number;
      RIDGE: 'x' | 'z';
      ROT?: number;
    }>,
    /** low translucent greenhouse (bright rectangle in the DOP at ~36,17) */
    GREENHOUSE: { pos: [36, 17], size: [3.0, 1.4], H: 1.2, ROT: 0.2 },
    /** compost heap near the south hut */
    COMPOST: [[47, 27]] as Array<[number, number]>,
    /** one conifer inside the plot [x, z] */
    CONIFER: [46, 20] as [number, number],
    /** noise seed for hut weathering etc. */
    SEED: 20261028,
  },

  /** information panel at the meadow (panel.ts): real ZKM info board,
   *  face texture newimages/panel_small.png → public/textures/panel.png.
   *  Position from the user's placement (5–8 m west of the Stückle fence,
   *  at the path junction coming from St.-Florian-Straße — matches the
   *  small bright object in the 2024 DOP at local ~24/28); the EXIF of
   *  panel-position.jpg is too coarse and was only a hint. */
  PANEL: {
    /** board position, WGS84 → EPSG:25832 → local ≈ (24.0, 28.0) */
    LAT: 48.98965,
    LON: 8.387631,
    /** jump-to-board preset ("Tafel"): camera DIST in front of the face,
     *  EYE_H above the ground; target = board centre height.
     *  START_DIST = the app's initial view: the board from closer up. */
    VIEW: {
      DIST: 3.2,
      EYE_H: 1.55,
      START_DIST: 1.5,
    },
    /** small warm spot aimed at the board only — keeps the text readable
     *  when the board sits in shade (main.ts). Position: board centre +
     *  face normal*OUT + up*HEIGHT; decay 2 (physical). */
    LIGHT: {
      COLOR: '#fff1cf',
      INTENSITY: 2.2,
      DISTANCE: 6,
      ANGLE_DEG: 36,
      PENUMBRA: 0.7,
      OUT: 1.05,
      HEIGHT: 1.15,
    },
    /** compass direction the board FACE points toward, degrees (0=N, 90=E).
     *  Rotated so the three Hochsitz towers (meadow, ~N of the board) form
     *  the backdrop when reading it — face toward the path junction S of
     *  the board; keeps the Stückle south hut (E) out of the sight line.
     *  (= bearing panel→Hochsitz centroid + 180, from site.json structures) */
    AZIMUTH_DEG: 171,
    /** board face size, m — the graphic is 1280×1024 (5:4 landscape) */
    BOARD_W: 0.76,
    BOARD_H: 0.61,
    /** board centre above ground, m (reading height on the position photo) */
    BOARD_CENTRE_H: 1.4,
    /** board thickness + post cross-section, m */
    BOARD_T: 0.03,
    POST_W: 0.09,
    /** post top height above ground, m (board hangs near the post top) */
    POST_TOP_H: 1.7,
    /** colours: dark timber post, light aluminium board edges */
    POST_COLOR: 0x3a2e24,
    EDGE_COLOR: 0xc9c9c9,
    TEXTURE_URL: '/textures/panel.png',
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
    /** chase cam: distance behind (along -heading) and above, m */
    FOLLOW: { BACK: 4, UP: 2.2 },
    /** one-shot route (user choreography): jump off a Stückle fence post,
     *  walk through the middle of the orchard, stop facing a Hochsitz */
    ROUTE: {
      /** jump off the fence post nearest this anchor (Stückle west fence) */
      JUMP_FROM: [36.5, 9.5],
      /** ballistic hop parameters */
      JUMP_DURATION: 0.9,
      JUMP_APEX: 0.35,
      /** landing point relative to the post top (towards the orchard) */
      LAND_OFFSET: [-2.4, -0.9],
      /** the meadow middle the cat walks through first */
      MID: [20, 3],
      /** Hochsitz to walk to and face */
      HOCHSITZ: [19.8, -1.6],
      /** stop this far from the Hochsitz */
      STAND_OFF: 1.8,
    },
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
