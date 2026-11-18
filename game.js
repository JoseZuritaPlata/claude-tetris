'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#a7c7e7', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

// ---- Skins ----
// Cada skin define su paleta (alineada por índice con PIECES), el fondo del
// tablero, la rejilla y su propia función de dibujo de bloque.

// Crea una paleta del mismo largo que PIECES; los huecos usan COLORS.
function skinPalette(list) {
  return PIECES.map((_, i) => (i === 0 ? null : list[i] || COLORS[i] || '#888888'));
}

// Aclara (amt > 0) u oscurece (amt < 0) un color '#rrggbb' (otros formatos se devuelven tal cual).
function shadeColor(hex, amt) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = v => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function roundedRectPath(context, x, y, w, h, rad) {
  rad = Math.min(rad, w / 2, h / 2);
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, rad);
  } else {
    context.moveTo(x + rad, y);
    context.arcTo(x + w, y, x + w, y + h, rad);
    context.arcTo(x + w, y + h, x, y + h, rad);
    context.arcTo(x, y + h, x, y, rad);
    context.arcTo(x, y, x + w, y, rad);
    context.closePath();
  }
}

const PIXEL_SHADES = {}; // caché color -> { light, dark } para el skin pixel art
const NEON_SPRITES = {}; // caché `${color}|${size}` -> canvas con el bloque neon ya renderizado
const NEON_PAD = 10;     // margen del sprite para que quepa el resplandor

// Renderiza una vez el bloque neon (con shadowBlur) en un canvas fuera de pantalla;
// después cada frame solo hace drawImage, que es mucho más barato que el blur.
function neonSprite(color, size) {
  const key = color + '|' + size;
  let sprite = NEON_SPRITES[key];
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = size + NEON_PAD * 2;
  const c = sprite.getContext('2d');
  const o = NEON_PAD;
  c.shadowColor = color;
  c.shadowBlur = 12;
  c.strokeStyle = color;
  c.lineWidth = 2;
  c.strokeRect(o + 3, o + 3, size - 6, size - 6);
  c.shadowBlur = 0;
  c.globalAlpha = 0.25;
  c.fillStyle = color;
  c.fillRect(o + 4, o + 4, size - 8, size - 8);
  NEON_SPRITES[key] = sprite;
  return sprite;
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: skinPalette(COLORS),
    boardBg: null,   // null: usa el fondo CSS (respeta el tema claro/oscuro)
    gridColor: null, // null: usa la variable CSS --grid
    ghostAlpha: 0.2,
    drawBlock(context, px, py, size, color, alpha) {
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.fillRect(px + 1, py + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(px + 1, py + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    name: 'Neon',
    colors: skinPalette([null, '#00f0ff', '#fff200', '#e040ff', '#39ff14', '#ff1744', '#2979ff', '#ff9100']),
    boardBg: '#000000',
    gridColor: '#0d0d16',
    ghostAlpha: 0.35,
    drawBlock(context, px, py, size, color, alpha) {
      context.globalAlpha = alpha;
      context.drawImage(neonSprite(color, size), px - NEON_PAD, py - NEON_PAD);
      context.globalAlpha = 1;
    },
  },
  pastel: {
    name: 'Pastel',
    colors: skinPalette([null, '#a8e6ef', '#fdf1a8', '#d7b8f3', '#b8e8c2', '#f7b5c0', '#b5cdf7', '#fcd2a9']),
    boardBg: '#fbf7f2',
    gridColor: '#efe8e0',
    ghostAlpha: 0.4,
    drawBlock(context, px, py, size, color, alpha) {
      const rad = Math.max(2, Math.round(size * 0.22));
      context.save();
      context.globalAlpha = alpha;
      roundedRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, rad);
      context.fillStyle = color;
      context.fill();
      context.lineWidth = 1;
      context.strokeStyle = 'rgba(120,100,130,0.3)';
      context.stroke();
      // brillo suave arriba
      roundedRectPath(context, px + 5, py + 4, size - 10, Math.max(2, size * 0.18), rad / 2);
      context.fillStyle = 'rgba(255,255,255,0.45)';
      context.fill();
      context.restore();
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: skinPalette([null, '#3ec6e0', '#f2d13a', '#a659d6', '#5cc45a', '#e0483e', '#4a6fe0', '#f08a2a']),
    boardBg: '#181826',
    gridColor: '#232336',
    ghostAlpha: 0.25,
    drawBlock(context, px, py, size, color, alpha) {
      let shades = PIXEL_SHADES[color];
      if (!shades) shades = PIXEL_SHADES[color] = { light: shadeColor(color, 0.45), dark: shadeColor(color, -0.4) };
      const p = Math.max(2, Math.floor(size / 6)); // tamaño de "píxel" (5px en bloques de 30)
      const x0 = px + 1, y0 = py + 1, s = size - 2;
      context.globalAlpha = alpha;
      context.fillStyle = color;
      context.fillRect(x0, y0, s, s);
      // borde inferior/derecho oscuro
      context.fillStyle = shades.dark;
      context.fillRect(x0, y0 + s - p, s, p);
      context.fillRect(x0 + s - p, y0, p, s);
      // borde superior/izquierdo claro
      context.fillStyle = shades.light;
      context.fillRect(x0, y0, s - p, p);
      context.fillRect(x0, y0, p, s - p);
      // destellos y textura interior
      context.fillRect(x0 + p, y0 + p, p, p);
      context.fillRect(x0 + 2 * p, y0 + p, p, p);
      context.fillStyle = shades.dark;
      context.fillRect(x0 + s - 2 * p, y0 + s - 2 * p, p, p);
      context.fillRect(x0 + 2 * p, y0 + 3 * p, p, p);
      context.globalAlpha = 1;
    },
  },
};

const SKIN_STORAGE_KEY = 'tetris.skin';
let activeSkin = SKINS.retro;

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  activeSkin.drawBlock(context, x * size, y * size, size, activeSkin.colors[colorIndex], alpha ?? 1);
}

// Pinta el fondo del canvas según el skin (retro: deja el fondo CSS).
function paintBackground(context, c) {
  context.clearRect(0, 0, c.width, c.height);
  if (activeSkin.boardBg) {
    context.fillStyle = activeSkin.boardBg;
    context.fillRect(0, 0, c.width, c.height);
  }
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor ||
    getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  paintBackground(ctx, canvas);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, activeSkin.ghostAlpha);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  paintBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  if (board && current) draw(); // redibuja (útil en pausa / game over)
}

let savedTheme = 'dark';
try { if (localStorage.getItem('theme') === 'light') savedTheme = 'light'; } catch (_) {}
applyTheme(savedTheme);

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  applyTheme(theme);
  try { localStorage.setItem('theme', theme); } catch (_) {}
  themeToggle.blur(); // evita que Space/flechas manejen el switch durante el juego
});

// ---- Skins: selector ----
const skinSelect = document.getElementById('skin-select');

for (const [id, skin] of Object.entries(SKINS)) {
  const opt = document.createElement('option');
  opt.value = id;
  opt.textContent = skin.name;
  skinSelect.appendChild(opt);
}

function applySkin(id) {
  if (!Object.prototype.hasOwnProperty.call(SKINS, id)) id = 'retro';
  activeSkin = SKINS[id];
  skinSelect.value = id;
  document.body.dataset.skin = id;
  // redibuja aunque el bucle esté detenido (pausa / game over)
  if (board && current) draw();
  if (next) drawNext();
  return id;
}

let savedSkin = 'retro';
try { savedSkin = localStorage.getItem(SKIN_STORAGE_KEY) || 'retro'; } catch (_) {}
applySkin(savedSkin);

skinSelect.addEventListener('change', () => {
  const id = applySkin(skinSelect.value);
  try { localStorage.setItem(SKIN_STORAGE_KEY, id); } catch (_) {}
  skinSelect.blur(); // devuelve flechas/Space al juego
});
// Si el selector conserva el foco (p. ej. se cerró con Escape), las teclas del
// juego no cambian el skin: se suelta el foco y la tecla sigue hasta el juego.
const SKIN_GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyX', 'KeyP', 'Escape'];
skinSelect.addEventListener('keydown', e => {
  if (SKIN_GAME_KEYS.includes(e.code)) {
    e.preventDefault();
    skinSelect.blur();
  } else {
    e.stopPropagation(); // otras teclas (letras, Enter…) no llegan al juego
  }
});

init();
