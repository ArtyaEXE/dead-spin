import type {Point} from '@dead-spin/shared';
import type {Stroke} from './vector';

export type Circle = Point & {radius: number};

export type Body = Circle & {
	r: number; // rotation, degrees; 0 = pointing up
	vx: number;
	vy: number;
	vr: number; // angular velocity, deg/sec
	speed: number;
};

export function resolveCollision(a: Circle, b: Circle): boolean {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const distance = Math.sqrt(dx * dx + dy * dy);
	return distance < a.radius + b.radius;
}

/**
 * Прилагает силу вдоль "носа" тела (угол r, 0° = вверх).
 * Обновляет vx/vy/speed in place.
 */
export function applyForce(body: Body, f: number): void {
	const rad = body.r * (Math.PI / 180);
	body.vx += f * Math.sin(rad);
	body.vy += -f * Math.cos(rad);
	body.speed = Math.hypot(body.vx, body.vy);
}

function distancePointToSegment(point: Point, segmentStart: Point, segmentEnd: Point): number {
	const A = point.x - segmentStart.x;
	const B = point.y - segmentStart.y;
	const C = segmentEnd.x - segmentStart.x;
	const D = segmentEnd.y - segmentStart.y;

	const dot = A * C + B * D;
	const lenSq = C * C + D * D;
	let param = -1;

	if (lenSq !== 0) param = dot / lenSq;

	let xx: number;
	let yy: number;

	if (param < 0) {
		xx = segmentStart.x;
		yy = segmentStart.y;
	} else if (param > 1) {
		xx = segmentEnd.x;
		yy = segmentEnd.y;
	} else {
		xx = segmentStart.x + param * C;
		yy = segmentStart.y + param * D;
	}

	const dx = point.x - xx;
	const dy = point.y - yy;
	return Math.sqrt(dx * dx + dy * dy);
}

function checkCircleSegmentCollision(circle: Circle, segmentStart: Point, segmentEnd: Point): boolean {
	return distancePointToSegment(circle, segmentStart, segmentEnd) < circle.radius;
}

export function checkMazeCollision(circle: Circle, mazeWalls: readonly Stroke[]): boolean {
	for (const wall of mazeWalls) {
		if (checkCircleSegmentCollision(circle, wall.s, wall.e)) return true;
	}
	return false;
}

/**
 * Свип-коллизия: проверяет столкновение круга, движущегося со скоростью (vx,vy),
 * со списком отрезков стен. Движение разбивается на шаги размером радиуса/2
 * чтобы круг не "прошивал" стены между кадрами.
 */
export function checkMovingCircle(circle: Body, mazeWalls: readonly Stroke[], deltaTime: number): boolean {
	const vx = circle.vx;
	const vy = circle.vy;
	const speed = Math.sqrt(vx * vx + vy * vy);
	if (speed === 0) return false;

	const steps = Math.ceil(((speed * deltaTime) / circle.radius) * 2);

	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const testCircle: Circle = {
			x: circle.x + vx * deltaTime * t,
			y: circle.y + vy * deltaTime * t,
			radius: circle.radius,
		};
		if (checkMazeCollision(testCircle, mazeWalls)) return true;
	}

	return false;
}

export const Physics = {
	resolveCollision,
	applyForce,
	checkMovingCircle,
	checkMazeCollision,
};
