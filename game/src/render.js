// Drawing only: the world's state and the current screen in, pixels out. A camera
// follows the player over the 2048x2048 city and the 1280x720 view is scaled to the
// window. Top-down neon: dark asphalt, coloured roofs, district names painted on
// the road, headlight cones at night, a minimap that says PORT MERIDIAN.
import { FONT, PALETTE, WORLD } from './config.js';
import { districtAt } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const VIEW_W = 1280;
const VIEW_H = 720;
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  // Camera in world pixels (top-left of the 1280x720 view).
  const camera = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW_W, height / VIEW_H);
    view.x = (width - VIEW_W * view.scale) / 2;
    view.y = (height - VIEW_H * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function updateCamera(state) {
    const p = state.player;
    camera.x = clamp(p.x - VIEW_W / 2, 0, WORLD.size - VIEW_W);
    camera.y = clamp(p.y - VIEW_H / 2, 0, WORLD.size - VIEW_H);
  }

  /** Client (mouse) pixels to world pixels, for aiming. */
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (canvas.width / rect.width);
    const sy = (clientY - rect.top) * (canvas.height / rect.height);
    return {
      x: camera.x + (sx - view.x) / view.scale,
      y: camera.y + (sy - view.y) / view.scale,
    };
  }

  function inView(x, y, margin) {
    return (
      x > camera.x - margin && x < camera.x + VIEW_W + margin &&
      y > camera.y - margin && y < camera.y + VIEW_H + margin
    );
  }

  function drawGround(state) {
    const city = state.city;
    context.fillStyle = PALETTE.ground;
    context.fillRect(camera.x, camera.y, VIEW_W, VIEW_H);
    // Parks.
    context.fillStyle = PALETTE.park;
    for (const park of city.parks) {
      if (!inView(park.x + park.w / 2, park.y + park.h / 2, 220)) continue;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Roads: vertical strips, then horizontal strips.
    context.fillStyle = PALETTE.road;
    for (let i = 0; i < WORLD.grid; i += 1) {
      const x = i * WORLD.pitch;
      if (x + WORLD.road >= camera.x && x <= camera.x + VIEW_W) {
        context.fillRect(x, camera.y, WORLD.road, VIEW_H);
      }
      const y = i * WORLD.pitch;
      if (y + WORLD.road >= camera.y && y <= camera.y + VIEW_H) {
        context.fillRect(camera.x, y, VIEW_W, WORLD.road);
      }
    }
    // Lane dashes down the middle of each road.
    context.fillStyle = PALETTE.roadLine;
    const dash = 26;
    const gap = 30;
    for (let i = 0; i < WORLD.grid; i += 1) {
      const cx = i * WORLD.pitch + WORLD.road / 2;
      if (cx >= camera.x - 4 && cx <= camera.x + VIEW_W + 4) {
        for (let y = Math.floor(camera.y / (dash + gap)) * (dash + gap); y < camera.y + VIEW_H; y += dash + gap) {
          context.fillRect(cx - 2, y, 4, dash);
        }
      }
      const cy = i * WORLD.pitch + WORLD.road / 2;
      if (cy >= camera.y - 4 && cy <= camera.y + VIEW_H + 4) {
        for (let x = Math.floor(camera.x / (dash + gap)) * (dash + gap); x < camera.x + VIEW_W; x += dash + gap) {
          context.fillRect(x, cy - 2, dash, 4);
        }
      }
    }
    // District names painted on the asphalt.
    context.textBaseline = 'middle';
    for (const label of city.labels) {
      if (!inView(label.x, label.y, 200)) continue;
      context.save();
      context.translate(label.x, label.y);
      if (label.vertical) context.rotate(Math.PI / 2);
      context.font = `bold 22px ${FONT}`;
      context.fillStyle = 'rgba(139, 147, 163, 0.55)';
      context.textAlign = 'center';
      context.fillText(label.text, 0, 0);
      context.restore();
    }
  }

  function drawBlocks(state) {
    const city = state.city;
    // Construction site: hazard ground, barriers, a crane.
    const con = city.kind;
    for (const [key, kind] of con) {
      if (kind !== 'construction') continue;
      const [bx, by] = key.split(',').map(Number);
      const r = city.blockRect(bx, by);
      if (!inView(r.x + r.w / 2, r.y + r.h / 2, 240)) continue;
      context.fillStyle = PALETTE.construction;
      context.fillRect(r.x, r.y, r.w, r.h);
      context.strokeStyle = PALETTE.hazard;
      context.lineWidth = 4;
      context.setLineDash([18, 14]);
      context.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      context.setLineDash([]);
      // Crane: mast and jib.
      context.fillStyle = PALETTE.hazard;
      context.fillRect(r.x + 40, r.y + 30, 10, 130);
      context.fillRect(r.x + 40, r.y + 30, 120, 8);
      context.fillStyle = PALETTE.barrier;
      for (let i = 0; i < 4; i += 1) {
        context.fillRect(r.x + 16 + i * 48, r.y + r.h - 26, 34, 14);
      }
    }
    // Gas stations: forecourt, canopy, pumps.
    for (const pump of city.pumps) {
      if (!inView(pump.x, pump.y, 160)) continue;
      context.fillStyle = PALETTE.gasPump;
      context.fillRect(pump.x - 10, pump.y - 14, 20, 28);
      context.fillStyle = PALETTE.gasCanopy;
      context.fillRect(pump.x - 14, pump.y - 18, 28, 6);
    }
    // Buildings: roof slab, edge, a lighter inner roof.
    const roofs = [PALETTE.buildingRoof, PALETTE.buildingRoof2, PALETTE.buildingRoof3];
    for (const s of city.solids) {
      if (s.kind !== 'building') continue;
      if (!inView(s.x + s.w / 2, s.y + s.h / 2, 220)) continue;
      context.fillStyle = roofs[s.roof || 0];
      context.fillRect(s.x, s.y, s.w, s.h);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
      context.fillStyle = 'rgba(255,255,255,0.06)';
      context.fillRect(s.x + 10, s.y + 10, s.w - 20, s.h - 20);
    }
    // Park trees.
    for (const tree of city.trees) {
      if (!inView(tree.x, tree.y, 40)) continue;
      context.fillStyle = '#1e6b43';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, TAU);
      context.fill();
    }
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      if (!pk.active || !inView(pk.x, pk.y, 40)) continue;
      const colors = { health: PALETTE.pickupHealth, armor: PALETTE.pickupArmor, longshot: PALETTE.pickupGun, turbo: PALETTE.pickupTurbo };
      const pulse = 1 + 0.12 * Math.sin(state.elapsed * 5 + pk.x);
      context.fillStyle = colors[pk.kind];
      context.beginPath();
      context.arc(pk.x, pk.y, 15 * pulse, 0, TAU);
      context.fill();
      context.fillStyle = '#0b0e1a';
      context.textBaseline = 'middle';
      const glyph = pk.kind === 'health' ? '+' : pk.kind === 'armor' ? 'A' : pk.kind === 'longshot' ? 'L' : 'T';
      text(glyph, pk.x, pk.y + 1, 18, '#0b0e1a', 'center', 'middle');
    }
    // Mission crates.
    for (const crate of state.crates) {
      if (!crate.active || !inView(crate.x, crate.y, 40)) continue;
      context.fillStyle = PALETTE.gold;
      context.fillRect(crate.x - 13, crate.y - 13, 26, 26);
      context.strokeStyle = '#0b0e1a';
      context.lineWidth = 3;
      context.strokeRect(crate.x - 13, crate.y - 13, 26, 26);
      context.beginPath();
      context.moveTo(crate.x - 13, crate.y);
      context.lineTo(crate.x + 13, crate.y);
      context.moveTo(crate.x, crate.y - 13);
      context.lineTo(crate.x, crate.y + 13);
      context.stroke();
    }
  }

  function drawMarker(state) {
    const target = state.navTarget;
    if (!target) return;
    const pulse = 1 + 0.18 * Math.sin(state.elapsed * 4);
    // Beacon pillar.
    const grad = context.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(255, 224, 102, 0)');
    grad.addColorStop(1, 'rgba(255, 224, 102, 0.4)');
    context.fillStyle = grad;
    context.fillRect(target.x - 7, target.y - 260, 14, 260);
    // Ring on the ground.
    context.strokeStyle = PALETTE.markerRing;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(target.x, target.y, 26 * pulse, 0, TAU);
    context.stroke();
    // Diamond.
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.moveTo(target.x, target.y - 12);
    context.lineTo(target.x + 10, target.y);
    context.lineTo(target.x, target.y + 12);
    context.lineTo(target.x - 10, target.y);
    context.closePath();
    context.fill();
    // Off-screen arrow: point at the marker from the view edge.
    const sx = target.x - camera.x;
    const sy = target.y - camera.y;
    if (sx < 0 || sx > VIEW_W || sy < 0 || sy > VIEW_H) {
      const cx = clamp(sx, 46, VIEW_W - 46);
      const cy = clamp(sy, 46, VIEW_H - 46);
      const a = Math.atan2(sy - cy, sx - cx);
      context.save();
      context.translate(cx, cy);
      context.rotate(a);
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.moveTo(16, 0);
      context.lineTo(-10, -11);
      context.lineTo(-10, 11);
      context.closePath();
      context.fill();
      context.restore();
    }
  }

  function drawPed(p) {
    context.fillStyle = p.color;
    context.beginPath();
    context.arc(p.x, p.y, 9, 0, TAU);
    context.fill();
    if (p.down > 0) {
      // Lying down: a flat shape.
      context.fillStyle = 'rgba(0,0,0,0.35)';
      context.beginPath();
      context.ellipse(p.x, p.y, 13, 6, 0, 0, TAU);
      context.fill();
    }
  }

  function drawCar(v, isPlayer, time) {
    const isBike = v.kind === 'bike';
    const len = isBike ? 34 : 46;
    const wid = isBike ? 14 : 24;
    context.save();
    context.translate(v.x, v.y);
    context.rotate(v.angle);
    // Body.
    context.fillStyle = v.color;
    if (isBike) {
      context.fillRect(-len / 2, -wid / 2, len, wid);
    } else {
      context.beginPath();
      context.roundRect(-len / 2, -wid / 2, len, wid, 7);
      context.fill();
    }
    // Windshield.
    context.fillStyle = 'rgba(11, 14, 26, 0.55)';
    context.fillRect(len * 0.08, -wid / 2 + 4, len * 0.22, wid - 8);
    // Wheels.
    context.fillStyle = '#0b0e1a';
    const wheelY = wid / 2 - 1;
    context.fillRect(-len / 2 + 6, -wheelY - 3, 10, 4);
    context.fillRect(-len / 2 + 6, wheelY - 1, 10, 4);
    context.fillRect(len / 2 - 16, -wheelY - 3, 10, 4);
    context.fillRect(len / 2 - 16, wheelY - 1, 10, 4);
    // Police light bar.
    if (v.driver === 'police' || v.driver === 'roadblock') {
      const phase = Math.floor(time * 6) % 2;
      context.fillStyle = phase === 0 ? PALETTE.policeLightR : PALETTE.policeLightB;
      context.fillRect(-6, -wid / 2 - 2, 12, 5);
      context.fillStyle = phase === 0 ? PALETTE.policeLightB : PALETTE.policeLightR;
      context.fillRect(-6, wid / 2 - 3, 12, 5);
    }
    // Player outline.
    if (isPlayer) {
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(-len / 2 - 3, -wid / 2 - 3, len + 6, wid + 6, 9);
      context.stroke();
    }
    context.restore();
    // Headlight dots at night.
    context.fillStyle = 'rgba(255, 240, 180, 0.9)';
    const fx = v.x + Math.cos(v.angle) * (len / 2);
    const fy = v.y + Math.sin(v.angle) * (len / 2);
    const px = Math.cos(v.angle + Math.PI / 2);
    const py = Math.sin(v.angle + Math.PI / 2);
    context.beginPath();
    context.arc(fx + px * 7, fy + py * 7, 2.5, 0, TAU);
    context.arc(fx - px * 7, fy - py * 7, 2.5, 0, TAU);
    context.fill();
  }

  function drawEntities(state) {
    for (const p of state.peds) {
      if (p.active && inView(p.x, p.y, 30)) drawPed(p);
    }
    for (const v of state.vehicles) {
      if (!v.active || !inView(v.x, v.y, 80)) continue;
      drawCar(v, v.driver === 'player', state.elapsed);
    }
    const player = state.player;
    if (player.onFoot && inView(player.x, player.y, 30)) {
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(player.x, player.y, 11, 0, TAU);
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, 11, 0, TAU);
      context.stroke();
      // Facing tick.
      context.beginPath();
      context.moveTo(player.x, player.y);
      context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
      context.stroke();
    }
    // Bullets.
    context.fillStyle = PALETTE.bullet;
    for (const b of state.bullets) {
      if (!b.active || !inView(b.x, b.y, 20)) continue;
      context.beginPath();
      context.arc(b.x, b.y, 4, 0, TAU);
      context.fill();
    }
    // Particles.
    for (const pt of state.particles) {
      if (!pt.active || !inView(pt.x, pt.y, 20)) continue;
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function darknessAt(timeOfDay) {
    const day = Math.cos((timeOfDay - 0.25) * TAU);
    return 0.72 * (1 - day) / 2;
  }

  function drawNight(state) {
    const darkness = darknessAt(state.timeOfDay);
    if (darkness <= 0.02) return;
    context.fillStyle = `rgba(5, 8, 20, ${darkness.toFixed(3)})`;
    context.fillRect(camera.x, camera.y, VIEW_W, VIEW_H);
    // Headlight cones: additive light in front of the player's car and cruisers.
    context.save();
    context.globalCompositeOperation = 'lighter';
    const cones = [];
    const player = state.player;
    if (!player.onFoot && player.car) cones.push(player.car);
    for (const v of state.vehicles) {
      if (v.active && v.driver === 'police') cones.push(v);
    }
    for (const car of cones) {
      const len = 260;
      const spread = 0.42;
      const gx = car.x + Math.cos(car.angle) * len;
      const gy = car.y + Math.sin(car.angle) * len;
      const grad = context.createRadialGradient(car.x, car.y, 10, gx, gy, len);
      grad.addColorStop(0, 'rgba(255, 240, 180, 0.30)');
      grad.addColorStop(1, 'rgba(255, 240, 180, 0)');
      context.fillStyle = grad;
      context.beginPath();
      context.moveTo(car.x, car.y);
      context.arc(car.x, car.y, len, car.angle - spread, car.angle + spread);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function drawHud(state, ui) {
    const player = state.player;
    const top = 16;
    // Top-left: cash and combo.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(14, top, 250, 64);
    context.strokeStyle = PALETTE.hudBorder;
    context.lineWidth = 1;
    context.strokeRect(14, top, 250, 64);
    text(`$${Math.floor(player.cash).toLocaleString('en-US')}`, 28, top + 30, 26, PALETTE.gold, 'left', 'middle');
    text(player.combo > 0 ? `Combo x${(1 + Math.min(2, 0.25 * player.combo)).toFixed(2)}` : 'No combo', 28, top + 56, 16, PALETTE.muted, 'left', 'middle');
    // Top-centre: mission and objective.
    const missionText = state.missionText || 'Neon Harbor';
    const objectiveText = state.objectiveText || '';
    context.fillStyle = PALETTE.hudPanel;
    const mw = 560;
    context.fillRect((VIEW_W - mw) / 2, top, mw, 64);
    context.strokeRect((VIEW_W - mw) / 2, top, mw, 64);
    text(missionText, VIEW_W / 2, top + 26, 22, PALETTE.text, 'center', 'middle');
    text(objectiveText, VIEW_W / 2, top + 52, 15, PALETTE.muted, 'center', 'middle');
    // Top-right: wanted stars and the clock.
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(VIEW_W - 264, top, 250, 64);
    context.strokeRect(VIEW_W - 264, top, 250, 64);
    const stars = Math.floor(player.wanted + 0.0001);
    for (let i = 0; i < 5; i += 1) {
      text(i < stars ? '★' : '☆', VIEW_W - 246 + i * 30, top + 30, 26, i < stars ? PALETTE.star : PALETTE.starEmpty, 'left', 'middle');
    }
    const hour = Math.floor(((state.timeOfDay * 24 + 6) % 24));
    const minute = Math.floor((((state.timeOfDay * 24 + 6) % 1) * 60));
    const clock = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const dayPart = state.timeOfDay < 0.2 || state.timeOfDay > 0.8 ? 'Night' : state.timeOfDay < 0.45 ? 'Day' : state.timeOfDay < 0.6 ? 'Dusk' : 'Night';
    text(`${dayPart} ${clock} · ${player.district}`, VIEW_W - 28, top + 56, 14, PALETTE.muted, 'right', 'middle');
    // Bottom-left: HP, armor, fuel.
    const bx = 14;
    const by = VIEW_H - 96;
    context.fillStyle = PALETTE.hudPanel;
    context.fillRect(bx, by, 280, 82);
    context.strokeRect(bx, by, 280, 82);
    text('HP', bx + 14, by + 20, 15, PALETTE.muted, 'left', 'middle');
    context.fillStyle = '#2a3040';
    context.fillRect(bx + 52, by + 10, 210, 16);
    context.fillStyle = player.hp > 30 ? PALETTE.pickupHealth : PALETTE.danger;
    context.fillRect(bx + 52, by + 10, 210 * clamp(player.hp / 100, 0, 1), 16);
    text('ARMOR', bx + 14, by + 46, 15, PALETTE.muted, 'left', 'middle');
    context.fillStyle = '#2a3040';
    context.fillRect(bx + 52, by + 36, 210, 16);
    context.fillStyle = PALETTE.pickupArmor;
    context.fillRect(bx + 52, by + 36, 210 * clamp(player.armor / 100, 0, 1), 16);
    const fuel = player.car ? player.car.fuel : 100;
    text(player.onFoot ? 'ON FOOT' : 'FUEL', bx + 14, by + 70, 15, PALETTE.muted, 'left', 'middle');
    context.fillStyle = '#2a3040';
    context.fillRect(bx + 52, by + 60, 210, 14);
    context.fillStyle = fuel > 25 ? PALETTE.pickupTurbo : PALETTE.danger;
    context.fillRect(bx + 52, by + 60, 210 * clamp(fuel / 100, 0, 1), 14);
    // Speed, when driving.
    if (!player.onFoot) {
      const kmh = Math.round(Math.abs(player.speed) * 0.36);
      text(`${kmh} km/h`, VIEW_W - 28, VIEW_H - 118, 26, PALETTE.text, 'right', 'middle');
      if (player.turboSeconds > 0) text(`TURBO ${player.turboSeconds.toFixed(1)}s`, VIEW_W - 28, VIEW_H - 88, 16, PALETTE.pickupTurbo, 'right', 'middle');
    }
    // Temporary centre message.
    if (state.messageTimer > 0 && state.message) {
      text(state.message, VIEW_W / 2, VIEW_H - 150, 24, PALETTE.gold, 'center', 'middle');
    }
    // Controls hint.
    text('WASD drive · E enter/exit car · F or click shoot · Shift handbrake · P pause · M mute', VIEW_W / 2, VIEW_H - 12, 13, PALETTE.muted, 'center', 'middle');
    void ui;
  }

  function drawMinimap(state) {
    const size = 168;
    const x = VIEW_W - size - 14;
    const y = VIEW_H - size - 14;
    const scale = size / WORLD.size;
    context.fillStyle = PALETTE.minimapBg;
    context.fillRect(x - 6, y - 26, size + 12, size + 32);
    context.strokeStyle = PALETTE.hudBorder;
    context.strokeRect(x - 6, y - 26, size + 12, size + 32);
    text('PORT MERIDIAN', x + size / 2, y - 8, 12, PALETTE.gold, 'center', 'middle');
    // Roads.
    context.strokeStyle = 'rgba(139, 147, 163, 0.5)';
    context.lineWidth = 1;
    for (let i = 0; i < WORLD.grid; i += 1) {
      const rx = x + (i * WORLD.pitch + WORLD.road / 2) * scale;
      context.beginPath();
      context.moveTo(rx, y);
      context.lineTo(rx, y + size);
      context.stroke();
      const ry = y + (i * WORLD.pitch + WORLD.road / 2) * scale;
      context.beginPath();
      context.moveTo(x, ry);
      context.lineTo(x + size, ry);
      context.stroke();
    }
    // Mission marker.
    if (state.navTarget) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(x + state.navTarget.x * scale, y + state.navTarget.y * scale, 5, 0, TAU);
      context.fill();
    }
    // Police.
    for (const v of state.vehicles) {
      if (!v.active || v.driver !== 'police') continue;
      context.fillStyle = PALETTE.policeLightB;
      context.beginPath();
      context.arc(x + v.x * scale, y + v.y * scale, 3, 0, TAU);
      context.fill();
    }
    // Player.
    const player = state.player;
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(x + player.x * scale, y + player.y * scale, 4, 0, TAU);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    context.beginPath();
    context.arc(x + player.x * scale, y + player.y * scale, 4, 0, TAU);
    context.stroke();
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 30;
    const height = 120 + lines.length * lineH + 74;
    const x = (VIEW_W - width) / 2;
    const y = (VIEW_H - height) / 2;
    context.fillStyle = 'rgba(10, 13, 26, 0.92)';
    context.fillRect(x, y, width, height);
    context.strokeStyle = accent || PALETTE.hudBorder;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    context.textBaseline = 'alphabetic';
    text(title, VIEW_W / 2, y + 72, 52, accent || PALETTE.text, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW_W / 2, y + 122 + i * lineH, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW_W / 2, y + height - 34, 22, PALETTE.gold, 'center');
  }

  /** Paint one frame: the city, the entities, night, the HUD, then a panel per screen. */
  function draw(state, screen, ui) {
    updateCamera(state);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    context.save();
    context.beginPath();
    // The clip is in view coordinates (the transform above, before the camera
    // translate): the visible view is (0, 0) to (VIEW_W, VIEW_H). Clipping to
    // the camera's world rect here would shift the clip by the camera offset
    // and leave a dark strip where the world is never painted.
    context.rect(0, 0, VIEW_W, VIEW_H);
    context.clip();
    context.translate(-camera.x, -camera.y);
    drawGround(state);
    drawBlocks(state);
    drawPickups(state);
    drawMarker(state);
    drawEntities(state);
    drawNight(state);
    context.restore();
    // HUD and minimap live in screen space, over the camera view.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      const lines = [
        'An open-world crime game in Port Meridian — steal a car, run the jobs,',
        'outdrive the Port Meridian PD. Eight missions, from Rook\'s first drop',
        'to the five-star finale. Everything here is original: own city, own story.',
        '',
        'WASD / arrows drive · E steal or leave a car · F or click shoot',
        'Shift handbrake · P pause · M mute',
      ];
      if (ui && ui.hasSave) lines.push(`Continue: mission ${ui.saveMission + 1} of 8 · $${ui.saveCash}`);
      drawPanel('NEON HARBOR', lines, ui && ui.hasSave ? 'Press Space to continue — or C for a new game' : 'Press Space or click to start', '#19e3ff');
      return;
    }
    drawHud(state, ui);
    drawMinimap(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      const over = (ui && ui.overKind) || 'wasted';
      const title = over === 'busted' ? 'BUSTED' : 'WASTED';
      const accent = over === 'busted' ? '#3fa9ff' : '#ff5c5c';
      const lines = [
        `${state.missionText || 'Neon Harbor'}`,
        `Cash earned $${Math.floor(state.totalEarned).toLocaleString('en-US')} · best $${Math.floor(ui ? ui.best : 0).toLocaleString('en-US')}`,
        '',
        'The PD impounded your ride. Port Meridian is still out there.',
      ];
      drawPanel(title, lines, 'Press Space or click to play again', accent);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, toWorld };
}
