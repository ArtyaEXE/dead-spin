import {describe, expect, it} from 'vitest';
import {
	resolveCollision,
	applyForce,
	checkMazeCollision,
	checkMovingCircle,
	type Body,
} from '../physics';
import {pointsToStrokes} from '../vector';


function makeBody(overrides: Partial<Body> = {}): Body {
	return {
		x: 0, y: 0, radius: 30,
		r: 0, vx: 0, vy: 0, vr: 0, speed: 0,
		...overrides,
	};
}


describe('resolveCollision', () => {
	it('returns true when circles overlap', () => {
		expect(resolveCollision(
			{x: 0, y: 0, radius: 20},
			{x: 30, y: 0, radius: 20},
		)).toBe(true);
	});

	it('returns false when circles are apart', () => {
		expect(resolveCollision(
			{x: 0, y: 0, radius: 10},
			{x: 100, y: 0, radius: 10},
		)).toBe(false);
	});

	it('returns false when circles just touch (strict inequality)', () => {
		expect(resolveCollision(
			{x: 0, y: 0, radius: 10},
			{x: 20, y: 0, radius: 10},
		)).toBe(false);
	});
});


describe('applyForce', () => {
	it('pushes body straight up when r = 0', () => {
		const b = makeBody();
		applyForce(b, 100);
		expect(b.vx).toBeCloseTo(0, 5);
		expect(b.vy).toBeCloseTo(-100, 5);
		expect(b.speed).toBeCloseTo(100, 5);
	});

	it('pushes body to the right when r = 90°', () => {
		const b = makeBody({r: 90});
		applyForce(b, 100);
		expect(b.vx).toBeCloseTo(100, 5);
		expect(b.vy).toBeCloseTo(0, 5);
	});

	it('accumulates velocity across calls', () => {
		const b = makeBody();
		applyForce(b, 50);
		applyForce(b, 50);
		expect(b.vy).toBeCloseTo(-100, 5);
	});
});


describe('checkMazeCollision', () => {
	// Квадратный контур 100x100 в координатах (0..100)
	const square = pointsToStrokes([
		{x: 0, y: 0}, {x: 100, y: 0},
		{x: 100, y: 100}, {x: 0, y: 100},
	]);

	it('detects collision when circle touches a wall', () => {
		expect(checkMazeCollision({x: 5, y: 50, radius: 10}, square)).toBe(true);
	});

	it('passes when circle is well inside', () => {
		expect(checkMazeCollision({x: 50, y: 50, radius: 10}, square)).toBe(false);
	});

	it('passes when circle is well outside', () => {
		expect(checkMazeCollision({x: -200, y: -200, radius: 10}, square)).toBe(false);
	});
});


describe('checkMovingCircle', () => {
	// Горизонтальная стена на y=100, x=0..500
	const wall = pointsToStrokes([
		{x: 0, y: 100}, {x: 500, y: 100},
		{x: 500, y: 110}, {x: 0, y: 110},
	]);

	it('returns false when not moving', () => {
		const body = makeBody({x: 50, y: 0});
		expect(checkMovingCircle(body, wall, 1 / 60)).toBe(false);
	});

	it('catches fast-moving circle that would otherwise tunnel through', () => {
		// без свипа круг перескочил бы стену за один кадр
		const body = makeBody({x: 250, y: 50, vy: 10000, speed: 10000});
		expect(checkMovingCircle(body, wall, 1 / 60)).toBe(true);
	});

	it('does not register collision on a parallel path', () => {
		const body = makeBody({x: 250, y: 0, vx: 500, speed: 500});
		expect(checkMovingCircle(body, wall, 1 / 60)).toBe(false);
	});
});
