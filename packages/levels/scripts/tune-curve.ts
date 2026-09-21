/**
 * Правка кривой сложности L1–L30 без перерисовки карт (GDD §8.3).
 *
 *  1) Звёзды уводятся с прямой линии к финишу. «Крюк» = длина ломаной
 *     start→★1→★2→★3→finish / прямая start→finish. Цель: ≥ 1.35 с L4,
 *     ≥ 1.6 с L10. Генератор PALLAS клал звёзды вплотную к маршруту
 *     (крюк 1.02–1.09) — механика «потратить топливо ради звезды или лететь
 *     к финишу» исчезала. Для каждой звезды перебираются кандидаты по
 *     сетке внутри пещеры не дальше MAX_MOVE от исходной точки, берётся
 *     тот, что даёт наибольший крюк при соблюдении инвариантов.
 *
 *  2) В пустые уровни (L3–L6, L16–L18) добавляются мины — на маршруте между
 *     звёздами, в самом широком месте, чтобы heat-механика читалась, а не
 *     душила. Только если у уровня нет ни одного врага.
 *
 * Инварианты (память feedback_level_design §5): звезда↔стена ≥ 55,
 * звезда↔звезда ≥ 130, звезда↔враг ≥ 110 (+радиус врага).
 * Идемпотентно: уровень с крюком ≥ цели и/или с врагами не трогается.
 *
 *   pnpm --filter @dead-spin/levels exec tsx scripts/tune-curve.ts
 */

import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema, type Level} from '@dead-spin/shared';
import {pointInPoly, distToPolygonEdge, type GenPoint} from '../src/generate';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

const STAR_WALL = 55;
const STAR_STAR = 130;
const STAR_ENEMY = 110;
const STAR_ENDPOINT = 120;
const MAX_MOVE = 450;
const GRID = 25;
const MIN_GAIN = 0.01;
const MAX_ROUNDS = 8;

const MINE_RADIUS = 28;
/** Мине нужен коридор: радиус + место пройти мимо (детект 3.2×radius ≈ 90). */
const MINE_WALL = MINE_RADIUS + 45;
const MINE_STAR = STAR_ENEMY + MINE_RADIUS;
const MINE_ENDPOINT = 220;
const MINE_MINE = 260;

/** Сколько мин добавить в уровни без врагов. */
const MINES_FOR_EMPTY: Record<number, number> = {3: 1, 4: 1, 5: 2, 6: 2, 16: 1, 17: 2, 18: 2};

type P = GenPoint;
const dist = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);

function hookTarget(n: number): number {
	if (n >= 10) return 1.6;
	if (n >= 4) return 1.35;
	return 0;
}

function chain(l: Level, stars: [P, P, P]): number {
	return (
		dist(l.startPoint, stars[0]) + dist(stars[0], stars[1]) + dist(stars[1], stars[2]) + dist(stars[2], l.finishPoint)
	);
}

function hookOf(l: Level, stars: [P, P, P]): number {
	return chain(l, stars) / Math.max(1, dist(l.startPoint, l.finishPoint));
}

/** Внутри игровой пещеры: в первом полигоне и не в остальных (если есть). */
function inCave(p: P, l: Level): boolean {
	const outer = l.walls[0]!;
	if (!pointInPoly(p, outer)) return false;
	for (let i = 1; i < l.walls.length; i++) if (pointInPoly(p, l.walls[i]!)) return false;
	return true;
}

function wallClearance(p: P, l: Level): number {
	let best = Infinity;
	for (const poly of l.walls) best = Math.min(best, distToPolygonEdge(p, poly));
	return best;
}

function starOk(p: P, idx: number, stars: [P, P, P], l: Level): boolean {
	if (!inCave(p, l) || wallClearance(p, l) < STAR_WALL) return false;
	if (dist(p, l.startPoint) < STAR_ENDPOINT || dist(p, l.finishPoint) < STAR_ENDPOINT) return false;
	for (let i = 0; i < 3; i++) if (i !== idx && dist(p, stars[i]!) < STAR_STAR) return false;
	for (const e of l.enemies) {
		const r = e.name === 'worm' ? 35 : e.radius;
		if (dist(p, e) < STAR_ENEMY + r) return false;
	}
	return true;
}

function spreadStars(n: number, l: Level): {changed: boolean; before: number; after: number} {
	const target = hookTarget(n);
	const origin: [P, P, P] = [l.star1, l.star2, l.star3];
	const stars: [P, P, P] = [{...l.star1}, {...l.star2}, {...l.star3}];
	const before = hookOf(l, stars);
	if (target === 0 || before >= target) return {changed: false, before, after: before};

	let hook = before;
	for (let round = 0; round < MAX_ROUNDS && hook < target; round++) {
		let best: {idx: number; p: P; hook: number} | null = null;
		for (const idx of [1, 2, 0]) {
			const o = origin[idx]!;
			for (let dy = -MAX_MOVE; dy <= MAX_MOVE; dy += GRID) {
				for (let dx = -MAX_MOVE; dx <= MAX_MOVE; dx += GRID) {
					if (dx * dx + dy * dy > MAX_MOVE * MAX_MOVE) continue;
					const cand = {x: o.x + dx, y: o.y + dy};
					if (!starOk(cand, idx, stars, l)) continue;
					const trial = stars.slice() as [P, P, P];
					trial[idx] = cand;
					const h = hookOf(l, trial);
					if (!best || h > best.hook) best = {idx, p: cand, hook: h};
				}
			}
		}
		if (!best || best.hook - hook < MIN_GAIN) break;
		stars[best.idx] = best.p;
		hook = best.hook;
	}

	const changed = hook > before + MIN_GAIN;
	if (changed) {
		l.star1 = stars[0];
		l.star2 = stars[1];
		l.star3 = stars[2];
	}
	return {changed, before, after: hook};
}

function mineOk(p: P, l: Level, placed: P[]): boolean {
	if (!inCave(p, l) || wallClearance(p, l) < MINE_WALL) return false;
	if (dist(p, l.startPoint) < MINE_ENDPOINT || dist(p, l.finishPoint) < MINE_ENDPOINT) return false;
	for (const s of [l.star1, l.star2, l.star3]) if (dist(p, s) < MINE_STAR) return false;
	for (const m of placed) if (dist(p, m) < MINE_MINE) return false;
	return true;
}

function addMines(n: number, l: Level): number {
	const want = MINES_FOR_EMPTY[n] ?? 0;
	if (want === 0 || l.enemies.length > 0) return 0;

	const route: P[] = [l.startPoint, l.star1, l.star2, l.star3, l.finishPoint];
	// Кандидаты — точки на сегментах маршрута; предпочитаем середину сегмента.
	const cands: {p: P; clr: number}[] = [];
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i]!,
			b = route[i + 1]!;
		for (let t = 0.3; t <= 0.7001; t += 0.05) {
			const p = {x: Math.round(a.x + (b.x - a.x) * t), y: Math.round(a.y + (b.y - a.y) * t)};
			if (!inCave(p, l)) continue;
			cands.push({p, clr: wallClearance(p, l)});
		}
	}
	cands.sort((x, y) => y.clr - x.clr);

	const placed: P[] = [];
	for (const c of cands) {
		if (placed.length >= want) break;
		if (!mineOk(c.p, l, placed)) continue;
		placed.push(c.p);
		l.enemies.push({name: 'mine', x: c.p.x, y: c.p.y, r: 0, radius: MINE_RADIUS, speed: 0});
	}
	return placed.length;
}

const files = readdirSync(dataDir)
	.filter((f) => /^\d+\.json$/.test(f))
	.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

console.log('lvl  крюк до → после  цель   мин+  враги  сдвиг ★ (px)');
let touched = 0;
for (const file of files) {
	const n = parseInt(file, 10);
	const full = join(dataDir, file);
	const raw = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
	const l = LevelSchema.parse(raw);
	const orig: [P, P, P] = [{...l.star1}, {...l.star2}, {...l.star3}];

	const s = spreadStars(n, l);
	const mines = addMines(n, l);

	if (s.changed || mines > 0) {
		raw['star1'] = l.star1;
		raw['star2'] = l.star2;
		raw['star3'] = l.star3;
		raw['enemies'] = l.enemies;
		LevelSchema.parse(raw);
		writeFileSync(full, JSON.stringify(raw, null, 2) + '\n', 'utf8');
		touched++;
	}

	const moves = [l.star1, l.star2, l.star3].map((p, i) => Math.round(dist(p, orig[i]!)));
	const tgt = hookTarget(n);
	const flag = tgt > 0 && s.after < tgt ? ' ⚠' : '';
	console.log(
		`${String(n).padStart(3)}  ${s.before.toFixed(2)} → ${s.after.toFixed(2)}   ${tgt ? tgt.toFixed(2) : '  —'}` +
			`   ${String(mines).padStart(2)}    ${String(l.enemies.length).padStart(3)}    ${moves.join('/')}${flag}`,
	);
}
console.log(`\nизменено уровней: ${touched}. ⚠ — цель по крюку не достигнута в пределах MAX_MOVE=${MAX_MOVE}.`);
