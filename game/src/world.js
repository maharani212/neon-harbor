// Neon Harbor — the game's rules and state, with no drawing and no browser in it.
// The player (on foot or in a car), traffic, pedestrians, police, the wanted level,
// missions, combat, pickups, fuel and the day/night clock. step() advances one fixed
// step and returns what happened as bit flags, so the caller can react without the
// world knowing about screens or sound. The autopilot (used by the screenshot scenes
// and the Node smoke test) drives by the same road graph the traffic uses.
import {
  BIKE, BULLET, CAR, COMBO, DAY_LENGTH, GAS_STATIONS, MISSIONS, PICKUPS,
  PEDS, PLAYER, POLICE, ROADBLOCK, STEP, TRAFFIC, WANTED, WORLD,
} from './config.js';
import {
  bfs, blockAt, createCity, districtAt, isOnRoad, nearestNode, nodeId, nodePos,
  randomRoadPoint,
} from './city.js';

export const EVENT_HIT = 1;
export const EVENT_PICKUP = 2;
export const EVENT_OBJECTIVE = 4;
export const EVENT_MISSION_DONE = 8;
export const EVENT_WASTED = 16;
export const EVENT_BUSTED = 32;
export const EVENT_SHOOT = 64;
export const EVENT_CRASH = 128;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
/** Smallest signed turn from `from` to `to`, in (-PI, PI]. */
function angleDiff(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
function circleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}
/** Push a circle out of a rectangle; returns the corrected {x, y} or null when clear. */
function pushOutCircleRect(cx, cy, r, rect) {
  const nx = clamp(cx, rect.x, rect.x + rect.w);
  const ny = clamp(cy, rect.y, rect.y + rect.h);
  let dx = cx - nx;
  let dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 === 0) {
    // Centre inside the rectangle: push out along the smallest penetration.
    const left = cx - rect.x;
    const right = rect.x + rect.w - cx;
    const top = cy - rect.y;
    const bottom = rect.y + rect.h - cy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rect.x - r, y: cy };
    if (m === right) return { x: rect.x + rect.w + r, y: cy };
    if (m === top) return { x: cx, y: rect.y - r };
    return { x: cx, y: rect.y + rect.h + r };
  }
  const d = Math.sqrt(d2);
  dx /= d;
  dy /= d;
  return { x: nx + dx * r, y: ny + dy * r };
}

const VEHICLE_COLORS = ['#c9d2e8', '#8fa0c9', '#e8b64c', '#7fb8a6', '#d98a7a', '#9a8fd0'];
const PED_COLORS = ['#ffd166', '#7dff9e', '#ff9ecf', '#8fd0ff', '#ffb37a'];

/** Mission target points, by intersection node (i, j). */
function at(i, j) {
  return nodePos(nodeId(i, j));
}

export function createWorld(random) {
  const city = createCity(random);

  // ---- state -------------------------------------------------------------
  const player = {
    x: 0, y: 0, angle: 0, speed: 0, onFoot: true,
    hp: PLAYER.hp, armor: 0, cash: 0, wanted: 0,
    weapon: 'pistol', hasLongshot: false, turboSeconds: 0,
    cooldown: 0, invuln: 0, bustTimer: 0, lastCrime: -99,
    car: null, // the vehicle the player is driving, or null
    district: 'NEON HARBOR',
  };
  const vehicles = [];
  const peds = [];
  const bullets = [];
  const particles = [];
  const pickups = [];
  const crates = [];
  const roadblocks = [];
  let missionCar = null; // the courier / Vex car for tail and escort missions
  let passenger = null; // the fare for mission 5 (a ped that rides along)

  const state = {
    player, vehicles, peds, bullets, particles, pickups, crates, roadblocks,
    city,
    elapsed: 0,
    timeOfDay: 0.12, // morning
    missionIndex: 0,
    objectiveIndex: 0,
    combo: 0,
    totalEarned: 0,
    allMissionsDone: false,
    missionTimer: 0,
    missionText: '',
    objectiveText: '',
    message: '',
    messageTimer: 0,
    distanceDriven: 0,
    shotsFired: 0,
    crimes: 0,
    // Autopilot bookkeeping (drives the player in the shot scenes and tests).
    pilot: { path: null, pathIndex: 0, targetNode: -1, stuckTimer: 0, reverseTimer: 0, lastX: 0, lastY: 0, repathTimer: 0 },
    // Per-frame navigation target, recomputed by the mission system.
    navTarget: null,
    navLabel: '',
    // Mission runtime.
    mission: null,
  };

  // ---- missions ----------------------------------------------------------
  // Each mission is a list of objectives. Positions are intersection nodes so
  // every target sits on a road the autopilot can actually reach.
  function buildMissions() {
    const p = (i, j) => at(i, j);
    return [
      {
        title: 'First Drop', pay: MISSIONS[0].pay,
        brief: 'Rook needs a package moved. Pick it up at the Docks, drop it at the Night Market.',
        objectives: [
          { type: 'goto', ...p(1, 1), r: 70, label: 'Pick up the package at the Docks' },
          { type: 'collect', ...p(1, 1), r: 46, label: 'Grab the package' },
          { type: 'goto', ...p(6, 1), r: 70, label: 'Drop it at the Night Market' },
        ],
      },
      {
        title: 'Night Market Dash', pay: MISSIONS[1].pay,
        brief: 'Vex timed you. Three checkpoints, ninety seconds. No excuses.',
        objectives: [
          { type: 'timed', ...p(5, 0), r: 70, time: 90, label: 'Checkpoint 1 of 3 — 90s on the clock' },
          { type: 'timed', ...p(7, 2), r: 70, time: 90, label: 'Checkpoint 2 of 3' },
          { type: 'timed', ...p(4, 1), r: 70, time: 90, label: 'Checkpoint 3 of 3' },
        ],
      },
      {
        title: 'Three Crates', pay: MISSIONS[2].pay,
        brief: 'Three crates went missing in the Industrial district. Bring them back.',
        objectives: [
          { type: 'crates', label: 'Collect 3 crates in the Industrial district', spots: [p(1, 5), p(2, 6), p(0, 6)], r: 48 },
        ],
      },
      {
        title: 'The Courier', pay: MISSIONS[3].pay,
        brief: 'Tail the courier. Stay close enough to see him, far enough that he never does.',
        objectives: [
          { type: 'tail', label: 'Tail the courier — stay 120–340 px back for 20s', duration: 20, minDist: 120, maxDist: 340 },
        ],
      },
      {
        title: 'Fare Play', pay: MISSIONS[4].pay,
        brief: 'A fare is waiting in Uptown. Pick them up, drop them at the Docks. No small talk.',
        objectives: [
          { type: 'goto', ...p(6, 3), r: 70, label: 'Pick up the fare in Uptown' },
          { type: 'goto', ...p(1, 1), r: 70, label: 'Drop the fare at the Docks' },
        ],
      },
      {
        title: 'Vex Escort', pay: MISSIONS[5].pay,
        brief: 'Vex is moving. Keep her car in sight all the way to the safehouse — and in one piece.',
        objectives: [
          { type: 'escort', label: 'Escort Vex to the safehouse — stay within 280 px', dest: p(3, 6), maxDist: 280 },
        ],
      },
      {
        title: 'Getaway', pay: MISSIONS[6].pay,
        brief: 'You are hot — three stars and climbing. Lose the cruisers, then vanish at the hideout.',
        objectives: [
          { type: 'escape', label: 'Lose the cops — get your heat below one star', below: 0.5 },
          { type: 'goto', ...p(2, 6), r: 70, label: 'Reach the hideout' },
        ],
      },
      {
        title: 'Five-Star Finale', pay: MISSIONS[7].pay,
        brief: 'One last job. Grab the Longshot, hit the rooftop mark, then outrun a five-star storm.',
        objectives: [
          { type: 'collect', ...p(4, 4), r: 46, label: 'Grab the Longshot at the plaza' },
          { type: 'goto', ...p(5, 5), r: 70, label: 'Reach the rooftop mark' },
          { type: 'escape', label: 'Outrun the five-star heat — get below one star', below: 0.5 },
          { type: 'goto', ...p(3, 6), r: 70, label: 'Reach the hideout' },
        ],
      },
    ];
  }
  const missionDefs = buildMissions();

  function missionPay(index) {
    const mult = 1 + Math.min(COMBO.max, COMBO.step * state.combo);
    return Math.round(missionDefs[index].pay * mult);
  }

  function setMessage(text, seconds) {
    state.message = text;
    state.messageTimer = seconds;
  }

  // ---- spawning ----------------------------------------------------------
  function addVehicle(kind, x, y, angle, driver) {
    const spec = kind === 'bike' ? BIKE : CAR;
    const v = {
      kind, x, y, angle, speed: 0, driver,
      color: driver === 'police' ? '#e8ecf5' : VEHICLE_COLORS[Math.floor(random() * VEHICLE_COLORS.length)],
      hp: 100, fuel: spec.fuelMax, active: true,
      path: null, pathIndex: 0, targetNode: -1, retargetTimer: random.range(4, TRAFFIC.retargetSeconds),
      stuckTimer: 0, reverseTimer: 0, lastX: x, lastY: y, cruise: TRAFFIC.speed + random.range(-TRAFFIC.speedJitter, TRAFFIC.speedJitter),
      repathTimer: 0, siren: 0, isPlayer: false,
    };
    vehicles.push(v);
    return v;
  }

  function addPed(x, y) {
    const p = {
      x, y, angle: random.range(0, TAU), speed: 0,
      targetX: x, targetY: y, color: PED_COLORS[Math.floor(random() * PED_COLORS.length)],
      down: 0, fleeing: false, active: true, retargetTimer: random.range(2, 8),
    };
    peds.push(p);
    return p;
  }

  function addPickup(kind, x, y) {
    pickups.push({ kind, x, y, active: true, respawnTimer: 0 });
  }

  function addBullet(x, y, angle, damage, fromPlayer) {
    bullets.push({
      x, y, vx: Math.cos(angle) * BULLET.speed, vy: Math.sin(angle) * BULLET.speed,
      life: BULLET.life, damage, fromPlayer, active: true,
    });
  }

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random.range(0, TAU);
      const s = random.range(speed * 0.3, speed);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: random.range(0.3, 0.7), maxLife: 0.7, color, size: random.range(2, 5), active: true });
    }
  }

  function nearestParkedCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of vehicles) {
      if (!v.active || v.driver !== 'parked') continue;
      const d = dist(player.x, player.y, v.x, v.y);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  function nearestPump(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const pump of city.pumps) {
      const d = dist(player.x, player.y, pump.x, pump.y);
      if (d < bestD) {
        bestD = d;
        best = pump;
      }
    }
    return best;
  }

  function addWanted(amount, reason) {
    if (amount <= 0) return;
    player.wanted = clamp(player.wanted + amount, 0, WANTED.max);
    player.lastCrime = state.elapsed;
    state.crimes += 1;
    void reason;
  }

  function damagePlayer(amount, source) {
    if (player.invuln > 0 || player.hp <= 0) return;
    let rest = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, rest);
      player.armor -= absorbed;
      rest -= absorbed;
    }
    player.hp = Math.max(0, player.hp - rest);
    player.invuln = 0.6;
    void source;
  }

  // ---- missions: start / advance -----------------------------------------
  function startMission(index) {
    state.missionIndex = index;
    state.objectiveIndex = 0;
    state.allMissionsDone = false;
    const def = missionDefs[index];
    state.mission = { def, objective: def.objectives[0], progress: 0, timer: 0, failTimer: 0 };
    state.missionTimer = 0;
    crates.length = 0;
    missionCar = null;
    passenger = null;
    const obj = state.mission.objective;
    state.missionText = `${index + 1}. ${def.title}`;
    state.objectiveText = obj.label;
    if (obj.type === 'crates') {
      for (const spot of obj.spots) crates.push({ x: spot.x, y: spot.y, taken: false, active: true });
    }
    if (obj.type === 'tail') {
      const start = at(2, 2);
      missionCar = addVehicle('car', start.x, start.y, 0, 'mission');
      missionCar.cruise = 190;
      missionCar.path = [nodeId(2, 2), nodeId(5, 2), nodeId(5, 4), nodeId(2, 4)];
      missionCar.pathIndex = 1;
      missionCar.loopPath = true;
      missionCar.color = '#ffb020';
    }
    if (obj.type === 'escort') {
      const start = at(2, 2);
      missionCar = addVehicle('car', start.x, start.y, 0, 'mission');
      missionCar.cruise = 170;
      const dest = nearestNode(obj.dest.x, obj.dest.y);
      missionCar.path = bfs(nearestNode(start.x, start.y), dest) || [nearestNode(start.x, start.y)];
      missionCar.pathIndex = 1;
      missionCar.color = '#ff4fd8';
      missionCar.hp = 100;
    }
    if (index === 6) player.wanted = 3;
    updateNavTarget();
    setMessage(`${def.title} — ${def.brief}`, 6);
  }

  function advanceObjective() {
    const def = state.mission.def;
    state.objectiveIndex += 1;
    if (state.objectiveIndex >= def.objectives.length) {
      completeMission();
      return;
    }
    const obj = def.objectives[state.objectiveIndex];
    state.mission.objective = obj;
    state.mission.progress = 0;
    state.mission.timer = 0;
    state.mission.failTimer = 0;
    state.objectiveText = obj.label;
    if (obj.type === 'crates') {
      crates.length = 0;
      for (const spot of obj.spots) crates.push({ x: spot.x, y: spot.y, taken: false, active: true });
    }
    if (obj.type === 'tail' && !missionCar) {
      const start = at(2, 2);
      missionCar = addVehicle('car', start.x, start.y, 0, 'mission');
      missionCar.cruise = 190;
      missionCar.path = [nodeId(2, 2), nodeId(5, 2), nodeId(5, 4), nodeId(2, 4)];
      missionCar.pathIndex = 1;
      missionCar.loopPath = true;
      missionCar.color = '#ffb020';
    }
    if (obj.type === 'escort' && !missionCar) {
      const start = at(2, 2);
      missionCar = addVehicle('car', start.x, start.y, 0, 'mission');
      missionCar.cruise = 170;
      const dest = nearestNode(obj.dest.x, obj.dest.y);
      missionCar.path = bfs(nearestNode(start.x, start.y), dest) || [nearestNode(start.x, start.y)];
      missionCar.pathIndex = 1;
      missionCar.color = '#ff4fd8';
      missionCar.hp = 100;
    }
    if (state.missionIndex === 7 && state.objectiveIndex === 2) addWanted(5, 'finale');
    updateNavTarget();
  }

  function completeMission() {
    const pay = missionPay(state.missionIndex);
    player.cash += pay;
    state.totalEarned += pay;
    state.combo += 1;
    setMessage(`Mission complete — $${pay}  (combo x${(1 + Math.min(COMBO.max, COMBO.step * state.combo)).toFixed(2)})`, 5);
    const next = state.missionIndex + 1;
    if (next >= missionDefs.length) {
      state.allMissionsDone = true;
      state.missionText = 'All missions complete';
      state.objectiveText = 'Free roam — Port Meridian is yours.';
      state.mission = null;
      state.navTarget = null;
      return 'done';
    }
    startMission(next);
    return 'done';
  }

  function failMission(why) {
    state.combo = 0;
    setMessage(`Mission failed — ${why}. Try again.`, 5);
    startMission(state.missionIndex);
    return 'failed';
  }

  function updateNavTarget() {
    const m = state.mission;
    if (!m) {
      state.navTarget = null;
      state.navLabel = '';
      return;
    }
    const obj = m.objective;
    if (obj.type === 'goto' || obj.type === 'timed' || obj.type === 'collect') {
      state.navTarget = { x: obj.x, y: obj.y };
      state.navLabel = obj.label;
    } else if (obj.type === 'crates') {
      const next = crates.find((c) => c.active && !c.taken);
      state.navTarget = next ? { x: next.x, y: next.y } : null;
      state.navLabel = obj.label;
    } else if ((obj.type === 'tail' || obj.type === 'escort') && missionCar) {
      // Aim behind the target car, not at its bumper, so the pilot holds formation.
      const behind = 210;
      state.navTarget = {
        x: missionCar.x - Math.cos(missionCar.angle) * behind,
        y: missionCar.y - Math.sin(missionCar.angle) * behind,
      };
      state.navLabel = obj.label;
    } else if (obj.type === 'escape') {
      // Run for the hideout's road while the heat is on; the marker is the hideout.
      state.navTarget = { x: at(2, 6).x, y: at(2, 6).y };
      state.navLabel = obj.label;
    } else {
      state.navTarget = null;
      state.navLabel = obj.label;
    }
  }

  // ---- reset -------------------------------------------------------------
  function reset() {
    vehicles.length = 0;
    peds.length = 0;
    bullets.length = 0;
    particles.length = 0;
    pickups.length = 0;
    crates.length = 0;
    roadblocks.length = 0;
    missionCar = null;
    passenger = null;
    state.elapsed = 0;
    state.timeOfDay = 0.12;
    state.combo = 0;
    state.totalEarned = 0;
    state.allMissionsDone = false;
    state.distanceDriven = 0;
    state.shotsFired = 0;
    state.crimes = 0;
    state.message = '';
    state.messageTimer = 0;
    state.pilot.path = null;
    state.pilot.pathIndex = 0;
    state.pilot.targetNode = -1;
    state.pilot.stuckTimer = 0;
    state.pilot.reverseTimer = 0;
    state.pilot.repathTimer = 0;

    // Player starts on foot at the plaza, next to a parked car to steal.
    const start = at(3, 3);
    player.x = start.x;
    player.y = start.y + 60;
    player.angle = -Math.PI / 2;
    player.speed = 0;
    player.onFoot = true;
    player.hp = PLAYER.hp;
    player.armor = 0;
    player.cash = 0;
    player.wanted = 0;
    player.weapon = 'pistol';
    player.hasLongshot = false;
    player.turboSeconds = 0;
    player.cooldown = 0;
    player.invuln = 0;
    player.bustTimer = 0;
    player.lastCrime = -99;
    player.car = null;
    player.district = districtAt(player.x, player.y);

    // A parked car right beside the player, plus a bike a block away.
    addVehicle('car', start.x + 40, start.y + 60, 0, 'parked');
    addVehicle('bike', at(4, 3).x, at(4, 3).y, Math.PI / 2, 'parked');
    addVehicle('car', at(2, 4).x + 20, at(2, 4).y, 0, 'parked');

    // Traffic.
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const p = randomRoadPoint(random);
      const v = addVehicle(random.chance(0.15) ? 'bike' : 'car', p.x, p.y, random.range(0, TAU), 'traffic');
      v.angle = random.range(0, TAU);
    }
    // Pedestrians on the sidewalks.
    for (let i = 0; i < PEDS.count; i += 1) {
      const p = randomRoadPoint(random);
      addPed(p.x + random.range(-40, 40), p.y + random.range(-40, 40));
    }
    // Pickups: one of each kind, spread out.
    addPickup('health', at(1, 3).x, at(1, 3).y);
    addPickup('armor', at(5, 1).x, at(5, 1).y);
    addPickup('longshot', at(4, 4).x, at(4, 4).y);
    addPickup('turbo', at(6, 5).x, at(6, 5).y);
    addPickup('health', at(3, 6).x, at(3, 6).y);
    addPickup('turbo', at(0, 4).x, at(0, 4).y);

    startMission(0);
  }

  // ---- driving -----------------------------------------------------------
  let events = 0;

  /** Steer/throttle that drives a car toward (tx, ty) at `cruise` speed. */
  function driveToward(v, tx, ty, cruise, spec) {
    const desired = angleTo(v.x, v.y, tx, ty);
    const diff = angleDiff(v.angle, desired);
    const steer = clamp(diff * 2.4, -1, 1);
    const targetSpeed = Math.abs(diff) > 0.5 ? cruise * 0.35 : cruise;
    let throttle = 0;
    if (v.speed < targetSpeed) throttle = 1;
    else if (v.speed > targetSpeed + 25) throttle = -0.7;
    return { throttle, steer };
  }

  /** A vehicle straight ahead of `v` within `range`, or null. */
  function carAhead(v, range) {
    const fx = Math.cos(v.angle);
    const fy = Math.sin(v.angle);
    for (const o of vehicles) {
      if (o === v || !o.active) continue;
      const dx = o.x - v.x;
      const dy = o.y - v.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > range || d === 0) continue;
      const ahead = (dx * fx + dy * fy) / d;
      if (ahead > 0.86) return o;
    }
    return null;
  }

  /** One physics step for a car/bike: throttle, steering, drag, walls, other cars. */
  function driveVehicle(v, dt, throttle, steer, handbrake) {
    const spec = v.kind === 'bike' ? BIKE : CAR;
    const onRoad = isOnRoad(v.x, v.y);
    const drag = onRoad ? spec.drag : spec.offroadDrag;
    const boosted = v.driver === 'player' && player.turboSeconds > 0;
    const maxF = boosted ? spec.maxSpeed * 1.3 : spec.maxSpeed;

    if (throttle > 0) {
      const canFuel = v.driver !== 'player' || v.fuel > 0;
      if (canFuel) v.speed += throttle * spec.accel * (boosted ? 1.6 : 1) * dt;
    } else if (throttle < 0) {
      if (v.speed > 5) v.speed += throttle * spec.brake * dt;
      else v.speed += throttle * spec.reverseAccel * dt;
    }
    if (handbrake) v.speed *= Math.max(0, 1 - 4.5 * dt);
    v.speed -= v.speed * drag * dt;
    v.speed = clamp(v.speed, -spec.maxReverse, maxF);

    const authority = spec.minTurnAuthority + (1 - spec.minTurnAuthority) * Math.min(1, Math.abs(v.speed) / 100);
    v.angle += steer * spec.turnRate * authority * dt * (v.speed >= 0 ? 1 : -1);

    const nx = v.x + Math.cos(v.angle) * v.speed * dt;
    const ny = v.y + Math.sin(v.angle) * v.speed * dt;
    v.x = nx;
    v.y = ny;

    // Walls: push out of solid rectangles, bleed speed on impact.
    const r = spec.radius;
    for (const s of city.solids) {
      if (v.x + r < s.x || v.x - r > s.x + s.w || v.y + r < s.y || v.y - r > s.y + s.h) continue;
      const out = pushOutCircleRect(v.x, v.y, r, s);
      if (!out) continue;
      const impact = Math.abs(v.speed);
      v.x = out.x;
      v.y = out.y;
      if (impact > 140) {
        v.speed *= 0.35;
        v.hp = Math.max(0, v.hp - impact * 0.03);
        if (v.driver === 'player') {
          damagePlayer(impact * 0.02, 'crash');
          events |= EVENT_CRASH;
          addParticles(v.x, v.y, '#ffb020', 8, 160);
        }
      } else {
        v.speed *= 0.65;
      }
    }
    v.x = clamp(v.x, r, WORLD.size - r);
    v.y = clamp(v.y, r, WORLD.size - r);

    // Other cars: soft push-apart, and a hard hit hurts.
    for (const o of vehicles) {
      if (o === v || !o.active) continue;
      const dx = o.x - v.x;
      const dy = o.y - v.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const min = spec.radius + (o.kind === 'bike' ? BIKE.radius : CAR.radius) - 4;
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2;
      const ux = dx / d;
      const uy = dy / d;
      v.x -= ux * push;
      v.y -= uy * push;
      o.x += ux * push;
      o.y += uy * push;
      const closing = Math.abs(v.speed - o.speed);
      if (closing > 160) {
        v.speed *= 0.6;
        o.speed *= 0.6;
        if (v.driver === 'player' || o.driver === 'player') {
          damagePlayer(closing * 0.02, 'ram');
          events |= EVENT_CRASH;
          if ((v.driver === 'police' || o.driver === 'police')) addWanted(WANTED.ramPolice, 'ram police');
          addParticles((v.x + o.x) / 2, (v.y + o.y) / 2, '#ffb020', 6, 140);
        }
        if (o.driver === 'police') o.hp = Math.max(0, o.hp - closing * 0.02);
        if (v.driver === 'police') v.hp = Math.max(0, v.hp - closing * 0.02);
      }
    }
  }

  // ---- player ------------------------------------------------------------
  function updatePlayer(dt, c, harmless) {
    if (player.cooldown > 0) player.cooldown -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    if (player.turboSeconds > 0) player.turboSeconds -= dt;

    const throttle = c.throttle !== undefined ? c.throttle : (c.up ? 1 : 0) + (c.down ? -1 : 0);
    const steer = c.steer !== undefined ? c.steer : (c.left ? -1 : 0) + (c.right ? 1 : 0);

    if (player.onFoot) {
      const mx = c.moveX !== undefined ? c.moveX : (c.right ? 1 : 0) - (c.left ? 1 : 0);
      const my = c.moveY !== undefined ? c.moveY : (c.down ? 1 : 0) - (c.up ? 1 : 0);
      const len = Math.sqrt(mx * mx + my * my);
      if (len > 0) {
        const nx = player.x + (mx / len) * PLAYER.walkSpeed * dt;
        const ny = player.y + (my / len) * PLAYER.walkSpeed * dt;
        player.angle = Math.atan2(my, mx);
        // Walk around buildings.
        let blocked = false;
        for (const s of city.solids) {
          if (circleRect(nx, ny, PLAYER.radius, s)) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          player.x = clamp(nx, PLAYER.radius, WORLD.size - PLAYER.radius);
          player.y = clamp(ny, PLAYER.radius, WORLD.size - PLAYER.radius);
        }
      }
      if (c.enter) {
        const car = nearestParkedCar(PLAYER.enterRadius);
        if (car) {
          enterCar(car);
          if (!harmless) addWanted(WANTED.stealCar, 'steal car');
        }
      }
    } else if (player.car) {
      const car = player.car;
      const spec = car.kind === 'bike' ? BIKE : CAR;
      driveVehicle(car, dt, throttle, steer, !!c.handbrake);
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      player.speed = car.speed;
      state.distanceDriven += Math.abs(car.speed) * dt;
      // Fuel.
      if (throttle > 0 && car.fuel > 0) {
        car.fuel = Math.max(0, car.fuel - spec.fuelDrain * dt * (0.5 + Math.abs(car.speed) / spec.maxSpeed));
      }
      const pump = nearestPump(64);
      if (pump && Math.abs(car.speed) < 15) {
        car.fuel = Math.min(spec.fuelMax, car.fuel + spec.fuelRefill * dt);
      }
      if (c.enter) exitCar();
      if (car.hp <= 0) {
        // The ride is wrecked: out on foot.
        addParticles(car.x, car.y, '#ff5c5c', 14, 220);
        car.active = false;
        player.car = null;
        player.onFoot = true;
        player.x = car.x + 30;
        player.y = car.y + 30;
        setMessage('Your ride is wrecked.', 3);
      }
    }

    // Shooting (on foot or from the car): aim at the pointer, or straight ahead.
    if (c.shoot && player.cooldown <= 0 && !harmless) {
      const range = player.weapon === 'longshot' ? PLAYER.longshotRange : PLAYER.pistolRange;
      const damage = player.weapon === 'longshot' ? PLAYER.longshotDamage : PLAYER.pistolDamage;
      const cooldown = player.weapon === 'longshot' ? PLAYER.longshotCooldown : PLAYER.pistolCooldown;
      let angle = player.angle;
      if (c.aimX !== undefined && c.aimY !== undefined) angle = angleTo(player.x, player.y, c.aimX, c.aimY);
      const gx = player.x + Math.cos(angle) * 26;
      const gy = player.y + Math.sin(angle) * 26;
      addBullet(gx, gy, angle, damage, true);
      player.cooldown = cooldown;
      state.shotsFired += 1;
      events |= EVENT_SHOOT;
      addParticles(gx, gy, '#fff3b0', 3, 90);
      addWanted(WANTED.shoot, 'shoot');
      const nearPolice = vehicles.some((v) => v.active && v.driver === 'police' && dist(player.x, player.y, v.x, v.y) < WANTED.seeRadius);
      if (nearPolice) addWanted(WANTED.shootNearPolice, 'shoot near police');
      void range;
    }
  }

  function enterCar(car) {
    car.driver = 'player';
    car.isPlayer = true;
    player.car = car;
    player.onFoot = false;
    player.x = car.x;
    player.y = car.y;
    player.angle = car.angle;
  }

  function exitCar() {
    const car = player.car;
    if (!car) return;
    car.driver = 'parked';
    car.isPlayer = false;
    player.car = null;
    player.onFoot = true;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.speed = 0;
  }

  // ---- traffic and mission cars ------------------------------------------
  function updateTraffic(dt) {
    for (const v of vehicles) {
      if (!v.active || (v.driver !== 'traffic' && v.driver !== 'mission')) continue;
      // Follow the road graph toward a destination.
      if (!v.path || v.pathIndex >= v.path.length) {
        if (v.loopPath) {
          // The courier loops its circuit forever.
          v.pathIndex = 0;
        } else if (v.driver === 'mission') {
          // An escort target holds at its destination; it never wanders off.
          v.path = null;
          v.pathIndex = 0;
        } else {
          const dest = Math.floor(random() * 64);
          const path = bfs(nearestNode(v.x, v.y), dest);
          if (path && path.length > 1) {
            v.path = path;
            v.pathIndex = 1;
          } else {
            v.path = null;
            v.pathIndex = 0;
          }
          v.retargetTimer = TRAFFIC.retargetSeconds;
        }
      }
      v.retargetTimer -= dt;
      if (v.retargetTimer <= 0) {
        v.path = null;
        v.retargetTimer = TRAFFIC.retargetSeconds;
      }
      let target = null;
      if (v.path && v.pathIndex < v.path.length) {
        target = nodePos(v.path[v.pathIndex]);
        if (dist(v.x, v.y, target.x, target.y) < 34) {
          v.pathIndex += 1;
          if (v.pathIndex < v.path.length) target = nodePos(v.path[v.pathIndex]);
          else target = null;
        }
      }
      let control = { throttle: 0, steer: 0 };
      if (target) control = driveToward(v, target.x, target.y, v.cruise, v.kind === 'bike' ? BIKE : CAR);
      // Do not rear-end the car ahead.
      if (carAhead(v, 78)) control.throttle = Math.min(control.throttle, -0.7);
      driveVehicle(v, dt, control.throttle, control.steer, false);
      // Stuck detection: reverse out, then re-path.
      const moved = dist(v.x, v.y, v.lastX, v.lastY);
      if (Math.abs(v.speed) < 8 && control.throttle > 0) v.stuckTimer += dt;
      else v.stuckTimer = 0;
      if (v.stuckTimer > 1.2) {
        v.reverseTimer = 0.8;
        v.stuckTimer = 0;
      }
      if (v.reverseTimer > 0) {
        v.reverseTimer -= dt;
        driveVehicle(v, dt, -1, -control.steer, false);
        if (v.reverseTimer <= 0) v.path = null;
      }
      v.lastX = v.x;
      v.lastY = v.y;
      if (v.hp <= 0) {
        addParticles(v.x, v.y, '#ff5c5c', 12, 200);
        v.active = false;
        if (missionCar === v) missionCar = null;
      }
    }
  }

  // ---- police -------------------------------------------------------------
  function policeCountWanted() {
    return POLICE.countByWanted[clamp(Math.floor(player.wanted), 0, WANTED.max)];
  }

  function updatePolice(dt, harmless) {
    // Spawn / despawn cruisers to match the heat.
    const want = harmless ? 0 : policeCountWanted();
    let have = 0;
    for (const v of vehicles) if (v.active && v.driver === 'police') have += 1;
    if (have < want) {
      // Spawn on a road node a little way from the player.
      for (let tries = 0; tries < 12 && have < want; tries += 1) {
        const node = Math.floor(random() * 64);
        const p = nodePos(node);
        const d = dist(player.x, player.y, p.x, p.y);
        if (d < POLICE.spawnRadius * 0.6 || d > POLICE.spawnRadius * 1.6) continue;
        const v = addVehicle('car', p.x, p.y, random.range(0, TAU), 'police');
        v.cruise = POLICE.speed;
        v.color = '#e8ecf5';
        have += 1;
      }
    }
    if (have > want) {
      for (const v of vehicles) {
        if (have <= want) break;
        if (v.active && v.driver === 'police') {
          v.active = false;
          have -= 1;
        }
      }
    }

    // Chase the player.
    for (const v of vehicles) {
      if (!v.active || v.driver !== 'police') continue;
      if (harmless) continue;
      v.repathTimer -= dt;
      if (v.repathTimer <= 0 || !v.path || v.pathIndex >= v.path.length) {
        const path = bfs(nearestNode(v.x, v.y), nearestNode(player.x, player.y));
        if (path && path.length > 1) {
          v.path = path;
          v.pathIndex = 1;
        }
        v.repathTimer = 0.8;
      }
      let target = null;
      if (v.path && v.pathIndex < v.path.length) {
        target = nodePos(v.path[v.pathIndex]);
        if (dist(v.x, v.y, target.x, target.y) < 34) {
          v.pathIndex += 1;
          if (v.pathIndex < v.path.length) target = nodePos(v.path[v.pathIndex]);
        }
      }
      // Close in: aim at the player, not the road, once the gap is small.
      const dPlayer = dist(v.x, v.y, player.x, player.y);
      let control;
      if (dPlayer < 190) {
        control = driveToward(v, player.x, player.y, POLICE.speed, CAR);
      } else if (target) {
        control = driveToward(v, target.x, target.y, POLICE.speed, CAR);
      } else {
        control = { throttle: 0, steer: 0 };
      }
      if (carAhead(v, 60) && dPlayer > 120) control.throttle = Math.min(control.throttle, -0.5);
      driveVehicle(v, dt, control.throttle, control.steer, false);
      v.siren = (v.siren + dt) % 1;
      // Ram: a cruiser on the player's bumper hurts.
      if (dPlayer < CAR.radius + 16 && Math.abs(v.speed) > 60) {
        damagePlayer(POLICE.ramDamage * dt * 3, 'ram');
        events |= EVENT_HIT;
      }
      // Bust: a cruiser sitting on a slow player ends the run.
      if (dPlayer < POLICE.bustRadius && Math.abs(player.speed) < POLICE.bustMaxSpeed && !player.onFoot) {
        player.bustTimer += dt;
        if (player.bustTimer >= POLICE.bustSeconds) events |= EVENT_BUSTED;
      } else if (dPlayer < POLICE.bustRadius && player.onFoot) {
        player.bustTimer += dt;
        if (player.bustTimer >= POLICE.bustSeconds) events |= EVENT_BUSTED;
      } else {
        player.bustTimer = Math.max(0, player.bustTimer - dt * 2);
      }
      // Give up when far away and cold.
      if (player.wanted < 0.5 && dPlayer > POLICE.despawnRadius) v.active = false;
      if (v.hp <= 0) {
        addParticles(v.x, v.y, '#ff5c5c', 12, 200);
        v.active = false;
      }
    }

    // Roadblocks: once the heat hits three stars, cruisers park across the road ahead.
    if (!harmless && player.wanted >= ROADBLOCK.minWanted) {
      const active = roadblocks.filter((r) => r.active).length;
      if (active === 0) {
        const ahead = {
          x: player.x + Math.cos(player.angle) * ROADBLOCK.ahead,
          y: player.y + Math.sin(player.angle) * ROADBLOCK.ahead,
        };
        const node = nearestNode(ahead.x, ahead.y);
        const pos = nodePos(node);
        const horizontal = Math.abs(Math.cos(player.angle)) > Math.abs(Math.sin(player.angle));
        const block = { active: true, x: pos.x, y: pos.y, cars: [] };
        for (let i = 0; i < ROADBLOCK.cars; i += 1) {
          const off = (i - (ROADBLOCK.cars - 1) / 2) * 52;
          const cx = horizontal ? pos.x : pos.x + off;
          const cy = horizontal ? pos.y + off : pos.y;
          const car = addVehicle('car', cx, cy, horizontal ? Math.PI / 2 : 0, 'roadblock');
          car.color = '#e8ecf5';
          block.cars.push(car);
        }
        roadblocks.push(block);
        setMessage('Roadblock ahead!', 3);
      }
    }
    for (const block of roadblocks) {
      if (!block.active) continue;
      if (player.wanted < ROADBLOCK.clearBelow) {
        block.active = false;
        for (const car of block.cars) car.active = false;
        continue;
      }
      // A roadblock wakes up when the player gets close.
      if (dist(player.x, player.y, block.x, block.y) < 200) {
        for (const car of block.cars) {
          if (car.active && car.driver === 'roadblock') car.driver = 'police';
        }
      }
    }
  }

  // ---- pedestrians --------------------------------------------------------
  function updatePeds(dt, harmless) {
    for (const p of peds) {
      if (!p.active) continue;
      if (p.down > 0) {
        p.down -= dt;
        continue;
      }
      // Flee from a fast car or a gunshot nearby.
      let fleeX = 0;
      let fleeY = 0;
      let danger = false;
      for (const v of vehicles) {
        if (!v.active || Math.abs(v.speed) < 60) continue;
        const d = dist(p.x, p.y, v.x, v.y);
        if (d < PEDS.fleeRadius) {
          danger = true;
          fleeX += (p.x - v.x) / (d || 1);
          fleeY += (p.y - v.y) / (d || 1);
        }
      }
      p.fleeing = danger;
      let tx = p.targetX;
      let ty = p.targetY;
      let speed = PEDS.speed;
      if (danger) {
        tx = p.x + fleeX * 100;
        ty = p.y + fleeY * 100;
        speed = PEDS.speed * 1.9;
      }
      p.retargetTimer -= dt;
      if (p.retargetTimer <= 0 || dist(p.x, p.y, tx, ty) < 18) {
        const np = randomRoadPoint(random);
        p.targetX = np.x;
        p.targetY = np.y;
        p.retargetTimer = random.range(3, 9);
        tx = p.targetX;
        ty = p.targetY;
      }
      const a = angleTo(p.x, p.y, tx, ty);
      p.angle = a;
      p.x = clamp(p.x + Math.cos(a) * speed * dt, 8, WORLD.size - 8);
      p.y = clamp(p.y + Math.sin(a) * speed * dt, 8, WORLD.size - 8);
      // Run over by a car.
      for (const v of vehicles) {
        if (!v.active || Math.abs(v.speed) < 30) continue;
        if (dist(p.x, p.y, v.x, v.y) < (v.kind === 'bike' ? BIKE.radius : CAR.radius) + 10) {
          p.down = 2.5;
          addParticles(p.x, p.y, '#ffd166', 6, 120);
          if (v.driver === 'player' && !harmless) {
            addWanted(WANTED.hitPed, 'hit pedestrian');
            events |= EVENT_HIT;
          }
          break;
        }
      }
    }
  }

  // ---- bullets ------------------------------------------------------------
  function updateBullets(dt, harmless) {
    for (const b of bullets) {
      if (!b.active) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.size || b.y > WORLD.size) {
        b.active = false;
        continue;
      }
      // Walls stop bullets.
      let stopped = false;
      for (const s of city.solids) {
        if (b.x >= s.x && b.x <= s.x + s.w && b.y >= s.y && b.y <= s.y + s.h) {
          stopped = true;
          break;
        }
      }
      if (stopped) {
        addParticles(b.x, b.y, '#ffe066', 3, 80);
        b.active = false;
        continue;
      }
      // Vehicles.
      for (const v of vehicles) {
        if (!v.active) continue;
        if (b.fromPlayer && v.driver === 'player') continue;
        const r = (v.kind === 'bike' ? BIKE.radius : CAR.radius) + BULLET.radius;
        if (dist(b.x, b.y, v.x, v.y) < r) {
          v.hp = Math.max(0, v.hp - b.damage);
          addParticles(b.x, b.y, '#ff5c5c', 5, 120);
          b.active = false;
          if (b.fromPlayer && v.driver === 'police' && !harmless) addWanted(WANTED.shootNearPolice, 'shot police');
          if (missionCar === v && v.hp <= 0) {
            addParticles(v.x, v.y, '#ff5c5c', 14, 220);
            v.active = false;
            missionCar = null;
          }
          break;
        }
      }
      if (!b.active) continue;
      // Pedestrians.
      for (const p of peds) {
        if (!p.active || p.down > 0) continue;
        if (dist(b.x, b.y, p.x, p.y) < 16) {
          p.down = 2.5;
          addParticles(p.x, p.y, '#ffd166', 6, 120);
          b.active = false;
          if (b.fromPlayer && !harmless) addWanted(WANTED.hitPed, 'shot pedestrian');
          break;
        }
      }
    }
  }

  // ---- pickups ------------------------------------------------------------
  function updatePickups(dt, harmless) {
    for (const pk of pickups) {
      if (!pk.active) {
        pk.respawnTimer -= dt;
        if (pk.respawnTimer <= 0) pk.active = true;
        continue;
      }
      const r = PICKUPS[pk.kind].radius;
      if (dist(player.x, player.y, pk.x, pk.y) < r + PLAYER.radius) {
        pk.active = false;
        pk.respawnTimer = PICKUPS.respawnSeconds;
        if (harmless) continue;
        events |= EVENT_PICKUP;
        if (pk.kind === 'health') {
          player.hp = Math.min(PLAYER.hp, player.hp + PICKUPS.health.heal);
          setMessage('Health +45', 2);
        } else if (pk.kind === 'armor') {
          player.armor = Math.min(PLAYER.armorMax, player.armor + PICKUPS.armor.armor);
          setMessage('Armor +50', 2);
        } else if (pk.kind === 'longshot') {
          player.hasLongshot = true;
          player.weapon = 'longshot';
          setMessage('Longshot acquired — hold F to fire', 3);
        } else if (pk.kind === 'turbo') {
          player.turboSeconds = PICKUPS.turbo.boostSeconds;
          setMessage('Turbo! 6s of boost', 2);
        }
        addParticles(pk.x, pk.y, '#ffe066', 8, 140);
      }
    }
  }

  function updateParticles(dt) {
    for (const pt of particles) {
      if (!pt.active) continue;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.life -= dt;
      if (pt.life <= 0) pt.active = false;
    }
  }

  function updateWanted(dt, harmless) {
    if (harmless) return;
    let nearPolice = false;
    for (const v of vehicles) {
      if (v.active && v.driver === 'police' && dist(player.x, player.y, v.x, v.y) < 300) {
        nearPolice = true;
        break;
      }
    }
    if (state.elapsed - player.lastCrime > 3 && !nearPolice && player.wanted > 0) {
      player.wanted = Math.max(0, player.wanted - POLICE.decayPerSecond * dt);
    }
  }

  // ---- missions: per-step checks -----------------------------------------
  function updateMissions(dt, harmless) {
    if (harmless || !state.mission) return;
    const m = state.mission;
    const obj = m.objective;
    m.timer += dt;
    if (obj.type === 'goto') {
      if (dist(player.x, player.y, obj.x, obj.y) < obj.r) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'timed') {
      if (state.missionTimer > obj.time) {
        failMission('time ran out');
        return;
      }
      if (dist(player.x, player.y, obj.x, obj.y) < obj.r) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'collect') {
      if (dist(player.x, player.y, obj.x, obj.y) < obj.r) {
        if (state.missionIndex === 7 && state.objectiveIndex === 0) {
          player.hasLongshot = true;
          player.weapon = 'longshot';
        }
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'crates') {
      for (const crate of crates) {
        if (crate.active && !crate.taken && dist(player.x, player.y, crate.x, crate.y) < obj.r) {
          crate.taken = true;
          crate.active = false;
          player.cash += 50;
          setMessage('Crate secured (+$50)', 2);
          updateNavTarget();
        }
      }
      if (crates.length > 0 && crates.every((c) => c.taken)) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'tail') {
      if (!missionCar || !missionCar.active) {
        failMission('the courier got away');
        return;
      }
      const d = dist(player.x, player.y, missionCar.x, missionCar.y);
      if (d >= obj.minDist && d <= obj.maxDist) {
        m.progress += dt;
        m.failTimer = 0;
      } else if (d < obj.minDist) {
        m.failTimer += dt;
        if (m.failTimer > 2) {
          failMission('you spooked the courier');
          return;
        }
      } else {
        m.failTimer += dt;
        if (m.failTimer > 3) {
          failMission('you lost the courier');
          return;
        }
      }
      if (m.progress >= obj.duration) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'escort') {
      if (!missionCar || !missionCar.active) {
        failMission('Vex was taken out');
        return;
      }
      const d = dist(player.x, player.y, missionCar.x, missionCar.y);
      if (d > obj.maxDist) {
        m.failTimer += dt;
        if (m.failTimer > 4) {
          failMission('you left Vex behind');
          return;
        }
      } else {
        m.failTimer = 0;
      }
      if (dist(missionCar.x, missionCar.y, obj.dest.x, obj.dest.y) < 70) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    } else if (obj.type === 'escape') {
      if (player.wanted < obj.below) {
        events |= EVENT_OBJECTIVE;
        advanceObjective();
      }
    }
    updateNavTarget();
  }

  // ---- autopilot -----------------------------------------------------------
  // Drives the player by the road graph: BFS to the mission marker, line-follow
  // the nodes, reverse out when wedged. Used by the screenshot scenes and the
  // Node smoke test. Returns controls in the same shape step() takes.
  function autopilotControls() {
    const pilot = state.pilot;
    const c = {
      throttle: 0, steer: 0, moveX: 0, moveY: 0,
      enter: false, shoot: false, boost: false, handbrake: false,
      aimX: player.x, aimY: player.y,
    };
    if (player.onFoot) {
      const car = nearestParkedCar(500);
      if (car) {
        const d = dist(player.x, player.y, car.x, car.y);
        if (d < PLAYER.enterRadius) {
          c.enter = true;
          return c;
        }
        const a = angleTo(player.x, player.y, car.x, car.y);
        c.moveX = Math.cos(a);
        c.moveY = Math.sin(a);
        return c;
      }
      const t = state.navTarget;
      if (t) {
        const a = angleTo(player.x, player.y, t.x, t.y);
        c.moveX = Math.cos(a);
        c.moveY = Math.sin(a);
      }
      return c;
    }
    const car = player.car;
    if (!car) return c;
    const t = state.navTarget;
    const targetNode = t ? nearestNode(t.x, t.y) : -1;
    if (!pilot.path || pilot.targetNode !== targetNode || pilot.pathIndex >= pilot.path.length) {
      const dest = targetNode >= 0 ? targetNode : Math.floor(random() * 64);
      const path = bfs(nearestNode(player.x, player.y), dest);
      pilot.path = path && path.length > 1 ? path : [nearestNode(player.x, player.y)];
      pilot.pathIndex = 1;
      pilot.targetNode = dest;
      pilot.stuckTimer = 0;
    }
    // Wedged against a wall or a car: back out at an angle, then re-path.
    if (Math.abs(car.speed) < 8 && pilot.path) pilot.stuckTimer += STEP;
    else pilot.stuckTimer = 0;
    if (pilot.stuckTimer > 1.2) {
      pilot.reverseTimer = 0.8;
      pilot.reverseSteer = random.chance(0.5) ? 0.7 : -0.7;
      pilot.stuckTimer = 0;
      pilot.path = null;
    }
    if (pilot.reverseTimer > 0) {
      pilot.reverseTimer -= STEP;
      c.throttle = -1;
      c.steer = pilot.reverseSteer || 0;
      return c;
    }
    let target = null;
    if (pilot.path && pilot.pathIndex < pilot.path.length) {
      target = nodePos(pilot.path[pilot.pathIndex]);
      if (dist(player.x, player.y, target.x, target.y) < 70) {
        pilot.pathIndex += 1;
        if (pilot.pathIndex < pilot.path.length) target = nodePos(pilot.path[pilot.pathIndex]);
        else target = null;
      }
    }
    if (!target) {
      pilot.path = null;
      return c;
    }
    // On the last leg, aim at the exact marker rather than the node centre.
    const isLast = pilot.pathIndex >= pilot.path.length - 1;
    const tx = isLast && t ? t.x : target.x;
    const ty = isLast && t ? t.y : target.y;
    const spec = car.kind === 'bike' ? BIKE : CAR;
    // Look ahead: a sharp turn at the next node means slowing down early, while
    // there is still road to brake on, instead of arriving too fast to turn.
    let cruise = spec.maxSpeed * 0.62;
    if (pilot.path && pilot.pathIndex + 1 < pilot.path.length) {
      const cur = nodePos(pilot.path[pilot.pathIndex]);
      const nxt = nodePos(pilot.path[pilot.pathIndex + 1]);
      const a1 = angleTo(player.x, player.y, cur.x, cur.y);
      const a2 = angleTo(cur.x, cur.y, nxt.x, nxt.y);
      const turn = Math.abs(angleDiff(a1, a2));
      if (turn > 0.5 && dist(player.x, player.y, cur.x, cur.y) < 200) {
        cruise = spec.maxSpeed * 0.32;
      }
    }
    const control = driveToward(car, tx, ty, cruise, spec);
    c.throttle = control.throttle;
    c.steer = control.steer;
    if (carAhead(car, 160)) c.throttle = Math.min(c.throttle, -1);
    pilot.lastX = player.x;
    pilot.lastY = player.y;
    return c;
  }

  // ---- the step ------------------------------------------------------------
  function step(dt, controls, harmless) {
    events = 0;
    const c = controls || {};
    state.elapsed += dt;
    state.timeOfDay = (state.timeOfDay + dt / DAY_LENGTH) % 1;
    if (state.mission) state.missionTimer += dt;
    if (state.messageTimer > 0) state.messageTimer -= dt;

    updatePlayer(dt, c, !!harmless);
    updateTraffic(dt);
    updatePolice(dt, !!harmless);
    updatePeds(dt, !!harmless);
    updateBullets(dt, !!harmless);
    updatePickups(dt, !!harmless);
    updateMissions(dt, !!harmless);
    updateParticles(dt);
    updateWanted(dt, !!harmless);
    player.district = districtAt(player.x, player.y);

    if (player.hp <= 0) events |= EVENT_WASTED;
    return events;
  }

  reset();
  return {
    state, city, reset, step,
    autopilotControls,
    getNavTarget: () => state.navTarget,
    missionPay,
    addWanted,
    startMission,
    enterCar,
    exitCar,
  };
}
