// Bloom Bastion — every tuning number, colour and layout rectangle in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to the window,
// so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The lawn grid the player plants on. The path winds through it; path cells cannot be planted. */
export const GRID = { cols: 18, rows: 8, cell: 64, x: 40, y: 72 };

/**
 * The pests' route as grid waypoints (column, row); the first and last sit just off the lawn,
 * so enemies walk in from the left hedge and out through the right one, toward the flower bed.
 */
export const PATH_CELLS = [
  [-1, 1], [3, 1], [3, 5], [7, 5], [7, 2], [11, 2], [11, 6], [15, 6], [15, 3], [19, 3],
];

export const START_SUN = 160;
export const START_LIVES = 20;
export const TOTAL_WAVES = 15;

/** Sunlight trickles in on its own, and a bigger drop lands on the lawn now and then to click. */
export const INCOME = { perSecond: 0.7, dropEvery: [6, 10], dropValue: 25, dropLife: 9 };

/** The four plantable towers. Level 2 is bought per tower; see UPGRADE below. */
export const TOWERS = {
  daisy: {
    name: 'Daisy Turret', key: '1', cost: 50, range: 138, damage: 9, rate: 0.42,
    blurb: 'Fast pollen shots at one pest.',
  },
  thorn: {
    name: 'Thorn Vine', key: '2', cost: 40, range: 116, damage: 3, rate: 0.55,
    slow: 0.45, slowTime: 1.7, blurb: 'Darts that slow pests down.',
  },
  hive: {
    name: 'Bee Hive', key: '3', cost: 95, range: 126, damage: 12, rate: 1.15,
    splash: 58, blurb: 'Honey bursts that splash a group.',
  },
  fern: {
    name: 'Frost Fern', key: '4', cost: 110, range: 112, damage: 5, rate: 2.6,
    freezeTime: 1.15, blurb: 'Freezes every pest in reach.',
  },
};
export const TOWER_ORDER = ['daisy', 'thorn', 'hive', 'fern'];
/** Buying level 2 costs this share of the plant's price and strengthens it as listed. */
export const UPGRADE = { costShare: 0.8, damage: 1.65, range: 1.14, rate: 0.88 };
/** Selling a plant refunds this share of everything spent on it. */
export const SELL_SHARE = 0.7;

/** The pests. Speed is pixels a second along the path; bounty is sunlight paid for a kill. */
export const PESTS = {
  aphid: { name: 'Aphid', hp: 22, speed: 62, bounty: 3, score: 10, radius: 13, damage: 1 },
  beetle: { name: 'Beetle', hp: 100, speed: 36, bounty: 5, score: 25, radius: 16, damage: 1 },
  slug: { name: 'Slug', hp: 225, speed: 24, bounty: 7, score: 40, radius: 18, damage: 2 },
  wasp: { name: 'Wasp', hp: 34, speed: 96, bounty: 4, score: 20, radius: 13, damage: 1 },
  ant: { name: 'Garden Ant', hp: 15, speed: 118, bounty: 2, score: 15, radius: 11, damage: 1 },
  boss: { name: 'Goliath Beetle', hp: 7800, speed: 21, bounty: 150, score: 1000, radius: 34, damage: 10 },
};

/** Enemy health grows by this factor each wave after the first, compounding gently. */
export const WAVE_HP_GROWTH = 1.23;
/**
 * Pests also march a little faster each wave. Health alone only lengthens a wave;
 * speed is what turns a strong garden's surplus into leaks, above all for the fast
 * kinds — it is the pressure that makes slows and freezes worth planting.
 */
export const WAVE_SPEED_GROWTH = 1.028;
/** Seconds between one pest and the next inside a wave's groups. */
export const SPAWN_GAP = 0.72;

/** Screen layout: the top HUD band and the bottom toolbar the renderer and input share. */
export const LAYOUT = {
  hudHeight: 56,
  toolbarY: 600,
  toolbarHeight: 112,
  cardX: 40,
  cardY: 616,
  cardW: 150,
  cardH: 80,
  cardGap: 12,
  startWave: { x: 1088, y: 616, w: 152, h: 80 },
  infoX: 712,
  infoW: 360,
  buttonW: 108,
  buttonH: 34,
};

export const PALETTE = {
  skyTop: '#8ed4f7',
  skyBottom: '#d8f3ff',
  lawnA: '#79c25f',
  lawnB: '#6db353',
  lawnLine: 'rgba(46, 96, 34, 0.18)',
  dirt: '#d9b77c',
  dirtEdge: '#b8935a',
  hedge: '#3e7d32',
  hudBar: '#2f5d33',
  hudBarEdge: '#26492a',
  panel: '#fdf6e0',
  panelEdge: '#c9a86a',
  ink: '#2c3a1e',
  mutedInk: '#6b7a52',
  sunCore: '#ffd94d',
  sunRim: '#f5a623',
  heart: '#ef5350',
  textLight: '#ffffff',
  rangeFill: 'rgba(255, 255, 255, 0.16)',
  rangeEdge: 'rgba(255, 255, 255, 0.75)',
  badCell: 'rgba(239, 83, 80, 0.4)',
  goodCell: 'rgba(255, 255, 255, 0.35)',
  overlay: 'rgba(24, 42, 20, 0.62)',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'bloom-bastion.best';
