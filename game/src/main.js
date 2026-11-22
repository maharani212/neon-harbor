// Neon Harbor — the entry point: the canvas, the game loop and the wiring.
// It creates the world, reads the keyboard, steps the simulation, draws the
// frame and keeps the synthesised sound in step with the car and the police.

import { createWorld, startGame, updateWorld } from './world.js';
import { drawWorld } from './render.js';
import { Input } from './input.js';
import { Sound } from './sound.js';
import { getShotParams, applyShot, driveAutopilot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

/** Fit the canvas to the window (the game draws at the window's size). */
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

Input.attach();

const shot = getShotParams();
const world = createWorld(shot ? shot.seed : 1);
if (shot) applyShot(world, shot.shot);

// Exposed for the automated smoke test: window.__game.world and .state.
window.__game = { world, shot: shot ? shot.shot : null };

let last = performance.now();
let frames = 0;
let fpsT = 0;

/** One frame: step the world, draw it, keep the sound in step. */
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frames++;
  fpsT += dt;

  // First gesture starts the audio (autoplay policy) and the game.
  if (Input.wasPressed('Enter')) {
    Sound.init();
    Sound.resume();
    if (world.state === 'title') startGame(world);
    else if (world.state === 'brief') world.state = 'play';
  }
  if (Input.wasPressed('KeyM')) Sound.toggleMute();
  if (Input.wasPressed('KeyR') && (world.state === 'busted' || world.state === 'wasted' || world.state === 'win' || world.state === 'failed')) {
    // updateWorld handles the R key for these states; nothing extra here.
  }

  if (shot) {
    // The autopilot drives; the loop still steps the world normally.
    if (world.state === 'play') driveAutopilot(world, Input, dt);
  }

  updateWorld(world, Input, dt);
  Input.endFrame();

  drawWorld(ctx, world, canvas.width, canvas.height);

  // Sound follows the car and the police.
  const p = world.player;
  const speed01 = p.car ? Math.min(1, Math.abs(p.car.speed) / 560) : 0;
  Sound.engine(speed01, !p.onFoot && world.state === 'play');
  const copNear = world.police.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520);
  Sound.siren(world.state === 'play' && copNear);

  // A quiet FPS counter for the smoke test (not drawn).
  if (fpsT >= 5) {
    window.__game.fps = frames / fpsT;
    frames = 0;
    fpsT = 0;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
