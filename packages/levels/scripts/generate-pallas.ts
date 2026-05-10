/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Генератор уровней для второго мира (PALLAS, L4–L6).
 *
 * Алгоритм: Perlin-noise distance field + marching squares (см. skill
 * dead-spin-level-generator). Один TS-скрипт без зависимостей кроме
 * @dead-spin/shared (для финальной валидации Zod). Запуск:
 *
 *   pnpm --filter @dead-spin/levels exec tsx scripts/generate-pallas.ts
 *
 * Перезаписывает src/data/{4,5,6}.json. После запуска прогнать validate.
 *
 * Тематика PALLAS — мостик от тутора CERES к настоящей игре:
 *   L4 — первый спуск, мягкая гравитация, без врагов
 *   L5 — гравитация + первые мины
 *   L6 — без гравитации, две мины и первый камень (новый враг)
 */

import {writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema} from '@dead-spin/shared';


// ─── RNG (детерминированный mulberry32) ──────────────────────────────

function rng(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t = (t + 0x6D2B79F5) >>> 0;
		let r = t;
		r = Math.imul(r ^ (r >>> 15), r | 1);
		r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}


// ─── Value noise + fbm ───────────────────────────────────────────────

function hash2(seed: number, ix: number, iy: number): number {
	let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number): number {
	const x0 = Math.floor(x), y0 = Math.floor(y);
	const tx = smooth(x - x0), ty = smooth(y - y0);
	const n00 = hash2(seed, x0, y0);
	const n10 = hash2(seed, x0 + 1, y0);
	const n01 = hash2(seed, x0, y0 + 1);
	const n11 = hash2(seed, x0 + 1, y0 + 1);
	const a = n00 + (n10 - n00) * tx;
	const b = n01 + (n11 - n01) * tx;
	return (a + (b - a) * ty) * 2 - 1; // в [-1,1]
}

function fbm(seed: number, x: number, y: number, scale: number, amps: number[]): number {
	let total = 0;
	for (let o = 0; o < amps.length; o++) {
		const f = scale * (1 << o);
		total += valueNoise(seed + o * 97, x * f, y * f) * (amps[o] ?? 0);
	}
	return total;
}


// ─── Геометрия ───────────────────────────────────────────────────────

type Pt = {x: number; y: number};
type Polyline = Pt[];
type Room = {x: number; y: number; radius: number};


function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
	const dx = b.x - a.x, dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
	let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function distToPolyline(px: number, py: number, line: Polyline, widths: number[]): number {
	// Минимум среди (dist - halfWidth_сегмента). Используем интерполяцию
	// width'ов по проекции точки на сегмент.
	let best = Infinity;
	for (let i = 0; i < line.length - 1; i++) {
		const a = line[i]!, b = line[i + 1]!;
		const dx = b.x - a.x, dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		if (len2 === 0) continue;
		let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const cx = a.x + t * dx, cy = a.y + t * dy;
		const d = Math.hypot(px - cx, py - cy);
		const wA = widths[i] ?? 100, wB = widths[i + 1] ?? wA;
		const w = wA + (wB - wA) * t;
		const sd = d - w;
		if (sd < best) best = sd;
	}
	return best;
}

function distToRoom(px: number, py: number, r: Room): number {
	return Math.hypot(px - r.x, py - r.y) - r.radius;
}


// ─── Field ───────────────────────────────────────────────────────────

type Spec = {
	n: number;
	res: {x: number; y: number};
	seed: number;
	noiseAmps: number[];
	noiseScale: number;
	grid: number;
	simplifyEps: number;
	gravity: {x: number; y: number};
	mainPath: Polyline;
	mainWidths: number[];
	branches: {path: Polyline; widths: number[]}[];
	rooms: Room[];
	startPoint: Pt;
	finishPoint: Pt;
	stars: [Pt, Pt, Pt];
	enemies: any[];
	decor: any[];
};


function fieldAt(spec: Spec, x: number, y: number): number {
	let best = distToPolyline(x, y, spec.mainPath, spec.mainWidths);
	for (const br of spec.branches) {
		const d = distToPolyline(x, y, br.path, br.widths);
		if (d < best) best = d;
	}
	for (const r of spec.rooms) {
		const d = distToRoom(x, y, r);
		if (d < best) best = d;
	}
	const n = fbm(spec.seed, x, y, spec.noiseScale, spec.noiseAmps);
	// signed-distance: <0 в каверне, >0 в скале. Шум вычитается из distance,
	// делает границу неровной.
	return best - n;
}


// ─── Marching squares ────────────────────────────────────────────────

type Seg = {a: Pt; b: Pt};

function lerp(a: number, b: number, va: number, vb: number): number {
	if (vb === va) return a;
	return a + ((0 - va) / (vb - va)) * (b - a);
}

function marchingSquares(spec: Spec): Seg[] {
	const {grid} = spec;
	const w = spec.res.x, h = spec.res.y;
	const xs: number[] = [];
	const ys: number[] = [];
	for (let x = 0; x <= w; x += grid) xs.push(x);
	for (let y = 0; y <= h; y += grid) ys.push(y);
	const cols = xs.length, rows = ys.length;
	const F = new Float32Array(cols * rows);
	for (let j = 0; j < rows; j++) {
		for (let i = 0; i < cols; i++) {
			F[j * cols + i] = fieldAt(spec, xs[i]!, ys[j]!);
		}
	}

	const segs: Seg[] = [];
	for (let j = 0; j < rows - 1; j++) {
		for (let i = 0; i < cols - 1; i++) {
			const x0 = xs[i]!, x1 = xs[i + 1]!;
			const y0 = ys[j]!, y1 = ys[j + 1]!;
			const v00 = F[j * cols + i]!;
			const v10 = F[j * cols + (i + 1)]!;
			const v01 = F[(j + 1) * cols + i]!;
			const v11 = F[(j + 1) * cols + (i + 1)]!;
			let code = 0;
			if (v00 < 0) code |= 1;
			if (v10 < 0) code |= 2;
			if (v11 < 0) code |= 4;
			if (v01 < 0) code |= 8;
			if (code === 0 || code === 15) continue;

			// Edge interpolations
			const eTop = (): Pt => ({x: lerp(x0, x1, v00, v10), y: y0});
			const eRight = (): Pt => ({x: x1, y: lerp(y0, y1, v10, v11)});
			const eBottom = (): Pt => ({x: lerp(x0, x1, v01, v11), y: y1});
			const eLeft = (): Pt => ({x: x0, y: lerp(y0, y1, v00, v01)});

			switch (code) {
				case 1: segs.push({a: eLeft(), b: eTop()}); break;
				case 2: segs.push({a: eTop(), b: eRight()}); break;
				case 3: segs.push({a: eLeft(), b: eRight()}); break;
				case 4: segs.push({a: eRight(), b: eBottom()}); break;
				case 5:
					// Saddle — оба сегмента (не парим о disambig для нашего масштаба)
					segs.push({a: eLeft(), b: eTop()});
					segs.push({a: eRight(), b: eBottom()});
					break;
				case 6: segs.push({a: eTop(), b: eBottom()}); break;
				case 7: segs.push({a: eLeft(), b: eBottom()}); break;
				case 8: segs.push({a: eBottom(), b: eLeft()}); break;
				case 9: segs.push({a: eBottom(), b: eTop()}); break;
				case 10:
					segs.push({a: eTop(), b: eRight()});
					segs.push({a: eBottom(), b: eLeft()});
					break;
				case 11: segs.push({a: eBottom(), b: eRight()}); break;
				case 12: segs.push({a: eRight(), b: eLeft()}); break;
				case 13: segs.push({a: eRight(), b: eTop()}); break;
				case 14: segs.push({a: eTop(), b: eLeft()}); break;
			}
		}
	}
	return segs;
}


// ─── Chain segments → closed polygons ────────────────────────────────

function chainSegments(segs: Seg[]): Polyline[] {
	const eps = 1e-3;
	const key = (p: Pt): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
	const used = new Array(segs.length).fill(false);
	const map = new Map<string, number[]>();
	for (let i = 0; i < segs.length; i++) {
		const ka = key(segs[i]!.a), kb = key(segs[i]!.b);
		(map.get(ka) ?? map.set(ka, []).get(ka)!).push(i);
		(map.get(kb) ?? map.set(kb, []).get(kb)!).push(i);
	}

	const polys: Polyline[] = [];
	for (let s = 0; s < segs.length; s++) {
		if (used[s]) continue;
		used[s] = true;
		const start = segs[s]!.a;
		const poly: Polyline = [start, segs[s]!.b];
		while (true) {
			const last = poly[poly.length - 1]!;
			const candidates = map.get(key(last)) ?? [];
			let next = -1;
			for (const ci of candidates) {
				if (used[ci]) continue;
				next = ci;
				break;
			}
			if (next === -1) break;
			used[next] = true;
			const seg = segs[next]!;
			const ka = key(seg.a), kb = key(seg.b);
			const lk = key(last);
			const append = (lk === ka) ? seg.b : seg.a;
			if (Math.hypot(append.x - start.x, append.y - start.y) < eps) {
				break; // closed
			}
			poly.push(append);
		}
		if (poly.length >= 4) polys.push(poly);
	}
	return polys;
}


// ─── Douglas-Peucker simplify ────────────────────────────────────────

function dpSimplify(poly: Polyline, eps: number): Polyline {
	if (poly.length < 4) return poly;
	const keep = new Array(poly.length).fill(false);
	keep[0] = keep[poly.length - 1] = true;
	const stack: [number, number][] = [[0, poly.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop()!;
		let dmax = 0, idx = -1;
		const a = poly[s]!, b = poly[e]!;
		for (let i = s + 1; i < e; i++) {
			const d = distToSegment(poly[i]!.x, poly[i]!.y, a, b);
			if (d > dmax) { dmax = d; idx = i; }
		}
		if (dmax > eps && idx !== -1) {
			keep[idx] = true;
			stack.push([s, idx]);
			stack.push([idx, e]);
		}
	}
	return poly.filter((_, i) => keep[i]);
}


// ─── Polygon utils ───────────────────────────────────────────────────

function pointInPoly(p: Pt, poly: Polyline): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!, b = poly[j]!;
		const intersect = ((a.y > p.y) !== (b.y > p.y)) &&
			(p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x);
		if (intersect) inside = !inside;
	}
	return inside;
}

function distToPolygonEdge(p: Pt, poly: Polyline): number {
	let best = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
		const d = distToSegment(p.x, p.y, a, b);
		if (d < best) best = d;
	}
	return best;
}

function polyPerimeter(poly: Polyline): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
		s += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return s;
}

function polyArea(poly: Polyline): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
		s += (b.x - a.x) * (b.y + a.y);
	}
	return s; // знак: >0 = CW в y-down
}


// ─── Snap-in для ключевых точек ──────────────────────────────────────

function snapInside(p: Pt, poly: Polyline, clearance: number, maxRadius = 200): Pt {
	if (pointInPoly(p, poly) && distToPolygonEdge(p, poly) >= clearance) return p;
	// Спираль вокруг p, шаг 8 px
	for (let r = 8; r <= maxRadius; r += 8) {
		const steps = Math.max(8, Math.round((2 * Math.PI * r) / 8));
		for (let k = 0; k < steps; k++) {
			const a = (k / steps) * 2 * Math.PI;
			const q = {x: Math.round(p.x + r * Math.cos(a)), y: Math.round(p.y + r * Math.sin(a))};
			if (pointInPoly(q, poly) && distToPolygonEdge(q, poly) >= clearance) return q;
		}
	}
	return p; // fallback — последний шанс
}


// ─── Spec ────────────────────────────────────────────────────────────

const SPECS: Spec[] = [
	// L4 — первый спуск (sinuous descent), мягкая гравитация вниз, без врагов
	{
		n: 4,
		res: {x: 1500, y: 1700},
		seed: 4001,
		noiseAmps: [28, 14, 7],
		noiseScale: 0.0042,
		grid: 10,
		simplifyEps: 4,
		gravity: {x: 0, y: 18},
		mainPath: [
			{x: 220, y: 200},
			{x: 380, y: 460},
			{x: 620, y: 720},
			{x: 470, y: 1010},
			{x: 720, y: 1280},
			{x: 1300, y: 1550},
		],
		mainWidths: [115, 130, 140, 130, 120, 115],
		branches: [
			// pocket для star3 — alcove левее main, около wp3
			{path: [{x: 470, y: 1010}, {x: 320, y: 1040}, {x: 230, y: 990}], widths: [115, 90, 80]},
		],
		rooms: [
			{x: 230, y: 990, radius: 95}, // конец branch'а — хидден pocket
		],
		startPoint: {x: 220, y: 200},
		finishPoint: {x: 1300, y: 1550},
		stars: [
			{x: 380, y: 470},   // star1 — на main, легко
			{x: 720, y: 660},   // star2 — на наружной стороне bend'а wp3
			{x: 230, y: 990},   // star3 — в hidden pocket в конце branch
		],
		enemies: [],
		decor: [
			{name: 'static', x: 280, y: 250, r: 120, s: 0.32, src: 'sign-down.png'},
			{name: 'static', x: 540, y: 800, r: -40, s: 0.42, src: 'ship-1.png'}, // embedded
			{name: 'static', x: 800, y: 1330, r: 30, s: 0.36, src: 'debris-3.png'},
			{name: 'static', x: 1180, y: 1450, r: -20, s: 0.45, src: 'gear-1.png'},
			{name: 'static', x: 360, y: 940, r: 90, s: 0.28, src: 'pipe-2.png'},
		],
	},
	// L5 — corridor + pocket, гравитация средняя, две первые мины
	{
		n: 5,
		res: {x: 1700, y: 1300},
		seed: 5101,
		noiseAmps: [26, 13, 6],
		noiseScale: 0.0048,
		grid: 10,
		simplifyEps: 4,
		gravity: {x: 0, y: 12},
		mainPath: [
			{x: 200, y: 270},
			{x: 460, y: 400},
			{x: 800, y: 540},
			{x: 1100, y: 720},
			{x: 1370, y: 920},
			{x: 1530, y: 1100},
		],
		mainWidths: [105, 125, 135, 125, 115, 105],
		branches: [
			// pocket вверх от wp1 — сюда уходит star3
			{path: [{x: 460, y: 400}, {x: 430, y: 230}, {x: 360, y: 130}], widths: [110, 90, 75]},
		],
		rooms: [
			{x: 360, y: 130, radius: 85},
		],
		startPoint: {x: 200, y: 270},
		finishPoint: {x: 1530, y: 1100},
		stars: [
			{x: 800, y: 470},   // star1 — на наружной стороне wp2
			{x: 1450, y: 990},  // star2 — на main near wp4-wp5 (далеко от mine 2)
			{x: 360, y: 130},   // star3 — в pocket
		],
		enemies: [
			// chokepoint mine 1 — между wp2 и wp3
			{name: 'mine', x: 970, y: 640, r: 0, radius: 30, speed: 0},
			// тикающая mine 2 — около wp4
			{name: 'mine', x: 1280, y: 820, r: 0, radius: 30, speed: 100},
		],
		decor: [
			{name: 'static', x: 420, y: 280, r: 60, s: 0.34, src: 'sign-warning.png'},
			{name: 'static', x: 1000, y: 540, r: -60, s: 0.4, src: 'ship-2.png'},
			{name: 'static', x: 720, y: 360, r: 0, s: 0.36, src: 'debris-4.png'},
			{name: 'static', x: 1450, y: 1000, r: 80, s: 0.42, src: 'robot-1.png'},
			{name: 'static', x: 1100, y: 880, r: -10, s: 0.32, src: 'debris-9.png'},
			{name: 'static', x: 380, y: 70, r: 0, s: 0.3, src: 'sign-happy.png'},
		],
	},
	// L6 — corridor + room, без гравитации, 2 мины + 1 stone (новый враг)
	{
		n: 6,
		res: {x: 1900, y: 1400},
		seed: 6202,
		noiseAmps: [28, 14, 7],
		noiseScale: 0.0046,
		grid: 10,
		simplifyEps: 4,
		gravity: {x: 0, y: 0},
		mainPath: [
			{x: 220, y: 700},
			{x: 480, y: 540},
			{x: 820, y: 420},
			{x: 1180, y: 480},
			{x: 1500, y: 700},
			{x: 1700, y: 980},
		],
		mainWidths: [110, 130, 145, 135, 120, 110],
		branches: [
			// dive вниз около wp3 — сюда star3
			{path: [{x: 1180, y: 480}, {x: 1240, y: 760}, {x: 1340, y: 990}], widths: [125, 105, 90]},
		],
		rooms: [
			// большая комната-зал на середине, чтобы было где бегать stone
			{x: 920, y: 470, radius: 180},
		],
		startPoint: {x: 220, y: 700},
		finishPoint: {x: 1700, y: 980},
		stars: [
			{x: 460, y: 580},   // star1 — на main wp1
			{x: 920, y: 320},   // star2 — над hall (внутри room)
			{x: 1340, y: 990},  // star3 — в конце branch
		],
		enemies: [
			// stone в большой комнате — отскакивает упруго от стен hall'а
			{name: 'stone', x: 960, y: 480, r: 0, radius: 38, speed: 60},
			// mine 1 — между wp4 и wp5 как chokepoint
			{name: 'mine', x: 1580, y: 820, r: 0, radius: 28, speed: 0},
			// mine 2 — в branch около середины (сторожит star3)
			{name: 'mine', x: 1230, y: 870, r: 0, radius: 30, speed: 100},
		],
		decor: [
			{name: 'static', x: 320, y: 660, r: 0, s: 0.32, src: 'sign-right.png'},
			{name: 'static', x: 650, y: 460, r: -50, s: 0.45, src: 'ship-3.png'},
			{name: 'static', x: 1080, y: 320, r: 30, s: 0.5, src: 'gear-2.png'},
			{name: 'static', x: 1620, y: 700, r: -20, s: 0.42, src: 'robot-2.png'},
			{name: 'static', x: 850, y: 660, r: 60, s: 0.36, src: 'debris-7.png'},
			{name: 'static', x: 1220, y: 590, r: 0, s: 0.3, src: 'sign-warning.png'},
			{name: 'static', x: 1700, y: 880, r: -10, s: 0.28, src: 'debris-11.png'},
		],
	},
];


// ─── Main pipeline ──────────────────────────────────────────────────

function generateLevel(spec: Spec): any {
	const segs = marchingSquares(spec);
	const polys = chainSegments(segs);
	if (polys.length === 0) throw new Error(`L${spec.n}: no polygons`);
	// Берём polygon с наибольшим периметром (главная пещера).
	let best = polys[0]!;
	let bestPerim = polyPerimeter(best);
	for (const p of polys) {
		const pe = polyPerimeter(p);
		if (pe > bestPerim) { best = p; bestPerim = pe; }
	}

	// Simplify
	let poly = dpSimplify(best, spec.simplifyEps);

	// Если winding неправильный (CCW в y-down), реверсим — игра, как видно
	// в L1, использует CW.
	if (polyArea(poly) < 0) poly = poly.slice().reverse();

	// Snap-in ключевых точек
	const startPoint = snapInside(spec.startPoint, poly, 60);
	const finishPoint = snapInside(spec.finishPoint, poly, 60);
	const stars = spec.stars.map(s => snapInside(s, poly, 55)) as [Pt, Pt, Pt];

	// Snap-in enemies (по их радиусу)
	const enemies = spec.enemies.map(e => {
		if (e.name === 'mine' || e.name === 'stone') {
			const radius = e.radius as number;
			const snapped = snapInside({x: e.x, y: e.y}, poly, radius + 10);
			return {...e, x: snapped.x, y: snapped.y};
		}
		return e;
	});

	const json = {
		name: String(spec.n),
		res: spec.res,
		startPoint: {x: Math.round(startPoint.x), y: Math.round(startPoint.y)},
		finishPoint: {x: Math.round(finishPoint.x), y: Math.round(finishPoint.y)},
		star1: {x: Math.round(stars[0].x), y: Math.round(stars[0].y)},
		star2: {x: Math.round(stars[1].x), y: Math.round(stars[1].y)},
		star3: {x: Math.round(stars[2].x), y: Math.round(stars[2].y)},
		gravity: spec.gravity,
		referenceUrl: '',
		decorations: spec.decor,
		enemies,
		walls: [poly.map(p => ({x: Math.round(p.x), y: Math.round(p.y)}))],
	};

	// Final Zod-валидация перед записью.
	const parsed = LevelSchema.safeParse(json);
	if (!parsed.success) {
		console.error(`L${spec.n} validation failed:`);
		for (const i of parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
		throw new Error('schema');
	}
	return json;
}


const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

for (const spec of SPECS) {
	const json = generateLevel(spec);
	const path = join(dataDir, `${spec.n}.json`);
	writeFileSync(path, JSON.stringify(json, null, 2));
	const wp = json.walls[0].length;
	console.log(`L${spec.n}: ${json.res.x}×${json.res.y}  walls=${wp}pt  enemies=${json.enemies.length}  decor=${json.decorations.length}  → ${path}`);
}

console.log('\nDone.');
