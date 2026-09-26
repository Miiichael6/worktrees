# Plan: Menú de pausa, Tabla de records, Skins

## Context
Tetris vanilla (index.html / style.css / game.js ~340 líneas, sin build ni tests). Hay un overlay compartido `#overlay` (PAUSA/GAME OVER) con `#restart-btn`; `togglePause()` solo con `KeyP`; `init()` reinicia sin recargar; `drawBlock(context,x,y,colorIndex,size,alpha)` es el único punto de dibujo de bloques (board, ghost, next); `COLORS` es const global con 8 piezas; tema light/dark ya persiste en `localStorage('tetris-theme')`.

## Work units (ejecución en PARALELO)

Las 3 unidades se lanzan **a la vez**, en un solo mensaje: 3 agentes en background, cada uno en su propio git worktree aislado (`isolation: "worktree"`, `run_in_background: true`). Ninguna espera a otra; cada una abre su propio PR.
Solo 3 archivos y 3 features: dividir más crearía dependencias entre PRs, así que son **3 unidades** (cada una mergeable sola; conflictos textuales entre ellas se resuelven al mergear en orden).

1. **Menú de pausa completo** — index.html, style.css, game.js. `P`/`Escape` abren overlay de pausa propio (`#pause-menu`) con botones Reanudar, Reiniciar (`init()`), Ver controles (panel toggle con lista de teclas), Nivel inicial (select 1–10, guardado en `localStorage('tetris-start-level')`, aplicado en `init()`: `level`, `dropInterval`, y líneas-base para que `level = max(startLevel, floor(lines/10)+1)`). Navegación con teclado. Bloquear inputs de juego mientras está abierto y descartar la tecla que cierra el menú / ignorar keydown repetido (`e.repeat`) durante ~150 ms tras reanudar.
2. **Tabla de records local** — index.html, style.css, game.js. `localStorage('tetris-records')` = `{ top:[{name,score,lines,level,date}] (máx 5), bestCombo, maxLines }`. Añadir contador de combo (líneas limpiadas en locks consecutivos). Pantalla de inicio (overlay inicial con top 5 + botón Jugar) y en game over: si entra en top 5 mostrar input de nombre + Guardar, resaltar la fila nueva. Mostrar mejor combo y máx. líneas. Botón "Resetear records" con `confirm()`. Escapar nombres (textContent).
3. **Skins visuales** — index.html, style.css, game.js. Objeto `SKINS = { retro, neon, pastel, pixel }` con `{ colors[], bg, grid, drawBlock(ctx,x,y,color,size,alpha) }`. Retro = estilo actual; Neon = fondo negro + `shadowBlur`/`shadowColor` (resetear después); Pastel = colores suaves + rect redondeado (`roundRect` o path); Pixel = patrón de textura 2×2/4×4 sobre cada bloque. Selector (`<select id="skin-select">`) en el panel, persistido en `localStorage('tetris-skin')`, aplica en caliente (redibuja board y next aunque esté en pausa). Mantener compatibilidad con light/dark toggle.

## Convenciones
- `'use strict'`, sin módulos/deps, funciones sueltas, textos UI en español, estilo arcade con variables CSS existentes.
- Leer `localStorage` en try/catch con valores por defecto.
- Actualizar CLAUDE.md tabla de internals si se añaden conceptos.

## E2E recipe
1. `python -m http.server 8123` en el worktree (background).
2. Usar skill `agent-browser`: abrir `http://localhost:8123`, ejercitar la feature (unidad 1: pulsar Escape, clic en cada opción, cambiar nivel, reiniciar y verificar HUD LEVEL; unidad 2: forzar game over con hard drops repetidos (Space), escribir nombre, guardar, recargar y ver top en inicio, resetear; unidad 3: cambiar cada skin, screenshot de cada una, recargar y verificar persistencia).
3. Revisar la consola por errores. Matar el servidor.
Si agent-browser no está disponible, verificar con `node --check game.js` y describir lo no verificado.

## Worker instructions (plantilla)
Objetivo global + tarea de la unidad (verbatim arriba) + convenciones + receta E2E + bloque verbatim del /batch (code-review → tests (no hay suite: `node --check game.js`) → e2e → commit/push/`gh pr create` → `PR: <url>`). Nota: el remote es `Klerith/claude-tetris`; si el push falla por permisos, reportarlo.
