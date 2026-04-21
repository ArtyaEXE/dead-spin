import {describe, expect, it} from 'vitest';
import {FUEL_MAX, FUEL_REGEN_PER_TICK, FUEL_TICK_MS} from '@dead-spin/shared';
import {computeRegenerated} from '../fuel';


describe('computeRegenerated (lazy fuel regen)', () => {
	it('does nothing if fuel is already at max', () => {
		const r = computeRegenerated(FUEL_MAX, 0, 100_000);
		expect(r.fuel).toBe(FUEL_MAX);
	});

	it('does nothing if less than one tick has passed', () => {
		const start = 1_000_000;
		const r = computeRegenerated(1000, start, start + FUEL_TICK_MS - 1);
		expect(r.fuel).toBe(1000);
		expect(r.fuelUpdatedAtMs).toBe(start);
	});

	it('adds exactly one tick of regen after one tick', () => {
		const start = 1_000_000;
		const r = computeRegenerated(1000, start, start + FUEL_TICK_MS);
		expect(r.fuel).toBe(1000 + FUEL_REGEN_PER_TICK);
		expect(r.fuelUpdatedAtMs).toBe(start + FUEL_TICK_MS);
	});

	it('preserves fractional tick time (does not lose sub-tick elapsed)', () => {
		const start = 1_000_000;
		// 1.5 tick prошло: регенит 1 тик, метку двигает только на 1 тик
		const r = computeRegenerated(1000, start, start + Math.floor(FUEL_TICK_MS * 1.5));
		expect(r.fuel).toBe(1000 + FUEL_REGEN_PER_TICK);
		expect(r.fuelUpdatedAtMs).toBe(start + FUEL_TICK_MS);
	});

	it('clamps at FUEL_MAX even after long idle', () => {
		const start = 0;
		const r = computeRegenerated(10_000, start, 24 * 60 * 60 * 1000);
		expect(r.fuel).toBe(FUEL_MAX);
	});

	it('handles multiple ticks deterministically', () => {
		const start = 0;
		const r = computeRegenerated(0, start, 5 * FUEL_TICK_MS);
		expect(r.fuel).toBe(5 * FUEL_REGEN_PER_TICK);
		expect(r.fuelUpdatedAtMs).toBe(5 * FUEL_TICK_MS);
	});
});
