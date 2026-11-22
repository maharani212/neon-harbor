// Neon Harbor — every tuning number and colour in one place.
// The city is a fixed 2048x2048 world: an 8x8 grid of intersections, roads 56 px wide,
// blocks 200 px square. The renderer scales the camera view to the window, so no rule
// below depends on the screen size.

export const STEP = 1 / 60;

export const WORLD = {
  size: 2048,
  pitch: 256, // block + road
  road: 56,
  block: 200,
  grid: 8, // intersections per side (0..7)
};

export const DISTRICTS = [
  { name: 'DOCKS', x0: 0, y0: 0, x1: 4, y1: 2 },
  { name: 'NIGHT MARKET', x0: 4, y0: 0, x1: 8, y1: 2 },
  { name: 'OLD TOWN', x0: 0, y0: 2, x1: 3, y1: 5 },
  { name: 'NEON HARBOR', x0: 3, y0: 2, x1: 6, y1: 5 },
  { name: 'UPTOWN', x0: 6, y0: 2, x1: 8, y1: 5 },
  { name: 'INDUSTRIAL', x0: 0, y0: 5, x1: 4, y1: 8 },
  { name: 'MARINA', x0: 4, y0: 5, x1: 8, y1: 8 },
];

// One block is a construction site (block coords, not pixels): traffic routes around it.
export const CONSTRUCTION_BLOCK = { bx: 5, by: 3 };

// Two gas stations, by block coords; pumps sit on the block's south edge.
export const GAS_STATIONS = [
  { bx: 1, by: 1, name: 'Docks Fuel' },
  { bx: 6, by: 6, name: 'Marina Fuel' },
];

export const PLAYER = {
  walkSpeed: 230,
  radius: 13,
  hp: 100,
  armorMax: 100,
  enterRadius: 46,
  // On-foot shooting.
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.28,
  longshotDamage: 70,
  longshotRange: 640,
  longshotCooldown: 0.42,
};

export const CAR = {
  length: 46,
  width: 24,
  radius: 20,
  accel: 340,
  brake: 520,
  reverseAccel: 220,
  maxSpeed: 520,
  maxReverse: 170,
  turnRate: 2.6,
  // Even at a standstill the wheel still bites a little, so an autopilot that
  // stops nose-first into a wall can turn itself out instead of deadlocking.
  minTurnAuthority: 0.3,
  drag: 0.55,
  offroadDrag: 1.6,
  fuelMax: 100,
  fuelDrain: 1.1, // per second while the throttle is down
  fuelRefill: 22, // per second parked at a pump
  ramDamage: 8,
};

export const BIKE = {
  length: 34,
  width: 14,
  radius: 14,
  accel: 460,
  brake: 560,
  reverseAccel: 200,
  maxSpeed: 640,
  maxReverse: 160,
  turnRate: 3.4,
  minTurnAuthority: 0.35,
  drag: 0.5,
  offroadDrag: 1.4,
  fuelMax: 100,
  fuelDrain: 0.9,
  fuelRefill: 22,
  ramDamage: 5,
};

export const TRAFFIC = {
  count: 14,
  speed: 150,
  speedJitter: 60,
  // A traffic car re-picks a destination when it arrives, or after this long.
  retargetSeconds: 26,
};

export const PEDS = {
  count: 22,
  speed: 55,
  speedJitter: 30,
  fleeRadius: 130,
};

export const POLICE = {
  // How many cruisers are out for each wanted level (index = wanted).
  countByWanted: [0, 1, 2, 3, 4, 5],
  speed: 430,
  accel: 420,
  turnRate: 3.0,
  ramDamage: 6,
  // Seconds a cruiser must sit on a slow player before the bust lands.
  bustSeconds: 2.5,
  bustRadius: 56,
  bustMaxSpeed: 26,
  // A cruiser gives up and despawns past this distance from the player.
  despawnRadius: 900,
  spawnRadius: 620,
  // Wanted decays this fast when no crime is happening and no cruiser is near.
  decayPerSecond: 0.045,
};

export const ROADBLOCK = {
  minWanted: 3,
  // Cars parked across the road ahead of the player, per roadblock.
  cars: 2,
  ahead: 340,
  // A roadblock dissolves once the heat drops below this.
  clearBelow: 3,
};

export const WANTED = {
  max: 5,
  stealCar: 0.6,
  hitPed: 1.0,
  hitPolice: 1.2,
  shoot: 0.35,
  shootNearPolice: 0.8,
  ramPolice: 0.9,
  // How close a cruiser must be to "see" a crime.
  seeRadius: 520,
};

// Pickups scattered around the city.
export const PICKUPS = {
  health: { heal: 45, radius: 26 },
  armor: { armor: 50, radius: 26 },
  longshot: { radius: 26 },
  turbo: { radius: 26, boostSeconds: 6 },
  respawnSeconds: 24,
};

export const BULLET = {
  speed: 900,
  radius: 4,
  life: 1.4,
};

export const MISSIONS = [
  { id: 1, title: 'First Drop', pay: 300 },
  { id: 2, title: 'Night Market Dash', pay: 400 },
  { id: 3, title: 'Three Crates', pay: 450 },
  { id: 4, title: 'The Courier', pay: 500 },
  { id: 5, title: 'Fare Play', pay: 450 },
  { id: 6, title: 'Vex Escort', pay: 600 },
  { id: 7, title: 'Getaway', pay: 650 },
  { id: 8, title: 'Five-Star Finale', pay: 1000 },
];

export const COMBO = {
  step: 0.25, // +25% pay per consecutive completed mission
  max: 2.0, // at most triple pay
};

// Day/night: a full cycle takes this long; 0 = dawn, 0.25 = noon, 0.5 = dusk, 0.75 = midnight.
export const DAY_LENGTH = 240;

export const PALETTE = {
  backdrop: '#0b0e1a',
  ground: '#141a2e',
  sidewalk: '#1d2440',
  road: '#232a45',
  roadLine: '#3a4470',
  blockEdge: '#2c3558',
  buildingRoof: '#2a3352',
  buildingRoof2: '#333d63',
  buildingRoof3: '#3d2f5e',
  buildingEdge: '#4a5580',
  construction: '#3a2f14',
  hazard: '#f2c94c',
  barrier: '#ff7a3d',
  gasCanopy: '#0f7a6e',
  gasPump: '#e8ecf5',
  park: '#14352a',
  water: '#0e2a4a',
  player: '#19e3ff',
  playerCar: '#19e3ff',
  bike: '#ff4fd8',
  traffic: '#c9d2e8',
  traffic2: '#8fa0c9',
  traffic3: '#e8b64c',
  police: '#e8ecf5',
  policeLightR: '#ff3b30',
  policeLightB: '#2f7bff',
  ped: '#ffd166',
  ped2: '#7dff9e',
  ped3: '#ff9ecf',
  bullet: '#ffe066',
  muzzle: '#fff3b0',
  pickupHealth: '#2fd67a',
  pickupArmor: '#3fa9ff',
  pickupGun: '#ff5c8a',
  pickupTurbo: '#ffb020',
  marker: '#ffe066',
  markerRing: '#ffe066',
  text: '#eef1f5',
  muted: '#8b93a3',
  gold: '#f2c94c',
  danger: '#ff5c5c',
  hudPanel: 'rgba(10, 13, 26, 0.82)',
  hudBorder: '#3a4470',
  minimapBg: 'rgba(10, 13, 26, 0.85)',
  star: '#ffe066',
  starEmpty: '#3a4470',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (mission, cash, best combo) is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save.v1';
export const BEST_KEY = 'neon-harbor.best.v1';
