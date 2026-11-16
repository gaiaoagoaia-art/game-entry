// Bloom Bastion's renderer: everything is drawn in code on a 2D canvas — the lawn and its
// winding dirt path, the plant towers, the pests, the HUD and toolbar, and the title, pause,
// victory and defeat screens. No image is ever loaded. The UI rectangles exported here are
// the same ones the main loop hit-tests, so what is drawn is exactly what can be clicked.

import {
  FIELD, FONT, GRID, LAYOUT, PALETTE, TOWERS, TOWER_ORDER, TOTAL_WAVES,
} from './config.js';
import { cellCentre } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Clickable rectangles, shared with the main loop. */
export const UI_RECTS = {
  cards: TOWER_ORDER.map((type, i) => ({
    type,
    x: LAYOUT.cardX + i * (LAYOUT.cardW + LAYOUT.cardGap),
    y: LAYOUT.cardY,
    w: LAYOUT.cardW,
    h: LAYOUT.cardH,
  })),
  startWave: LAYOUT.startWave,
  upgrade: { x: LAYOUT.infoX + 10, y: 664, w: 158, h: 36 },
  sell: { x: LAYOUT.infoX + 180, y: 664, w: 118, h: 36 },
  speed: { x: 1030, y: 12, w: 58, h: 32 },
  mute: { x: 1096, y: 12, w: 40, h: 32 },
  pause: { x: 1144, y: 12, w: 40, h: 32 },
  restart: { x: 1192, y: 12, w: 40, h: 32 },
};

export function pointInRect(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** What each plant's level 2 trick is, in the few words the info panel has room for. */
export const LEVEL2_PERKS = {
  daisy: 'shoots two pests at once',
  thorn: 'a far stronger slow',
  hive: 'a much wider splash',
  fern: 'a far longer freeze',
};

export function createRenderer(canvas) {
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  function roundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, size, color, align = 'left', weight = '600') {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  function drawSun(x, y, r, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * 0.6);
    ctx.fillStyle = PALETTE.sunRim;
    for (let i = 0; i < 8; i += 1) {
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(r * 0.9, -3.4);
      ctx.lineTo(r * 1.5, 0);
      ctx.lineTo(r * 0.9, 3.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.sunCore;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.sunRim;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawHeart(x, y, s) {
    ctx.fillStyle = PALETTE.heart;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.9);
    ctx.bezierCurveTo(x - s * 1.5, y, x - s * 0.7, y - s * 1.1, x, y - s * 0.25);
    ctx.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.5, y, x, y + s * 0.9);
    ctx.fill();
  }

  function drawGarden(state, world) {
    // Sky strip behind the HUD band, then the lawn as a checkerboard of greens.
    const sky = ctx.createLinearGradient(0, 0, 0, LAYOUT.hudHeight);
    sky.addColorStop(0, PALETTE.skyTop);
    sky.addColorStop(1, PALETTE.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, FIELD.width, LAYOUT.hudHeight);
    for (let row = 0; row < GRID.rows; row += 1) {
      for (let col = 0; col < GRID.cols; col += 1) {
        ctx.fillStyle = (col + row) % 2 === 0 ? PALETTE.lawnA : PALETTE.lawnB;
        ctx.fillRect(GRID.x + col * GRID.cell, GRID.y + row * GRID.cell, GRID.cell, GRID.cell);
      }
    }
    ctx.fillStyle = PALETTE.lawnB;
    ctx.fillRect(0, GRID.y + GRID.rows * GRID.cell, FIELD.width, LAYOUT.toolbarY - (GRID.y + GRID.rows * GRID.cell));
    ctx.fillRect(0, GRID.y, GRID.x, GRID.rows * GRID.cell);
    ctx.fillRect(GRID.x + GRID.cols * GRID.cell, GRID.y, FIELD.width - (GRID.x + GRID.cols * GRID.cell), GRID.rows * GRID.cell);

    // The dirt path: one thick round-joined stroke, edged darker underneath.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of [[GRID.cell * 0.94, PALETTE.dirtEdge], [GRID.cell * 0.82, PALETTE.dirt]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      world.path.points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
    // Pebbles on the path, fixed spots from the decoration phases.
    ctx.fillStyle = 'rgba(160, 128, 84, 0.5)';
    for (let i = 0; i < state.decor.length; i += 3) {
      const d = state.decor[i];
      const p = world.path.points[1 + (i % (world.path.points.length - 2))];
      ctx.beginPath();
      ctx.arc(p.x + Math.sin(d.phase) * 14, p.y + Math.cos(d.phase * 2) * 12, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hedges down both sides where the pests come and go.
    ctx.fillStyle = PALETTE.hedge;
    ctx.fillRect(0, GRID.y, 26, GRID.rows * GRID.cell);
    ctx.fillRect(FIELD.width - 26, GRID.y, 26, GRID.rows * GRID.cell);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    for (let y = GRID.y + 16; y < GRID.y + GRID.rows * GRID.cell; y += 34) {
      ctx.beginPath();
      ctx.arc(13, y, 7, 0, Math.PI * 2);
      ctx.arc(FIELD.width - 13, y + 12, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lawn decoration: little flowers and grass tufts, swaying gently.
    for (const d of state.decor) {
      const { x, y } = cellCentre(d.col, d.row);
      const sway = Math.sin(state.time * 1.6 + d.phase) * 2;
      if (d.kind === 'tuft') {
        ctx.strokeStyle = '#4e8f3a';
        ctx.lineWidth = 2.4;
        for (let b = -1; b <= 1; b += 1) {
          ctx.beginPath();
          ctx.moveTo(x + b * 6, y + 16);
          ctx.quadraticCurveTo(x + b * 8 + sway, y, x + b * 10 + sway * 1.6, y - 12 - Math.abs(b) * -3);
          ctx.stroke();
        }
      } else {
        const colors = ['#ff8a9e', '#ffd54f', '#ba68c8'];
        ctx.fillStyle = colors[d.variant];
        for (let p = 0; p < 5; p += 1) {
          const a = (p / 5) * Math.PI * 2 + d.phase;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 5 + sway * 0.4, y + 8 + Math.sin(a) * 5, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fff59d';
        ctx.beginPath();
        ctx.arc(x + sway * 0.4, y + 8, 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawTowerBody(tower, t) {
    const { x, y } = tower;
    // Soil mound.
    ctx.fillStyle = '#8a6642';
    ctx.beginPath();
    ctx.ellipse(x, y + 22, 24, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const sway = Math.sin(t * 2 + tower.sway) * 0.05;
    if (tower.type === 'daisy') {
      ctx.strokeStyle = '#3e7d32';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, y + 20);
      ctx.quadraticCurveTo(x + sway * 30, y, x + sway * 40, y - 14);
      ctx.stroke();
      const hx = x + sway * 40;
      const hy = y - 16;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(tower.angle + Math.PI / 2);
      ctx.fillStyle = tower.level >= 2 ? '#ffe082' : '#ffffff';
      for (let p = 0; p < 8; p += 1) {
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, -13, 5.6, 11, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = '#ffb300';
      ctx.beginPath();
      ctx.arc(hx, hy, 8.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f57f17';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
      if (tower.muzzle > 0) {
        ctx.fillStyle = 'rgba(255, 213, 79, 0.85)';
        ctx.beginPath();
        ctx.arc(hx + Math.cos(tower.angle) * 14, hy + Math.sin(tower.angle) * 14, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (tower.type === 'thorn') {
      ctx.strokeStyle = tower.level >= 2 ? '#2e5d27' : '#388e3c';
      ctx.lineWidth = 7;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 3.4; a += 0.3) {
        const r = 4 + a * 3.4;
        const px = x + Math.cos(a + tower.sway) * r;
        const py = y + 16 - a * 4.6;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = '#e8f5e9';
      for (let i = 0; i < (tower.level >= 2 ? 7 : 5); i += 1) {
        const a = 0.7 + i * 1.35 + tower.sway;
        const r = 6 + ((i * 37) % 16);
        const px = x + Math.cos(a) * r;
        const py = y + 12 - i * 5.4;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + 7, py - 3);
        ctx.lineTo(px + 1, py + 5);
        ctx.closePath();
        ctx.fill();
      }
    } else if (tower.type === 'hive') {
      ctx.fillStyle = tower.level >= 2 ? '#f9a825' : '#ffb300';
      ctx.beginPath();
      ctx.moveTo(x - 22, y + 20);
      ctx.quadraticCurveTo(x - 24, y - 18, x, y - 24);
      ctx.quadraticCurveTo(x + 24, y - 18, x + 22, y + 20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(121, 85, 26, 0.45)';
      ctx.lineWidth = 3;
      for (const yy of [-8, 4, 14]) {
        ctx.beginPath();
        ctx.moveTo(x - 20 + Math.abs(yy) * 0.4, y + yy);
        ctx.lineTo(x + 20 - Math.abs(yy) * 0.4, y + yy);
        ctx.stroke();
      }
      ctx.fillStyle = '#5d4037';
      ctx.beginPath();
      ctx.ellipse(x, y + 8, 6, 7.6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Bees on patrol.
      for (let b = 0; b < 3; b += 1) {
        const a = t * 2.6 + b * 2.1 + tower.sway;
        const bx = x + Math.cos(a) * 30;
        const by = y - 8 + Math.sin(a * 1.7) * 10;
        ctx.fillStyle = '#fdd835';
        ctx.beginPath();
        ctx.ellipse(bx, by, 4.6, 3.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(bx, by - 3.6, 3.2, 2, -0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Frost fern: icy fronds fanning from the base.
      const fronds = tower.level >= 2 ? 9 : 7;
      for (let i = 0; i < fronds; i += 1) {
        const spread = (i / (fronds - 1) - 0.5) * 1.9;
        const len = 34 - Math.abs(spread) * 12;
        ctx.strokeStyle = i % 2 ? '#81d4fa' : '#4fc3f7';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(x, y + 18);
        ctx.quadraticCurveTo(
          x + Math.sin(spread) * len * 0.5 + sway * 20, y + 18 - len * 0.6,
          x + Math.sin(spread) * len, y + 18 - len,
        );
        ctx.stroke();
        ctx.fillStyle = '#e1f5fe';
        ctx.beginPath();
        ctx.arc(x + Math.sin(spread) * len, y + 18 - len, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tower.pulse > 0) {
        ctx.fillStyle = `rgba(165, 232, 255, ${tower.pulse * 0.5})`;
        ctx.beginPath();
        ctx.arc(x, y, tower.range * (1 - tower.pulse / 0.35) * 0.4 + 12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (tower.level >= 2) {
      ctx.fillStyle = '#ffd94d';
      ctx.strokeStyle = '#f5a623';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + 19, y - 19, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      text('2', x + 19, y - 18.4, 11, '#7a5200', 'center', '800');
    }
  }

  function drawEnemy(enemy, t) {
    const { x, y } = enemy;
    const r = enemy.radius;
    const flash = enemy.flashT > 0;
    ctx.save();
    ctx.translate(x, y);
    // Soft shadow.
    ctx.fillStyle = 'rgba(30, 60, 20, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.85, r * 0.9, r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    const wiggle = Math.sin(t * 10 + enemy.wobble) * 0.06;
    ctx.rotate(wiggle);
    // The hit flash swaps each fill for a pale tint of the pest's own colour, never a
    // white-out: a big pest flashing pure white reads as a glitch, not a hit.
    if (enemy.kind === 'aphid') {
      ctx.fillStyle = flash ? '#c5e1a5' : '#7cb342';
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.82, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#aed581' : '#558b2f';
      ctx.beginPath();
      ctx.arc(r * 0.55 * (enemy.dx || 1), 0, r * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#33691e';
      ctx.lineWidth = 2;
      for (let leg = -1; leg <= 1; leg += 1) {
        ctx.beginPath();
        ctx.moveTo(leg * r * 0.4, r * 0.6);
        ctx.lineTo(leg * r * 0.55, r * 1.05);
        ctx.stroke();
      }
    } else if (enemy.kind === 'slug') {
      ctx.fillStyle = flash ? '#eef3dd' : '#c0ca9e';
      ctx.beginPath();
      ctx.moveTo(-r * 1.25, r * 0.55);
      ctx.quadraticCurveTo(-r * 1.1, -r * 0.7, -r * 0.1, -r * 0.62);
      ctx.quadraticCurveTo(r * 0.9, -r * 0.55, r * 1.05, r * 0.1);
      ctx.quadraticCurveTo(r * 1.1, r * 0.55, r * 0.4, r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = flash ? '#c9d4ae' : '#9aa87c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(r * 0.75, -r * 0.4);
      ctx.lineTo(r * 0.95, -r * 1.15);
      ctx.moveTo(r * 0.45, -r * 0.45);
      ctx.lineTo(r * 0.5, -r * 1.2);
      ctx.stroke();
      ctx.fillStyle = '#37474f';
      ctx.beginPath();
      ctx.arc(r * 0.97, -r * 1.18, 2.6, 0, Math.PI * 2);
      ctx.arc(r * 0.52, -r * 1.24, 2.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.kind === 'ant') {
      // A garden ant: three body segments strung along its line of march, six legs
      // paddling, antennae up front. Small and quick — it reads as a scurrying dot.
      const facing = enemy.dx || 1;
      ctx.strokeStyle = flash ? '#a97e56' : '#5d3a1a';
      ctx.lineWidth = 2;
      for (let leg = -1; leg <= 1; leg += 1) {
        const paddle = Math.sin(t * 26 + enemy.wobble + leg * 2.1) * r * 0.3;
        ctx.beginPath();
        ctx.moveTo(leg * r * 0.35, 0);
        ctx.lineTo(leg * r * 0.35 + paddle * 0.4, r * 0.95);
        ctx.moveTo(leg * r * 0.35, 0);
        ctx.lineTo(leg * r * 0.35 - paddle * 0.4, -r * 0.95);
        ctx.stroke();
      }
      ctx.fillStyle = flash ? '#d7b48c' : '#8d5a3a';
      ctx.beginPath();
      ctx.ellipse(-r * 0.62 * facing, 0, r * 0.52, r * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.36, r * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#c49a6c' : '#6d4226';
      ctx.beginPath();
      ctx.arc(r * 0.55 * facing, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = flash ? '#c49a6c' : '#6d4226';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(r * 0.78 * facing, -r * 0.12);
      ctx.quadraticCurveTo(r * 1.15 * facing, -r * 0.62, r * 1.3 * facing, -r * 0.5);
      ctx.moveTo(r * 0.78 * facing, r * 0.12);
      ctx.quadraticCurveTo(r * 1.15 * facing, r * 0.62, r * 1.3 * facing, r * 0.5);
      ctx.stroke();
    } else if (enemy.kind === 'wasp') {
      const flap = Math.sin(t * 42 + enemy.wobble) * 0.7;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.save();
      ctx.rotate(-0.6 + flap * 0.4);
      ctx.beginPath();
      ctx.ellipse(-r * 0.2, -r * 0.85, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.rotate(0.5 - flap * 0.4);
      ctx.beginPath();
      ctx.ellipse(r * 0.25, -r * 0.85, r * 0.62, r * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = flash ? '#ffee58' : '#fdd835';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#78909c' : '#37474f';
      ctx.fillRect(-r * 0.42, -r * 0.72, r * 0.3, r * 1.44);
      ctx.fillRect(r * 0.22, -r * 0.74, r * 0.3, r * 1.48);
    } else {
      // Beetles, and the Goliath Beetle boss at a grander scale.
      const boss = enemy.kind === 'boss';
      ctx.fillStyle = flash ? '#a1887f' : boss ? '#4e342e' : '#6d4c41';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 0.88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = flash ? '#bcaaa4' : boss ? '#5d4037' : '#795548';
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.08, r * 0.82, r * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30, 20, 14, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.72);
      ctx.lineTo(0, r * 0.6);
      ctx.stroke();
      // Head and horn.
      const hx = r * 0.8 * (enemy.dx || 1);
      ctx.fillStyle = flash ? '#8d6e63' : '#3e2723';
      ctx.beginPath();
      ctx.arc(hx, 0, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3e2723';
      ctx.lineWidth = boss ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(hx, -r * 0.2);
      ctx.quadraticCurveTo(hx + r * 0.5, -r * 0.75, hx + r * 0.78, -r * 0.5);
      ctx.stroke();
      ctx.fillStyle = '#ef5350';
      ctx.beginPath();
      ctx.arc(hx + r * 0.14, -r * 0.12, boss ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.arc(hx + r * 0.14, r * 0.16, boss ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      if (boss) {
        ctx.fillStyle = '#ffd94d';
        for (let s = -2; s <= 2; s += 1) {
          ctx.beginPath();
          ctx.moveTo(s * r * 0.3 - 5, -r * 0.82);
          ctx.lineTo(s * r * 0.3 + 5, -r * 0.82);
          ctx.lineTo(s * r * 0.3, -r * 1.12);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // Status tints and the health bar.
    if (enemy.freezeT > 0) {
      // A shell of ice: a pale translucent dome and a few snow sparkles, the pest visible inside.
      ctx.fillStyle = 'rgba(190, 235, 255, 0.34)';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(225, 245, 254, 0.9)';
      ctx.lineWidth = 1.6;
      for (const [sx, sy] of [[-0.55, -0.4], [0.4, -0.62], [0.62, 0.3], [-0.3, 0.55]]) {
        const px = x + sx * r;
        const py = y + sy * r;
        ctx.beginPath();
        ctx.moveTo(px - 3.4, py);
        ctx.lineTo(px + 3.4, py);
        ctx.moveTo(px, py - 3.4);
        ctx.lineTo(px, py + 3.4);
        ctx.stroke();
      }
    } else if (enemy.slowT > 0) {
      ctx.fillStyle = 'rgba(129, 212, 250, 0.3)';
      ctx.beginPath();
      ctx.arc(x, y, r * 1.08, 0, Math.PI * 2);
      ctx.fill();
    }
    if (enemy.hp < enemy.maxHp) {
      const w = Math.max(30, r * 2);
      const share = Math.max(0, enemy.hp / enemy.maxHp);
      ctx.fillStyle = 'rgba(20, 30, 16, 0.65)';
      ctx.fillRect(x - w / 2, y - r - 13, w, 6);
      ctx.fillStyle = share > 0.45 ? '#8bc34a' : share > 0.2 ? '#ffb300' : '#ef5350';
      ctx.fillRect(x - w / 2 + 1, y - r - 12, (w - 2) * share, 4);
    }
  }

  function drawHud(state, ui) {
    ctx.fillStyle = PALETTE.hudBar;
    ctx.fillRect(0, 0, FIELD.width, LAYOUT.hudHeight);
    ctx.fillStyle = PALETTE.hudBarEdge;
    ctx.fillRect(0, LAYOUT.hudHeight, FIELD.width, 4);
    // The game's name on a little wooden sign.
    text('🌼 Bloom Bastion', 22, 29, 24, '#ffe082', 'left', '800');
    drawSun(316, 29, 12, state.time);
    text(String(Math.floor(state.sun)), 338, 30, 24, '#ffffff', 'left', '800');
    drawHeart(452, 24, 10);
    text(String(state.lives), 474, 30, 24, '#ffffff', 'left', '800');
    text(`Wave ${Math.max(1, state.wave)}/${TOTAL_WAVES}`, 566, 30, 22, '#dcedc8', 'left', '700');
    text(`Score ${state.score}`, 726, 30, 22, '#ffffff', 'left', '700');
    text(`Best ${ui.best}`, 872, 30, 20, '#c5e1a5', 'left', '600');
    // Buttons: speed, mute, pause, restart.
    for (const [rect, label] of [
      [UI_RECTS.speed, ui.speed > 1 ? '2× ⏩' : '1× ⏩'],
      [UI_RECTS.mute, ui.muted ? '🔇' : '🔊'],
      [UI_RECTS.pause, ui.screen === SCREEN_PAUSED ? '▶' : '⏸'],
      [UI_RECTS.restart, '↺'],
    ]) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundedRect(rect.x, rect.y, rect.w, rect.h, 8);
      ctx.fill();
      text(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, 17, '#ffffff', 'center', '700');
    }
  }

  function drawToolbar(state, ui) {
    ctx.fillStyle = '#8a6642';
    ctx.fillRect(0, LAYOUT.toolbarY, FIELD.width, LAYOUT.toolbarHeight);
    ctx.fillStyle = '#75552f';
    ctx.fillRect(0, LAYOUT.toolbarY, FIELD.width, 5);
    for (const card of UI_RECTS.cards) {
      const def = TOWERS[card.type];
      const afford = state.sun >= def.cost;
      const chosen = ui.placing === card.type;
      ctx.fillStyle = chosen ? '#fff3c4' : PALETTE.panel;
      roundedRect(card.x, card.y, card.w, card.h, 10);
      ctx.fill();
      ctx.strokeStyle = chosen ? PALETTE.sunRim : PALETTE.panelEdge;
      ctx.lineWidth = chosen ? 3 : 2;
      ctx.stroke();
      if (!afford) {
        ctx.fillStyle = 'rgba(120, 110, 90, 0.45)';
        roundedRect(card.x, card.y, card.w, card.h, 10);
        ctx.fill();
      }
      const fake = { type: card.type, x: card.x + 40, y: card.y + 42, level: 1, angle: -Math.PI / 2, muzzle: 0, pulse: 0, sway: card.x };
      ctx.save();
      ctx.translate(fake.x, fake.y);
      ctx.scale(0.72, 0.72);
      ctx.translate(-fake.x, -fake.y);
      drawTowerBody(fake, state.time);
      ctx.restore();
      const words = def.name.split(' ');
      text(words[0], card.x + 78, card.y + 21, 15.5, PALETTE.ink, 'left', '700');
      text(words.slice(1).join(' '), card.x + 78, card.y + 41, 15.5, PALETTE.ink, 'left', '700');
      drawSun(card.x + 86, card.y + 62, 8, state.time);
      text(String(def.cost), card.x + 100, card.y + 63, 16, afford ? '#b8860b' : '#8d8574', 'left', '800');
      text(def.key, card.x + card.w - 14, card.y + 14, 12, PALETTE.mutedInk, 'center', '800');
    }

    // The info panel: the selected plant's details, or a hint.
    ctx.fillStyle = PALETTE.panel;
    roundedRect(LAYOUT.infoX, LAYOUT.cardY, LAYOUT.infoW, LAYOUT.cardH, 10);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (ui.selected) {
      const t = ui.selected;
      const def = TOWERS[t.type];
      text(`${def.name} · Lv ${t.level}`, LAYOUT.infoX + 14, LAYOUT.cardY + 22, 17, PALETTE.ink, 'left', '800');
      text(t.level < 2
        ? `Damage ${Math.round(t.damage)} · Range ${Math.round(t.range)} · Lv2: ${LEVEL2_PERKS[t.type]}`
        : `Damage ${Math.round(t.damage)} · Range ${Math.round(t.range)} · Trick: ${LEVEL2_PERKS[t.type]}`,
      LAYOUT.infoX + 14, LAYOUT.cardY + 46, 13.5, PALETTE.mutedInk, 'left', '600');
      if (t.level < 2) {
        const cost = ui.upgradeCost;
        ctx.fillStyle = state.sun >= cost ? '#7cb342' : '#bdb49c';
        roundedRect(UI_RECTS.upgrade.x, UI_RECTS.upgrade.y, UI_RECTS.upgrade.w, UI_RECTS.upgrade.h, 8);
        ctx.fill();
        text(`Upgrade · ${cost} sun`, UI_RECTS.upgrade.x + UI_RECTS.upgrade.w / 2, UI_RECTS.upgrade.y + 19, 15, '#ffffff', 'center', '800');
      } else {
        text('Fully grown ✿', UI_RECTS.upgrade.x + 6, UI_RECTS.upgrade.y + 19, 15, '#7cb342', 'left', '800');
      }
      ctx.fillStyle = '#c98a4b';
      roundedRect(UI_RECTS.sell.x, UI_RECTS.sell.y, UI_RECTS.sell.w, UI_RECTS.sell.h, 8);
      ctx.fill();
      text(`Sell · +${ui.sellValue}`, UI_RECTS.sell.x + UI_RECTS.sell.w / 2, UI_RECTS.sell.y + 19, 15, '#ffffff', 'center', '800');
    } else if (ui.placing) {
      const def = TOWERS[ui.placing];
      text(`Planting: ${def.name}`, LAYOUT.infoX + 14, LAYOUT.cardY + 24, 17, PALETTE.ink, 'left', '800');
      text(def.blurb, LAYOUT.infoX + 14, LAYOUT.cardY + 50, 14, PALETTE.mutedInk, 'left', '600');
      text('Click a lawn square · right-click or Esc to cancel', LAYOUT.infoX + 14, LAYOUT.cardY + 70, 12.5, PALETTE.mutedInk, 'left', '600');
    } else {
      text('Pick a plant, then click a lawn square.', LAYOUT.infoX + 14, LAYOUT.cardY + 26, 15.5, PALETTE.ink, 'left', '700');
      text('Keys 1–4 choose · Space wave · F speed · P pause', LAYOUT.infoX + 14, LAYOUT.cardY + 54, 13, PALETTE.mutedInk, 'left', '600');
    }

    // The start-wave button, or the wave's progress while it runs.
    const r = UI_RECTS.startWave;
    if (state.waveActive) {
      ctx.fillStyle = '#a1887f';
      roundedRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      const left = state.spawnQueue.length + state.enemies.length;
      text(`Wave ${state.wave}`, r.x + r.w / 2, r.y + 28, 19, '#ffffff', 'center', '800');
      text(`${left} pest${left === 1 ? '' : 's'} left`, r.x + r.w / 2, r.y + 54, 14.5, '#ffe0b2', 'center', '700');
    } else if (!state.won && !state.lost) {
      ctx.fillStyle = '#7cb342';
      roundedRect(r.x, r.y, r.w, r.h, 10);
      ctx.fill();
      ctx.fillStyle = '#689f38';
      roundedRect(r.x, r.y + r.h - 12, r.w, 12, 6);
      ctx.fill();
      text(state.wave === 0 ? 'Start wave 1' : `Start wave ${state.wave + 1}`, r.x + r.w / 2, r.y + 32, 18.5, '#ffffff', 'center', '800');
      text('or press Space', r.x + r.w / 2, r.y + 58, 13.5, '#dcedc8', 'center', '600');
    }
  }

  function drawOverlayPanel(w, h) {
    ctx.fillStyle = PALETTE.overlay;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundedRect(x, y, w, h, 18);
    ctx.fill();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 3;
    ctx.stroke();
    return { x, y };
  }

  function drawTitle(state, ui) {
    const { x, y } = drawOverlayPanel(700, 470);
    text('🌼 Bloom Bastion 🌼', FIELD.width / 2, y + 62, 52, '#33691e', 'center', '800');
    text('A garden tower defence', FIELD.width / 2, y + 104, 21, PALETTE.mutedInk, 'center', '700');
    // Two mascot daisies stand guard at the panel's top corners.
    for (const mx of [x + 54, x + 646]) {
      const mascot = { type: 'daisy', x: mx, y: y + 66, level: 1, angle: -Math.PI / 2, muzzle: 0, pulse: 0, sway: mx };
      ctx.save();
      ctx.translate(mx, y + 66);
      ctx.scale(0.85, 0.85);
      ctx.translate(-mx, -(y + 66));
      drawTowerBody(mascot, state.time);
      ctx.restore();
    }
    const lines = [
      'Pests are marching down the path to eat your flower bed!',
      'Plant defenders on the lawn and stop all 15 waves.',
      '',
      '🌻 Sunlight is money — pop pests for bounty, click the falling drops!',
      '🌼 Daisy Turret — fast shots      🌵 Thorn Vine — slows pests',
      '🐝 Bee Hive — splash bursts      ❄ Frost Fern — freezes a crowd',
      '🐜 Garden Ants swarm in fast — slow them, splash them, freeze them.',
      'Click a plant to upgrade it (level 2 gains a trick) or sell it.',
      '',
      'Keys: 1–4 plant · Space wave · F fast · P pause · M mute',
    ];
    lines.forEach((line, i) => text(line, x + 56, y + 150 + i * 25, 17.5, PALETTE.ink, 'left', '600'));
    ctx.fillStyle = '#7cb342';
    roundedRect(FIELD.width / 2 - 130, y + 396, 260, 50, 12);
    ctx.fill();
    text('Start defending ▶', FIELD.width / 2, y + 422, 21, '#ffffff', 'center', '800');
    if (ui.best > 0) text(`Best score so far: ${ui.best}`, FIELD.width / 2, y + 128, 15, PALETTE.mutedInk, 'center', '700');
  }

  /** A five-pointed star, filled gold when earned and pale when not. */
  function drawStar(cx, cy, r, earned) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const rad = i % 2 === 0 ? r : r * 0.45;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = earned ? '#ffc107' : 'rgba(160, 150, 120, 0.35)';
    ctx.fill();
    ctx.strokeStyle = earned ? '#f5a623' : 'rgba(140, 130, 105, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawEnd(state, ui, won) {
    // A won garden gets a taller panel: its star rating sits under the headline.
    const lift = won ? 40 : 0;
    const { y } = drawOverlayPanel(620, 380 + lift);
    text(won ? '🏆 The garden is safe!' : '🥀 The pests got the blooms…', FIELD.width / 2, y + 66, 38, won ? '#33691e' : '#8e3b2f', 'center', '800');
    text(won ? 'All 15 waves turned back. The flower bed blooms on!' : `The bed was overrun on wave ${state.wave} of ${TOTAL_WAVES}.`, FIELD.width / 2, y + 112, 18, PALETTE.mutedInk, 'center', '600');
    if (won) {
      // Stars for the state of the bed: three for a near-untouched garden.
      const earned = state.lives >= 18 ? 3 : state.lives >= 10 ? 2 : 1;
      for (let i = 0; i < 3; i += 1) {
        drawStar(FIELD.width / 2 + (i - 1) * 56, y + 146, i === 1 ? 21 : 17, i < earned);
      }
    } else {
      text('Tip: a Thorn Vine beside a Daisy Turret stops the fast ones cold.', FIELD.width / 2, y + 136, 14.5, PALETTE.mutedInk, 'center', '600');
    }
    const rows = [
      ['Final score', String(state.score)],
      ['Best score', String(Math.max(ui.best, state.score))],
      ['Pests popped', String(state.kills)],
      ['Plants planted', String(state.planted)],
      ['Lives left', String(state.lives)],
    ];
    rows.forEach(([label, value], i) => {
      text(label, FIELD.width / 2 - 150, y + 158 + lift + i * 32, 18, PALETTE.ink, 'left', '600');
      text(value, FIELD.width / 2 + 150, y + 158 + lift + i * 32, 18, PALETTE.ink, 'right', '800');
    });
    ctx.fillStyle = '#7cb342';
    roundedRect(FIELD.width / 2 - 120, y + 322 + lift, 240, 46, 12);
    ctx.fill();
    text('Play again ↺', FIELD.width / 2, y + 346 + lift, 20, '#ffffff', 'center', '800');
  }

  function draw(state, ui, world) {
    ctx.save();
    if (state.shake > 0.2) {
      const s = state.shake;
      ctx.translate(Math.sin(state.time * 91) * s * 0.5, Math.cos(state.time * 83) * s * 0.4);
    }
    drawGarden(state, world);

    // Sun drops waiting to be collected.
    for (const drop of state.drops) {
      const bob = Math.sin(state.time * 3 + drop.x) * 3;
      const blink = drop.t > 6.5 && Math.sin(state.time * 10) > 0;
      if (!blink) drawSun(drop.x, drop.y + bob, 13, state.time + drop.x);
    }

    // Placement and selection highlights.
    if (ui.hoverCell && ui.screen === SCREEN_PLAY) {
      const { col, row } = ui.hoverCell;
      const cx = GRID.x + col * GRID.cell;
      const cy = GRID.y + row * GRID.cell;
      if (ui.placing) {
        const def = TOWERS[ui.placing];
        const centre = cellCentre(col, row);
        ctx.fillStyle = PALETTE.rangeFill;
        ctx.beginPath();
        ctx.arc(centre.x, centre.y, def.range, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = PALETTE.rangeEdge;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = ui.hoverValid ? PALETTE.goodCell : PALETTE.badCell;
        ctx.fillRect(cx, cy, GRID.cell, GRID.cell);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx + 1, cy + 1, GRID.cell - 2, GRID.cell - 2);
    }
    if (ui.selected) {
      const t = ui.selected;
      ctx.fillStyle = PALETTE.rangeFill;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.range, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.rangeEdge;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.strokeStyle = '#ffd94d';
      ctx.lineWidth = 3;
      ctx.strokeRect(t.x - GRID.cell / 2 + 2, t.y - GRID.cell / 2 + 2, GRID.cell - 4, GRID.cell - 4);
    }

    for (const tower of state.towers) drawTowerBody(tower, state.time);
    for (const enemy of state.enemies) drawEnemy(enemy, state.time);

    // Projectiles, each with a short fading streak along the step it just travelled.
    for (const p of state.projectiles) {
      if (p.px !== undefined && (p.px !== p.x || p.py !== p.y)) {
        ctx.strokeStyle = p.kind === 'thorn' ? 'rgba(232, 245, 233, 0.55)'
          : p.kind === 'hive' ? 'rgba(255, 202, 40, 0.5)' : 'rgba(255, 241, 118, 0.55)';
        ctx.lineWidth = 2.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.px - (p.x - p.px) * 1.6, p.py - (p.y - p.py) * 1.6);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      if (p.kind === 'thorn') {
        ctx.fillStyle = '#e8f5e9';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'hive') {
        ctx.fillStyle = '#ffca28';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 241, 118, 0.7)';
        ctx.beginPath();
        ctx.arc(p.x - 2, p.y - 2, 2.6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fff176';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Particles and floating texts.
    for (const p of state.particles) {
      const share = Math.max(0, p.life / p.maxLife);
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = share * 0.8;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.ring * (1 - share) + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = share;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * share + 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    for (const t of state.texts) {
      ctx.globalAlpha = Math.max(0, 1 - t.t / 1.15);
      text(t.text, t.x, t.y, 16, t.color, 'center', '800');
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    drawHud(state, ui);
    drawToolbar(state, ui);

    // The wave banner.
    if (state.banner) {
      const b = state.banner;
      const alpha = b.t < 0.25 ? b.t / 0.25 : b.t > 1.8 ? Math.max(0, (2.2 - b.t) / 0.4) : 1;
      ctx.globalAlpha = alpha;
      text(b.title, FIELD.width / 2, 150, 46, '#ffffff', 'center', '800');
      if (b.sub) text(b.sub, FIELD.width / 2, 190, 21, '#fff9c4', 'center', '700');
      ctx.globalAlpha = 1;
    }

    if (ui.screen === SCREEN_TITLE) drawTitle(state, ui);
    else if (ui.screen === SCREEN_PAUSED) {
      const { y } = drawOverlayPanel(420, 220);
      text('⏸ Paused', FIELD.width / 2, y + 78, 38, '#33691e', 'center', '800');
      text('Press P or click ▶ to carry on.', FIELD.width / 2, y + 132, 17, PALETTE.mutedInk, 'center', '600');
      text('R restarts the garden.', FIELD.width / 2, y + 164, 17, PALETTE.mutedInk, 'center', '600');
    } else if (ui.screen === SCREEN_WIN) drawEnd(state, ui, true);
    else if (ui.screen === SCREEN_OVER) drawEnd(state, ui, false);
  }

  return { draw };
}
