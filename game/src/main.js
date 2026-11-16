// Bloom Bastion's boot and main loop: input is read every frame, the world advances in fixed
// 1/60 s steps (doubled at fast speed), and the renderer paints what is there. The game moves
// between five screens: title, play, paused, victory and defeat. Clicks plant and tend the
// garden; the keyboard mirrors every control.
//
// ?seed=N fixes the garden's random stream. ?shot=title|battle|boss|victory (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets window.__shotReady
// for a screenshot.

import { BEST_KEY, GRID, STEP, TOWERS, TOWER_ORDER } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import {
  createWorld, EVENT_BOSS_DOWN, EVENT_FREEZE, EVENT_HIT, EVENT_KILL, EVENT_LEAK,
  EVENT_LOSE, EVENT_SHOT, EVENT_SPLASH, EVENT_THORN, EVENT_WAVE_CLEAR, EVENT_WIN,
} from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_RESTART, ACTION_SPEED, createInput,
} from './input.js';
import {
  createRenderer, pointInRect, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  SCREEN_WIN, UI_RECTS,
} from './render.js';
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
const audio = createAudio();

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
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = {
    screen: scene.screen, best: scene.best ?? 0, placing: null, selected: null,
    hoverCell: null, hoverValid: false, speed: 1, muted: false,
    upgradeCost: 0, sellValue: 0,
  };
  let painted = 0;
  function paint() {
    renderer.draw(world.state, ui, world);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let placing = null;
  let selected = null;
  let speed = 1;
  let accumulator = 0;
  let last = performance.now();
  let lastShotSound = 0;
  let lastPopSound = 0;
  let lastThornSound = 0;
  let lastHitSound = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    placing = null;
    selected = null;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing. Plant your defenders, then start wave 1.');
  }

  function finishGame(wonGame) {
    screen = wonGame ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(wonGame
      ? `Victory! Score ${world.state.score}.`
      : `Defeat on wave ${world.state.wave}. Score ${world.state.score}.`);
  }

  function hoverCell() {
    const p = input.pointer;
    if (!p.inside) return null;
    const col = Math.floor((p.x - GRID.x) / GRID.cell);
    const row = Math.floor((p.y - GRID.y) / GRID.cell);
    if (col < 0 || row < 0 || col >= GRID.cols || row >= GRID.rows) return null;
    return { col, row };
  }

  function playEvents(events) {
    const now = performance.now();
    if (events & EVENT_SHOT && now - lastShotSound > 75) {
      audio.shoot();
      lastShotSound = now;
    }
    if (events & EVENT_THORN && now - lastThornSound > 110) {
      audio.thorn();
      lastThornSound = now;
    }
    if ((events & EVENT_HIT) && !(events & EVENT_KILL) && now - lastHitSound > 85) {
      audio.hit();
      lastHitSound = now;
    }
    if (events & EVENT_SPLASH) audio.splash();
    if (events & EVENT_FREEZE && now - lastPopSound > 200) audio.freeze();
    if (events & EVENT_KILL && now - lastPopSound > 90) {
      audio.pop();
      lastPopSound = now;
    }
    if (events & EVENT_BOSS_DOWN) audio.splash();
    if (events & EVENT_LEAK) {
      audio.leak();
      announce(world.state.lives === 1 ? 'A pest got through! 1 life left.' : `A pest got through! ${world.state.lives} lives left.`);
    }
    if (events & EVENT_WAVE_CLEAR) audio.coin();
    if (events & EVENT_WIN) {
      audio.win();
      finishGame(true);
    } else if (events & EVENT_LOSE) {
      audio.lose();
      finishGame(false);
    }
  }

  function handleClick(click) {
    const { x, y } = click;
    // The HUD buttons work on every screen.
    if (pointInRect(x, y, UI_RECTS.mute)) {
      announce(audio.toggleMuted() ? 'Sound off.' : 'Sound on.');
      return;
    }
    if (pointInRect(x, y, UI_RECTS.speed)) {
      speed = speed === 1 ? 2 : 1;
      announce(`Speed ${speed}×.`);
      return;
    }
    if (pointInRect(x, y, UI_RECTS.restart) && screen !== SCREEN_TITLE) {
      startGame();
      return;
    }
    if (pointInRect(x, y, UI_RECTS.pause)) {
      if (screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      return;
    }

    if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) {
      startGame();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      return;
    }

    // Play screen: a sun drop is collected before anything else claims the click.
    if (world.collectDropAt(x, y) > 0) {
      audio.coin();
      return;
    }
    // Tower cards choose what to plant.
    for (const card of UI_RECTS.cards) {
      if (pointInRect(x, y, card)) {
        if (world.state.sun >= TOWERS[card.type].cost) {
          placing = placing === card.type ? null : card.type;
          selected = null;
        } else {
          audio.error();
          announce(`Not enough sunlight for a ${TOWERS[card.type].name}.`);
        }
        return;
      }
    }
    if (pointInRect(x, y, UI_RECTS.startWave)) {
      if (world.startWave()) audio.waveHorn();
      return;
    }
    // The selected plant's buttons.
    if (selected) {
      if (selected.level < 2 && pointInRect(x, y, UI_RECTS.upgrade)) {
        if (world.upgradeTower(selected)) audio.plant();
        else audio.error();
        return;
      }
      if (pointInRect(x, y, UI_RECTS.sell)) {
        world.sellTower(selected);
        selected = null;
        audio.sell();
        return;
      }
    }
    // The lawn itself: plant, or select the plant that stands there.
    const cell = hoverCell();
    if (cell) {
      if (placing) {
        if (world.placeTower(placing, cell.col, cell.row)) {
          audio.plant();
          if (world.state.sun < TOWERS[placing].cost) placing = null;
        } else {
          audio.error();
        }
      } else {
        selected = world.towerAt(cell.col, cell.row);
      }
    } else {
      selected = null;
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const digit = input.takeDigit();
    if (digit && screen === SCREEN_PLAY) {
      const type = TOWER_ORDER.find((t) => TOWERS[t].key === digit);
      if (type && world.state.sun >= TOWERS[type].cost) {
        placing = placing === type ? null : type;
        selected = null;
      } else audio.error();
    }
    if (actions & ACTION_MUTE) announce(audio.toggleMuted() ? 'Sound off.' : 'Sound on.');
    if (actions & ACTION_SPEED) {
      speed = speed === 1 ? 2 : 1;
      announce(`Speed ${speed}×.`);
    }
    if (actions & ACTION_RESTART && screen !== SCREEN_TITLE) startGame();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
      else if (screen === SCREEN_PLAY && !world.state.waveActive && world.startWave()) audio.waveHorn();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        if (placing) placing = null;
        else screen = SCREEN_PAUSED;
      } else if (screen === SCREEN_PAUSED) screen = SCREEN_PLAY;
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    for (const click of input.takeClicks()) handleClick(click);
    handleActions();
    accumulator += Math.min((now - last) / 1000, MAX_FRAME) * speed;
    last = now;
    if (screen === SCREEN_PLAY || screen === SCREEN_TITLE) {
      let guard = 0;
      while (accumulator >= STEP && guard < 40) {
        playEvents(world.step(STEP));
        accumulator -= STEP;
        guard += 1;
        if (screen !== SCREEN_PLAY && screen !== SCREEN_TITLE) {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
    }
    const cell = hoverCell();
    const ui = {
      screen,
      best,
      placing,
      selected,
      hoverCell: cell,
      hoverValid: cell ? world.canPlant(cell.col, cell.row) : false,
      speed,
      muted: audio.muted,
      upgradeCost: selected ? world.upgradeCost(selected) : 0,
      sellValue: selected ? world.sellValue(selected) : 0,
    };
    renderer.draw(world.state, ui, world);
  }

  canvas.addEventListener('pointerdown', () => audio.unlock());
  window.addEventListener('keydown', () => audio.unlock());
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    placing = null;
    selected = null;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Bloom Bastion. Click or press Space to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
