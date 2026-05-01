import {z} from 'zod';
import {PointSchema} from './level';


/**
 * Запись («ghost») прохождения уровня. Порт `imports/lib/client/tries.js`
 * из Meteor-исходника. Формат event-based, не покадровый:
 *
 * - `start` — снимок при старте уровня (позиция = level.startPoint).
 * - `boost` — после каждого тапа бустера; снимок берётся ПОСЛЕ
 *   `Physics.applyForce`, поэтому в `vx/vy` уже зашит импульс.
 * - `loose` — снимок в момент гибели (взрыв в этой точке).
 * - `win`   — снимок при пересечении финиша.
 *
 * Между событиями плеер-призрак движется детерминированно: гравитация
 * + линейная угловая скорость. На каждом event'е state перезаписывается
 * к зафиксированному снимку. Размер записи типичного прохождения —
 * 10–30 событий × ~50 байт = ~1 КБ.
 */


export const GhostEventTypeSchema = z.enum(['start', 'boost', 'loose', 'win']);
export type GhostEventType = z.infer<typeof GhostEventTypeSchema>;


export const GhostEventSchema = z.object({
	type: GhostEventTypeSchema,
	time: z.number().nonnegative().finite(),
	x: z.number().finite(),
	y: z.number().finite(),
	r: z.number().finite(),
	vx: z.number().finite(),
	vy: z.number().finite(),
	vr: z.number().finite(),
});
export type GhostEvent = z.infer<typeof GhostEventSchema>;


export const GhostRecordingSchema = z.object({
	level: z.number().int().positive(),
	gravity: PointSchema,
	events: z.array(GhostEventSchema).min(2).max(500),
});
export type GhostRecording = z.infer<typeof GhostRecordingSchema>;


/**
 * Sanity-проверка записи на стороне сервера. Не ловит ботов с честной
 * физикой, но закрывает «случайно подсунул мусор»:
 *  - первый event = `start` около startPoint
 *  - последний event = `win` около finishPoint
 *  - время монотонно растёт
 *  - суммарное время ≈ заявленный timeMs
 */
export function isPlausibleRecording(args: {
	rec: GhostRecording;
	level: number;
	startPoint: {x: number; y: number};
	finishPoint: {x: number; y: number};
	timeMs: number;
	tolerancePx?: number;
	toleranceTimeMs?: number;
}): boolean {
	const {rec, level, startPoint, finishPoint, timeMs} = args;
	const px = args.tolerancePx ?? 80;
	const tms = args.toleranceTimeMs ?? 500;

	if (rec.level !== level) return false;
	if (rec.events.length < 2) return false;

	const first = rec.events[0]!;
	const last = rec.events[rec.events.length - 1]!;

	if (first.type !== 'start') return false;
	if (last.type !== 'win') return false;

	if (Math.hypot(first.x - startPoint.x, first.y - startPoint.y) > px) return false;
	if (Math.hypot(last.x - finishPoint.x, last.y - finishPoint.y) > px) return false;

	if (Math.abs(last.time - timeMs) > tms) return false;

	for (let i = 1; i < rec.events.length; i++) {
		const cur = rec.events[i]!;
		const prev = rec.events[i - 1]!;
		if (cur.time < prev.time) return false;
	}

	return true;
}
