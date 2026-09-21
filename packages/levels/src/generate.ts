/**
 * Процедурный генератор пещер — чистая (браузеро-безопасная) библиотека.
 *
 * Алгоритм: Perlin/value-noise distance field + marching squares +
 * Douglas-Peucker simplify. Union features = main path + branches + rooms.
 *
 * Используется двумя потребителями:
 *   - Node-скрипты (scripts/generate-*.ts) — пакетная генерация в JSON
 *   - Браузер-редактор — live-preview пещеры при драге waypoints/ширины
 *
 * НЕ импортирует node:* — всё чисто, работает и в браузере.
 */
import {LevelSchema, type Level} from '@dead-spin/shared';

// ─── Public types ────────────────────────────────────────────────────

export type GenPoint = {x: number; y: number};
export type GenPolyline = GenPoint[];
export type GenRoom = {x: number; y: number; radius: number};
export type GenBranch = {path: GenPolyline; widths: number[]};

export type LevelSpec = {
	n: number;
	res: {x: number; y: number};
	seed: number;
	noiseAmps: number[];
	noiseScale: number;
	grid: number;
	simplifyEps: number;
	gravity: {x: number; y: number};
	mainPath: GenPolyline;
	mainWidths: number[];
	branches: GenBranch[];
	rooms: GenRoom[];
	startPoint: GenPoint;
	finishPoint: GenPoint;
	stars: [GenPoint, GenPoint, GenPoint];
	// biome-ignore lint/suspicious/noExplicitAny: спека принимает врагов любого типа, схема валидирует на выходе
	enemies: any[];
	// biome-ignore lint/suspicious/noExplicitAny: спека принимает врагов любого типа, схема валидирует на выходе
	decor: any[];
};

// ─── Noise + math ────────────────────────────────────────────────────

function hash2(seed: number, ix: number, iy: number): number {
	let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number): number {
	return t * t * (3 - 2 * t);
}

function valueNoise(seed: number, x: number, y: number): number {
	const x0 = Math.floor(x),
		y0 = Math.floor(y);
	const tx = smooth(x - x0),
		ty = smooth(y - y0);
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

function distToSegment(px: number, py: number, a: GenPoint, b: GenPoint): number {
	const dx = b.x - a.x,
		dy = b.y - a.y;
	const len2 = dx * dx + dy * dy;
	if (len2 === 0) return Math.hypot(px - a.x, py - a.y);
	let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
	t = Math.max(0, Math.min(1, t));
	return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function distToPolyline(px: number, py: number, line: GenPolyline, widths: number[]): number {
	let best = Infinity;
	for (let i = 0; i < line.length - 1; i++) {
		const a = line[i]!,
			b = line[i + 1]!;
		const dx = b.x - a.x,
			dy = b.y - a.y;
		const len2 = dx * dx + dy * dy;
		if (len2 === 0) continue;
		let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const cx = a.x + t * dx,
			cy = a.y + t * dy;
		const d = Math.hypot(px - cx, py - cy);
		const wA = widths[i] ?? 100,
			wB = widths[i + 1] ?? wA;
		const w = wA + (wB - wA) * t;
		const sd = d - w;
		if (sd < best) best = sd;
	}
	return best;
}

function distToRoom(px: number, py: number, r: GenRoom): number {
	return Math.hypot(px - r.x, py - r.y) - r.radius;
}

// ─── Field + marching squares ────────────────────────────────────────

function fieldAt(spec: LevelSpec, x: number, y: number): number {
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

type Seg = {a: GenPoint; b: GenPoint};

function lerp(a: number, b: number, va: number, vb: number): number {
	if (vb === va) return a;
	return a + ((0 - va) / (vb - va)) * (b - a);
}

function marchingSquares(spec: LevelSpec): Seg[] {
	const {grid} = spec;
	const w = spec.res.x,
		h = spec.res.y;
	const xs: number[] = [],
		ys: number[] = [];
	for (let x = 0; x <= w; x += grid) xs.push(x);
	for (let y = 0; y <= h; y += grid) ys.push(y);
	const cols = xs.length,
		rows = ys.length;
	const F = new Float32Array(cols * rows);
	for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) F[j * cols + i] = fieldAt(spec, xs[i]!, ys[j]!);

	const segs: Seg[] = [];
	for (let j = 0; j < rows - 1; j++) {
		for (let i = 0; i < cols - 1; i++) {
			const x0 = xs[i]!,
				x1 = xs[i + 1]!;
			const y0 = ys[j]!,
				y1 = ys[j + 1]!;
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
			const eTop = (): GenPoint => ({x: lerp(x0, x1, v00, v10), y: y0});
			const eRight = (): GenPoint => ({x: x1, y: lerp(y0, y1, v10, v11)});
			const eBottom = (): GenPoint => ({x: lerp(x0, x1, v01, v11), y: y1});
			const eLeft = (): GenPoint => ({x: x0, y: lerp(y0, y1, v00, v01)});
			switch (code) {
				case 1:
					segs.push({a: eLeft(), b: eTop()});
					break;
				case 2:
					segs.push({a: eTop(), b: eRight()});
					break;
				case 3:
					segs.push({a: eLeft(), b: eRight()});
					break;
				case 4:
					segs.push({a: eRight(), b: eBottom()});
					break;
				case 5:
					segs.push({a: eLeft(), b: eTop()});
					segs.push({a: eRight(), b: eBottom()});
					break;
				case 6:
					segs.push({a: eTop(), b: eBottom()});
					break;
				case 7:
					segs.push({a: eLeft(), b: eBottom()});
					break;
				case 8:
					segs.push({a: eBottom(), b: eLeft()});
					break;
				case 9:
					segs.push({a: eBottom(), b: eTop()});
					break;
				case 10:
					segs.push({a: eTop(), b: eRight()});
					segs.push({a: eBottom(), b: eLeft()});
					break;
				case 11:
					segs.push({a: eBottom(), b: eRight()});
					break;
				case 12:
					segs.push({a: eRight(), b: eLeft()});
					break;
				case 13:
					segs.push({a: eRight(), b: eTop()});
					break;
				case 14:
					segs.push({a: eTop(), b: eLeft()});
					break;
			}
		}
	}
	return segs;
}

function chainSegments(segs: Seg[]): GenPolyline[] {
	const eps = 1e-3;
	const key = (p: GenPoint): string => `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
	const used = new Array(segs.length).fill(false);
	const map = new Map<string, number[]>();
	for (let i = 0; i < segs.length; i++) {
		const ka = key(segs[i]!.a),
			kb = key(segs[i]!.b);
		(map.get(ka) ?? map.set(ka, []).get(ka)!).push(i);
		(map.get(kb) ?? map.set(kb, []).get(kb)!).push(i);
	}
	const polys: GenPolyline[] = [];
	for (let s = 0; s < segs.length; s++) {
		if (used[s]) continue;
		used[s] = true;
		const start = segs[s]!.a;
		const poly: GenPolyline = [start, segs[s]!.b];
		while (true) {
			const last = poly[poly.length - 1]!;
			const candidates = map.get(key(last)) ?? [];
			let next = -1;
			for (const ci of candidates) {
				if (!used[ci]) {
					next = ci;
					break;
				}
			}
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

function dpSimplify(poly: GenPolyline, eps: number): GenPolyline {
	if (poly.length < 4) return poly;
	const keep = new Array(poly.length).fill(false);
	keep[0] = keep[poly.length - 1] = true;
	const stack: [number, number][] = [[0, poly.length - 1]];
	while (stack.length) {
		const [s, e] = stack.pop()!;
		let dmax = 0,
			idx = -1;
		const a = poly[s]!,
			b = poly[e]!;
		for (let i = s + 1; i < e; i++) {
			const d = distToSegment(poly[i]!.x, poly[i]!.y, a, b);
			if (d > dmax) {
				dmax = d;
				idx = i;
			}
		}
		if (dmax > eps && idx !== -1) {
			keep[idx] = true;
			stack.push([s, idx]);
			stack.push([idx, e]);
		}
	}
	return poly.filter((_, i) => keep[i]);
}

export function pointInPoly(p: GenPoint, poly: GenPolyline): boolean {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const a = poly[i]!,
			b = poly[j]!;
		const intersect = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
		if (intersect) inside = !inside;
	}
	return inside;
}

export function distToPolygonEdge(p: GenPoint, poly: GenPolyline): number {
	let best = Infinity;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!,
			b = poly[(i + 1) % poly.length]!;
		const d = distToSegment(p.x, p.y, a, b);
		if (d < best) best = d;
	}
	return best;
}

function polyPerimeter(poly: GenPolyline): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!,
			b = poly[(i + 1) % poly.length]!;
		s += Math.hypot(b.x - a.x, b.y - a.y);
	}
	return s;
}

function polyArea(poly: GenPolyline): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const a = poly[i]!,
			b = poly[(i + 1) % poly.length]!;
		s += (b.x - a.x) * (b.y + a.y);
	}
	return s;
}

export function snapInside(p: GenPoint, poly: GenPolyline, clearance: number, maxRadius = 250): GenPoint {
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

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Генерирует ТОЛЬКО полигон стен из spec. Лёгкая операция для live-preview
 * в редакторе — пересчитывается при каждом драге waypoint/ширины без
 * валидации всего уровня. Возвращает CCW-полигон (positive area).
 */
export function generateWallPolygon(spec: LevelSpec): GenPolyline {
	const segs = marchingSquares(spec);
	const polys = chainSegments(segs);
	if (polys.length === 0) return [];
	let best = polys[0]!;
	let bestPerim = polyPerimeter(best);
	for (const p of polys) {
		const pe = polyPerimeter(p);
		if (pe > bestPerim) {
			best = p;
			bestPerim = pe;
		}
	}
	let poly = dpSimplify(best, spec.simplifyEps);
	if (polyArea(poly) < 0) poly = poly.slice().reverse();
	return poly.map((p) => ({x: Math.round(p.x), y: Math.round(p.y)}));
}

/**
 * Полная генерация уровня: стены + snap всех ключевых точек/врагов внутрь
 * полигона + валидация Zod. Бросает при невалидном результате.
 */
export function generateLevel(spec: LevelSpec): Level {
	const poly = generateWallPolygon(spec);
	if (poly.length === 0) throw new Error(`L${spec.n}: no polygons`);

	const startPoint = snapInside(spec.startPoint, poly, 60);
	const finishPoint = snapInside(spec.finishPoint, poly, 60);
	const stars = spec.stars.map((s) => snapInside(s, poly, 55)) as [GenPoint, GenPoint, GenPoint];
	const enemies = spec.enemies.map((e) => {
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
		walls: [poly],
	};

	const parsed = LevelSchema.safeParse(json);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
		throw new Error(`L${spec.n} validation failed: ${issues}`);
	}
	return parsed.data;
}
