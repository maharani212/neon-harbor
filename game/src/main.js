// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between four screens: title, play, paused
// and game over. Progress (mission, cash) is saved to localStorage so a visit can
// continue where it left off.
//
// ?seed=N fixes the city and the traffic. ?shot=start|play|chase|mission (with
// &seed=N) stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_PICKUP,
  EVENT_SHOOT, EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createSound } from './sound.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const sound = createSound();
// Debug handle (single-player offline game): read the live world and the
// camera's world position from a console or a test while the game runs.
window.__nh = { world, renderer };

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.missionIndex !== 'number' || typeof save.cash !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      missionIndex: world.state.missionIndex,
      cash: Math.floor(world.state.player.cash),
      totalEarned: Math.floor(world.state.totalEarned),
    }));
  } catch {
    // Storage can be off: the run then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas, (x, y) => renderer.toWorld(x, y));
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  let overKind = 'wasted';
  let accumulator = 0;
  let last = performance.now();
  let newGameKey = false;

  // Screen readers (and anyone watching the page's text) hear screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(continueSave) {
    world.reset();
    if (continueSave && save) {
      world.state.player.cash = save.cash;
      world.state.totalEarned = save.totalEarned || 0;
      world.startMission(Math.min(save.missionIndex, 7));
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    sound.ensure();
    announce(`Playing. Mission ${world.state.missionIndex + 1} of 8.`);
  }

  function endGame(kind) {
    overKind = kind;
    screen = SCREEN_OVER;
    if (world.state.totalEarned > best) {
      best = world.state.totalEarned;
      saveBest(best);
    }
    writeSave();
    if (kind === 'busted') sound.busted();
    announce(kind === 'busted' ? 'Busted. The PD got you.' : 'Wasted. Your run is over.');
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      sound.setMuted(!sound.isMuted());
      announce(sound.isMuted() ? 'Muted.' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) {
        startGame(!!save);
      } else if (newGameKey) {
        // 'C' on the title screen starts fresh, wiping the save.
        save = null;
        try {
          window.localStorage.removeItem(SAVE_KEY);
        } catch {
          // Ignore storage errors.
        }
        startGame(false);
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startGame(false);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function buildControls(actions) {
    const keys = input.keys();
    const aim = input.aim();
    const controls = {
      up: keys.up, down: keys.down, left: keys.left, right: keys.right,
      handbrake: keys.handbrake,
      enter: !!(actions & ACTION_ENTER),
      shoot: input.isShooting(),
    };
    if (aim) {
      controls.aimX = aim.x;
      controls.aimY = aim.y;
    }
    return controls;
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, {}, true);
      return;
    }
    const controls = buildControls(actions);
    const events = world.step(STEP, controls, false);
    if (events & EVENT_SHOOT) sound.shot();
    if (events & EVENT_PICKUP) sound.pickup();
    if (events & EVENT_CRASH) sound.crash();
    if (events & EVENT_MISSION_DONE) {
      sound.missionDone();
      writeSave();
    }
    if (events & EVENT_WASTED) endGame('wasted');
    else if (events & EVENT_BUSTED) endGame('busted');
    sound.update(world.state.player.speed, world.state.player.wanted, !world.state.player.onFoot);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // One take per frame: handleActions and the steps share these presses.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(actions);
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // The 'C' press is consumed by this frame's title handling.
    newGameKey = false;
    const ui = {
      best,
      overKind,
      hasSave: !!save,
      saveMission: save ? save.missionIndex : 0,
      saveCash: save ? save.cash : 0,
    };
    renderer.draw(world.state, screen, ui);
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyC' && screen === SCREEN_TITLE && !event.repeat) newGameKey = true;
  });

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
