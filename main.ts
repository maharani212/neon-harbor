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

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (reference/gate.json). Only text_max_bytes shapes the dossier;
// the rest only refuse, so they are passed exactly as the gate names them.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

// A clean output directory, so both runs of this program write the same bytes.
mkdirSync(outDir, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  const target = join(outDir, name);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}

// Copy the game and its screenshots into the output directory.
cpSync(join(here, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(here, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

// Build the dossier from the copied game and screenshots and write it out.
const dossier = buildDossier(outDir, CAPS);
writeFileSync(join(outDir, 'dossier.json'), dossier);

const shots = readdirSync(join(outDir, 'screenshots')).filter((n) => !n.startsWith('.'));
console.log(`Neon Harbor handed in: ${shots.length} screenshots, dossier ${dossier.length} bytes`);
