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
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#9e9e9e', // N - tuerca (gris metálico)
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
  [[8,8,8],[8,0,8],[8,8,8]],                  // N (tuerca)
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const MIN_START_LEVEL = 1;
const MAX_START_LEVEL = 10;
const START_LEVEL_KEY = 'tetris-start-level';
const RECORDS_KEY = 'tetris-records';
const MAX_RECORDS = 5;

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
const resumeBtn = document.getElementById('resume-btn');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const startLevelEl = document.getElementById('start-level-value');
const restartBtn = document.getElementById('restart-btn');
const comboEl = document.getElementById('combo');
const nameEntry = document.getElementById('name-entry');
const newRecordMsg = document.getElementById('new-record-msg');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordsSection = document.getElementById('records');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false;
let combo = 0, maxCombo = 0;
let pendingRecord = null; // { score, lines } waiting for a name after game over
let savedIndex = -1;      // row to highlight after saving
let baseLevel = 1;        // nivel con el que empezó la partida actual
let startLevel = loadStartLevel(); // nivel elegido para la próxima partida
let menuView = 'main';    // 'main' | 'controls'
let menuIndex = 0;        // ítem seleccionado del menú visible
const heldKeys = new Set();    // teclas físicamente pulsadas
let blockedKeys = new Set();   // teclas ignoradas hasta su keyup (tras cerrar el menú)

function loadStartLevel() {
  try {
    const n = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
    if (n >= MIN_START_LEVEL && n <= MAX_START_LEVEL) return n;
  } catch (_) { /* localStorage no disponible */ }
  return MIN_START_LEVEL;
}

function saveStartLevel() {
  try {
    localStorage.setItem(START_LEVEL_KEY, String(startLevel));
  } catch (_) { /* localStorage no disponible */ }
}

function intervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

// ---- Records (localStorage) ----
function emptyRecords() {
  return { scores: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!data || !Array.isArray(data.scores)) return emptyRecords();
    return {
      scores: data.scores
        .filter(r => r && typeof r.score === 'number')
        .slice(0, MAX_RECORDS),
      bestCombo: Number(data.bestCombo) || 0,
      maxLines: Number(data.maxLines) || 0,
    };
  } catch {
    return emptyRecords();
  }
}

function saveRecords(data) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(data));
  } catch {
    // storage unavailable: records only live for this session
  }
}

let records = loadRecords();

function qualifies(s) {
  if (s <= 0) return false;
  if (records.scores.length < MAX_RECORDS) return true;
  return s > records.scores[records.scores.length - 1].score;
}

function insertPosition(s) {
  const i = records.scores.findIndex(r => s > r.score);
  return i === -1 ? records.scores.length : i;
}

function renderRecords() {
  const rows = records.scores.map(r => ({ ...r, highlight: false }));
  if (pendingRecord) {
    rows.splice(insertPosition(pendingRecord.score), 0, {
      name: nameInput.value.trim() || '???',
      score: pendingRecord.score,
      lines: pendingRecord.lines,
      highlight: true,
    });
    rows.length = Math.min(rows.length, MAX_RECORDS);
  } else if (savedIndex >= 0 && rows[savedIndex]) {
    rows[savedIndex].highlight = true;
  }

  recordsBody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    recordsBody.appendChild(tr);
  }
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.highlight) tr.classList.add('highlight');
    [i + 1, r.name, r.score.toLocaleString(), r.lines ?? 0].forEach(v => {
      const td = document.createElement('td');
      td.textContent = v;
      tr.appendChild(td);
    });
    recordsBody.appendChild(tr);
  });

  bestComboEl.textContent = records.bestCombo;
  maxLinesEl.textContent = records.maxLines;
}

function commitPendingRecord() {
  if (!pendingRecord) return;
  const name = nameInput.value.trim() || 'ANÓNIMO';
  const pos = insertPosition(pendingRecord.score);
  records.scores.splice(pos, 0, { name, score: pendingRecord.score, lines: pendingRecord.lines });
  records.scores.length = Math.min(records.scores.length, MAX_RECORDS);
  saveRecords(records);
  pendingRecord = null;
  savedIndex = pos;
  nameEntry.classList.add('hidden');
  renderRecords();
  nameInput.blur();
  // tras guardar, Enter en el menú reinicia la partida
  menuIndex = Math.max(0, menuItems().indexOf(restartBtn));
  renderMenuSelection();
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  records = emptyRecords();
  pendingRecord = null;
  savedIndex = -1;
  bestComboEl.classList.remove('new-best');
  maxLinesEl.classList.remove('new-best');
  nameEntry.classList.add('hidden');
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    // storage unavailable
  }
  renderRecords();
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
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
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.max(baseLevel, Math.floor(lines / 10) + 1);
    dropInterval = intervalFor(level);
    updateHUD();
  } else if (combo) {
    combo = 0;
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
  comboEl.textContent = combo;
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
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
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

// ---- Menú (inicio / pausa / game over) ----

function menuItems() {
  const view = menuView === 'controls' ? menuControls : menuMain;
  return Array.from(view.querySelectorAll('.menu-item'))
    .filter(el => !el.classList.contains('hidden'));
}

function renderMenuSelection() {
  const items = menuItems();
  if (!items.length) return;
  menuIndex = (menuIndex + items.length) % items.length;
  document.querySelectorAll('.menu-item.selected')
    .forEach(el => el.classList.remove('selected'));
  items[menuIndex].classList.add('selected');
}

function showMenuView(view) {
  menuView = view;
  menuMain.classList.toggle('hidden', view !== 'main');
  menuControls.classList.toggle('hidden', view !== 'controls');
  menuIndex = 0;
  renderMenuSelection();
}

function openMenu(mode, title, subtitle) {
  // mode: 'start' | 'pause' | 'gameover'
  overlayTitle.textContent = title;
  overlayTitle.classList.toggle('pause', mode === 'pause');
  overlayScore.textContent = subtitle;
  resumeBtn.classList.toggle('hidden', mode !== 'pause');
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  // los récords se muestran en inicio y game over, no en pausa
  const showRecords = mode !== 'pause';
  recordsSection.classList.toggle('hidden', !showRecords);
  resetRecordsBtn.classList.toggle('hidden', !showRecords);
  if (mode !== 'gameover') nameEntry.classList.add('hidden');
  if (showRecords) renderRecords();
  renderStartLevel();
  overlay.classList.remove('hidden');
  showMenuView('main');
}

function closeMenu() {
  overlay.classList.add('hidden');
  showMenuView('main');
  // Evita que un botón con foco reciba Enter/Space durante el juego
  if (document.activeElement && overlay.contains(document.activeElement)) {
    document.activeElement.blur();
  }
  // Las teclas que siguen pulsadas no actúan hasta que se suelten
  blockedKeys = new Set(heldKeys);
}

function renderStartLevel() {
  startLevelEl.textContent = startLevel;
}

function changeStartLevel(delta, wrap) {
  let n = startLevel + delta;
  if (wrap) {
    if (n > MAX_START_LEVEL) n = MIN_START_LEVEL;
    if (n < MIN_START_LEVEL) n = MAX_START_LEVEL;
  } else {
    n = Math.min(MAX_START_LEVEL, Math.max(MIN_START_LEVEL, n));
  }
  startLevel = n;
  saveStartLevel();
  renderStartLevel();
}

function runMenuAction(action) {
  switch (action) {
    case 'resume':    if (paused) togglePause(); break;
    case 'restart':   init(); break;
    case 'controls':  showMenuView('controls'); break;
    case 'back':      showMenuView('main'); break;
    case 'level-dec': changeStartLevel(-1, false); break;
    case 'level-inc': changeStartLevel(1, false); break;
  }
}

function activateSelected() {
  const item = menuItems()[menuIndex];
  if (!item) return;
  if (item.dataset.item === 'level') changeStartLevel(1, true);
  else runMenuAction(item.dataset.action);
}

function menuOpen() {
  return !started || paused || gameOver;
}

function handleMenuKey(e) {
  switch (e.code) {
    case 'ArrowUp':
      e.preventDefault();
      menuIndex--;
      renderMenuSelection();
      break;
    case 'ArrowDown':
      e.preventDefault();
      menuIndex++;
      renderMenuSelection();
      break;
    case 'ArrowLeft':
    case 'ArrowRight': {
      e.preventDefault();
      const item = menuItems()[menuIndex];
      if (item && item.dataset.item === 'level')
        changeStartLevel(e.code === 'ArrowLeft' ? -1 : 1, false);
      break;
    }
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      e.preventDefault();
      if (!e.repeat) activateSelected();
      break;
  }
}

function showStartScreen() {
  started = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  openMenu('start', 'TETRIS', '');
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  // all-time stats are stored regardless of the name entry
  const newBestCombo = maxCombo > records.bestCombo;
  const newMaxLines = lines > records.maxLines;
  if (newBestCombo) records.bestCombo = maxCombo;
  if (newMaxLines) records.maxLines = lines;
  if (newBestCombo || newMaxLines) saveRecords(records);
  bestComboEl.classList.toggle('new-best', newBestCombo);
  maxLinesEl.classList.toggle('new-best', newMaxLines);

  savedIndex = -1;
  pendingRecord = qualifies(score) ? { score, lines } : null;

  if (pendingRecord) {
    newRecordMsg.textContent = `¡Nuevo récord! Puesto #${insertPosition(score) + 1}`;
    nameEntry.classList.remove('hidden');
  }
  openMenu('gameover', 'GAME OVER', `Puntuación: ${score.toLocaleString()} · Mejor combo: ${maxCombo}`);
  if (pendingRecord) nameInput.focus();
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    closeMenu();
    startLoop();
  } else {
    cancelAnimationFrame(animId);
    openMenu('pause', 'PAUSA', '');
  }
}

function startLoop() {
  cancelAnimationFrame(animId);
  lastTime = null; // el primer frame usa dt = 0: sin caídas repentinas
  dropAccum = 0;
  animId = requestAnimationFrame(loop);
}

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.max(0, ts - lastTime);
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
  if (gameOver || paused) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  commitPendingRecord(); // restarting without saving keeps the record as "ANÓNIMO"
  cancelAnimationFrame(animId);
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  baseLevel = startLevel;
  level = baseLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = intervalFor(level);
  next = randomPiece();
  spawn();
  updateHUD();
  closeMenu();
  bestComboEl.classList.remove('new-best');
  maxLinesEl.classList.remove('new-best');
  draw();
  startLoop();
}

document.addEventListener('keydown', e => {
  heldKeys.add(e.code);
  // never steer the game while typing (e.g. the record name)
  if (e.target instanceof HTMLInputElement) return;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    // Escape cierra primero la subvista de controles
    if (e.code === 'Escape' && menuOpen() && menuView === 'controls') {
      showMenuView('main');
      return;
    }
    togglePause();
    return;
  }

  if (menuOpen()) {
    handleMenuKey(e);
    return;
  }

  // Tecla que seguía pulsada al cerrar el menú: se ignora hasta soltarla
  if (blockedKeys.has(e.code)) {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    return;
  }

  switch (e.code) {
    case 'ArrowLeft':
      e.preventDefault();
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      e.preventDefault();
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      e.preventDefault();
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  blockedKeys.delete(e.code);
});

// Si la ventana pierde el foco no recibiremos los keyup pendientes
window.addEventListener('blur', () => {
  heldKeys.clear();
  blockedKeys.clear();
});

overlay.addEventListener('click', e => {
  const target = e.target.closest('[data-action]');
  if (!target || !overlay.contains(target)) return;
  const item = target.closest('.menu-item');
  if (item) {
    const idx = menuItems().indexOf(item);
    if (idx !== -1) { menuIndex = idx; renderMenuSelection(); }
  }
  runMenuAction(target.dataset.action);
});

overlay.addEventListener('mousemove', e => {
  const item = e.target.closest('.menu-item');
  if (!item) return;
  const idx = menuItems().indexOf(item);
  if (idx !== -1 && idx !== menuIndex) {
    menuIndex = idx;
    renderMenuSelection();
  }
});

saveScoreBtn.addEventListener('click', commitPendingRecord);
resetRecordsBtn.addEventListener('click', resetRecords);
nameInput.addEventListener('input', renderRecords);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    e.preventDefault();
    commitPendingRecord();
  }
});

const themeToggle = document.getElementById('theme-toggle');
const toggleIcon = themeToggle.querySelector('.toggle-icon');
const toggleLabel = themeToggle.querySelector('.toggle-label');

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add('light-mode');
    toggleIcon.textContent = '☀';
    toggleLabel.textContent = 'DARK';
  } else {
    document.body.classList.remove('light-mode');
    toggleIcon.textContent = '☾';
    toggleLabel.textContent = 'LIGHT';
  }
}

let savedTheme = null;
try { savedTheme = localStorage.getItem('tetris-theme'); } catch (_) { /* localStorage no disponible */ }
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  try { localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark'); } catch (_) { /* localStorage no disponible */ }
});

showStartScreen();
