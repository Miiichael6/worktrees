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

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`), and a shared overlay `#overlay` for both PAUSE and GAME OVER states. The overlay holds a menu with two views: `#menu-main` (Reanudar / Reiniciar / Ver controles / Nivel inicial selector) and `#menu-controls` (key list + Volver). Menu entries are `.menu-item`; clickable ones carry `data-action`.
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~535 lines, `'use strict'`, no modules).

### game.js internals

| Concern | Key identifiers |
|---|---|
| Board state | `board` — `ROWS×COLS` matrix; `0` = empty, `1–7` = piece color index |
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
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| State flags | `paused`, `gameOver`, `animId` (RAF handle), `menuView`, `menuIndex` |

### Game flow

`init()` (also used by Reiniciar; cancels any pending RAF first) → `spawn()` → `startLoop()` (resets `dropAccum`, sets `lastTime = null` so the first frame has dt = 0) → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()` (opens the menu without Reanudar). `P`/`Escape` toggle pause; `Escape` first closes the controls sub-view.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array indexed 1–7), `LINE_SCORES`, `MIN_START_LEVEL`/`MAX_START_LEVEL`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
