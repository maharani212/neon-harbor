// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by the
// world's road-graph autopilot, so the frame is what a short game really looks like
// and the same seed always gives the same frame. The scenes are staged, painted
// twice, and window.__shotReady is set by main.js.
import { STEP } from './config.js';
import { EVENT_BUSTED, EVENT_WASTED } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 22;
const CHASE_SECONDS = 16;
const MISSION_SECONDS = 18;

function runSteps(world, seconds, controls) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const c = typeof controls === 'function' ? controls() : controls;
    const events = world.step(STEP, c || {}, false);
    if (events & (EVENT_WASTED | EVENT_BUSTED)) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * UI facts the panel needs. Unknown names stage the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  const ui = { best: 0, hasSave: false, saveMission: 0, saveCash: 0, overKind: 'wasted' };
  if (name === 'play') {
    runSteps(world, PLAY_SECONDS, () => world.autopilotControls());
    return { screen: SCREEN_PLAY, ui };
  }
  if (name === 'chase') {
    world.addWanted(4, 'shot');
    runSteps(world, CHASE_SECONDS, () => world.autopilotControls());
    return { screen: SCREEN_PLAY, ui };
  }
  if (name === 'mission') {
    world.startMission(2); // Three Crates
    runSteps(world, MISSION_SECONDS, () => world.autopilotControls());
    const over = world.state.player.hp <= 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, ui };
  }
  // Title: let the traffic roll for a few seconds behind the panel.
  for (let i = 0; i < Math.round(START_SECONDS / STEP); i += 1) {
    world.step(STEP, {}, true);
  }
  return { screen: SCREEN_TITLE, ui };
}
