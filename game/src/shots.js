// Neon Harbor — screenshot staging and autopilot.
// A URL query like ?shot=play&seed=1 puts the game into a deterministic
// scene and drives the player itself, so the four screenshots are real
// renders of the game with no human at the keyboard. The scenes are:
//   start   — the title screen over the night city
//   play    — mid-mission driving (Night Market Dash)
//   chase   — a five-star police chase
//   mission — a courier drop-off on foot beside a car

import { missionTarget, startGame, startMission } from './world.js';

/** Read the shot parameters from the page URL. Null when this is a normal play session. */
export function getShotParams() {
  if (typeof window === 'undefined' || !window.location) return null;
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  if (!shot) return null;
  const seed = parseInt(q.get('seed') || '1', 10) || 1;
  return { shot, seed };
}

/** Put a car under the player at a road point, facing along the road. */
function giveCar(world, x, y, angle) {
  const p = world.player;
  // Find the nearest parked car and move it to the spot, or spawn one.
  let car = null;
  let bestD = Infinity;
  for (const c of world.cars) {
    if (c.kind !== 'parked') continue;
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      bestD = d;
      car = c;
    }
  }
  if (!car) {
    car = { id: world.cars.length, x, y, angle, speed: 0, color: '#ff5d5d', kind: 'parked', driver: false, road: null, dir: 1, targetSpeed: 0, stuckT: 0 };
    world.cars.push(car);
  }
  car.x = x;
  car.y = y;
  car.angle = angle;
  car.speed = 0;
  car.kind = 'player';
  p.car = car;
  p.onFoot = false;
  p.x = x;
  p.y = y;
  p.angle = angle;
  return car;
}

/** Configure the world for one of the four screenshot scenes. */
export function applyShot(world, shot) {
  const p = world.player;
  if (shot === 'start') {
    world.state = 'title';
    world.camera.x = 1600;
    world.camera.y = 1100;
    return;
  }
  startGame(world);
  // Skip the briefing so the scene is the game itself.
  world.state = 'play';
  if (shot === 'play') {
    // Night Market Dash: in a car, mid-delivery, timer running.
    world.missionIndex = 1;
    startMission(world);
    world.state = 'play';
    giveCar(world, 1260, 1260, 0);
    world.player.car.speed = 260;
    world.time = 12;
  } else if (shot === 'chase') {
    // Five-star chase: player in a fast car, police closing in.
    world.missionIndex = 7;
    startMission(world);
    world.state = 'play';
    giveCar(world, 1540, 1260, Math.PI / 2);
    world.player.car.speed = 320;
    world.wanted = 5;
    // Place three police cars just behind the player.
    for (let i = 0; i < 3; i++) {
      world.police.push({
        id: 100 + i, x: 1540 - 60 - i * 70, y: 1260 + (i - 1) * 50, angle: Math.PI / 2, speed: 300,
        color: '#e8ecff', kind: 'police', driver: true, road: null, dir: 1,
        targetSpeed: 420, stuckT: 0, siren: i * 1.1,
      });
    }
    world.time = 8;
  } else if (shot === 'mission') {
    // The Courier: on foot beside a car, a drop-off marker ahead.
    world.missionIndex = 3;
    startMission(world);
    world.state = 'play';
    giveCar(world, 980, 980, 0);
    world.player.car.speed = 0;
    // Step out so the shot shows the player on foot by the car.
    const car = world.player.car;
    car.kind = 'parked';
    world.player.car = null;
    world.player.onFoot = true;
    world.player.x = 980 + 34;
    world.player.y = 980 + 26;
    world.player.angle = -Math.PI / 4;
    world.time = 5;
  }
}

/** Drive the player toward the current objective (or just cruise). */
export function driveAutopilot(world, input, dt) {
  const p = world.player;
  const t = missionTarget(world);
  const tx = t ? t.x : p.x + 600;
  const ty = t ? t.y : p.y;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const desired = Math.atan2(dy, dx);
  let turn = 0;
  const diff = desired - p.angle;
  const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
  if (wrapped > 0.12) turn = -1; // A
  else if (wrapped < -0.12) turn = 1; // D
  const codes = ['KeyW'];
  if (turn === -1) codes.push('KeyA');
  if (turn === 1) codes.push('KeyD');
  if (p.onFoot) {
    // On foot, walk toward the target.
    const fx = [];
    if (dx > 30) fx.push('KeyD');
    if (dx < -30) fx.push('KeyA');
    if (dy > 30) fx.push('KeyS');
    if (dy < -30) fx.push('KeyW');
    input.setVirtual(fx.length ? fx : ['KeyW']);
    return;
  }
  input.setVirtual(codes);
}
