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
 */

import {writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema} from '@dead-spin/shared';


// ─── Noise + math ────────────────────────────────────────────────────

function hash2(seed: number, ix: number, iy: number): number {
	let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number { return t * t * (3 - 2 * t); }

function valueNoise(seed: number, x: number, y: number): number {
	const x0 = Math.floor(x), y0 = Math.floor(y);
	const tx = smooth(x - x0), ty = smooth(y - y0);
	const n00 = hash2(seed, x0, y0);
	const n10 = hash2(seed, x0 + 1, y0);
	const n01 = hash2(seed, x0, y0 + 1);
	const n11 = hash2(seed, x0 + 1, y0 + 1);
	const a = n00 + (n10 - n00) * tx;
	const b = n01 + (n11 - n01) * tx;
	return (a + (b - a) * ty) * 2 - 1;
}

function fbm(seed: number, x: number, y: number, scale: number, amps: number[]): number {
	let total = 0;
	for (let o = 0; o < amps.length; o++) {
		const f = scale * (1 << o);
		total += valueNoise(seed + o * 97, x * f, y * f) * (amps[o] ?? 0);
	}
	return total;
}


// ─── Geometry ────────────────────────────────────────────────────────

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


// ─── Field + marching squares ────────────────────────────────────────

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
	return best - n;
}


type Seg = {a: Pt; b: Pt};

function lerp(a: number, b: number, va: number, vb: number): number {
	if (vb === va) return a;
	return a + ((0 - va) / (vb - va)) * (b - a);
}

function marchingSquares(spec: Spec): Seg[] {
	const {grid} = spec;
	const w = spec.res.x, h = spec.res.y;
	const xs: number[] = [], ys: number[] = [];
	for (let x = 0; x <= w; x += grid) xs.push(x);
	for (let y = 0; y <= h; y += grid) ys.push(y);
	const cols = xs.length, rows = ys.length;
	const F = new Float32Array(cols * rows);
	for (let j = 0; j < rows; j++)
		for (let i = 0; i < cols; i++)
			F[j * cols + i] = fieldAt(spec, xs[i]!, ys[j]!);

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
			const eTop = (): Pt => ({x: lerp(x0, x1, v00, v10), y: y0});
			const eRight = (): Pt => ({x: x1, y: lerp(y0, y1, v10, v11)});
			const eBottom = (): Pt => ({x: lerp(x0, x1, v01, v11), y: y1});
			const eLeft = (): Pt => ({x: x0, y: lerp(y0, y1, v00, v01)});
			switch (code) {
				case 1: segs.push({a: eLeft(), b: eTop()}); break;
				case 2: segs.push({a: eTop(), b: eRight()}); break;
				case 3: segs.push({a: eLeft(), b: eRight()}); break;
				case 4: segs.push({a: eRight(), b: eBottom()}); break;
				case 5: segs.push({a: eLeft(), b: eTop()}); segs.push({a: eRight(), b: eBottom()}); break;
				case 6: segs.push({a: eTop(), b: eBottom()}); break;
				case 7: segs.push({a: eLeft(), b: eBottom()}); break;
				case 8: segs.push({a: eBottom(), b: eLeft()}); break;
				case 9: segs.push({a: eBottom(), b: eTop()}); break;
				case 10: segs.push({a: eTop(), b: eRight()}); segs.push({a: eBottom(), b: eLeft()}); break;
				case 11: segs.push({a: eBottom(), b: eRight()}); break;
				case 12: segs.push({a: eRight(), b: eLeft()}); break;
				case 13: segs.push({a: eRight(), b: eTop()}); break;
				case 14: segs.push({a: eTop(), b: eLeft()}); break;
			}
		}
	}
	return segs;
}


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
			for (const ci of candidates) { if (!used[ci]) { next = ci; break; } }
			if (next === -1) break;
			used[next] = true;
			const seg = segs[next]!;
			const lk = key(last);
			const append = lk === key(seg.a) ? seg.b : seg.a;
			if (Math.hypot(append.x - start.x, append.y - start.y) < eps) break;
			poly.push(append);
		}
		if (poly.length >= 4) polys.push(poly);
	}
	return polys;
}


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
			stack.push([s, idx]); stack.push([idx, e]);
		}
	}
	return poly.filter((_, i) => keep[i]);
}


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
	return s;
}


function snapInside(p: Pt, poly: Polyline, clearance: number, maxRadius = 250): Pt {
	if (pointInPoly(p, poly) && distToPolygonEdge(p, poly) >= clearance) return p;
	for (let r = 8; r <= maxRadius; r += 8) {
		const steps = Math.max(8, Math.round((2 * Math.PI * r) / 8));
		for (let k = 0; k < steps; k++) {
			const a = (k / steps) * 2 * Math.PI;
			const q = {x: Math.round(p.x + r * Math.cos(a)), y: Math.round(p.y + r * Math.sin(a))};
			if (pointInPoly(q, poly) && distToPolygonEdge(q, poly) >= clearance) return q;
		}
	}
	return p;
}


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

function generateLevel(spec: Spec): any {
	const segs = marchingSquares(spec);
	const polys = chainSegments(segs);
	if (polys.length === 0) throw new Error(`L${spec.n}: no polygons`);
	let best = polys[0]!;
	let bestPerim = polyPerimeter(best);
	for (const p of polys) {
		const pe = polyPerimeter(p);
		if (pe > bestPerim) { best = p; bestPerim = pe; }
	}
	let poly = dpSimplify(best, spec.simplifyEps);
	if (polyArea(poly) < 0) poly = poly.slice().reverse();

	const startPoint = snapInside(spec.startPoint, poly, 60);
	const finishPoint = snapInside(spec.finishPoint, poly, 60);
	const stars = spec.stars.map(s => snapInside(s, poly, 55)) as [Pt, Pt, Pt];
	const enemies = spec.enemies.map(e => {
		if (e.name === 'mine' || e.name === 'stone') {
			const radius = e.radius as number;
			const snapped = snapInside({x: e.x, y: e.y}, poly, radius + 10);
			return {...e, x: snapped.x, y: snapped.y};
		}
		if (e.name === 'worm') {
			const snapped = snapInside({x: e.x, y: e.y}, poly, 50);
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
	console.log(`L${spec.n}: ${json.res.x}×${json.res.y}  walls=${wp}pt  enemies=${json.enemies.length}  decor=${json.decorations.length}`);
}

console.log('\nDone.');
