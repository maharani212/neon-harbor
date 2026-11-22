// Neon Harbor — configuration and tuning.
// Every number that shapes the city, the cars and the missions lives here so
// the rest of the game reads plain constants instead of magic numbers.

export const WORLD_W = 3200;
export const WORLD_H = 2400;

// City grid: roads are ROAD_W wide, blocks are BLOCK wide, pitch is their sum.
export const ROAD_W = 72;
export const BLOCK = 208;
export const PITCH = ROAD_W + BLOCK; // 280

// Vertical road centre lines (x) and horizontal road centre lines (y).
export const ROAD_X = [140, 420, 700, 980, 1260, 1540, 1820, 2100, 2380, 2660, 2940];
export const ROAD_Y = [140, 420, 700, 980, 1260, 1540, 1820, 2100];

// Harbor: water starts at this y; the dock strip sits just above it.
export const WATER_Y = 2180;
export const DOCK_Y0 = 2136;
export const DOCK_Y1 = 2180;
// The pier (walkable) crosses the water at this road's x, the yacht waits at its end.
export const PIER_X = 1540;
export const PIER_HALF = 26;
export const PIER_END_Y = 2340;

// Neon palette: dark blue night, magenta / cyan / yellow light.
export const PALETTE = {
  sky: '#070b1d',
  water: '#0a1f3d',
  waterLine: '#123a6b',
  road: '#1a1d2e',
  roadEdge: '#2c3048',
  lane: '#8f96b8',
  sidewalk: '#23263a',
  park: '#0e2f1e',
  parkLine: '#1d5a34',
  building: '#141830',
  buildingEdge: '#2a2f55',
  windowLit: '#ffd166',
  windowDark: '#1d2447',
  player: '#ff2e88',
  ped: '#e8e6ff',
  police: '#e8ecff',
  policeLightR: '#ff2b2b',
  policeLightB: '#2b6bff',
  objective: '#ffd166',
  money: '#7dff9e',
  star: '#ffd166',
  danger: '#ff4d4d',
  text: '#f2f4ff',
  muted: '#9aa1c7',
};

export const NEON_SIGNS = ['#ff2e88', '#00e5ff', '#ffd166', '#7dff9e', '#b967ff', '#ff7a3d'];

// Traffic / pedestrian car colors.
export const CAR_COLORS = ['#ff5d5d', '#ffd166', '#4dc3ff', '#7dff9e', '#c77dff', '#ff9f43', '#e8ecff', '#5df2d6'];

// On-foot movement.
export const PLAYER = {
  radius: 11,
  walkSpeed: 210,
  runSpeed: 300,
  hp: 100,
};

// Car physics (pixels, seconds).
export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 5.2,
  drift: 0.92,
};

// Wanted level: stars 0..5. Police count and speed scale with stars.
export const WANTED = {
  max: 5,
  decayDelay: 6, // seconds with no police sight before stars start falling
  decayRate: 0.25, // stars per second once decaying
  policePerStar: [0, 1, 2, 3, 4, 6],
  policeSpeed: [0, 300, 330, 365, 400, 440],
  sightRange: 520,
  bustRange: 46,
  bustTime: 1.6, // seconds a cop must stay close on foot to bust you
};

// Mission payouts and timers.
export const MISSIONS = [
  { id: 1, name: 'First Ride', payout: 200, brief: 'Steal any car and drive to the marker.' },
  { id: 2, name: 'Night Market Dash', payout: 350, brief: 'Deliver the package across town. Beat the clock.', time: 70 },
  { id: 3, name: 'Harbor Heist', payout: 500, brief: 'Grab the 3 crates at the docks. The law is watching.', crates: 3 },
  { id: 4, name: 'The Courier', payout: 600, brief: 'Three drop-offs, in order. No questions asked.', stops: 3 },
  { id: 5, name: 'Getaway Driver', payout: 800, brief: 'Lose the 3-star chase and reach the safehouse.', stars: 3 },
  { id: 6, name: 'Midnight Run', payout: 1000, brief: 'Race through 4 checkpoints across the city.', checkpoints: 4, time: 110 },
  { id: 7, name: 'Port Meridian PD', payout: 1200, brief: 'Survive a 4-star manhunt for 60 seconds.', stars: 4, time: 60 },
  { id: 8, name: 'Five-Star Finale', payout: 2000, brief: 'Survive the 5-star chase and reach the yacht.', stars: 5 },
];

export const START_MONEY = 0;
export const BUST_FINE = 150;
export const WASTED_FINE = 200;
export const PICKUP_CASH = 50;

// View.
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const MINIMAP_W = 210;
export const MINIMAP_H = 158;
