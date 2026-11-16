// The screenshot scenes behind ?shot=title|battle|boss|victory. Each one drives the real
// simulation forward from a fresh world with a scripted gardener — a fixed planting plan of
// good lawn squares beside the path, bought in order whenever the sunlight affords it, waves
// started as soon as the lawn is clear — so every frame is a real game state the rules
// produced, and the same seed always grows the same frame.

import { STEP, TOTAL_WAVES } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/**
 * The gardener's planting plan: [tower type, column, row] in buying order. The squares hug
 * the path's bends, where a plant's range covers the most path, and the mix grows from cheap
 * daisies into the full garden as the waves pay for it.
 */
const PLAN = [
  ['daisy', 2, 2], ['daisy', 4, 3], ['thorn', 4, 0], ['daisy', 6, 4], ['hive', 8, 3],
  ['daisy', 2, 0], ['fern', 10, 3], ['daisy', 12, 5], ['thorn', 6, 6], ['hive', 12, 1],
  ['daisy', 14, 4], ['fern', 8, 6], ['hive', 4, 6], ['daisy', 16, 2], ['thorn', 14, 7],
  ['hive', 10, 0], ['daisy', 6, 1], ['fern', 16, 5], ['daisy', 2, 4], ['hive', 14, 1],
  ['thorn', 10, 5], ['fern', 12, 7], ['daisy', 8, 1],
];

/** Safety bound so a staged scene can never loop forever: 40 simulated minutes. */
const MAX_STEPS = 60 * 60 * 40;

/**
 * Play the world forward with the scripted gardener until `done(state)` holds. Between waves
 * the gardener also collects every sun drop on the lawn, as a player would. Returns false
 * when the step bound ran out first.
 */
function playForward(world, done) {
  const state = world.state;
  let planIndex = 0;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    // Buy the next planned plant whenever it is affordable; once the garden is planted,
    // spend spare sunlight growing plants to level 2, earliest planted first.
    while (planIndex < PLAN.length) {
      const [type, col, row] = PLAN[planIndex];
      if (!world.placeTower(type, col, row)) break;
      planIndex += 1;
    }
    if (planIndex >= PLAN.length) {
      const sapling = state.towers.find((t) => t.level < 2);
      if (sapling && state.sun >= world.upgradeCost(sapling) + 30) world.upgradeTower(sapling);
    }
    if (!state.waveActive && !state.won && !state.lost) world.startWave();
    if (step % 90 === 0) {
      for (const drop of [...state.drops]) world.collectDropAt(drop.x, drop.y);
    }
    world.step(STEP);
    if (done(state)) return true;
    if (state.lost) return false;
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * - title:   a few idle seconds in, the title screen over the empty garden.
 * - battle:  a mid-late wave at its busiest — the planted garden firing, pests strung
 *            along the path, shots in the air and a sun drop waiting to be clicked.
 * - boss:    the final wave, the Goliath Beetle mid-path against the full garden.
 * - victory: the final wave cleared — the win screen over the garden that did it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'battle') {
    // Busy means strung out: a fresh group still entering at the gate while the
    // leaders are already deep in the garden, more than one kind on the path and
    // shots in the air — not one bunched kill-box blob, and not a wave just begun.
    const rich = (s) => {
      if (s.wave < 9 || s.wave > 14 || !s.waveActive || s.banner !== null) return false;
      if (s.towers.length < 18 || s.enemies.length < 8 || s.projectiles.length < 3) return false;
      const kinds = new Set(s.enemies.map((e) => e.kind)).size;
      const deep = s.enemies.filter((e) => e.dist > 1000).length;
      const fresh = s.enemies.filter((e) => e.dist < 500).length;
      return kinds >= 2 && deep >= 2 && fresh >= 2;
    };
    const plain = (s) => s.wave >= 5 && s.waveActive && s.enemies.length >= 4
      && s.enemies.some((e) => e.dist > 600);
    if (!playForward(world, rich)) {
      // The busy frame never came: if the gardener's game already ended, grow a
      // fresh one for the plainer frame; otherwise just play on until it comes.
      if (state.lost || state.won) world.reset();
      playForward(world, plain);
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'boss') {
    // The boss crosses the garden's heart on the upper loop, freeze-cycled by the
    // fern there: catch it in a thawed moment, beetles still around it, shots flying.
    const reached = playForward(world, (s) => {
      if (s.wave < TOTAL_WAVES || !s.waveActive || s.banner !== null) return false;
      const boss = s.enemies.find((e) => e.kind === 'boss');
      return boss !== undefined && boss.dist > 1050 && boss.dist < 1400
        && boss.flashT <= 0.02 && boss.freezeT <= 0 && s.enemies.length >= 4
        && s.projectiles.length >= 2;
    });
    if (!reached) {
      playForward(world, (s) => {
        if (s.wave < TOTAL_WAVES || !s.waveActive) return false;
        const boss = s.enemies.find((e) => e.kind === 'boss');
        return boss !== undefined && boss.dist > 900 && boss.dist < 1600 && s.projectiles.length >= 1;
      });
    }
    return { screen: SCREEN_PLAY };
  }
  if (name === 'victory') {
    playForward(world, (s) => s.won);
    return { screen: state.won ? SCREEN_WIN : SCREEN_PLAY, best: state.score };
  }
  // title, and any other name.
  for (let i = 0; i < 4 / STEP; i += 1) world.step(STEP);
  return { screen: SCREEN_TITLE };
}
