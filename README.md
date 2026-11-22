# Neon Harbor

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/maharani212/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/maharani212/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01)

An open-world crime game in the spirit of GTA 6, built for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01). Explore the neon night city of Port Meridian on foot and by car, steal vehicles, outrun the Port Meridian PD, and run eight story missions from your first stolen ride to a five-star finale at the yacht.

## How to play

Open `game/index.html` in a desktop browser, or serve it locally:

```
node serve.ts
```

then open http://localhost:8080.

- **WASD / arrows** — walk and drive (Shift to run on foot)
- **E** — steal / enter a car, or step out of one
- **Space** — punch on foot
- **M** — mute sound
- **Enter** — start, begin a mission
- **R** — retry after being busted, wasted, or failing a mission

Stealing a car or hitting a pedestrian raises your wanted level (1–5 stars). The police chase harder as the stars climb. Lose them by breaking line of sight and waiting, or outrun them. Get busted on foot or wasted at 0 HP and you pay a fine and start the mission over.

## Missions

1. First Ride — steal a car, drive to the marker ($200)
2. Night Market Dash — deliver a package across town against the clock ($350)
3. Harbor Heist — grab 3 crates at the docks while the law watches ($500)
4. The Courier — three drop-offs, in order ($600)
5. Getaway Driver — lose a 3-star chase and reach the safehouse ($800)
6. Midnight Run — race through 4 checkpoints across the city ($1,000)
7. Port Meridian PD — survive a 4-star manhunt for 60 seconds ($1,200)
8. Five-Star Finale — survive the 5-star chase and reach the yacht ($2,000)

## The game

- A deterministic procedural city (seeded): roads, buildings with neon signs, parks, a harbor with docks and a pier
- Traffic that drives the roads and pedestrians that walk the sidewalks
- A wanted system with police cars that chase, ram, and bust you
- A HUD with money, mission objective, wanted stars, speed, health, and a live minimap
- Synthesised WebAudio sound: engine hum, sirens, pickup chimes, crash thuds, mission jingles
- No libraries, no network: plain ES modules and canvas, served as static files

## Build

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` (or `$MAKEFUN_OUTPUT_DIR`) and writes `dossier.json` with the vendored make.fun library:

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots are real renders of the game, staged with `?shot=start|play|chase|mission&seed=1` (see `shots.json`).
