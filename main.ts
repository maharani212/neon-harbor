// Neon Harbor — the gta6-01 entry program (Node 22, standard library only).
//
// What it hands in: this directory's game/ folder — plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library, no network
// request) — plus screenshots/ (four real renders of the game) and a dossier.json
// the judge reads, built with the vendored make.fun library. The game itself is an
// open-world crime game: steal a car, run eight story missions across Port Meridian,
// outdrive the Port Meridian PD through a five-star finale.
//
// Run it from this directory: `node main.ts` writes /output. Outside the grader's
// container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it locally first with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps (reference/gate.json). Only text_max_bytes shapes the dossier
// bytes; the rest refuse an entry the scorer would refuse — more than 4 screenshots
// or one over 256 KiB, more than 993 entries in game/ or 48 MiB of game files in
// all, or a path under game/ over 1000 bytes. Passing them here makes this program
// fail exactly where the scorer would, instead of handing in a dead entry.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function fail(message) {
  throw new Error(`main.ts: ${message}`);
}

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(here, 'game');
  const shotsDir = join(here, 'screenshots');

  if (!existsSync(join(gameDir, 'index.html'))) fail('game/index.html is missing: a game is a directory of static files, its index.html at its root');
  if (!existsSync(shotsDir)) fail('screenshots/ is missing: the entry needs 3 or 4 renders of the game');
  const shots = readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort();
  if (shots.length < 3 || shots.length > CAPS.screenshots.max) {
    fail(`screenshots/ holds ${shots.length} images: the entry needs 3 or 4`);
  }
  for (const name of shots) {
    const bytes = statSync(join(shotsDir, name)).size;
    if (bytes > CAPS.screenshots.max_bytes) fail(`screenshots/${name} is ${bytes} bytes, over the ${CAPS.screenshots.max_bytes} allowed`);
  }

  mkdirSync(out, { recursive: true });
  cpSync(gameDir, join(out, 'game'), { recursive: true });
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

  const dossier = buildDossier(out, CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
  console.log(`Neon Harbor handed in: ${shots.length} screenshots, dossier ${dossier.length} bytes -> ${out}`);
}

main();
