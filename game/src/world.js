// Bloom Bastion's simulation: the lawn, the path, the plants, the pests and everything that
// flies between them. Pure rules, no drawing and no sound — step(dt) advances the world by one
// fixed step and returns EVENT_* flags for whatever happened, so the shell can play sounds and
// announcements. All randomness comes from the seeded stream handed in at creation, so a seed
// always grows the same game (the screenshot scenes rely on that).

import {
  GRID, INCOME, PATH_CELLS, PESTS, SPAWN_GAP, START_LIVES, START_SUN, TOTAL_WAVES,
  TOWERS, UPGRADE, SELL_SHARE, WAVE_HP_GROWTH, WAVE_SPEED_GROWTH,
} from './config.js';

export const EVENT_SHOT = 1;
export const EVENT_SPLASH = 2;
export const EVENT_FREEZE = 4;
export const EVENT_KILL = 8;
export const EVENT_LEAK = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_WIN = 64;
export const EVENT_LOSE = 128;
export const EVENT_BOSS_DOWN = 256;
export const EVENT_THORN = 512;
export const EVENT_HIT = 1024;

/** Pixel position of the centre of a grid cell. */
export function cellCentre(col, row) {
  return { x: GRID.x + col * GRID.cell + GRID.cell / 2, y: GRID.y + row * GRID.cell + GRID.cell / 2 };
}

/** The path as pixel waypoints, with the total walking length and each segment's span. */
function buildPath() {
  const points = PATH_CELLS.map(([col, row]) => cellCentre(col, row));
  const segments = [];
  let length = 0;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    segments.push({ a, b, span, from: length });
    length += span;
  }
  return { points, segments, length };
}

/** The set of "col,row" keys the path crosses inside the lawn; those cells cannot be planted. */
function buildPathCells() {
  const cells = new Set();
  for (let i = 0; i + 1 < PATH_CELLS.length; i += 1) {
    const [c0, r0] = PATH_CELLS[i];
    const [c1, r1] = PATH_CELLS[i + 1];
    const dc = Math.sign(c1 - c0);
    const dr = Math.sign(r1 - r0);
    let c = c0;
    let r = r0;
    cells.add(`${c},${r}`);
    while (c !== c1 || r !== r1) {
      c += dc;
      r += dr;
      cells.add(`${c},${r}`);
    }
  }
  for (const key of [...cells]) {
    const [c, r] = key.split(',').map(Number);
    if (c < 0 || r < 0 || c >= GRID.cols || r >= GRID.rows) cells.delete(key);
  }
  return cells;
}

/**
 * Each wave as groups of [pest kind, count]; groups march in with a pause between them.
 * Garden Ants debut on wave 4 and swarm in growing numbers from then on: individually
 * frail, but the fastest thing on the path, so a garden without slows or splash leaks.
 */
const WAVE_RECIPES = [
  [['aphid', 8]],
  [['aphid', 10], ['aphid', 6]],
  [['aphid', 8], ['beetle', 3]],
  [['aphid', 8], ['ant', 6], ['aphid', 6]],
  [['beetle', 5], ['aphid', 8], ['ant', 5]],
  [['wasp', 5], ['aphid', 10], ['beetle', 3]],
  [['slug', 3], ['aphid', 10], ['ant', 8]],
  [['beetle', 6], ['wasp', 5], ['ant', 6]],
  [['aphid', 16], ['slug', 3], ['wasp', 4], ['ant', 8]],
  [['slug', 5], ['beetle', 5], ['ant', 10]],
  [['wasp', 9], ['aphid', 12], ['ant', 8]],
  [['beetle', 8], ['slug', 4], ['aphid', 10], ['ant', 10]],
  [['wasp', 8], ['slug', 5], ['beetle', 5], ['ant', 12]],
  [['aphid', 20], ['wasp', 8], ['slug', 4], ['ant', 14]],
  [['beetle', 4], ['boss', 1], ['wasp', 6], ['slug', 3], ['ant', 10]],
];

/** Health multiplier for a wave's pests: gentle compounding growth after the first wave. */
function waveHpScale(wave) {
  return Math.pow(WAVE_HP_GROWTH, wave - 1);
}

/** Speed multiplier for a wave's pests: the march quickens a little every wave. */
function waveSpeedScale(wave) {
  return Math.pow(WAVE_SPEED_GROWTH, wave - 1);
}

export function createWorld(random) {
  const path = buildPath();
  const pathCells = buildPathCells();

  const state = {
    sun: START_SUN,
    lives: START_LIVES,
    score: 0,
    wave: 0,
    waveActive: false,
    won: false,
    lost: false,
    time: 0,
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    texts: [],
    drops: [],
    spawnQueue: [],
    spawnTimer: 0,
    dropTimer: 5,
    incomeCarry: 0,
    shake: 0,
    banner: null,
    decor: [],
    kills: 0,
    planted: 0,
  };

  /** Where a walking distance along the path lands, and which way it faces. */
  function positionAt(dist) {
    const d = Math.max(0, Math.min(path.length, dist));
    for (const seg of path.segments) {
      if (d <= seg.from + seg.span || seg === path.segments[path.segments.length - 1]) {
        const t = seg.span === 0 ? 0 : (d - seg.from) / seg.span;
        return {
          x: seg.a.x + (seg.b.x - seg.a.x) * t,
          y: seg.a.y + (seg.b.y - seg.a.y) * t,
          dx: Math.sign(seg.b.x - seg.a.x),
          dy: Math.sign(seg.b.y - seg.a.y),
        };
      }
    }
    const last = path.points[path.points.length - 1];
    return { x: last.x, y: last.y, dx: 1, dy: 0 };
  }

  /** Scatter the lawn's decoration: flowers and grass tufts on cells the path never touches. */
  function growDecor() {
    state.decor = [];
    for (let row = 0; row < GRID.rows; row += 1) {
      for (let col = 0; col < GRID.cols; col += 1) {
        if (pathCells.has(`${col},${row}`)) continue;
        const roll = random.next();
        if (roll < 0.16) state.decor.push({ col, row, kind: 'flower', variant: random.int(0, 2), phase: random.range(0, 6.28) });
        else if (roll < 0.34) state.decor.push({ col, row, kind: 'tuft', variant: random.int(0, 2), phase: random.range(0, 6.28) });
      }
    }
  }

  function reset() {
    state.sun = START_SUN;
    state.lives = START_LIVES;
    state.score = 0;
    state.wave = 0;
    state.waveActive = false;
    state.won = false;
    state.lost = false;
    state.time = 0;
    state.towers = [];
    state.enemies = [];
    state.projectiles = [];
    state.particles = [];
    state.texts = [];
    state.drops = [];
    state.spawnQueue = [];
    state.spawnTimer = 0;
    state.dropTimer = 5;
    state.incomeCarry = 0;
    state.shake = 0;
    state.banner = null;
    state.kills = 0;
    state.planted = 0;
    growDecor();
  }

  function burst(x, y, color, count, speed, life, size, gravity = 0) {
    for (let i = 0; i < count; i += 1) {
      const angle = random.range(0, Math.PI * 2);
      const v = random.range(speed * 0.3, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - speed * 0.25,
        life: random.range(life * 0.5, life),
        maxLife: life,
        size: random.range(size * 0.6, size * 1.3),
        color, gravity, ring: 0,
      });
    }
  }

  function ring(x, y, color, maxR) {
    state.particles.push({ x, y, vx: 0, vy: 0, life: 0.32, maxLife: 0.32, size: 3, color, gravity: 0, ring: maxR });
  }

  function floatText(x, y, text, color) {
    state.texts.push({ x, y, text, color, t: 0 });
  }

  function towerAt(col, row) {
    return state.towers.find((t) => t.col === col && t.row === row) ?? null;
  }

  function canPlant(col, row) {
    return col >= 0 && row >= 0 && col < GRID.cols && row < GRID.rows
      && !pathCells.has(`${col},${row}`) && !towerAt(col, row);
  }

  function placeTower(type, col, row) {
    const def = TOWERS[type];
    if (!def || !canPlant(col, row) || state.sun < def.cost) return false;
    const { x, y } = cellCentre(col, row);
    state.sun -= def.cost;
    state.towers.push({
      type, col, row, x, y,
      level: 1,
      invested: def.cost,
      damage: def.damage,
      range: def.range,
      rate: def.rate,
      cooldown: random.range(0, 0.2),
      angle: -Math.PI / 2,
      muzzle: 0,
      pulse: 0,
      sway: random.range(0, 6.28),
    });
    state.planted += 1;
    burst(x, y + 14, '#a5d68a', 8, 60, 0.5, 4, 120);
    return true;
  }

  function upgradeCost(tower) {
    return Math.round(TOWERS[tower.type].cost * UPGRADE.costShare);
  }

  function upgradeTower(tower) {
    if (!tower || tower.level >= 2 || state.sun < upgradeCost(tower)) return false;
    const cost = upgradeCost(tower);
    state.sun -= cost;
    tower.invested += cost;
    tower.level = 2;
    tower.damage *= UPGRADE.damage;
    tower.range *= UPGRADE.range;
    tower.rate *= UPGRADE.rate;
    burst(tower.x, tower.y, '#ffd94d', 12, 80, 0.6, 4);
    floatText(tower.x, tower.y - 30, 'Level 2!', '#f5a623');
    return true;
  }

  function sellValue(tower) {
    return Math.round(tower.invested * SELL_SHARE);
  }

  function sellTower(tower) {
    const index = state.towers.indexOf(tower);
    if (index === -1) return 0;
    const value = sellValue(tower);
    state.sun += value;
    state.towers.splice(index, 1);
    burst(tower.x, tower.y, '#e8dcc0', 8, 60, 0.45, 4, 80);
    floatText(tower.x, tower.y - 24, `+${value} sun`, '#b8860b');
    return value;
  }

  /** Flatten a wave recipe into a spawn queue of { kind, delay } entries. */
  function buildSpawnQueue(wave) {
    const queue = [];
    const recipe = WAVE_RECIPES[Math.min(wave, TOTAL_WAVES) - 1];
    recipe.forEach((group, groupIndex) => {
      const [kind, count] = group;
      for (let i = 0; i < count; i += 1) {
        let delay = SPAWN_GAP * random.range(0.85, 1.15);
        if (i === 0) delay = groupIndex === 0 ? 0.6 : 2.0;
        if (kind === 'boss') delay = 1.2;
        queue.push({ kind, delay });
      }
    });
    return queue;
  }

  function startWave() {
    if (state.waveActive || state.won || state.lost || state.wave >= TOTAL_WAVES) return false;
    state.wave += 1;
    state.spawnQueue = buildSpawnQueue(state.wave);
    state.spawnTimer = 0;
    state.waveActive = true;
    const bossWave = state.wave === TOTAL_WAVES;
    state.banner = {
      title: bossWave ? 'Final wave!' : `Wave ${state.wave}`,
      sub: bossWave ? 'The Goliath Beetle is coming…' : '',
      t: 0,
    };
    return true;
  }

  function spawnNext(kind) {
    const def = PESTS[kind];
    const scale = kind === 'boss' ? 1 : waveHpScale(state.wave);
    const hp = Math.round(def.hp * scale);
    state.enemies.push({
      kind, hp, maxHp: hp,
      dist: 0, x: 0, y: 0, dx: 1, dy: 0,
      speed: def.speed * waveSpeedScale(state.wave) * random.range(0.9, 1.1),
      slowT: 0, slowFactor: 0,
      freezeT: 0, flashT: 0,
      wobble: random.range(0, 6.28),
      radius: def.radius, bounty: def.bounty, score: def.score, damage: def.damage,
      dead: false, escaped: false,
    });
  }

  function damageEnemy(enemy, amount, events) {
    enemy.hp -= amount;
    enemy.flashT = 0.09;
    if (enemy.dead) return events;
    if (enemy.hp > 0) return events | EVENT_HIT;
    enemy.dead = true;
    state.kills += 1;
    state.sun += enemy.bounty;
    state.score += enemy.score;
    const colors = { aphid: '#8bc34a', beetle: '#5d4037', slug: '#c5e1a5', wasp: '#fdd835', ant: '#b07a4f', boss: '#4e342e' };
    burst(enemy.x, enemy.y, colors[enemy.kind], enemy.kind === 'boss' ? 46 : 12, enemy.kind === 'boss' ? 190 : 110, 0.6, 5, 140);
    floatText(enemy.x, enemy.y - enemy.radius - 6, `+${enemy.score}`, '#fff59d');
    if (enemy.kind === 'boss') {
      state.shake = 14;
      ring(enemy.x, enemy.y, '#8d6e63', 130);
      events |= EVENT_BOSS_DOWN;
    }
    return events | EVENT_KILL;
  }

  /**
   * A tower's shot, carrying everything its hit will do. Level 2 plants shoot with their
   * trick folded in: a Bee Hive's burst is wider, and a Thorn Vine's dart slows harder
   * and for longer (a Daisy Turret's trick — a second target — lives in the firing step).
   * px/py trail one step behind x/y so the renderer can streak the shot's path.
   */
  function fireProjectile(tower, target) {
    const def = TOWERS[tower.type];
    const grown = tower.level >= 2;
    state.projectiles.push({
      x: tower.x, y: tower.y - 16,
      px: tower.x, py: tower.y - 16,
      target, speed: 430,
      damage: tower.damage,
      kind: tower.type,
      splash: def.splash ? def.splash * (grown ? 1.35 : 1) : 0,
      slow: def.slow ? (grown ? 0.62 : def.slow) : 0,
      slowTime: def.slowTime ? (grown ? 2.4 : def.slowTime) : 0,
    });
  }

  function step(dt) {
    let events = 0;
    if (state.won || state.lost) {
      updateEffects(dt);
      return events;
    }
    state.time += dt;

    // Sunlight income and falling sun drops.
    state.incomeCarry += INCOME.perSecond * dt;
    while (state.incomeCarry >= 1) {
      state.sun += 1;
      state.incomeCarry -= 1;
    }
    state.dropTimer -= dt;
    if (state.dropTimer <= 0) {
      state.dropTimer = random.range(INCOME.dropEvery[0], INCOME.dropEvery[1]);
      const col = random.int(0, GRID.cols - 1);
      const row = random.int(0, GRID.rows - 1);
      const { x, y } = cellCentre(col, row);
      state.drops.push({ x: x + random.range(-14, 14), y: y + random.range(-14, 14), t: 0, value: INCOME.dropValue });
    }
    for (const drop of state.drops) drop.t += dt;
    state.drops = state.drops.filter((d) => d.t < INCOME.dropLife);

    // Spawning.
    if (state.spawnQueue.length > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const next = state.spawnQueue.shift();
        spawnNext(next.kind);
        state.spawnTimer = next.delay;
      }
    }

    // Pests walk the path.
    for (const enemy of state.enemies) {
      if (enemy.dead || enemy.escaped) continue;
      if (enemy.flashT > 0) enemy.flashT -= dt;
      if (enemy.freezeT > 0) enemy.freezeT -= dt;
      else if (enemy.slowT > 0) enemy.slowT -= dt;
      const factor = enemy.freezeT > 0 ? 0 : enemy.slowT > 0 ? 1 - enemy.slowFactor : 1;
      enemy.dist += enemy.speed * factor * dt;
      const pos = positionAt(enemy.dist);
      enemy.x = pos.x;
      enemy.y = pos.y + (enemy.kind === 'wasp' ? Math.sin(state.time * 9 + enemy.wobble) * 4 - 8 : 0);
      enemy.dx = pos.dx;
      enemy.dy = pos.dy;
      if (enemy.dist >= path.length) {
        enemy.escaped = true;
        state.lives -= enemy.damage;
        state.shake = Math.max(state.shake, enemy.kind === 'boss' ? 12 : 5);
        burst(enemy.x - 16, enemy.y, '#ef5350', 10, 90, 0.5, 4, 60);
        floatText(enemy.x - 34, enemy.y - 26, `-${enemy.damage} ♥`, '#ef9a9a');
        events |= EVENT_LEAK;
        if (state.lives <= 0) {
          state.lives = 0;
          state.lost = true;
          events |= EVENT_LOSE;
        }
      }
    }

    // Plants aim and fire.
    for (const tower of state.towers) {
      tower.cooldown -= dt;
      tower.muzzle = Math.max(0, tower.muzzle - dt);
      tower.pulse = Math.max(0, tower.pulse - dt);
      let target = null;
      for (const enemy of state.enemies) {
        if (enemy.dead || enemy.escaped) continue;
        const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
        if (d <= tower.range && (target === null || enemy.dist > target.dist)) target = enemy;
      }
      if (target) tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
      if (!target || tower.cooldown > 0) continue;
      tower.cooldown = tower.rate;
      tower.muzzle = 0.09;
      if (tower.type === 'fern') {
        tower.pulse = 0.35;
        ring(tower.x, tower.y, '#a5e8ff', tower.range);
        // A level 2 fern's frost lingers: its freeze holds pests far longer.
        const freezeTime = TOWERS.fern.freezeTime * (tower.level >= 2 ? 1.45 : 1);
        for (const enemy of state.enemies) {
          if (enemy.dead || enemy.escaped) continue;
          if (Math.hypot(enemy.x - tower.x, enemy.y - tower.y) <= tower.range) {
            enemy.freezeT = Math.max(enemy.freezeT, freezeTime);
            events = damageEnemy(enemy, tower.damage, events);
          }
        }
        events |= EVENT_FREEZE;
      } else {
        fireProjectile(tower, target);
        // A level 2 Daisy Turret's trick: it also picks off the next pest in reach.
        if (tower.type === 'daisy' && tower.level >= 2) {
          let second = null;
          for (const enemy of state.enemies) {
            if (enemy === target || enemy.dead || enemy.escaped) continue;
            const d = Math.hypot(enemy.x - tower.x, enemy.y - tower.y);
            if (d <= tower.range && (second === null || enemy.dist > second.dist)) second = enemy;
          }
          if (second) fireProjectile(tower, second);
        }
        events |= EVENT_SHOT;
        if (tower.type === 'thorn') events |= EVENT_THORN;
      }
    }

    // Projectiles home in on their pest.
    for (const p of state.projectiles) {
      const tx = p.target && !p.target.dead && !p.target.escaped ? p.target.x : p.x;
      const ty = p.target && !p.target.dead && !p.target.escaped ? p.target.y : p.y;
      const dx = tx - p.x;
      const dy = ty - p.y;
      const d = Math.hypot(dx, dy);
      const move = p.speed * dt;
      if (d <= Math.max(move, p.target ? p.target.radius : 4)) {
        p.done = true;
        if (p.target && !p.target.dead && !p.target.escaped) {
          if (p.splash > 0) {
            ring(p.target.x, p.target.y, '#ffca28', p.splash);
            for (const enemy of state.enemies) {
              if (enemy.dead || enemy.escaped) continue;
              if (Math.hypot(enemy.x - p.target.x, enemy.y - p.target.y) <= p.splash + enemy.radius * 0.5) {
                events = damageEnemy(enemy, p.damage, events);
              }
            }
            events |= EVENT_SPLASH;
          } else {
            if (p.kind === 'thorn') {
              p.target.slowT = Math.max(p.target.slowT, p.slowTime);
              p.target.slowFactor = p.slow;
            }
            events = damageEnemy(p.target, p.damage, events);
          }
        }
      } else {
        p.px = p.x;
        p.py = p.y;
        p.x += (dx / d) * move;
        p.y += (dy / d) * move;
      }
    }
    state.projectiles = state.projectiles.filter((p) => !p.done);
    state.enemies = state.enemies.filter((e) => !e.dead && !e.escaped);

    // A wave is cleared when its queue is spent and the lawn is empty of pests.
    if (state.waveActive && state.spawnQueue.length === 0 && state.enemies.length === 0) {
      state.waveActive = false;
      const bonus = 15 + state.wave * 2;
      state.sun += bonus;
      state.score += state.wave * 15;
      floatText(640, 300, `Wave ${state.wave} cleared! +${bonus} sun`, '#fff59d');
      // A little petal confetti over the lawn to celebrate.
      const petalColors = ['#ff8a9e', '#ffd54f', '#ba68c8', '#fff59d'];
      for (let i = 0; i < 3; i += 1) {
        burst(random.range(240, 1040), random.range(160, 480), petalColors[i % petalColors.length], 12, 120, 0.9, 4.4, 150);
      }
      events |= EVENT_WAVE_CLEAR;
      if (state.wave >= TOTAL_WAVES) {
        state.won = true;
        state.score += state.lives * 25;
        events |= EVENT_WIN;
      }
    }

    updateEffects(dt);
    return events;
  }

  function updateEffects(dt) {
    for (const p of state.particles) {
      p.life -= dt;
      if (!p.ring) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravity * dt;
      }
    }
    state.particles = state.particles.filter((p) => p.life > 0);
    for (const t of state.texts) {
      t.t += dt;
      t.y -= 34 * dt;
    }
    state.texts = state.texts.filter((t) => t.t < 1.15);
    if (state.banner) {
      state.banner.t += dt;
      if (state.banner.t > 2.2) state.banner = null;
    }
    state.shake = Math.max(0, state.shake - 42 * dt);
  }

  /** Collect a sun drop near a point; returns the sun gained (0 when nothing was there). */
  function collectDropAt(x, y) {
    for (let i = 0; i < state.drops.length; i += 1) {
      const drop = state.drops[i];
      if (Math.hypot(drop.x - x, drop.y - y) <= 34) {
        state.drops.splice(i, 1);
        state.sun += drop.value;
        burst(drop.x, drop.y, '#ffd94d', 10, 90, 0.5, 4);
        floatText(drop.x, drop.y - 18, `+${drop.value}`, '#f5a623');
        return drop.value;
      }
    }
    return 0;
  }

  reset();

  return {
    state,
    path,
    pathCells,
    reset,
    step,
    startWave,
    placeTower,
    upgradeTower,
    sellTower,
    upgradeCost,
    sellValue,
    towerAt,
    canPlant,
    collectDropAt,
    cellCentre,
  };
}
