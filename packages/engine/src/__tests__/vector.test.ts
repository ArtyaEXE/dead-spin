import {describe, expect, it} from 'vitest';
import {
	getDistanceBtwPoints,
	getNearestPointByCoords,
	getAngle,
	pointsToStrokes,
	strokesToPoints,
	getChunkCoordsByPoint,
	splitWallStrokesToChunks,
	getNearStrokesByPoint,
	createClosedBSpline,
	initSplineMovement,
	updateSplineMovement,
} from '../vector';


describe('getDistanceBtwPoints', () => {
	it('returns 0 for the same point', () => {
		expect(getDistanceBtwPoints({x: 10, y: 20}, {x: 10, y: 20})).toBe(0);
	});

	it('computes pythagorean distance', () => {
		expect(getDistanceBtwPoints({x: 0, y: 0}, {x: 3, y: 4})).toBe(5);
	});

	it('is symmetric', () => {
		const a = {x: 17, y: -3};
		const b = {x: -5, y: 42};
		expect(getDistanceBtwPoints(a, b)).toBeCloseTo(getDistanceBtwPoints(b, a), 10);
	});
});


describe('getNearestPointByCoords', () => {
	const points = [
		{x: 0, y: 0},
		{x: 100, y: 0},
		{x: 0, y: 100},
		{x: 100, y: 100},
	];

	it('returns null for empty / nullish input', () => {
		expect(getNearestPointByCoords(null, 0, 0)).toBeNull();
		expect(getNearestPointByCoords([], 0, 0)).toBeNull();
	});

	it('finds the closest point', () => {
		expect(getNearestPointByCoords(points, 10, 10)).toEqual({x: 0, y: 0});
		expect(getNearestPointByCoords(points, 95, 95)).toEqual({x: 100, y: 100});
	});

	it('respects maxDistance', () => {
		expect(getNearestPointByCoords(points, 50, 50, 10)).toBeNull();
		expect(getNearestPointByCoords(points, 50, 50, 80)).not.toBeNull();
	});
});


describe('getAngle', () => {
	it('returns 0° for a point directly above', () => {
		// y-axis inverted: "up" on screen = smaller y
		expect(getAngle({x: 0, y: 100}, {x: 0, y: 0})).toBeCloseTo(0, 5);
	});

	it('returns 90° for a point directly to the right', () => {
		expect(getAngle({x: 0, y: 0}, {x: 100, y: 0})).toBeCloseTo(90, 5);
	});

	it('returns 180° for a point directly below', () => {
		expect(getAngle({x: 0, y: 0}, {x: 0, y: 100})).toBeCloseTo(180, 5);
	});

	it('returns 270° for a point directly to the left', () => {
		expect(getAngle({x: 0, y: 0}, {x: -100, y: 0})).toBeCloseTo(270, 5);
	});
});


describe('pointsToStrokes / strokesToPoints', () => {
	it('produces closed polyline with N strokes for N points', () => {
		const poly = [
			{x: 0, y: 0},
			{x: 100, y: 0},
			{x: 100, y: 100},
			{x: 0, y: 100},
		];
		const strokes = pointsToStrokes(poly);

		expect(strokes).toHaveLength(4);
		expect(strokes[0]).toEqual({s: {x: 0, y: 0}, e: {x: 100, y: 0}});
		expect(strokes[3]).toEqual({s: {x: 0, y: 100}, e: {x: 0, y: 0}});
	});

	it('returns [] when fewer than 2 points', () => {
		expect(pointsToStrokes([])).toEqual([]);
		expect(pointsToStrokes([{x: 1, y: 1}])).toEqual([]);
	});

	it('strokesToPoints inverts pointsToStrokes', () => {
		const poly = [
			{x: 0, y: 0},
			{x: 10, y: 0},
			{x: 10, y: 10},
		];
		expect(strokesToPoints(pointsToStrokes(poly))).toEqual(poly);
	});
});


describe('chunks', () => {
	it('computes chunk coords deterministically', () => {
		expect(getChunkCoordsByPoint({x: 0, y: 0})).toBe('0,0');
		expect(getChunkCoordsByPoint({x: 199, y: 199})).toBe('0,0');
		expect(getChunkCoordsByPoint({x: 200, y: 0})).toBe('1,0');
		expect(getChunkCoordsByPoint({x: -1, y: -1})).toBe('-1,-1');
	});

	it('assigns stroke to both chunks when endpoints differ', () => {
		const strokes = [{s: {x: 50, y: 50}, e: {x: 250, y: 50}}];
		const chunks = splitWallStrokesToChunks(strokes);
		expect(chunks['0,0']).toHaveLength(1);
		expect(chunks['1,0']).toHaveLength(1);
	});

	it('getNearStrokesByPoint returns relevant strokes only', () => {
		const strokes = [
			{s: {x: 10, y: 10}, e: {x: 50, y: 50}},       // chunk 0,0
			{s: {x: 5000, y: 5000}, e: {x: 5100, y: 5100}}, // far away
		];
		const chunks = splitWallStrokesToChunks(strokes);
		const near = getNearStrokesByPoint(chunks, {x: 20, y: 20});
		expect(near).toHaveLength(1);
		expect(near[0]!.s).toEqual({x: 10, y: 10});
	});
});


describe('closed B-spline', () => {
	const square = [
		{x: 0, y: 0},
		{x: 100, y: 0},
		{x: 100, y: 100},
		{x: 0, y: 100},
	];

	it('returns a closed curve (first == last)', () => {
		const curve = createClosedBSpline(square, 10);
		expect(curve.length).toBeGreaterThan(square.length);
		expect(curve[0]).toEqual(curve[curve.length - 1]);
	});

	it('spline movement wraps around', () => {
		const curve = createClosedBSpline(square, 10);
		const state = initSplineMovement(curve, 1000);
		expect(state.totalLength).toBeGreaterThan(0);

		// Move for more than one full loop; should remain within bounds
		const pose = updateSplineMovement(state, state.totalLength / 1000 * 1.5);
		expect(Number.isFinite(pose.x)).toBe(true);
		expect(Number.isFinite(pose.y)).toBe(true);
		expect(pose.r).toBeGreaterThanOrEqual(0);
		expect(pose.r).toBeLessThan(360);
	});
});
