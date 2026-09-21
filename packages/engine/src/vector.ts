import type {Point} from '@dead-spin/shared';

export type Stroke = {s: Point; e: Point};
export type ChunkMap = Record<string, Stroke[]>;

export function getDistanceBtwPoints(p1: Point, p2: Point): number {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
}

export function pointsToStrokes(ps: readonly Point[]): Stroke[] {
	if (ps.length < 2) return [];

	const strokes: Stroke[] = [];
	for (let i = 0; i < ps.length; i++) {
		const curr = ps[i]!;
		const next = ps[(i + 1) % ps.length]!;
		strokes.push({s: curr, e: next});
	}
	return strokes;
}

export function strokesToPoints(ws: readonly Stroke[]): Point[] {
	return ws.map((w) => w.s);
}

export function getNearestPointByCoords(
	ps: readonly Point[] | null | undefined,
	x: number,
	y: number,
	maxDistance: number = Infinity,
): Point | null {
	if (!ps?.length) return null;

	const coords: Point = {x, y};
	let nearest: Point | null = null;
	let minDist = Infinity;

	for (const P of ps) {
		const dist = getDistanceBtwPoints(P, coords);
		if (dist >= minDist || dist > maxDistance) continue;
		minDist = dist;
		nearest = P;
	}

	return nearest;
}

/**
 * Угол (в градусах, 0° — вверх) от точки `from` к точке `to`.
 * Y-ось инвертируется, так как в экранных координатах Y растёт вниз.
 */
export function getAngle(from: Point, to: Point): number {
	const dx = to.x - from.x;
	const dy = from.y - to.y;

	let angleDeg = 90 - Math.atan2(dy, dx) * (180 / Math.PI);
	if (angleDeg < 0) angleDeg += 360;
	return angleDeg;
}

/// SPATIAL CHUNKS ///
// Broad-phase: делим плоскость на квадраты CHUNK_SIZE и привязываем каждый
// отрезок стены к чанкам его концов. При проверке коллизии берём только
// отрезки в соседних 9 чанках от игрока — вместо всех стен уровня.

export const CHUNK_SIZE = 200;

export function getChunkCoordsByPoint(point: Point, chunkSize: number = CHUNK_SIZE): string {
	const x = Math.floor(point.x / chunkSize);
	const y = Math.floor(point.y / chunkSize);
	return `${x},${y}`;
}

function appendStrokeToChunk(chunks: ChunkMap, coords: string, stroke: Stroke): void {
	const existing = chunks[coords];
	if (existing) existing.push(stroke);
	else chunks[coords] = [stroke];
}

export function splitWallStrokesToChunks(strokes: readonly Stroke[], chunks: ChunkMap = {}): ChunkMap {
	for (const S of strokes) {
		const CS = getChunkCoordsByPoint(S.s);
		const CE = getChunkCoordsByPoint(S.e);

		if (CS === CE) {
			appendStrokeToChunk(chunks, CS, S);
		} else {
			appendStrokeToChunk(chunks, CS, S);
			appendStrokeToChunk(chunks, CE, S);
		}
	}
	return chunks;
}

function getNearChunksByPoint(chunks: ChunkMap, point: Point): Stroke[][] {
	const [cxStr, cyStr] = getChunkCoordsByPoint(point).split(',');
	const centerX = Number(cxStr);
	const centerY = Number(cyStr);
	const result: Stroke[][] = [];

	for (let x = centerX - 1; x <= centerX + 1; x++) {
		for (let y = centerY - 1; y <= centerY + 1; y++) {
			const chunk = chunks[`${x},${y}`];
			if (chunk) result.push(chunk);
		}
	}
	return result;
}

export function getNearStrokesByPoint(chunks: ChunkMap, point: Point): Stroke[] {
	const near = getNearChunksByPoint(chunks, point);
	const set = new Set<Stroke>();
	for (const chunk of near) for (const stroke of chunk) set.add(stroke);
	return Array.from(set);
}

/// CLOSED B-SPLINE ///
// Генерация замкнутого B-сплайна по опорным точкам; используется для путей
// движения врагов (червяки по изогнутой траектории).

export function createClosedBSpline(points: readonly Point[], segmentsPerCurve: number = 20): Point[] {
	if (points.length < 2) return [];

	const ext: Point[] = [points[points.length - 1]!, ...points, points[0]!, points[1]!];

	const result: Point[] = [];
	const n = points.length;

	for (let i = 1; i <= n; i++) {
		const p0 = ext[i - 1]!;
		const p1 = ext[i]!;
		const p2 = ext[i + 1]!;
		const p3 = ext[i + 2]!;

		for (let t = 0; t < 1; t += 1 / segmentsPerCurve) {
			const tt = t * t;
			const ttt = tt * t;
			const ONE_SIXTH = 1 / 6;

			const x =
				ONE_SIXTH *
				((-ttt + 3 * tt - 3 * t + 1) * p0.x +
					(3 * ttt - 6 * tt + 4) * p1.x +
					(-3 * ttt + 3 * tt + 3 * t + 1) * p2.x +
					ttt * p3.x);
			const y =
				ONE_SIXTH *
				((-ttt + 3 * tt - 3 * t + 1) * p0.y +
					(3 * ttt - 6 * tt + 4) * p1.y +
					(-3 * ttt + 3 * tt + 3 * t + 1) * p2.y +
					ttt * p3.y);

			result.push({x, y});
		}
	}

	result.push(result[0]!);
	return result;
}

export type SplineState = {
	points: Point[];
	segmentLengths: number[];
	totalLength: number;
	speed: number;
	currentDistance: number;
};

export function initSplineMovement(splinePoints: Point[], speed: number, initialDistance: number = 0): SplineState {
	let totalLength = 0;
	const segmentLengths: number[] = [];

	for (let i = 1; i < splinePoints.length; i++) {
		const a = splinePoints[i - 1]!;
		const b = splinePoints[i]!;
		const len = getDistanceBtwPoints(a, b);
		segmentLengths.push(len);
		totalLength += len;
	}

	return {
		points: splinePoints,
		segmentLengths,
		totalLength,
		speed,
		currentDistance: initialDistance,
	};
}

export type SplinePose = Point & {r: number};

export function updateSplineMovement(state: SplineState, deltaTime: number): SplinePose {
	state.currentDistance += state.speed * deltaTime;

	while (state.currentDistance >= state.totalLength) state.currentDistance -= state.totalLength;
	while (state.currentDistance < 0) state.currentDistance += state.totalLength;

	let accumulated = 0;
	let segmentIndex = 0;
	for (; segmentIndex < state.segmentLengths.length; segmentIndex++) {
		if (accumulated + state.segmentLengths[segmentIndex]! >= state.currentDistance) break;
		accumulated += state.segmentLengths[segmentIndex]!;
	}

	const segLen = state.segmentLengths[segmentIndex]!;
	const progress = segLen === 0 ? 0 : (state.currentDistance - accumulated) / segLen;
	const p0 = state.points[segmentIndex]!;
	const p1 = state.points[segmentIndex + 1]!;

	const x = p0.x + (p1.x - p0.x) * progress;
	const y = p0.y + (p1.y - p0.y) * progress;

	let r = Math.atan2(p1.x - p0.x, p0.y - p1.y) * (180 / Math.PI);
	if (r < 0) r += 360;

	return {x, y, r};
}
