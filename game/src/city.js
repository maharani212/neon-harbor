// Neon Harbor — the city of Port Meridian.
// A deterministic grid city built from one seed: roads, blocks, buildings,
// parks, the harbor water, the docks and the pier. Everything the game needs
// to draw the city and to collide with it lives on the object buildCity
// returns; nothing here knows about the player, the police or the missions.

import { ROAD_X, ROAD_Y, ROAD_W, BLOCK, WORLD_W, WORLD_H, WATER_Y, DOCK_Y0, DOCK_Y1, PIER_X, PIER_HALF, PIER_END_Y, NEON_SIGNS, CAR_COLORS } from './config.js';
import { Rng } from './random.js';

/** The half-width of a road. */
const HALF_ROAD = ROAD_W / 2;

/** Whether a point is inside an axis-aligned rectangle. */
function inRect(x, y, r) {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Whether a circle overlaps an axis-aligned rectangle. */
function circleRect(cx, cy, cr, r) {
  const nx = Math.max(r.x, Math.min(cx, r.x + r.w));
  const ny = Math.max(r.y, Math.min(cy, r.y + r.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < cr * cr;
}

/**
 * Build Port Meridian from a seed. Returns the city with its geometry and the
 * collision queries the game uses. The same seed always builds the same city.
 */
export function buildCity(seed = 1) {
  const rng = new Rng(seed);
  const buildings = [];
  const parks = [];
  const crates = [];
  const carSpawns = [];
  const neonSigns = [];

  // Blocks sit between neighbouring roads. A block's span is the gap between
  // one road's far edge and the next road's near edge.
  const blockCols = [];
  for (let i = 0; i < ROAD_X.length - 1; i++) {
    blockCols.push({ x0: ROAD_X[i] + HALF_ROAD, x1: ROAD_X[i + 1] - HALF_ROAD });
  }
  const blockRows = [];
  for (let j = 0; j < ROAD_Y.length - 1; j++) {
    blockRows.push({ y0: ROAD_Y[j] + HALF_ROAD, y1: ROAD_Y[j + 1] - HALF_ROAD });
  }

  // Fill each block with buildings, or make it a park.
  for (const col of blockCols) {
    for (const row of blockRows) {
      const w = col.x1 - col.x0;
      const h = row.y1 - row.y0;
      if (rng.chance(0.16)) {
        // A park: green ground with a few trees, no buildings.
        const trees = [];
        const n = rng.int(3, 6);
        for (let t = 0; t < n; t++) {
          trees.push({ x: rng.range(col.x0 + 18, col.x1 - 18), y: rng.range(row.y0 + 18, row.y1 - 18), r: rng.range(7, 13) });
        }
        parks.push({ x: col.x0, y: row.y0, w, h, trees });
        continue;
      }
      // One to three buildings inside the block, each inset from its edges.
      const n = rng.int(1, 3);
      for (let b = 0; b < n; b++) {
        const bw = rng.range(60, Math.min(120, w - 24));
        const bh = rng.range(60, Math.min(120, h - 24));
        const bx = rng.range(col.x0 + 8, col.x0 + w - bw - 8);
        const by = rng.range(row.y0 + 8, row.y0 + h - bh - 8);
        const color = rng.pick(['#141830', '#171b38', '#10142a', '#1a1430']);
        const neon = rng.pick(NEON_SIGNS);
        buildings.push({ x: bx, y: by, w: bw, h: bh, color, neon, floors: rng.int(2, 6) });
        if (rng.chance(0.7)) {
          neonSigns.push({ x: bx + bw / 2, y: by, text: rng.pick(['HOTEL', 'BAR', '24H', 'NEON', 'CLUB', 'PIER', 'TAXI', 'DINE']), color: neon });
        }
      }
    }
  }

  // A ring of border buildings keeps the player inside the city on three sides.
  const border = (x, y, w, h) => buildings.push({ x, y, w, h, color: '#10142a', neon: '#2a2f55', floors: 3 });
  border(0, 0, 104, WORLD_H);
  border(WORLD_W - 104, 0, 104, WORLD_H);
  border(104, 0, WORLD_W - 208, 104);

  // The docks: a walkable strip above the water, with crates stacked on it.
  for (let i = 0; i < 10; i++) {
    const cx = 200 + i * 290 + rng.range(-40, 40);
    const cy = rng.range(DOCK_Y0 + 10, DOCK_Y1 - 14);
    crates.push({ x: cx, y: cy, w: 18, h: 18, taken: false });
  }
  // Three crates are the Harbor Heist pickups, spread along the docks.
  const heistCrates = [crates[1], crates[4], crates[7]].filter(Boolean);

  // Parked cars: spots just off the road edge, facing along the road.
  for (const rx of ROAD_X) {
    for (const ry of ROAD_Y) {
      if (rng.chance(0.55)) {
        const side = rng.chance(0.5) ? -1 : 1;
        carSpawns.push({ x: rx + side * (HALF_ROAD + 16), y: ry + rng.range(-90, 90), angle: side > 0 ? 0 : Math.PI, color: rng.pick(CAR_COLORS) });
      }
    }
  }
  // A few extra parked cars along the docks road.
  for (let i = 0; i < 4; i++) {
    carSpawns.push({ x: 300 + i * 700 + rng.range(-30, 30), y: 2100, angle: 0, color: rng.pick(CAR_COLORS) });
  }

  const water = { x: 0, y: WATER_Y, w: WORLD_W, h: WORLD_H - WATER_Y };
  const pier = { x: PIER_X - PIER_HALF, y: WATER_Y, w: PIER_HALF * 2, h: PIER_END_Y - WATER_Y };
  const yacht = { x: PIER_X, y: PIER_END_Y - 30 };

  /** Whether a point is in the water (the pier is dry land). */
  function inWater(x, y) {
    if (y < WATER_Y) return false;
    if (inRect(x, y, pier)) return false;
    return true;
  }

  /** Whether a point is solid: a building, water, or outside the world. */
  function isSolid(x, y) {
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return true;
    if (inWater(x, y)) return true;
    for (const b of buildings) if (inRect(x, y, b)) return true;
    return false;
  }

  /** Whether a circle of radius r at (x, y) touches anything solid. */
  function circleSolid(x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r >= WORLD_W || y + r >= WORLD_H) return true;
    if (inWater(x, y)) return true;
    // Water is a big rect: a circle near its edge counts as in the water.
    if (y + r > WATER_Y && !inRect(x, y, pier)) {
      if (y - r < WATER_Y && x > pier.x && x < pier.x + pier.w) {
        // Straddling the pier: only solid if the circle leaves the pier.
        if (x - r < pier.x || x + r > pier.x + pier.w) return true;
      } else if (y + r > WATER_Y) {
        return true;
      }
    }
    for (const b of buildings) if (circleRect(x, y, r, b)) return true;
    return false;
  }

  /** The nearest road centreline point to (x, y), for traffic to follow. */
  function nearestRoad(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const rx of ROAD_X) {
      const d = Math.abs(x - rx);
      if (d < bestD) {
        bestD = d;
        best = { x: rx, y, vertical: true };
      }
    }
    for (const ry of ROAD_Y) {
      const d = Math.abs(y - ry);
      if (d < bestD) {
        bestD = d;
        best = { x, y: ry, vertical: false };
      }
    }
    return best;
  }

  return {
    seed,
    buildings,
    parks,
    crates,
    heistCrates,
    carSpawns,
    neonSigns,
    water,
    pier,
    yacht,
    docks: { x: 0, y: DOCK_Y0, w: WORLD_W, h: DOCK_Y1 - DOCK_Y0 },
    isSolid,
    circleSolid,
    inWater,
    nearestRoad,
  };
}
