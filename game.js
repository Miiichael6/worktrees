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
const restartBtn = document.getElementById('restart-btn');
const comboEl = document.getElementById('combo');
const nameEntry = document.getElementById('name-entry');
const newRecordMsg = document.getElementById('new-record-msg');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');
const recordsBody = document.getElementById('records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const startHint = document.getElementById('start-hint');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordsSection = document.getElementById('records');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let started = false;
let combo = 0, maxCombo = 0;
let pendingRecord = null; // { score, lines } waiting for a name after game over
let savedIndex = -1;      // row to highlight after saving

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
  restartBtn.focus();
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
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
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

function showOverlay(mode) {
  // mode: 'start' | 'pause' | 'gameover'
  const showRecords = mode !== 'pause';
  recordsSection.classList.toggle('hidden', !showRecords);
  resetRecordsBtn.classList.toggle('hidden', !showRecords);
  restartBtn.classList.toggle('hidden', !showRecords);
  startHint.classList.toggle('hidden', !showRecords);
  if (mode !== 'gameover') nameEntry.classList.add('hidden');
  if (showRecords) renderRecords();
  overlay.classList.remove('hidden');
}

function showStartScreen() {
  started = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  overlayTitle.textContent = 'TETRIS';
  overlayScore.textContent = '';
  restartBtn.textContent = 'Jugar';
  showOverlay('start');
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

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Mejor combo: ${maxCombo}`;
  restartBtn.textContent = 'Reiniciar';

  if (pendingRecord) {
    newRecordMsg.textContent = `¡Nuevo récord! Puesto #${insertPosition(score) + 1}`;
    nameEntry.classList.remove('hidden');
  }
  showOverlay('gameover');
  if (pendingRecord) nameInput.focus();
}

function togglePause() {
  if (gameOver || !started) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    showOverlay('pause');
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
  if (gameOver) return;
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  commitPendingRecord(); // restarting without saving keeps the record as "ANÓNIMO"
  started = true;
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  bestComboEl.classList.remove('new-best');
  maxLinesEl.classList.remove('new-best');
  restartBtn.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // never steer the game while typing (e.g. the record name)
  if (e.target instanceof HTMLInputElement) return;
  if (!started || gameOver) {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault(); // avoid also "clicking" a focused button
      init();
    }
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused) return;
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
try {
  savedTheme = localStorage.getItem('tetris-theme');
} catch {
  // storage unavailable
}
applyTheme(savedTheme === 'light');

themeToggle.addEventListener('click', () => {
  const isLight = !document.body.classList.contains('light-mode');
  applyTheme(isLight);
  try {
    localStorage.setItem('tetris-theme', isLight ? 'light' : 'dark');
  } catch {
    // storage unavailable
  }
});

showStartScreen();
