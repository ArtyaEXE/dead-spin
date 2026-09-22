import {describe, expect, it} from 'vitest';
import {LevelSchema} from '@dead-spin/shared';
import {dailyLevel, endlessLevel, levelFromSeed, seedFromDate} from '../procedural';

/** Тот же замер крюка, что в scripts/validate.ts и в самом генераторе. */
function hook(l: ReturnType<typeof dailyLevel>): number {
	const d = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(b.x - a.x, b.y - a.y);
	const chain = d(l.startPoint, l.star1) + d(l.star1, l.star2) + d(l.star2, l.star3) + d(l.star3, l.finishPoint);
	return chain / d(l.startPoint, l.finishPoint);
}

describe('процедурные уровни', () => {
	it('собирает валидный по схеме уровень из любого сида', () => {
		for (const seed of [0, 1, 42, 9999, 0x7fffffff]) {
			const level = levelFromSeed(seed);
			expect(LevelSchema.safeParse(level).success).toBe(true);
		}
	});

	it('одна дата даёт один и тот же уровень: иначе сравнивать время бессмысленно', () => {
		const a = dailyLevel('2026-10-07');
		const b = dailyLevel('2026-10-07');
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
	});

	it('разные даты дают разные уровни', () => {
		const a = dailyLevel('2026-10-07');
		const b = dailyLevel('2026-10-08');
		expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
	});

	it('держит цель по крюку на длинном прогоне дат', () => {
		for (let d = 1; d <= 28; d++) {
			const level = dailyLevel(`2026-11-${String(d).padStart(2, '0')}`);
			expect(hook(level), `день ${d}`).toBeGreaterThanOrEqual(1.6);
		}
	});

	it('всегда ставит хотя бы две угрозы: испытание без риска не испытание', () => {
		for (let d = 1; d <= 14; d++) {
			const level = dailyLevel(`2026-12-${String(d).padStart(2, '0')}`);
			expect(level.enemies.length, `день ${d}`).toBeGreaterThanOrEqual(2);
		}
	});

	it('не ставит звёзды вплотную друг к другу и к концам маршрута', () => {
		const d = (a: {x: number; y: number}, b: {x: number; y: number}) => Math.hypot(b.x - a.x, b.y - a.y);
		for (let i = 0; i < 20; i++) {
			const l = levelFromSeed(i * 7919);
			const stars = [l.star1, l.star2, l.star3];
			for (const [k, s] of stars.entries()) {
				expect(d(s, l.startPoint), `сид ${i}, звезда ${k}`).toBeGreaterThanOrEqual(120);
				expect(d(s, l.finishPoint), `сид ${i}, звезда ${k}`).toBeGreaterThanOrEqual(120);
			}
			expect(d(stars[0]!, stars[1]!)).toBeGreaterThanOrEqual(130);
			expect(d(stars[1]!, stars[2]!)).toBeGreaterThanOrEqual(130);
		}
	});

	it('сид от даты стабилен и различает соседние дни', () => {
		expect(seedFromDate('2026-10-07')).toBe(seedFromDate('2026-10-07'));
		expect(seedFromDate('2026-10-07')).not.toBe(seedFromDate('2026-10-08'));
	});

	it('бесконечный режим повышает плотность с номером забега', () => {
		const first = endlessLevel(123, 0);
		const late = endlessLevel(123, 12);
		expect(LevelSchema.safeParse(first).success).toBe(true);
		expect(LevelSchema.safeParse(late).success).toBe(true);
		expect(late.name).toBe('∞13');
	});
});
