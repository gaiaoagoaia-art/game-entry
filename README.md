# Bloom Bastion

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/gaiaoagoaia-art/game-entry/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/gaiaoagoaia-art/game-entry/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

An entry for the make.fun bounty [best-game-01](https://make.fun/bounty/best-game-01): **Bloom Bastion**, an original garden tower-defence game that runs offline in a desktop browser from static files — no build step, no network requests, every picture drawn in code and every sound synthesised with Web Audio.

## The game

Pests are marching down a winding dirt path to eat the flower bed. You plant defenders on the lawn, spend sunlight, and turn back all **15 waves**.

- **Four plants, four jobs** — Daisy Turret (fast single-target pollen shots), Thorn Vine (darts that slow), Bee Hive (splash bursts), Frost Fern (an area freeze). Every plant upgrades to level 2 and gains its own trick — the daisy shoots two pests at once, the vine's slow bites far harder, the hive's splash widens, the fern's freeze lasts far longer — and anything can be sold back.
- **Six pests** — quick aphids, swarming garden ants, armoured beetles, tank slugs, fast wasps, and the Goliath Beetle, a crowned boss on the final wave. Pests grow tougher — and march a little faster — with every wave.
- **Sunlight economy** — sun trickles in on its own, falls on the lawn as collectible drops, and every pest popped pays a bounty; clearing a wave pays a bonus.
- **A complete loop** — title screen with instructions, HUD (sun, lives, wave, score, best), pause, 1×/2× speed, mute, victory (with a star rating) and defeat screens with run stats, and one-click restart.
- **Feel** — particles, projectile trails, hit flashes, floating score text, screen shake when the boss falls, wave banners, and a fully synthesised soundscape with a soft music loop (no audio files).
- **Controls** — mouse to plant, collect, upgrade and sell; keys 1–4 choose a plant, Space starts a wave, F toggles speed, P pauses, M mutes, R restarts.

The simulation runs on a fixed 1/60 s step from a seeded random stream, so a seed always grows the same garden — which is also how the screenshots were staged: `game/index.html?shot=battle&seed=7` (also `title`, `boss`, `victory`) plays the real rules forward with a scripted gardener and raises `window.__shotReady` on the finished frame.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored library.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.
- `game/index.html` — the page; `game/src/` holds the game, one job per file:
  - `config.js` — every tuning number, colour and layout rectangle.
  - `random.js` — the seeded random stream.
  - `world.js` — the simulation: path, plants, pests, projectiles, waves, economy.
  - `render.js` — all canvas drawing: garden, plants, pests, HUD, toolbar, screens.
  - `input.js` — mouse and keyboard, in logical coordinates.
  - `audio.js` — Web Audio sound effects and the music loop, synthesised.
  - `shots.js` — the deterministic screenshot scenes.
  - `main.js` — boot, the fixed-step loop, and the screen/interaction state machine.
- `screenshots/` — four real renders of the game: battle (cover), title, the boss wave, victory.
- `serve.ts` — a tiny local static server for `game/`.

## Run it

```
node serve.ts            # then open http://localhost:8080
```

## Hand it in

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```
