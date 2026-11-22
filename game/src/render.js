// Neon Harbor — rendering: the city, the cars, the people, the HUD and the
// menus, all on one canvas. Nothing here changes the world; it only reads it.

import { WORLD_W, WORLD_H, ROAD_X, ROAD_Y, ROAD_W, PALETTE, CAR, PLAYER, MINIMAP_W, MINIMAP_H } from './config.js';
import { missionTarget, wantedStars, currentMissionDef } from './world.js';

/** Draw a rounded rectangle path. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw one car as a rounded body with a windshield, roof and headlights. */
function drawCar(ctx, car, isPlayer) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = CAR.length;
  const W = CAR.width;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, -L / 2 + 2, -W / 2 + 3, L, W, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Roof and windshield.
  ctx.fillStyle = 'rgba(10,14,30,0.85)';
  roundRect(ctx, -L / 2 + 9, -W / 2 + 4, L - 22, W - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.5)';
  ctx.fillRect(L / 2 - 10, -W / 2 + 4, 4, W - 8);
  // Headlight cones.
  const g = ctx.createRadialGradient(L / 2, 0, 2, L / 2, 0, 90);
  g.addColorStop(0, 'rgba(255,240,180,0.35)');
  g.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(L / 2, -W / 2 + 3);
  ctx.lineTo(L / 2 + 85, -26);
  ctx.lineTo(L / 2 + 85, 26);
  ctx.lineTo(L / 2, W / 2 - 3);
  ctx.closePath();
  ctx.fill();
  // Taillights.
  ctx.fillStyle = '#ff2b2b';
  ctx.fillRect(-L / 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(-L / 2, W / 2 - 7, 3, 5);
  if (isPlayer) {
    ctx.strokeStyle = '#ff2e88';
    ctx.lineWidth = 2.5;
    roundRect(ctx, -L / 2 - 3, -W / 2 - 3, L + 6, W + 6, 9);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draw a police car: dark body, white doors, flashing light bar. */
function drawPolice(ctx, cop) {
  drawCar(ctx, { ...cop, color: '#20264a' }, false);
  ctx.save();
  ctx.translate(cop.x, cop.y);
  ctx.rotate(cop.angle);
  ctx.fillStyle = '#e8ecff';
  ctx.fillRect(-8, -CAR.width / 2 + 1, 16, CAR.width - 2);
  const phase = Math.sin(cop.siren) > 0;
  ctx.fillStyle = phase ? '#ff2b2b' : '#2b6bff';
  ctx.beginPath();
  ctx.arc(-2, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = phase ? '#2b6bff' : '#ff2b2b';
  ctx.beginPath();
  ctx.arc(6, 0, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Light glow.
  const glow = ctx.createRadialGradient(cop.x, cop.y, 4, cop.x, cop.y, 46);
  glow.addColorStop(0, phase ? 'rgba(255,43,43,0.35)' : 'rgba(43,107,255,0.35)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cop.x, cop.y, 46, 0, Math.PI * 2);
  ctx.fill();
}

/** Draw the minimap in the bottom-left corner. */
function drawMinimap(ctx, world, viewW, viewH) {
  const x0 = 14;
  const y0 = viewH - MINIMAP_H - 14;
  const sx = MINIMAP_W / WORLD_W;
  const sy = MINIMAP_H / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(5,8,20,0.82)';
  roundRect(ctx, x0 - 4, y0 - 4, MINIMAP_W + 8, MINIMAP_H + 8, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(154,161,199,0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(x0, y0, MINIMAP_W, MINIMAP_H);
  ctx.clip();
  // Water.
  ctx.fillStyle = '#0a1f3d';
  ctx.fillRect(x0, y0 + 2180 * sy, MINIMAP_W, (WORLD_H - 2180) * sy);
  // Roads.
  ctx.strokeStyle = '#3a4066';
  ctx.lineWidth = Math.max(1, 72 * sx);
  for (const rx of ROAD_X) {
    ctx.beginPath();
    ctx.moveTo(x0 + rx * sx, y0);
    ctx.lineTo(x0 + rx * sx, y0 + MINIMAP_H);
    ctx.stroke();
  }
  for (const ry of ROAD_Y) {
    ctx.beginPath();
    ctx.moveTo(x0, y0 + ry * sy);
    ctx.lineTo(x0 + MINIMAP_W, y0 + ry * sy);
    ctx.stroke();
  }
  // Buildings.
  ctx.fillStyle = '#2a2f55';
  for (const b of world.city.buildings) {
    ctx.fillRect(x0 + b.x * sx, y0 + b.y * sy, Math.max(1, b.w * sx), Math.max(1, b.h * sy));
  }
  // Objective.
  const t = missionTarget(world);
  if (t) {
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(x0 + t.x * sx, y0 + t.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Police.
  ctx.fillStyle = '#ff4d4d';
  for (const cop of world.police) {
    ctx.beginPath();
    ctx.arc(x0 + cop.x * sx, y0 + cop.y * sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player.
  const p = world.player;
  ctx.fillStyle = '#ff2e88';
  ctx.beginPath();
  ctx.arc(x0 + p.x * sx, y0 + p.y * sy, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** Draw the HUD: money, mission, wanted stars, speed, health, messages. */
function drawHud(ctx, world, viewW, viewH) {
  const p = world.player;
  ctx.save();
  ctx.textBaseline = 'top';
  // Money and mission, top-left.
  ctx.fillStyle = 'rgba(5,8,20,0.72)';
  roundRect(ctx, 12, 12, 300, 66, 10);
  ctx.fill();
  ctx.fillStyle = PALETTE.money;
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText(`$${p.money.toLocaleString('en-US')}`, 24, 20);
  const def = currentMissionDef(world);
  ctx.fillStyle = PALETTE.text;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(def ? `${def.id}. ${def.name}` : 'Free roam', 24, 50);
  const t = missionTarget(world);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(t ? t.label : def ? def.brief : 'Explore Port Meridian', 24, 68 - 12 + 14);
  // Wanted stars, top-right.
  const stars = wantedStars(world);
  ctx.fillStyle = 'rgba(5,8,20,0.72)';
  roundRect(ctx, viewW - 190, 12, 178, 44, 10);
  ctx.fill();
  ctx.font = '26px system-ui, sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? PALETTE.star : 'rgba(154,161,199,0.35)';
    ctx.fillText('★', viewW - 178 + i * 34, 18);
  }
  // Speed and health, bottom-right.
  ctx.fillStyle = 'rgba(5,8,20,0.72)';
  roundRect(ctx, viewW - 190, viewH - 76, 178, 62, 10);
  ctx.fill();
  if (!p.onFoot && p.car) {
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(`${Math.round(Math.abs(p.speed) * 0.12)} mph`, viewW - 178, viewH - 68);
  } else {
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('ON FOOT', viewW - 178, viewH - 66);
  }
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(viewW - 178, viewH - 34, 154, 10);
  ctx.fillStyle = p.hp > 40 ? PALETTE.money : PALETTE.danger;
  ctx.fillRect(viewW - 178, viewH - 34, 154 * (p.hp / 100), 10);
  // Transient message, centre-top.
  if (world.messageT > 0 && world.message) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const w = ctx.measureText(world.message).width;
    ctx.fillStyle = 'rgba(5,8,20,0.78)';
    roundRect(ctx, viewW / 2 - w / 2 - 14, 92, w + 28, 34, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.fillText(world.message, viewW / 2 - w / 2, 100);
  }
  // Mission timer, under the message.
  const m = world.mission;
  if (m && m.timer !== null && world.state === 'play') {
    ctx.font = 'bold 22px system-ui, sans-serif';
    const label = `${Math.max(0, Math.ceil(m.timer))}s`;
    ctx.fillStyle = m.timer < 15 ? PALETTE.danger : PALETTE.text;
    ctx.fillText(label, viewW / 2 - ctx.measureText(label).width / 2, 136);
  }
  ctx.restore();
  drawMinimap(ctx, world, viewW, viewH);
}

/** Draw the objective beacon and the off-screen arrow toward it. */
function drawObjective(ctx, world, camX, camY, viewW, viewH) {
  const t = missionTarget(world);
  if (!t || world.state !== 'play') return;
  const pulse = 1 + Math.sin(world.time * 5) * 0.15;
  // Beacon ring at the target.
  ctx.save();
  ctx.strokeStyle = PALETTE.objective;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,209,102,0.25)';
  ctx.beginPath();
  ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
  ctx.fill();
  // A light pillar so the target is visible from afar.
  const g = ctx.createLinearGradient(t.x, t.y - 260, t.x, t.y);
  g.addColorStop(0, 'rgba(255,209,102,0)');
  g.addColorStop(1, 'rgba(255,209,102,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(t.x - 8, t.y - 260, 16, 260);
  ctx.restore();
  // Off-screen arrow.
  const p = world.player;
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 520) {
    const a = Math.atan2(dy, dx);
    const ax = viewW / 2 + Math.cos(a) * 260;
    const ay = viewH / 2 + Math.sin(a) * 190;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.fillStyle = PALETTE.objective;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** A full-screen overlay panel with a title and lines of text. */
function overlay(ctx, viewW, viewH, title, lines, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(4,6,16,0.72)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = accent;
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText(title, viewW / 2, viewH / 2 - 110);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '19px system-ui, sans-serif';
  lines.forEach((line, i) => {
    ctx.fillText(line, viewW / 2, viewH / 2 - 40 + i * 30);
  });
  ctx.restore();
}

/** Draw the whole frame. */
export function drawWorld(ctx, world, viewW, viewH) {
  const city = world.city;
  const shakeX = world.shake > 0 ? (Math.random() - 0.5) * world.shake * 22 : 0;
  const shakeY = world.shake > 0 ? (Math.random() - 0.5) * world.shake * 22 : 0;
  const camX = world.camera.x - viewW / 2 + shakeX;
  const camY = world.camera.y - viewH / 2 + shakeY;

  ctx.save();
  ctx.fillStyle = PALETTE.sky;
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.translate(-camX, -camY);

  // Water and the harbor.
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(city.water.x, city.water.y, city.water.w, city.water.h);
  ctx.strokeStyle = PALETTE.waterLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, city.water.y);
  ctx.lineTo(WORLD_W, city.water.y);
  ctx.stroke();
  // Animated water shimmer.
  ctx.strokeStyle = 'rgba(18,58,107,0.7)';
  for (let i = 0; i < 8; i++) {
    const y = city.water.y + 30 + i * 22;
    const off = Math.sin(world.time * 0.7 + i * 1.3) * 14;
    ctx.beginPath();
    ctx.moveTo(120 + off, y);
    ctx.lineTo(420 + off, y);
    ctx.stroke();
  }
  // The pier and the yacht.
  ctx.fillStyle = '#3a2c1c';
  ctx.fillRect(city.pier.x, city.pier.y, city.pier.w, city.pier.h);
  ctx.fillStyle = '#e8ecff';
  ctx.save();
  ctx.translate(city.yacht.x, city.yacht.y);
  roundRect(ctx, -26, -12, 52, 24, 10);
  ctx.fill();
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(-6, -20, 12, 10);
  ctx.restore();

  // Docks strip.
  ctx.fillStyle = '#2a2118';
  ctx.fillRect(city.docks.x, city.docks.y, city.docks.w, city.docks.h);

  // Parks.
  for (const pk of city.parks) {
    ctx.fillStyle = PALETTE.park;
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.strokeStyle = PALETTE.parkLine;
    ctx.strokeRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = '#1d5a34';
    for (const tr of pk.trees) {
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Roads.
  ctx.fillStyle = PALETTE.road;
  for (const rx of ROAD_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const ry of ROAD_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  // Lane dashes.
  ctx.strokeStyle = PALETTE.lane;
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  for (const rx of ROAD_X) {
    ctx.beginPath();
    ctx.moveTo(rx, 0);
    ctx.lineTo(rx, WORLD_H);
    ctx.stroke();
  }
  for (const ry of ROAD_Y) {
    ctx.beginPath();
    ctx.moveTo(0, ry);
    ctx.lineTo(WORLD_W, ry);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Buildings with lit windows and a neon edge.
  for (const b of city.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = b.neon;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = PALETTE.windowLit;
    const cols = Math.max(1, Math.floor(b.w / 22));
    const rows = Math.max(1, Math.floor(b.h / 24));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        if ((cx * 7 + cy * 11 + b.floors) % 3 === 0) {
          ctx.globalAlpha = 0.85;
          ctx.fillRect(b.x + 8 + cx * 22, b.y + 8 + cy * 24, 10, 12);
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  // Neon signs.
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  for (const s of city.neonSigns) {
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(world.time * 2 + s.x);
    ctx.fillText(s.text, s.x, s.y - 6);
  }
  ctx.globalAlpha = 1;

  // Crates on the docks.
  for (const c of city.crates) {
    if (c.taken) continue;
    ctx.fillStyle = '#b98a3d';
    ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
    ctx.strokeStyle = '#7a5a22';
    ctx.strokeRect(c.x - 9, c.y - 9, 18, 18);
    ctx.beginPath();
    ctx.moveTo(c.x - 9, c.y - 9);
    ctx.lineTo(c.x + 9, c.y + 9);
    ctx.moveTo(c.x + 9, c.y - 9);
    ctx.lineTo(c.x - 9, c.y + 9);
    ctx.stroke();
  }

  // Cash pickups.
  for (const pk of world.pickups) {
    if (pk.taken) continue;
    ctx.fillStyle = PALETTE.money;
    ctx.beginPath();
    ctx.arc(pk.x, pk.y, 8 + Math.sin(world.time * 4) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0e2f1e';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillText('$', pk.x, pk.y + 4);
  }

  // Pedestrians.
  for (const pd of world.peds) {
    ctx.save();
    ctx.translate(pd.x, pd.y);
    if (pd.down > 0) {
      ctx.rotate(Math.PI / 2);
      ctx.globalAlpha = 0.7;
    }
    ctx.fillStyle = '#e8e6ff';
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath();
    ctx.arc(0, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Cars: parked and traffic.
  for (const c of world.cars) {
    if (c.kind === 'parked' || c.kind === 'traffic') drawCar(ctx, c, false);
  }
  // Police.
  for (const cop of world.police) drawPolice(ctx, cop);
  // The player's car.
  const p = world.player;
  if (!p.onFoot && p.car) drawCar(ctx, p.car, true);

  // The player on foot.
  if (p.onFoot) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 2, 0);
    ctx.lineTo(PLAYER.radius - 6, -5);
    ctx.lineTo(PLAYER.radius - 6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Particles.
  for (const pt of world.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawObjective(ctx, world, camX, camY, viewW, viewH);
  ctx.restore();

  // Night vignette.
  const vg = ctx.createRadialGradient(viewW / 2, viewH / 2, viewH * 0.42, viewW / 2, viewH / 2, viewH * 0.95);
  vg.addColorStop(0, 'rgba(4,6,16,0)');
  vg.addColorStop(1, 'rgba(4,6,16,0.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, viewW, viewH);

  // Flash on mission complete.
  if (world.flash > 0) {
    ctx.fillStyle = `rgba(255,209,102,${world.flash * 0.5})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  if (world.state === 'play' || world.state === 'brief') {
    drawHud(ctx, world, viewW, viewH);
  }

  if (world.state === 'title') {
    ctx.save();
    ctx.fillStyle = 'rgba(4,6,16,0.55)';
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2e88';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = 34;
    ctx.fillText('NEON HARBOR', viewW / 2, viewH / 2 - 60);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('An open-world crime game in Port Meridian', viewW / 2, viewH / 2 - 8);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText('WASD drive & walk  •  E steal / exit a car  •  SPACE punch  •  M mute', viewW / 2, viewH / 2 + 34);
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('Press ENTER to start', viewW / 2, viewH / 2 + 92);
    ctx.restore();
  }

  if (world.state === 'brief' && world.mission) {
    const def = world.mission.def;
    overlay(ctx, viewW, viewH, `MISSION ${def.id}: ${def.name}`, [def.brief, `Payout  $${def.payout}`, '', 'Press ENTER to begin'], '#ffd166');
  }
  if (world.state === 'busted') {
    overlay(ctx, viewW, viewH, 'BUSTED', ['The Port Meridian PD caught you.', `Fine paid: $${150}`, '', 'Press R to get back out there'], '#2b6bff');
  }
  if (world.state === 'wasted') {
    overlay(ctx, viewW, viewH, 'WASTED', ['The city chews you up.', `Fine paid: $${200}`, '', 'Press R to get back out there'], '#ff4d4d');
  }
  if (world.state === 'failed') {
    overlay(ctx, viewW, viewH, 'MISSION FAILED', [world.failReason || 'Try again.', '', 'Press R to retry the mission'], '#ff4d4d');
  }
  if (world.state === 'win') {
    overlay(ctx, viewW, viewH, 'YOU WIN', [`All 8 missions done. Port Meridian is yours.`, `Total earned: $${world.stats.earned.toLocaleString('en-US')}`, '', 'Press R to play again'], '#7dff9e');
  }
}

