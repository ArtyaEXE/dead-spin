import {describe, it, expect} from 'vitest';
import {computeRating, mergeRecord, levelFuelTank, DEFAULT_FUEL_TANK} from '@dead-spin/shared';


const level = {parTimeMs: 15_000, parFuel: 1_500, fuelTank: 3_000};

describe('computeRating', () => {
	it('финиш без par даёт ровно одну звезду', () => {
		const r = computeRating(level, {collected: 0, timeMs: 30_000, fuelSpent: 4_000});
		expect(r).toEqual({stars: 1, parHit: false, fullClear: false});
	});

	it('время в par даёт вторую звезду независимо от предметов', () => {
		const r = computeRating(level, {collected: 0, timeMs: 15_000, fuelSpent: 4_000});
		expect(r.stars).toBe(2);
		expect(r.parHit).toBe(true);
		expect(r.fullClear).toBe(false);
	});

	it('все предметы + экономия дают зачистку даже при медленном времени', () => {
		const r = computeRating(level, {collected: 3, timeMs: 40_000, fuelSpent: 1_500});
		expect(r.stars).toBe(2);
		expect(r.fullClear).toBe(true);
	});

	it('три предмета без экономии — зачистки нет', () => {
		const r = computeRating(level, {collected: 3, timeMs: 40_000, fuelSpent: 1_600});
		expect(r.fullClear).toBe(false);
	});

	it('оба условия — три звезды', () => {
		const r = computeRating(level, {collected: 3, timeMs: 10_000, fuelSpent: 900});
		expect(r).toEqual({stars: 3, parHit: true, fullClear: true});
	});

	it('continue режет рейтинг до одной звезды', () => {
		const r = computeRating(level, {collected: 3, timeMs: 10_000, fuelSpent: 900, usedContinue: true});
		expect(r).toEqual({stars: 1, parHit: false, fullClear: false});
	});

	it('уровень без par не даёт вторую и третью звезду', () => {
		const r = computeRating({}, {collected: 3, timeMs: 1, fuelSpent: 0});
		expect(r.stars).toBe(1);
	});
});


describe('mergeRecord', () => {
	it('первый рекорд берётся как есть', () => {
		const m = mergeRecord(null, {stars: 2, parHit: true, fullClear: false, timeMs: 12_000, fuelSpent: 2_000});
		expect(m).toEqual({stars: 2, parHit: true, fullClear: false, timeMs: 12_000, fuelSpent: 2_000});
	});

	it('медленная зачистка не стирает лучшее время, флаги суммируются', () => {
		const existing = {parHit: true, fullClear: false, timeMs: 12_000, fuelSpent: 2_000};
		const m = mergeRecord(existing, {stars: 2, parHit: false, fullClear: true, timeMs: 30_000, fuelSpent: 1_200});
		expect(m.stars).toBe(3);
		expect(m.timeMs).toBe(12_000);
		expect(m.fuelSpent).toBe(1_200);
	});

	it('худший заход ничего не меняет', () => {
		const existing = {parHit: true, fullClear: true, timeMs: 10_000, fuelSpent: 1_000};
		const m = mergeRecord(existing, {stars: 1, parHit: false, fullClear: false, timeMs: 50_000, fuelSpent: 3_000});
		expect(m).toEqual({stars: 3, ...existing});
	});
});


describe('levelFuelTank', () => {
	it('берёт бак уровня или дефолт', () => {
		expect(levelFuelTank(level)).toBe(3_000);
		expect(levelFuelTank({})).toBe(DEFAULT_FUEL_TANK);
	});
});
