// Neon Harbor — the game world: state, physics, traffic, police, wanted
// level and the eight story missions. This is the simulation; render.js only
// draws what lives here, and main.js only calls updateWorld each frame.

import { WORLD_W, WORLD_H, PLAYER, CAR, WANTED, MISSIONS, BUST_FINE, WASTED_FINE, PICKUP_CASH, ROAD_X, ROAD_Y, WATER_Y } from './config.js';
import { buildCity } from './city.js';
import { Rng } from './random.js';

const TAU = Math.PI * 2;

/** Wrap an angle to (-PI, PI]. */
function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}

/** Distance between two points. */
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Clamp a value. */
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A point on the map the player can reach, picked from a road intersection. */
function roadPoint(rng, xs, ys) {
  return { x: rng.pick(xs), y: rng.pick(ys) };
}

/** Mission target points, laid out across the city by index. */
function missionSpots(rng) {
  const spots = [];
  const pts = [
    { x: 2380, y: 700 }, { x: 420, y: 1540 }, { x: 2660, y: 1820 },
    { x: 700, y: 420 }, { x: 2100, y: 1260 }, { x: 1540, y: 1820 },
    { x: 980, y: 980 }, { x: 2940, y: 420 }, { x: 420, y: 2100 },
    { x: 1820, y: 1540 }, { x: 1260, y: 700 }, { x: 2380, y: 140 },
  ];
  return rng.shuffle(pts).slice(0, 8).map((p, i) => ({ ...p, label: `stop ${i + 1}` }));
}

/** Create a fresh world. Nothing moves until startGame is called. */
export function createWorld(seed = 1) {
  const city = buildCity(seed);
  const rng = new Rng(seed * 7919 + 13);
  const spots = missionSpots(rng);

  const world = {
    seed,
    city,
    rng,
    time: 0,
    state: 'title', // 'title' | 'brief' | 'play' | 'busted' | 'wasted' | 'win' | 'failed'
    player: {
      x: 1540, y: 980, angle: -Math.PI / 2, hp: PLAYER.hp, money: 0,
      onFoot: true, car: null, speed: 0, bustTimer: 0, punchT: 0,
    },
    cars: [],
    peds: [],
    police: [],
    particles: [],
    pickups: [],
    wanted: 0,
    lastSeenT: -999,
    missionIndex: 0,
    mission: null,
    spots,
    camera: { x: 1540, y: 980 },
    shake: 0,
    message: '',
    messageT: 0,
    stats: { distance: 0, earned: 0 },
    flash: 0,
  };

  // Parked cars from the city's spawns.
  for (const s of city.carSpawns) {
    world.cars.push({
      id: world.cars.length, x: s.x, y: s.y, angle: s.angle, speed: 0,
      color: s.color, kind: 'parked', driver: false, road: null, dir: 1, targetSpeed: 0, stuckT: 0,
    });
  }
  // Cash pickups on the streets.
  for (let i = 0; i < 8; i++) {
    const p = roadPoint(rng, ROAD_X, ROAD_Y);
    world.pickups.push({ x: p.x + rng.range(-30, 30), y: p.y + rng.range(-30, 30), taken: false });
  }
  return world;
}

/** Show a transient message on the HUD. */
function say(world, text, seconds = 3) {
  world.message = text;
  world.messageT = seconds;
}

/** Spawn a burst of particles. */
function burst(world, x, y, color, n, speed = 160) {
  for (let i = 0; i < n; i++) {
    const a = world.rng.range(0, TAU);
    const s = world.rng.range(speed * 0.3, speed);
    world.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: world.rng.range(0.3, 0.8), maxLife: 0.8, color, size: world.rng.range(2, 5) });
  }
}

/** The current mission definition (or null when all are done). */
export function currentMissionDef(world) {
  return MISSIONS[world.missionIndex] ?? null;
}

/** Start (or restart) the current mission, placing its targets and timers. */
export function startMission(world) {
  const def = currentMissionDef(world);
  if (!def) {
    world.mission = null;
    return;
  }
  const m = { def, stage: 0, timer: def.time ?? null, collected: 0, targets: [], done: false };
  const spots = world.spots;
  if (def.id === 1) {
    m.targets = [{ x: 2380, y: 700, r: 60, label: 'drive here' }];
  } else if (def.id === 2) {
    m.targets = [{ x: 420, y: 1540, r: 60, label: 'deliver here' }];
  } else if (def.id === 3) {
    m.targets = world.city.heistCrates.map((c) => ({ x: c.x, y: c.y, r: 46, label: 'crate', crate: c }));
    world.wanted = Math.max(world.wanted, 1);
  } else if (def.id === 4) {
    m.targets = [spots[0], spots[1], spots[2]].map((s, i) => ({ x: s.x, y: s.y, r: 60, label: `drop-off ${i + 1}/3` }));
  } else if (def.id === 5) {
    world.wanted = 3;
    m.targets = [{ x: 700, y: 420, r: 70, label: 'safehouse' }];
  } else if (def.id === 6) {
    m.targets = [spots[3], spots[4], spots[5], spots[6]].map((s, i) => ({ x: s.x, y: s.y, r: 60, label: `checkpoint ${i + 1}/4` }));
  } else if (def.id === 7) {
    world.wanted = 4;
    m.targets = [];
  } else if (def.id === 8) {
    world.wanted = 5;
    m.targets = [{ x: world.city.yacht.x, y: world.city.yacht.y, r: 70, label: 'the yacht' }];
  }
  world.mission = m;
  world.state = 'brief';
  say(world, `${def.name} — ${def.brief}`, 4);
}

/** Begin a new game from the title screen. */
export function startGame(world) {
  const p = world.player;
  p.x = 1540;
  p.y = 980;
  p.angle = -Math.PI / 2;
  p.hp = PLAYER.hp;
  p.money = 0;
  p.onFoot = true;
  p.car = null;
  p.speed = 0;
  p.bustTimer = 0;
  world.wanted = 0;
  world.missionIndex = 0;
  world.state = 'play';
  world.gameOver = null;
  world.particles = [];
  for (const c of world.cars) {
    if (c.kind === 'player') c.kind = 'parked';
    c.speed = 0;
  }
  for (const c of world.city.crates) c.taken = false;
  for (const pk of world.pickups) pk.taken = false;
  startMission(world);
}

/** Complete the active mission: pay out and move to the next one. */
function completeMission(world) {
  const m = world.mission;
  if (!m || m.done) return;
  m.done = true;
  const def = m.def;
  world.player.money += def.payout;
  world.stats.earned += def.payout;
  burst(world, world.player.x, world.player.y, '#ffd166', 26, 220);
  say(world, `Mission complete: ${def.name}  +$${def.payout}`, 4);
  world.flash = 0.35;
  world.missionIndex++;
  if (world.missionIndex >= MISSIONS.length) {
    world.state = 'win';
    world.gameOver = 'win';
    return;
  }
  startMission(world);
}

/** Fail the active mission (timeout); the player can retry it. */
function failMission(world, why) {
  world.state = 'failed';
  world.failReason = why;
  say(world, why, 4);
}

/** Retry the current mission after a failure, a bust or being wasted. */
export function retryMission(world) {
  const p = world.player;
  p.hp = PLAYER.hp;
  p.bustTimer = 0;
  if (p.car) {
    p.car.kind = 'parked';
    p.car.speed = 0;
    p.car = null;
  }
  p.onFoot = true;
  p.x = 1540;
  p.y = 980;
  p.angle = -Math.PI / 2;
  world.wanted = 0;
  world.police = [];
  world.state = 'play';
  world.gameOver = null;
  for (const c of world.city.crates) c.taken = false;
  startMission(world);
}

/** Respawn after being busted or wasted, with a fine. */
export function respawn(world) {
  const p = world.player;
  const fine = world.gameOver === 'busted' ? BUST_FINE : WASTED_FINE;
  p.money = Math.max(0, p.money - fine);
  say(world, `You paid a $${fine} fine.`, 3);
  retryMission(world);
}

/** The player's current objective point (for the HUD arrow and minimap). */
export function missionTarget(world) {
  const m = world.mission;
  if (!m || m.done) return null;
  if (m.def.id === 7) return null; // survive: no single point
  if (m.def.id === 3) {
    const next = m.targets.find((t) => !t.crate.taken);
    return next ?? null;
  }
  return m.targets[m.stage] ?? null;
}

/** Wanted stars as a whole number for the HUD. */
export function wantedStars(world) {
  return Math.min(WANTED.max, Math.floor(world.wanted + 0.0001));
}

/** Raise the wanted level, capped at 5. */
function addWanted(world, n) {
  world.wanted = Math.min(WANTED.max, world.wanted + n);
  world.lastSeenT = world.time;
}

/** Spawn traffic cars and pedestrians near the player so the streets feel alive. */
function maintainCrowd(world) {
  const p = world.player;
  // Traffic: keep about 14 moving cars.
  const moving = world.cars.filter((c) => c.kind === 'traffic').length;
  if (moving < 14) {
    const rx = world.rng.pick(ROAD_X);
    const ry = world.rng.pick(ROAD_Y);
    const vertical = world.rng.chance(0.5);
    const x = vertical ? rx : clamp(rx + world.rng.range(-900, 900), 60, WORLD_W - 60);
    const y = vertical ? clamp(ry + world.rng.range(-900, 900), 60, WATER_Y - 60) : ry;
    if (dist(x, y, p.x, p.y) > 420) {
      world.cars.push({
        id: world.cars.length, x, y,
        angle: vertical ? (world.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (world.rng.chance(0.5) ? 0 : Math.PI),
        speed: world.rng.range(90, 150), color: world.rng.pick(['#ff5d5d', '#ffd166', '#4dc3ff', '#7dff9e', '#c77dff', '#ff9f43', '#e8ecff']),
        kind: 'traffic', driver: true,
        road: { vertical, line: vertical ? rx : ry }, dir: world.rng.chance(0.5) ? 1 : -1,
        targetSpeed: world.rng.range(100, 160), stuckT: 0,
      });
    }
  }
  // Pedestrians: keep about 22 walking.
  if (world.peds.length < 22) {
    const rx = world.rng.pick(ROAD_X);
    const ry = world.rng.pick(ROAD_Y);
    const x = rx + world.rng.range(-140, 140);
    const y = ry + world.rng.range(-140, 140);
    if (dist(x, y, p.x, p.y) > 380 && !world.city.isSolid(x, y)) {
      world.peds.push({ x, y, angle: world.rng.range(0, TAU), speed: world.rng.range(28, 55), down: 0, flee: 0 });
    }
  }
  // Cull the far away.
  world.cars = world.cars.filter((c) => c.kind !== 'traffic' || dist(c.x, c.y, p.x, p.y) < 1600);
  world.peds = world.peds.filter((pd) => dist(pd.x, pd.y, p.x, p.y) < 1400);
}

/** Keep the police count matched to the wanted level, spawning at the edges. */
function maintainPolice(world) {
  const stars = wantedStars(world);
  const want = WANTED.policePerStar[stars] ?? 0;
  const p = world.player;
  if (world.police.length < want) {
    const rx = world.rng.pick(ROAD_X);
    const ry = world.rng.pick(ROAD_Y);
    const x = rx + world.rng.range(-500, 500);
    const y = ry + world.rng.range(-500, 500);
    if (dist(x, y, p.x, p.y) > 500 && !world.city.isSolid(x, y)) {
      world.police.push({
        id: world.cars.length + world.police.length, x, y, angle: 0, speed: 0,
        color: '#e8ecff', kind: 'police', driver: true, road: null, dir: 1,
        targetSpeed: WANTED.policeSpeed[stars] ?? 300, stuckT: 0, siren: 0,
      });
    }
  }
  if (stars === 0) {
    world.police = world.police.filter((c) => dist(c.x, c.y, p.x, p.y) < 700);
  }
}

/** Steer a car toward a point, returning a steering input -1..1. */
function steerToward(car, tx, ty) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  return clamp(wrapAngle(desired - car.angle) * 1.8, -1, 1);
}

/** Move a car with arcade physics and building collision. Returns true on a hard hit. */
function moveCar(world, car, dt, throttle, steer) {
  const city = world.city;
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = { x: -forward.y, y: forward.x };
  // Steering only bites while moving.
  const steerPower = CAR.steer * clamp(Math.abs(car.speed) / 160, 0, 1);
  car.angle += steer * steerPower * Math.sign(car.speed || 1) * dt * (car.speed >= 0 ? 1 : -1);
  // Longitudinal acceleration.
  if (throttle > 0) car.speed += CAR.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 8) car.speed -= CAR.brake * dt;
    else car.speed += CAR.reverseAccel * throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
  }
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
  // Velocity: mostly forward, a little lateral (drift).
  const vx = forward.x * car.speed;
  const vy = forward.y * car.speed;
  const nx = car.x + vx * dt;
  const ny = car.y + vy * dt;
  // Two probe circles (front and rear axle) for collision.
  const fx = nx + forward.x * 15;
  const fy = ny + forward.y * 15;
  const bx = nx - forward.x * 15;
  const by = ny - forward.y * 15;
  const hit = city.circleSolid(fx, fy, 11) || city.circleSolid(bx, by, 11);
  if (hit) {
    const hard = Math.abs(car.speed) > 160;
    car.speed *= -0.25;
    car.x -= vx * dt * 0.5;
    car.y -= vy * dt * 0.5;
    return hard;
  }
  car.x = nx;
  car.y = ny;
  return false;
}

/** The player presses E: get in or out of a car. */
export function tryEnterExitCar(world) {
  const p = world.player;
  if (p.onFoot) {
    let best = null;
    let bestD = 70;
    for (const c of world.cars) {
      if (c.kind === 'police') continue;
      const d = dist(p.x, p.y, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) return;
    if (best.kind === 'traffic' && best.driver) {
      // Yank the driver out: a pedestrian appears, the law notices.
      world.peds.push({ x: best.x + 20, y: best.y + 10, angle: 0, speed: 60, down: 0, flee: 3 });
      best.driver = false;
      addWanted(world, 1);
      say(world, 'Car stolen! Wanted level up.', 2.5);
    } else if (best.kind === 'parked') {
      addWanted(world, 1);
      say(world, 'Car stolen! Wanted level up.', 2.5);
    }
    best.kind = 'player';
    p.car = best;
    p.onFoot = false;
    p.x = best.x;
    p.y = best.y;
    p.angle = best.angle;
  } else if (p.car) {
    const car = p.car;
    car.kind = 'parked';
    car.speed = 0;
    const side = { x: p.x - Math.sin(p.angle) * 30, y: p.y + Math.cos(p.angle) * 30 };
    p.x = world.city.isSolid(side.x, side.y) ? p.x + Math.sin(p.angle) * 30 : side.x;
    p.y = world.city.isSolid(side.x, side.y) ? p.y - Math.cos(p.angle) * 30 : side.y;
    p.onFoot = true;
    p.car = null;
    p.speed = 0;
  }
}

/** The player punches on foot: knock back a nearby pedestrian. */
export function punch(world) {
  const p = world.player;
  if (!p.onFoot || p.punchT > 0) return;
  p.punchT = 0.35;
  const reach = 34;
  const fx = p.x + Math.cos(p.angle) * 22;
  const fy = p.y + Math.sin(p.angle) * 22;
  for (const pd of world.peds) {
    if (pd.down > 0) continue;
    if (dist(fx, fy, pd.x, pd.y) < reach) {
      pd.down = 1.2;
      pd.flee = 3;
      burst(world, pd.x, pd.y, '#e8e6ff', 6, 90);
    }
  }
}

/** One simulation step. input is the shared Input object. */
export function updateWorld(world, input, dt) {
  dt = Math.min(dt, 0.05);
  world.time += dt;
  const p = world.player;
  const city = world.city;

  if (world.messageT > 0) world.messageT -= dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt * 2.2);
  if (world.flash > 0) world.flash = Math.max(0, world.flash - dt);

  if (world.state === 'title') {
    // Slow drift over the city behind the title screen.
    world.camera.x = 1600 + Math.cos(world.time * 0.05) * 500;
    world.camera.y = 1100 + Math.sin(world.time * 0.04) * 300;
    return;
  }
  if (world.state === 'brief') {
    if (input.wasPressed('Enter') || input.wasPressed('Space')) {
      world.state = 'play';
    }
    return;
  }
  if (world.state === 'busted' || world.state === 'wasted' || world.state === 'win' || world.state === 'failed') {
    if (input.wasPressed('KeyR')) {
      if (world.state === 'win') startGame(world);
      else if (world.state === 'failed') retryMission(world);
      else respawn(world);
    }
    return;
  }

  // --- Player ---
  if (p.punchT > 0) p.punchT -= dt;
  if (input.wasPressed('KeyE')) tryEnterExitCar(world);
  if (input.wasPressed('Space')) punch(world);

  const axis = input.axis();
  if (p.onFoot) {
    const run = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const len = Math.hypot(axis.x, axis.y);
    if (len > 0) {
      const nx = p.x + (axis.x / len) * speed * dt;
      const ny = p.y + (axis.y / len) * speed * dt;
      p.angle = Math.atan2(axis.y, axis.x);
      if (!city.circleSolid(nx, p.y, PLAYER.radius)) p.x = nx;
      if (!city.circleSolid(p.x, ny, PLAYER.radius)) p.y = ny;
      p.speed = speed;
      world.stats.distance += speed * dt;
    } else {
      p.speed = 0;
    }
  } else if (p.car) {
    const car = p.car;
    const throttle = axis.y < 0 ? 1 : axis.y > 0 ? -1 : 0;
    const steer = axis.x;
    const hard = moveCar(world, car, dt, throttle, steer);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    p.speed = car.speed;
    world.stats.distance += Math.abs(car.speed) * dt;
    if (hard) {
      world.shake = Math.min(0.5, world.shake + 0.3);
      burst(world, car.x, car.y, '#ff9f43', 8, 120);
      p.hp = Math.max(0, p.hp - 4);
      world.lastHitT = world.time;
    }
    // Skid particles when steering hard at speed.
    if (Math.abs(steer) > 0.6 && Math.abs(car.speed) > 300 && world.rng.chance(0.5)) {
      world.particles.push({ x: car.x - Math.cos(car.angle) * 18, y: car.y - Math.sin(car.angle) * 18, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#8f96b8', size: 4 });
    }
  }

  // --- Traffic ---
  for (const c of world.cars) {
    if (c.kind !== 'traffic') continue;
    // Follow the road centreline; turn at intersections sometimes.
    const road = c.road;
    if (!road) continue;
    const onLine = road.vertical ? c.x : c.y;
    const target = road.vertical ? road.line : road.line;
    const drift = target - onLine;
    c.angle += clamp(wrapAngle((road.vertical ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI)) - c.angle), -1.6 * dt, 1.6 * dt);
    c.angle += clamp(drift * 0.004, -0.5 * dt, 0.5 * dt);
    // Slow for a car ahead on the same road.
    let slow = false;
    for (const o of world.cars) {
      if (o === c || o.kind === 'parked') continue;
      const d = dist(c.x, c.y, o.x, o.y);
      if (d < 70) {
        const ahead = (o.x - c.x) * Math.cos(c.angle) + (o.y - c.y) * Math.sin(c.angle);
        if (ahead > 0 && ahead < 70) slow = true;
      }
    }
    const wantSpeed = slow ? 0 : c.targetSpeed;
    c.speed += clamp(wantSpeed - c.speed, -300 * dt, 200 * dt);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!city.circleSolid(nx, ny, 12)) {
      c.x = nx;
      c.y = ny;
    } else {
      c.stuckT += dt;
      if (c.stuckT > 1.2) {
        // Turn around at a dead end or blockage.
        c.dir *= -1;
        c.angle += Math.PI;
        c.stuckT = 0;
      }
    }
    // At an intersection, sometimes turn onto the crossing road.
    const cross = road.vertical ? ROAD_Y : ROAD_X;
    for (const line of cross) {
      const along = road.vertical ? c.y : c.x;
      if (Math.abs(along - line) < 4 && world.rng.chance(0.25)) {
        const vertical = !road.vertical;
        c.road = { vertical, line };
        c.dir = world.rng.chance(0.5) ? 1 : -1;
        break;
      }
    }
  }

  // --- Pedestrians ---
  for (const pd of world.peds) {
    if (pd.down > 0) {
      pd.down -= dt;
      continue;
    }
    if (pd.flee > 0) {
      pd.flee -= dt;
      pd.angle += 2.4 * dt;
    } else if (world.rng.chance(0.01)) {
      pd.angle = world.rng.range(0, TAU);
    }
    const nx = pd.x + Math.cos(pd.angle) * pd.speed * dt;
    const ny = pd.y + Math.sin(pd.angle) * pd.speed * dt;
    if (!city.circleSolid(nx, ny, 6)) {
      pd.x = nx;
      pd.y = ny;
    } else {
      pd.angle += Math.PI / 2;
    }
  }

  // --- Player car vs pedestrians and cars (collisions) ---
  if (!p.onFoot && p.car) {
    const car = p.car;
    for (const pd of world.peds) {
      if (pd.down > 0) continue;
      if (dist(car.x, car.y, pd.x, pd.y) < 30 && Math.abs(car.speed) > 40) {
        pd.down = 2.5;
        pd.flee = 4;
        addWanted(world, 1);
        burst(world, pd.x, pd.y, '#e8e6ff', 10, 140);
        world.shake = Math.min(0.5, world.shake + 0.25);
        say(world, 'You hit a pedestrian! Wanted level up.', 2.5);
      }
    }
    for (const o of world.cars) {
      if (o === car || o.kind === 'parked') continue;
      if (dist(car.x, car.y, o.x, o.y) < 40) {
        const push = 60;
        const a = Math.atan2(o.y - car.y, o.x - car.x);
        o.x += Math.cos(a) * push * dt * 10;
        o.y += Math.sin(a) * push * dt * 10;
        if (Math.abs(car.speed) > 200) {
          car.speed *= 0.6;
          world.shake = Math.min(0.5, world.shake + 0.2);
          burst(world, (car.x + o.x) / 2, (car.y + o.y) / 2, '#ff9f43', 6, 100);
        }
      }
    }
  }

  // --- Police ---
  maintainPolice(world);
  const stars = wantedStars(world);
  for (const cop of world.police) {
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < WANTED.sightRange) world.lastSeenT = world.time;
    const steer = steerToward(cop, p.x, p.y);
    const hard = moveCar(world, cop, dt, 1, steer);
    if (hard) {
      cop.speed *= 0.4;
      burst(world, cop.x, cop.y, '#8f96b8', 5, 90);
    }
    cop.siren = (cop.siren + dt * 6) % (Math.PI * 2);
    // Ram the player: damage and shake.
    if (d < 44) {
      if (!p.onFoot && p.car) {
        if (Math.abs(cop.speed) > 60 || Math.abs(p.car.speed) > 60) {
          p.hp = Math.max(0, p.hp - 6 * dt * 10);
          world.shake = Math.min(0.6, world.shake + 0.3);
        }
      } else if (p.onFoot) {
        p.bustTimer += dt;
        if (p.bustTimer > WANTED.bustTime) {
          world.state = 'busted';
          world.gameOver = 'busted';
          say(world, 'BUSTED by the Port Meridian PD.', 3);
        }
      }
    } else if (p.onFoot) {
      p.bustTimer = Math.max(0, p.bustTimer - dt);
    }
  }

  // --- Wanted decay ---
  if (stars > 0 && world.time - world.lastSeenT > WANTED.decayDelay) {
    world.wanted = Math.max(0, world.wanted - WANTED.decayRate * dt);
  }

  // --- Cash pickups ---
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      p.money += PICKUP_CASH;
      burst(world, pk.x, pk.y, '#7dff9e', 8, 110);
      say(world, `+$${PICKUP_CASH} street cash`, 1.5);
    }
  }

  // --- Missions ---
  const m = world.mission;
  if (m && !m.done && world.state === 'play') {
    if (m.timer !== null) {
      m.timer -= dt;
      if (m.timer <= 0) {
        if (m.def.id === 7) {
          completeMission(world);
        } else {
          failMission(world, `Out of time — ${m.def.name} failed. Press R to retry.`);
        }
      }
    }
    const target = missionTarget(world);
    if (target && dist(p.x, p.y, target.x, target.y) < target.r) {
      if (m.def.id === 3) {
        target.crate.taken = true;
        m.collected++;
        burst(world, target.x, target.y, '#ffd166', 14, 150);
        say(world, `Crate ${m.collected}/3 secured`, 2);
        if (m.collected >= 3) completeMission(world);
      } else if (m.def.id === 1) {
        if (!p.onFoot) completeMission(world);
      } else if (m.def.id === 4 || m.def.id === 6) {
        m.stage++;
        burst(world, target.x, target.y, '#ffd166', 14, 150);
        if (m.stage >= m.targets.length) completeMission(world);
        else say(world, `Next: ${m.targets[m.stage].label}`, 2);
      } else {
        completeMission(world);
      }
    }
  }

  // --- Health ---
  if (p.hp <= 0 && world.state === 'play') {
    world.state = 'wasted';
    world.gameOver = 'wasted';
    say(world, 'WASTED. The city chews you up.', 3);
  }

  // --- Particles ---
  for (const pt of world.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  world.particles = world.particles.filter((pt) => pt.life > 0);

  maintainCrowd(world);

  // --- Camera ---
  const tx = clamp(p.x, 640, WORLD_W - 640);
  const ty = clamp(p.y, 360, WORLD_H - 360);
  world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5);
  world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5);
}
