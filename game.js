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
  trackCombo(cleared);
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

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || '#22222e';
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
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
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
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
  showGameOverRecords();
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
  if (gameOver) return; // endGame() dentro de este frame: no reprogramar el bucle
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
  resetRecordsState();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (!gameStarted || isTypingTarget(e.target)) return;
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

restartBtn.addEventListener('click', () => { restartBtn.blur(); init(); });

const themeToggle = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  if (board && current) draw(); // redibuja (útil en pausa / game over)
  else if (board) drawEmptyBoard(); // pantalla de inicio
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

// ---- Records ----
const RECORDS_KEY = 'tetris.records';
const STATS_KEY = 'tetris.stats';
const MAX_RECORDS = 5;
const NAME_MAX = 12;
const DEFAULT_NAME = 'Jugador';

const startScreen = document.getElementById('start-screen');
const playBtn = document.getElementById('play-btn');
const overRecords = document.getElementById('over-records');
const recordMsg = document.getElementById('record-msg');
const recordForm = document.getElementById('record-form');
const recordName = document.getElementById('record-name');
recordName.maxLength = NAME_MAX;

let gameStarted = false;
let combo = 0;
let maxCombo = 0;
let pendingRecord = null;   // entrada pendiente de nombre al game over
let highlightRecord = null; // entrada recién guardada (para resaltarla)

function isTypingTarget(el) {
  return !!el && typeof el.matches === 'function' && el.matches('input[type="text"], textarea');
}

function toNonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function sanitizeName(name) {
  const s = String(name ?? '').trim().slice(0, NAME_MAX);
  return s || DEFAULT_NAME;
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!Array.isArray(data)) return [];
    return data
      .filter(r => r && typeof r === 'object' && Number.isFinite(Number(r.score)))
      .map(r => ({
        name: sanitizeName(r.name),
        score: toNonNegInt(r.score),
        lines: toNonNegInt(r.lines),
        level: Math.max(1, toNonNegInt(r.level)),
        combo: toNonNegInt(r.combo),
        date: typeof r.date === 'string' ? r.date : '',
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RECORDS);
  } catch (_) {
    return [];
  }
}

function saveRecords(records) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(records)); } catch (_) {}
}

function loadStats() {
  try {
    const data = JSON.parse(localStorage.getItem(STATS_KEY));
    if (data && typeof data === 'object') {
      return { bestCombo: toNonNegInt(data.bestCombo), maxLines: toNonNegInt(data.maxLines) };
    }
  } catch (_) {}
  return { bestCombo: 0, maxLines: 0 };
}

function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (_) {}
}

function qualifies(value, records) {
  if (value <= 0) return false;
  return records.length < MAX_RECORDS || value > records[records.length - 1].score;
}

// Inserta tras las entradas con igual puntuación y devuelve la lista recortada al top.
function insertRecord(records, entry) {
  let i = records.findIndex(r => entry.score > r.score);
  if (i === -1) i = records.length;
  records.splice(i, 0, entry);
  return records.slice(0, MAX_RECORDS);
}

function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function makeEl(tag, text, cls) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function renderRecords() {
  const records = loadRecords();
  const stats = loadStats();
  document.querySelectorAll('[data-records]').forEach(container => {
    container.replaceChildren();
    if (!records.length) {
      container.appendChild(makeEl('p', 'Aún no hay records. ¡Juega una partida!', 'records-empty'));
    } else {
      const table = document.createElement('table');
      const head = document.createElement('tr');
      ['#', 'NOMBRE', 'PUNTOS', 'LÍNEAS', 'NIVEL', 'COMBO', 'FECHA'].forEach(h => head.appendChild(makeEl('th', h)));
      table.appendChild(head);
      records.forEach((r, i) => {
        const tr = document.createElement('tr');
        if (highlightRecord && r.date === highlightRecord.date && r.score === highlightRecord.score) {
          tr.className = 'highlight';
        }
        tr.append(
          makeEl('td', String(i + 1), 'num'),
          makeEl('td', r.name, 'name'),
          makeEl('td', r.score.toLocaleString(), 'num'),
          makeEl('td', String(r.lines), 'num'),
          makeEl('td', String(r.level), 'num'),
          makeEl('td', String(r.combo), 'num'),
          makeEl('td', formatDate(r.date), 'num'),
        );
        table.appendChild(tr);
      });
      container.appendChild(table);
    }
    const statsEl = makeEl('div', '', 'records-stats');
    const comboEl = makeEl('span', 'Mejor combo: ');
    comboEl.appendChild(makeEl('b', String(stats.bestCombo)));
    const linesStatEl = makeEl('span', 'Líneas máximas: ');
    linesStatEl.appendChild(makeEl('b', String(stats.maxLines)));
    statsEl.append(comboEl, linesStatEl);
    container.appendChild(statsEl);
  });
}

// combo = bloqueos consecutivos que limpian al menos una línea.
function trackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function showGameOverRecords() {
  const stats = loadStats();
  saveStats({
    bestCombo: Math.max(stats.bestCombo, maxCombo),
    maxLines: Math.max(stats.maxLines, lines),
  });

  highlightRecord = null;
  const records = loadRecords();
  if (qualifies(score, records)) {
    pendingRecord = { score, lines, level, combo: maxCombo, date: new Date().toISOString() };
    const pos = insertRecord(records, pendingRecord).indexOf(pendingRecord) + 1;
    recordMsg.textContent = `¡Nuevo récord! Puesto #${pos}`;
    recordMsg.classList.remove('hidden');
    recordName.value = '';
    recordForm.classList.remove('hidden');
  } else {
    pendingRecord = null;
    recordMsg.classList.add('hidden');
    recordForm.classList.add('hidden');
  }
  renderRecords();
  overRecords.classList.remove('hidden');
  if (pendingRecord) setTimeout(() => recordName.focus(), 0);
}

function commitPendingRecord() {
  if (!pendingRecord) return;
  const entry = { name: sanitizeName(recordName.value), ...pendingRecord };
  pendingRecord = null;
  saveRecords(insertRecord(loadRecords(), entry));
  highlightRecord = entry;
  recordForm.classList.add('hidden');
  recordName.blur();
  renderRecords();
}

// Llamado desde init(): guarda un record pendiente y reinicia el estado de combo.
function resetRecordsState() {
  commitPendingRecord();
  highlightRecord = null;
  combo = 0;
  maxCombo = 0;
  gameStarted = true;
  overRecords.classList.add('hidden');
  startScreen.classList.add('hidden');
}

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  commitPendingRecord();
});

document.querySelectorAll('.records-reset').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.blur();
    if (!confirm('¿Seguro que quieres borrar todos los records y estadísticas?')) return;
    try {
      localStorage.removeItem(RECORDS_KEY);
      localStorage.removeItem(STATS_KEY);
    } catch (_) {}
    highlightRecord = null;
    if (pendingRecord) recordMsg.textContent = '¡Nuevo récord! Puesto #1';
    renderRecords();
  });
});

playBtn.addEventListener('click', () => { playBtn.blur(); init(); });

function drawEmptyBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

function showStartScreen() {
  board = createBoard();
  drawEmptyBoard();
  renderRecords();
  startScreen.classList.remove('hidden');
  playBtn.focus();
}

showStartScreen();
