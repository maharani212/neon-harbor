// Port Meridian, the city itself: a road grid, the blocks between the roads, and the
// road graph every driver (traffic, police, the autopilot) steers by. Pure data and
// geometry — no drawing, no browser — so the same city can be built in Node for tests.
// Coordinates are world pixels; the city is WORLD.size square.

import { CONSTRUCTION_BLOCK, DISTRICTS, GAS_STATIONS, WORLD } from './config.js';

const { pitch, road, block, grid, size } = WORLD;
const NODES = grid * grid;

/** Node id for intersection (i, j). */
export function nodeId(i, j) {
  return j * grid + i;
}

/** Centre of an intersection node, in world pixels. */
export function nodePos(id) {
  const i = id % grid;
  const j = Math.floor(id / grid);
  return { x: i * pitch + road / 2, y: j * pitch + road / 2 };
}

/** The intersection nearest a point. */
export function nearestNode(x, y) {
  const i = Math.max(0, Math.min(grid - 1, Math.round((x - road / 2) / pitch)));
  const j = Math.max(0, Math.min(grid - 1, Math.round((y - road / 2) / pitch)));
  return nodeId(i, j);
}

/** Whether a point sits on a road (either a vertical or a horizontal strip). */
export function isOnRoad(x, y) {
  const rx = ((x % pitch) + pitch) % pitch;
  const ry = ((y % pitch) + pitch) % pitch;
  return rx < road || ry < road;
}

/** The block (bx, by) a point is over, or null when it is on a road. */
export function blockAt(x, y) {
  const rx = ((x % pitch) + pitch) % pitch;
  const ry = ((y % pitch) + pitch) % pitch;
  if (rx < road || ry < road) return null;
  return { bx: Math.floor(x / pitch), by: Math.floor(y / pitch) };
}

/** The district name for a point. */
export function districtAt(x, y) {
  const b = blockAt(x, y);
  const bx = b ? b.bx : Math.max(0, Math.min(grid - 1, Math.floor(x / pitch)));
  const by = b ? b.by : Math.max(0, Math.min(grid - 1, Math.floor(y / pitch)));
  for (const d of DISTRICTS) {
    if (bx >= d.x0 && bx < d.x1 && by >= d.y0 && by < d.y1) return d.name;
  }
  return 'PORT MERIDIAN';
}

/** A random point on a road, for spawning traffic and pickups. */
export function randomRoadPoint(random) {
  if (random.chance(0.5)) {
    // On a vertical road.
    const i = random.int(0, grid - 1);
    return { x: i * pitch + road / 2, y: random.range(0, size) };
  }
  const j = random.int(0, grid - 1);
  return { x: random.range(0, size), y: j * pitch + road / 2 };
}

/** Breadth-first path over the intersection grid; a list of node ids, start to goal. */
export function bfs(from, to) {
  if (from === to) return [from];
  const prev = new Int16Array(NODES).fill(-1);
  const queue = [from];
  prev[from] = from;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const ci = cur % grid;
    const cj = Math.floor(cur / grid);
    const neighbours = [];
    if (ci > 0) neighbours.push(cur - 1);
    if (ci < grid - 1) neighbours.push(cur + 1);
    if (cj > 0) neighbours.push(cur - grid);
    if (cj < grid - 1) neighbours.push(cur + grid);
    for (const next of neighbours) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.push(node);
        }
        path.reverse();
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** A block's rectangle, in world pixels. */
function blockRect(bx, by) {
  return { x: bx * pitch + road, y: by * pitch + road, w: block, h: block };
}

/**
 * Build the city from a seeded random: buildings per block, the construction site,
 * the two gas stations, two parks, and the district names painted on the asphalt.
 * Returns the solid rectangles (for collision), the pumps, the parks, the labels and
 * the per-block kind, all deterministic for the seed.
 */
export function createCity(random) {
  const solids = [];
  const pumps = [];
  const parks = [];
  const labels = [];
  const trees = [];
  const kind = new Map(); // "bx,by" -> 'building' | 'construction' | 'gas' | 'park'

  const parkBlocks = [
    { bx: 3, by: 6 },
    { bx: 6, by: 1 },
  ];
  const isPark = (bx, by) => parkBlocks.some((p) => p.bx === bx && p.by === by);
  const isGas = (bx, by) => GAS_STATIONS.some((g) => g.bx === bx && g.by === by);
  const isConstruction = (bx, by) => bx === CONSTRUCTION_BLOCK.bx && by === CONSTRUCTION_BLOCK.by;

  for (let by = 0; by < grid; by += 1) {
    for (let bx = 0; bx < grid; bx += 1) {
      const r = blockRect(bx, by);
      if (isConstruction(bx, by)) {
        kind.set(`${bx},${by}`, 'construction');
        // The site itself is solid: no driving through the fenced yard.
        solids.push({ x: r.x, y: r.y, w: r.w, h: r.h, kind: 'construction' });
        continue;
      }
      if (isGas(bx, by)) {
        kind.set(`${bx},${by}`, 'gas');
        // Canopy pillars are solid; the forecourt stays open.
        const canopy = { x: r.x + 30, y: r.y + 30, w: 140, h: 70 };
        solids.push({ x: canopy.x, y: canopy.y, w: 14, h: 14, kind: 'pillar' });
        solids.push({ x: canopy.x + canopy.w - 14, y: canopy.y, w: 14, h: 14, kind: 'pillar' });
        solids.push({ x: canopy.x, y: canopy.y + canopy.h - 14, w: 14, h: 14, kind: 'pillar' });
        solids.push({ x: canopy.x + canopy.w - 14, y: canopy.y + canopy.h - 14, w: 14, h: 14, kind: 'pillar' });
        // Two pumps on the forecourt's south edge.
        pumps.push({ x: r.x + 70, y: r.y + 150, station: `${bx},${by}` });
        pumps.push({ x: r.x + 130, y: r.y + 150, station: `${bx},${by}` });
        continue;
      }
      if (isPark(bx, by)) {
        kind.set(`${bx},${by}`, 'park');
        parks.push(r);
        for (let t = 0; t < 7; t += 1) {
          trees.push({ x: r.x + random.range(24, r.w - 24), y: r.y + random.range(24, r.h - 24), r: random.range(10, 18) });
        }
        continue;
      }
      kind.set(`${bx},${by}`, 'building');
      // One big slab, or two smaller ones side by side.
      if (random.chance(0.55)) {
        const w = random.range(110, 160);
        const h = random.range(110, 160);
        const x = r.x + (r.w - w) / 2 + random.range(-12, 12);
        const y = r.y + (r.h - h) / 2 + random.range(-12, 12);
        solids.push({ x, y, w, h, kind: 'building', roof: random.int(0, 2) });
      } else {
        const w1 = random.range(70, 95);
        const h1 = random.range(120, 170);
        const w2 = random.range(70, 95);
        const h2 = random.range(120, 170);
        solids.push({ x: r.x + 12, y: r.y + (r.h - h1) / 2, w: w1, h: h1, kind: 'building', roof: random.int(0, 2) });
        solids.push({ x: r.x + r.w - 12 - w2, y: r.y + (r.h - h2) / 2, w: w2, h: h2, kind: 'building', roof: random.int(0, 2) });
      }
    }
  }

  // District names painted on the asphalt: one per district, on a road through it.
  for (const d of DISTRICTS) {
    const midX = ((d.x0 + d.x1) / 2) * pitch;
    const midY = ((d.y0 + d.y1) / 2) * pitch;
    // Snap onto the nearest horizontal road so the name sits on asphalt.
    const roadJ = Math.max(0, Math.min(grid - 1, Math.round((midY - road / 2) / pitch)));
    labels.push({ x: midX, y: roadJ * pitch + road / 2, text: d.name, vertical: false });
  }
  // A couple of vertical ones for variety.
  labels.push({ x: 2 * pitch + road / 2, y: ((3 + 5) / 2) * pitch, text: 'OLD TOWN', vertical: true });
  labels.push({ x: 6 * pitch + road / 2, y: ((2 + 5) / 2) * pitch, text: 'UPTOWN', vertical: true });

  return { solids, pumps, parks, trees, labels, kind, blockRect };
}
