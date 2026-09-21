/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Генератор второго мира — PALLAS, 15 уровней (L16–L30).
 *
 * Тематический арк: мост от тутора CERES к настоящей игре. Каждые
 * ~3 уровня вводят что-то новое:
 *   L16–L18 — гравитация (мягкая → сильная)
 *   L19–L21 — первые мины
 *   L22–L24 — первые камни (новый враг)
 *   L25–L27 — гравитация + враги вместе
 *   L28–L30 — PALLAS-финал: червь, плотные коридоры, всё сразу
 *
 * Алгоритм генерации см. в скилле dead-spin-level-generator: Perlin field
 * + marching squares + DP simplify. Запуск:
 *
 *   pnpm --filter @dead-spin/levels exec tsx scripts/generate-pallas.ts
 *
 * Перезаписывает src/data/{16..30}.json. После запуска прогнать validate.
 *
 * ВНИМАНИЕ: перезапись ТЕРЯЕТ пост-генерационные правки — gravity-стрелки
 * (inject-gravity-decorations.ts) и ручную смену декораций. Если уровни
 * уже допиливались вручную/скриптами, не запускай это вслепую.
 *
 * Алгоритм вынесен в `src/generate.ts` (browser-safe, юзается редактором).
 */

import {writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateLevel, type LevelSpec} from '../src/generate';

type Spec = LevelSpec;


// ─── 15 PALLAS specs ─────────────────────────────────────────────────
//
// Прогрессия:
//   L16-18: gravity
//   L19-21: mines
//   L22-24: stones
//   L25-27: gravity+enemies combo
//   L28-30: dense + first worm + finale

const SPECS: Spec[] = [

	// ═══════════════════════ L16 — мягкий спуск ════════════════════════
	{
		n: 16, res: {x: 1500, y: 1700}, seed: 1601,
		noiseAmps: [28, 14, 7], noiseScale: 0.0042, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 18},
		mainPath: [{x: 220, y: 200}, {x: 380, y: 460}, {x: 620, y: 720}, {x: 470, y: 1010}, {x: 720, y: 1280}, {x: 1300, y: 1550}],
		mainWidths: [115, 130, 140, 130, 120, 115],
		branches: [{path: [{x: 470, y: 1010}, {x: 320, y: 1040}, {x: 230, y: 990}], widths: [115, 90, 80]}],
		rooms: [{x: 230, y: 990, radius: 95}],
		startPoint: {x: 220, y: 200}, finishPoint: {x: 1300, y: 1550},
		stars: [{x: 380, y: 470}, {x: 720, y: 660}, {x: 230, y: 990}],
		enemies: [],
		decor: [
			{name: 'static', x: 280, y: 250, r: 120, s: 0.32, src: 'sign-down.png'},
			{name: 'static', x: 540, y: 800, r: -40, s: 0.42, src: 'ship-1.png'},
			{name: 'static', x: 800, y: 1330, r: 30, s: 0.36, src: 'debris-3.png'},
			{name: 'static', x: 1180, y: 1450, r: -20, s: 0.45, src: 'gear-1.png'},
			{name: 'static', x: 360, y: 940, r: 90, s: 0.28, src: 'pipe-2.png'},
		],
	},

	// ═══════════════════════ L17 — двойной зигзаг ═════════════════════
	{
		n: 17, res: {x: 1700, y: 1500}, seed: 1702,
		noiseAmps: [28, 14, 7], noiseScale: 0.0044, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 14},
		mainPath: [{x: 200, y: 250}, {x: 550, y: 380}, {x: 850, y: 600}, {x: 600, y: 880}, {x: 950, y: 1100}, {x: 1500, y: 1300}],
		mainWidths: [105, 120, 130, 120, 115, 105],
		branches: [],
		rooms: [],
		startPoint: {x: 200, y: 250}, finishPoint: {x: 1500, y: 1300},
		stars: [{x: 550, y: 290}, {x: 720, y: 770}, {x: 1200, y: 1230}],
		enemies: [],
		decor: [
			{name: 'static', x: 290, y: 320, r: 0, s: 0.34, src: 'sign-warning.png'},
			{name: 'static', x: 760, y: 480, r: -40, s: 0.42, src: 'ship-2.png'},
			{name: 'static', x: 700, y: 1000, r: 50, s: 0.36, src: 'debris-7.png'},
			{name: 'static', x: 1380, y: 1200, r: 0, s: 0.4, src: 'gear-2.png'},
			{name: 'static', x: 480, y: 700, r: 60, s: 0.32, src: 'pipe-1.png'},
		],
	},

	// ═══════════════════════ L18 — узкий вертикальный шахта ════════════
	{
		n: 18, res: {x: 1100, y: 2000}, seed: 1803,
		noiseAmps: [22, 11, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 22},
		mainPath: [{x: 250, y: 200}, {x: 380, y: 500}, {x: 620, y: 800}, {x: 380, y: 1100}, {x: 620, y: 1400}, {x: 850, y: 1800}],
		mainWidths: [100, 115, 125, 115, 110, 100],
		branches: [],
		rooms: [{x: 720, y: 1100, radius: 90}],
		startPoint: {x: 250, y: 200}, finishPoint: {x: 850, y: 1800},
		stars: [{x: 360, y: 480}, {x: 720, y: 1100}, {x: 700, y: 1700}],
		enemies: [],
		decor: [
			{name: 'static', x: 300, y: 280, r: 180, s: 0.3, src: 'sign-down.png'},
			{name: 'static', x: 500, y: 700, r: -30, s: 0.35, src: 'ship-3.png'},
			{name: 'static', x: 280, y: 1300, r: 60, s: 0.28, src: 'debris-5.png'},
			{name: 'static', x: 800, y: 1700, r: 0, s: 0.4, src: 'gear-1.png'},
		],
	},

	// ═══════════════════════ L19 — первая мина ═════════════════════════
	{
		n: 19, res: {x: 1700, y: 1300}, seed: 1904,
		noiseAmps: [26, 13, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 200, y: 700}, {x: 460, y: 580}, {x: 820, y: 480}, {x: 1180, y: 540}, {x: 1430, y: 720}, {x: 1530, y: 950}],
		mainWidths: [110, 130, 145, 135, 125, 115],
		branches: [{path: [{x: 820, y: 480}, {x: 870, y: 250}, {x: 950, y: 130}], widths: [125, 95, 80]}],
		rooms: [{x: 950, y: 130, radius: 95}],
		startPoint: {x: 200, y: 700}, finishPoint: {x: 1530, y: 950},
		stars: [{x: 470, y: 520}, {x: 1300, y: 600}, {x: 950, y: 130}],
		enemies: [
			{name: 'mine', x: 1000, y: 540, r: 0, radius: 30, speed: 0},
		],
		decor: [
			{name: 'static', x: 280, y: 760, r: 0, s: 0.32, src: 'sign-warning.png'},
			{name: 'static', x: 700, y: 460, r: -30, s: 0.42, src: 'ship-1.png'},
			{name: 'static', x: 1100, y: 660, r: 30, s: 0.32, src: 'debris-9.png'},
			{name: 'static', x: 1450, y: 850, r: -10, s: 0.4, src: 'robot-1.png'},
			{name: 'static', x: 940, y: 200, r: 0, s: 0.28, src: 'sign-happy.png'},
		],
	},

	// ═══════════════════════ L20 — две мины + лёгкая гравитация ════════
	{
		n: 20, res: {x: 1700, y: 1300}, seed: 2005,
		noiseAmps: [26, 13, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 12},
		mainPath: [{x: 200, y: 270}, {x: 460, y: 400}, {x: 800, y: 540}, {x: 1100, y: 720}, {x: 1370, y: 920}, {x: 1530, y: 1100}],
		mainWidths: [105, 125, 135, 125, 115, 105],
		branches: [{path: [{x: 460, y: 400}, {x: 430, y: 230}, {x: 360, y: 130}], widths: [110, 90, 75]}],
		rooms: [{x: 360, y: 130, radius: 85}],
		startPoint: {x: 200, y: 270}, finishPoint: {x: 1530, y: 1100},
		stars: [{x: 800, y: 470}, {x: 1450, y: 990}, {x: 360, y: 130}],
		enemies: [
			{name: 'mine', x: 970, y: 640, r: 0, radius: 30, speed: 0},
			{name: 'mine', x: 1280, y: 820, r: 0, radius: 30, speed: 100},
		],
		decor: [
			{name: 'static', x: 420, y: 280, r: 60, s: 0.34, src: 'sign-warning.png'},
			{name: 'static', x: 1000, y: 540, r: -60, s: 0.4, src: 'ship-2.png'},
			{name: 'static', x: 720, y: 360, r: 0, s: 0.36, src: 'debris-4.png'},
			{name: 'static', x: 1450, y: 1000, r: 80, s: 0.42, src: 'robot-1.png'},
			{name: 'static', x: 380, y: 70, r: 0, s: 0.3, src: 'sign-happy.png'},
		],
	},

	// ═══════════════════════ L21 — миновое поле ═════════════════════════
	{
		n: 21, res: {x: 2000, y: 1100}, seed: 2106,
		noiseAmps: [22, 11, 6], noiseScale: 0.005, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 180, y: 550}, {x: 500, y: 540}, {x: 900, y: 540}, {x: 1300, y: 540}, {x: 1700, y: 540}, {x: 1850, y: 550}],
		mainWidths: [100, 115, 125, 125, 115, 100],
		branches: [],
		rooms: [],
		startPoint: {x: 180, y: 550}, finishPoint: {x: 1850, y: 550},
		stars: [{x: 500, y: 480}, {x: 1080, y: 720}, {x: 1750, y: 470}],
		enemies: [
			{name: 'mine', x: 700, y: 540, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 950, y: 480, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 1200, y: 600, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 1480, y: 540, r: 0, radius: 28, speed: 100},
		],
		decor: [
			{name: 'static', x: 270, y: 470, r: 0, s: 0.34, src: 'sign-danger.png'},
			{name: 'static', x: 600, y: 380, r: -20, s: 0.36, src: 'debris-7.png'},
			{name: 'static', x: 1050, y: 700, r: 30, s: 0.4, src: 'pipe-3.png'},
			{name: 'static', x: 1600, y: 380, r: 0, s: 0.38, src: 'robot-2.png'},
			{name: 'static', x: 850, y: 700, r: 60, s: 0.32, src: 'debris-2.png'},
		],
	},

	// ═══════════════════════ L22 — первый камень в зале ════════════════
	{
		n: 22, res: {x: 1900, y: 1400}, seed: 2207,
		noiseAmps: [28, 14, 7], noiseScale: 0.0046, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 220, y: 700}, {x: 480, y: 540}, {x: 820, y: 420}, {x: 1180, y: 480}, {x: 1500, y: 700}, {x: 1700, y: 980}],
		mainWidths: [110, 130, 145, 135, 120, 110],
		branches: [{path: [{x: 1180, y: 480}, {x: 1240, y: 760}, {x: 1340, y: 990}], widths: [125, 105, 90]}],
		rooms: [{x: 920, y: 470, radius: 180}],
		startPoint: {x: 220, y: 700}, finishPoint: {x: 1700, y: 980},
		stars: [{x: 460, y: 580}, {x: 920, y: 320}, {x: 1340, y: 990}],
		enemies: [
			{name: 'stone', x: 960, y: 480, r: 0, radius: 38, speed: 60},
			{name: 'mine', x: 1580, y: 820, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 1230, y: 870, r: 0, radius: 30, speed: 100},
		],
		decor: [
			{name: 'static', x: 320, y: 660, r: 0, s: 0.32, src: 'sign-right.png'},
			{name: 'static', x: 650, y: 460, r: -50, s: 0.45, src: 'ship-3.png'},
			{name: 'static', x: 1080, y: 320, r: 30, s: 0.5, src: 'gear-2.png'},
			{name: 'static', x: 1620, y: 700, r: -20, s: 0.42, src: 'robot-2.png'},
			{name: 'static', x: 850, y: 660, r: 60, s: 0.36, src: 'debris-7.png'},
		],
	},

	// ═══════════════════════ L23 — два камня ════════════════════════════
	{
		n: 23, res: {x: 2000, y: 1400}, seed: 2308,
		noiseAmps: [30, 14, 7], noiseScale: 0.0044, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 200, y: 1100}, {x: 500, y: 900}, {x: 850, y: 700}, {x: 1200, y: 700}, {x: 1550, y: 500}, {x: 1850, y: 350}],
		mainWidths: [110, 130, 150, 150, 130, 110],
		branches: [],
		rooms: [{x: 1050, y: 700, radius: 200}],
		startPoint: {x: 200, y: 1100}, finishPoint: {x: 1850, y: 350},
		stars: [{x: 470, y: 1000}, {x: 1050, y: 580}, {x: 1700, y: 430}],
		enemies: [
			{name: 'stone', x: 1000, y: 700, r: 0, radius: 38, speed: 70},
			{name: 'stone', x: 1150, y: 800, r: 30, radius: 35, speed: 50},
		],
		decor: [
			{name: 'static', x: 290, y: 1180, r: 0, s: 0.34, src: 'sign-warning.png'},
			{name: 'static', x: 700, y: 800, r: -30, s: 0.4, src: 'ship-1.png'},
			{name: 'static', x: 1300, y: 800, r: 30, s: 0.45, src: 'gear-1.png'},
			{name: 'static', x: 1750, y: 230, r: 0, s: 0.36, src: 'robot-3.png'},
			{name: 'static', x: 1480, y: 600, r: 60, s: 0.32, src: 'debris-11.png'},
			{name: 'static', x: 880, y: 850, r: 0, s: 0.3, src: 'pipe-4.png'},
		],
	},

	// ═══════════════════════ L24 — спираль с камнем ═════════════════════
	{
		n: 24, res: {x: 1700, y: 1700}, seed: 2409,
		noiseAmps: [26, 13, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 250, y: 200}, {x: 1300, y: 250}, {x: 1450, y: 1300}, {x: 400, y: 1400}, {x: 350, y: 600}, {x: 1100, y: 750}, {x: 1100, y: 950}],
		mainWidths: [110, 125, 130, 125, 120, 115, 105],
		branches: [],
		rooms: [],
		startPoint: {x: 250, y: 200}, finishPoint: {x: 1100, y: 950},
		stars: [{x: 1300, y: 200}, {x: 400, y: 1450}, {x: 600, y: 600}],
		enemies: [
			{name: 'stone', x: 800, y: 800, r: 0, radius: 35, speed: 60},
			{name: 'mine', x: 1380, y: 750, r: 0, radius: 28, speed: 0},
		],
		decor: [
			{name: 'static', x: 340, y: 270, r: 0, s: 0.32, src: 'sign-round.png'},
			{name: 'static', x: 1200, y: 400, r: -40, s: 0.42, src: 'ship-4.png'},
			{name: 'static', x: 600, y: 1330, r: 60, s: 0.4, src: 'debris-6.png'},
			{name: 'static', x: 350, y: 800, r: 30, s: 0.36, src: 'pipe-2.png'},
			{name: 'static', x: 950, y: 900, r: 0, s: 0.4, src: 'robot-1.png'},
		],
	},

	// ═══════════════════════ L25 — гравитация + 3 мины ═════════════════
	{
		n: 25, res: {x: 1700, y: 1700}, seed: 2510,
		noiseAmps: [26, 13, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 18},
		mainPath: [{x: 220, y: 200}, {x: 500, y: 400}, {x: 800, y: 600}, {x: 600, y: 900}, {x: 900, y: 1200}, {x: 1500, y: 1500}],
		mainWidths: [105, 125, 135, 125, 115, 105],
		branches: [],
		rooms: [],
		startPoint: {x: 220, y: 200}, finishPoint: {x: 1500, y: 1500},
		stars: [{x: 480, y: 320}, {x: 880, y: 600}, {x: 1230, y: 1330}],
		enemies: [
			{name: 'mine', x: 700, y: 530, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 750, y: 800, r: 0, radius: 28, speed: 100},
			{name: 'mine', x: 1100, y: 1180, r: 0, radius: 28, speed: 0},
		],
		decor: [
			{name: 'static', x: 290, y: 270, r: 90, s: 0.34, src: 'sign-down.png'},
			{name: 'static', x: 660, y: 470, r: -30, s: 0.4, src: 'ship-2.png'},
			{name: 'static', x: 1000, y: 1080, r: 0, s: 0.36, src: 'debris-3.png'},
			{name: 'static', x: 1380, y: 1380, r: -10, s: 0.4, src: 'gear-1.png'},
			{name: 'static', x: 460, y: 940, r: 60, s: 0.32, src: 'pipe-3.png'},
			{name: 'static', x: 800, y: 1000, r: 0, s: 0.3, src: 'sign-warning.png'},
		],
	},

	// ═══════════════════════ L26 — гравитация боковая ══════════════════
	{
		n: 26, res: {x: 2200, y: 1100}, seed: 2611,
		noiseAmps: [24, 12, 6], noiseScale: 0.005, grid: 10, simplifyEps: 4,
		gravity: {x: -22, y: 0},
		mainPath: [{x: 2050, y: 550}, {x: 1700, y: 460}, {x: 1300, y: 540}, {x: 950, y: 460}, {x: 600, y: 540}, {x: 250, y: 550}],
		mainWidths: [105, 120, 130, 130, 120, 105],
		branches: [],
		rooms: [{x: 1300, y: 540, radius: 150}],
		startPoint: {x: 2050, y: 550}, finishPoint: {x: 250, y: 550},
		stars: [{x: 1700, y: 360}, {x: 950, y: 600}, {x: 600, y: 660}],
		enemies: [
			{name: 'mine', x: 1500, y: 500, r: 0, radius: 28, speed: 0},
			{name: 'stone', x: 1300, y: 540, r: 0, radius: 35, speed: 50},
			{name: 'mine', x: 800, y: 580, r: 0, radius: 28, speed: 100},
		],
		decor: [
			{name: 'static', x: 1950, y: 460, r: 90, s: 0.32, src: 'sign-left.png'},
			{name: 'static', x: 1500, y: 380, r: -40, s: 0.4, src: 'ship-3.png'},
			{name: 'static', x: 1100, y: 670, r: 30, s: 0.42, src: 'gear-2.png'},
			{name: 'static', x: 700, y: 380, r: 0, s: 0.36, src: 'debris-9.png'},
			{name: 'static', x: 350, y: 650, r: -20, s: 0.34, src: 'robot-2.png'},
			{name: 'static', x: 1300, y: 380, r: 0, s: 0.3, src: 'pipe-1.png'},
		],
	},

	// ═══════════════════════ L27 — узкая шахта вниз с минами ═══════════
	{
		n: 27, res: {x: 1100, y: 2200}, seed: 2712,
		noiseAmps: [22, 11, 6], noiseScale: 0.0048, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 24},
		mainPath: [{x: 280, y: 200}, {x: 380, y: 600}, {x: 620, y: 900}, {x: 380, y: 1300}, {x: 620, y: 1700}, {x: 850, y: 2050}],
		mainWidths: [100, 110, 120, 110, 110, 100],
		branches: [],
		rooms: [],
		startPoint: {x: 280, y: 200}, finishPoint: {x: 850, y: 2050},
		stars: [{x: 380, y: 500}, {x: 600, y: 950}, {x: 700, y: 1900}],
		enemies: [
			{name: 'mine', x: 380, y: 750, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 580, y: 1200, r: 0, radius: 28, speed: 0},
			{name: 'stone', x: 480, y: 1500, r: 0, radius: 35, speed: 40},
		],
		decor: [
			{name: 'static', x: 350, y: 270, r: 180, s: 0.3, src: 'sign-down.png'},
			{name: 'static', x: 500, y: 700, r: -30, s: 0.36, src: 'ship-1.png'},
			{name: 'static', x: 280, y: 1500, r: 60, s: 0.32, src: 'debris-12.png'},
			{name: 'static', x: 770, y: 1900, r: 0, s: 0.4, src: 'gear-1.png'},
			{name: 'static', x: 480, y: 1000, r: 0, s: 0.3, src: 'sign-danger.png'},
		],
	},

	// ═══════════════════════ L28 — gauntlet ═════════════════════════════
	{
		n: 28, res: {x: 2200, y: 1500}, seed: 2813,
		noiseAmps: [30, 15, 7], noiseScale: 0.0044, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 200, y: 750}, {x: 600, y: 700}, {x: 1100, y: 750}, {x: 1600, y: 700}, {x: 2050, y: 750}],
		mainWidths: [110, 145, 160, 145, 110],
		branches: [],
		rooms: [{x: 1100, y: 750, radius: 240}],
		startPoint: {x: 200, y: 750}, finishPoint: {x: 2050, y: 750},
		stars: [{x: 600, y: 580}, {x: 1100, y: 540}, {x: 1600, y: 920}],
		enemies: [
			{name: 'stone', x: 950, y: 700, r: 0, radius: 38, speed: 70},
			{name: 'stone', x: 1250, y: 800, r: 30, radius: 38, speed: 60},
			{name: 'mine', x: 800, y: 720, r: 0, radius: 28, speed: 100},
			{name: 'mine', x: 1100, y: 920, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 1400, y: 720, r: 0, radius: 28, speed: 100},
		],
		decor: [
			{name: 'static', x: 290, y: 660, r: 0, s: 0.34, src: 'sign-danger.png'},
			{name: 'static', x: 850, y: 540, r: -40, s: 0.42, src: 'ship-3.png'},
			{name: 'static', x: 1400, y: 580, r: 30, s: 0.4, src: 'robot-3.png'},
			{name: 'static', x: 1900, y: 850, r: 0, s: 0.4, src: 'gear-2.png'},
			{name: 'static', x: 580, y: 920, r: 0, s: 0.36, src: 'debris-13.png'},
			{name: 'static', x: 1750, y: 580, r: 60, s: 0.32, src: 'pipe-4.png'},
		],
	},

	// ═══════════════════════ L29 — первый червь ════════════════════════
	{
		n: 29, res: {x: 2000, y: 1700}, seed: 2914,
		noiseAmps: [30, 15, 7], noiseScale: 0.0044, grid: 10, simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [{x: 200, y: 850}, {x: 550, y: 600}, {x: 950, y: 500}, {x: 1350, y: 700}, {x: 1700, y: 1100}, {x: 1850, y: 1500}],
		mainWidths: [110, 130, 145, 135, 125, 110],
		branches: [{path: [{x: 1350, y: 700}, {x: 1100, y: 1100}, {x: 850, y: 1300}], widths: [130, 110, 95]}],
		rooms: [{x: 850, y: 1300, radius: 110}],
		startPoint: {x: 200, y: 850}, finishPoint: {x: 1850, y: 1500},
		stars: [{x: 550, y: 480}, {x: 1300, y: 580}, {x: 850, y: 1300}],
		enemies: [
			{name: 'worm', x: 1000, y: 600, seed: 'p29'},
			{name: 'mine', x: 1600, y: 1000, r: 0, radius: 28, speed: 0},
		],
		decor: [
			{name: 'static', x: 290, y: 800, r: 0, s: 0.34, src: 'sign-warning.png'},
			{name: 'static', x: 700, y: 600, r: -30, s: 0.42, src: 'ship-2.png'},
			{name: 'static', x: 1500, y: 800, r: 30, s: 0.4, src: 'gear-1.png'},
			{name: 'static', x: 1750, y: 1300, r: -20, s: 0.4, src: 'robot-2.png'},
			{name: 'static', x: 980, y: 1180, r: 0, s: 0.3, src: 'pipe-3.png'},
			{name: 'static', x: 870, y: 1430, r: 60, s: 0.36, src: 'debris-2.png'},
		],
	},

	// ═══════════════════════ L30 — PALLAS финал ════════════════════════
	{
		n: 30, res: {x: 2200, y: 1700}, seed: 3015,
		noiseAmps: [30, 15, 7], noiseScale: 0.0044, grid: 10, simplifyEps: 4,
		gravity: {x: 8, y: 12},
		mainPath: [{x: 200, y: 200}, {x: 550, y: 450}, {x: 950, y: 600}, {x: 1350, y: 800}, {x: 1700, y: 1100}, {x: 2050, y: 1500}],
		mainWidths: [110, 135, 145, 135, 125, 110],
		branches: [{path: [{x: 950, y: 600}, {x: 700, y: 850}, {x: 480, y: 1100}], widths: [135, 110, 95]}],
		rooms: [{x: 480, y: 1100, radius: 100}, {x: 1500, y: 950, radius: 150}],
		startPoint: {x: 200, y: 200}, finishPoint: {x: 2050, y: 1500},
		stars: [{x: 550, y: 350}, {x: 480, y: 1100}, {x: 1700, y: 1100}],
		enemies: [
			{name: 'worm', x: 1700, y: 700, seed: 'p30a'},
			{name: 'stone', x: 1500, y: 950, r: 0, radius: 38, speed: 70},
			{name: 'mine', x: 800, y: 700, r: 0, radius: 28, speed: 0},
			{name: 'mine', x: 1200, y: 850, r: 0, radius: 28, speed: 100},
			{name: 'mine', x: 1850, y: 1300, r: 0, radius: 28, speed: 0},
		],
		decor: [
			{name: 'static', x: 280, y: 270, r: 0, s: 0.34, src: 'sign-danger.png'},
			{name: 'static', x: 700, y: 500, r: -50, s: 0.45, src: 'ship-4.png'},
			{name: 'static', x: 1100, y: 720, r: 30, s: 0.5, src: 'gear-2.png'},
			{name: 'static', x: 1620, y: 880, r: 0, s: 0.42, src: 'robot-3.png'},
			{name: 'static', x: 1900, y: 1430, r: -20, s: 0.4, src: 'gear-1.png'},
			{name: 'static', x: 600, y: 1100, r: 60, s: 0.32, src: 'pipe-4.png'},
			{name: 'static', x: 350, y: 1100, r: 0, s: 0.3, src: 'sign-warning.png'},
			{name: 'static', x: 1450, y: 1100, r: 0, s: 0.36, src: 'debris-13.png'},
		],
	},
];


// ─── Main pipeline ──────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

for (const spec of SPECS) {
	const json = generateLevel(spec);
	const path = join(dataDir, `${spec.n}.json`);
	writeFileSync(path, JSON.stringify(json, null, 2));
	const wp = json.walls[0]!.length;
	console.log(`L${spec.n}: ${json.res.x}×${json.res.y}  walls=${wp}pt  enemies=${json.enemies.length}  decor=${json.decorations.length}`);
}

console.log('\nDone.');
