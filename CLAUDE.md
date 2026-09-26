# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step or dependencies. Open directly or serve with any static server:

```bash
open index.html                  # macOS direct open
python3 -m http.server 8000      # then visit http://localhost:8000
```

## Architecture

Three files, no framework, no bundler:

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`, `#combo`), skin `<select id="skin-select">`, and a shared overlay `#overlay` for the start screen, PAUSE and GAME OVER. The overlay holds the records table `#records`, name entry `#name-entry`, reset `#reset-records-btn` and a menu with two views: `#menu-main` (Reanudar / Jugar·Reiniciar / Ver controles / Nivel inicial selector) and `#menu-controls` (key list + Volver). Menu entries are `.menu-item`; clickable ones carry `data-action`.
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~902 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–8` = piece color index (8 = N piece) |
| Piece representation | `{ type, shape, x, y }` where `shape` is a 2-D matrix |
| Rotation | `rotateCW(shape)` — transpose + reverse; `tryRotate()` applies wall kicks `[0,±1,±2]` |
| Collision | `collide(shape, ox, oy)` — checks bounds and board occupancy |
| Game loop | `loop(ts)` via `requestAnimationFrame`; `dropAccum` tracks elapsed ms against `dropInterval` |
| Line clear | `clearLines()` — iterates board bottom-up, splices full rows, prepends empty row |
| Scoring | `LINE_SCORES = [0,100,300,500,800]` × `level`; hard drop +2/cell, soft drop +1/row |
| Speed | `dropInterval = max(100, 1000 − (level−1) × 90)` ms; `intervalFor(level)`; level = `max(baseLevel, floor(lines/10) + 1)` |
| Starting level | `startLevel` (1–10, persisted in `localStorage['tetris-start-level']`, applied on next `init()` as `baseLevel`) |
| Pause / menu | `togglePause()`, `openMenu()`, `closeMenu()`, `showMenuView('main'\|'controls')`, `handleMenuKey()` (↑↓ navigate, Enter/Space select, ←→ change level), `runMenuAction(action)` |
| Input lock | While `paused \|\| gameOver` game keys are routed to the menu only; on `closeMenu()` keys still held (`heldKeys`) go to `blockedKeys` and are ignored until their `keyup` |
| Next preview | `next` piece drawn by `drawNext()` into `#next-canvas` at 24 px/cell; `shapeBounds(shape)` trims empty padding so the filled cells are centered in pixels; redrawn on every `spawn()` and on skin change |
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| Skins | `SKINS` (`retro`, `neon`, `pastel`, `pixel`) — each has `colors[1..8]`, `boardBg`, `gridColor` (`null` = CSS theme vars) and `drawBlock(ctx, x, y, colorIndex, size, alpha)`; `activeSkin` is used by board, ghost and `drawNext()`; `clearCanvas()` paints the skin background. `applySkin(key)` persists to `localStorage['tetris-skin']` and redraws immediately via `redrawBoard()` (also on start screen / pause / game over). `drawBlock` must reset `globalAlpha`/`shadowBlur`. |
| State flags | `started`, `paused`, `gameOver`, `animId` (RAF handle), `menuView`, `menuIndex` |
| Combo | `combo` — consecutive locks that clear lines (reset by a lock that clears none); `maxCombo` per game |
| Records | `localStorage['tetris-records']` = `{ scores:[{name,score,lines}] (top 5), bestCombo, maxLines }`; `loadRecords()`/`saveRecords()` wrap storage in try/catch; `pendingRecord` holds a qualifying score until `commitPendingRecord()` (Enter/Guardar, or auto-saved as "ANÓNIMO" on restart) |
| Overlay | `openMenu('start'\|'pause'\|'gameover', title, subtitle)` — records + reset shown on start/game over, Reanudar only on pause; `renderRecords()` highlights the current score's row |

### Game flow

`showStartScreen()` → (Jugar) → `init()` (also used by Reiniciar; commits any pending record and cancels any pending RAF first) → `spawn()` → `startLoop()` (resets `dropAccum`, sets `lastTime = null` so the first frame has dt = 0) → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()` (stores best combo / max lines, asks for a name if the score enters the top 5, opens the menu without Reanudar). `P`/`Escape` toggle pause; `Escape` first closes the controls sub-view. Game keys are ignored while an `<input>` has focus.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `LINE_SCORES`, `MIN_START_LEVEL`/`MAX_START_LEVEL`. Piece colors live per skin in `SKINS[*].colors`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
