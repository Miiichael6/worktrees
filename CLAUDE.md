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

- **`index.html`** — DOM structure: `<canvas id="board">` (300×600px) for the playfield, `<canvas id="next-canvas">` (120×120px) for the preview, sidebar HUD (`#score`, `#lines`, `#level`, `#combo`), and a shared overlay `#overlay` for the start screen, PAUSE and GAME OVER (records table `#records`, name entry `#name-entry`, reset `#reset-records-btn`).
- **`style.css`** — Dark/retro arcade theme; uses CSS variables, flexbox, and `backdrop-filter` on overlays.
- **`game.js`** — All game logic (~540 lines, `'use strict'`, no modules).

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
| Speed | `dropInterval = max(100, 1000 − (level−1) × 90)` ms; level = `floor(lines/10) + 1` |
| Ghost piece | `ghostY()` — projects current piece down until collision; drawn at `globalAlpha = 0.2` |
| State flags | `started`, `paused`, `gameOver`, `animId` (RAF handle) |
| Combo | `combo` — consecutive locks that clear lines (reset by a lock that clears none); `maxCombo` per game |
| Records | `localStorage['tetris-records']` = `{ scores:[{name,score,lines}] (top 5), bestCombo, maxLines }`; `loadRecords()`/`saveRecords()` wrap storage in try/catch; `pendingRecord` holds a qualifying score until `commitPendingRecord()` (Enter/Guardar, or auto-saved as "ANÓNIMO" on restart) |
| Overlay | `showOverlay('start'\|'pause'\|'gameover')` toggles records/buttons; `renderRecords()` highlights the current score's row |

### Game flow

`showStartScreen()` → (Enter / Jugar) → `init()` → `spawn()` → `requestAnimationFrame(loop)`. Each frame: accumulate dt → auto-drop or `lockPiece()` → `draw()`. `lockPiece()` = `merge()` + `clearLines()` + `spawn()`. If `spawn()` immediately collides → `endGame()` (stores best combo / max lines, asks for a name if the score enters the top 5). Game keys are ignored while an `<input>` has focus.

## Tunable constants (top of game.js)

`COLS` (10), `ROWS` (20), `BLOCK` (30 px), `COLORS` (array indexed 1–7), `LINE_SCORES`. If you change `COLS`/`ROWS`/`BLOCK`, update the canvas `width`/`height` attributes in `index.html` to match (`COLS×BLOCK` and `ROWS×BLOCK`).
