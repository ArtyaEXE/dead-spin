import {describe, expect, it} from 'vitest';
import {createLoop} from '../loop';

// Ref-объект обходит narrowing TS в callbacks-замыканиях.
type PendingRef = {cb: (() => void) | null};

describe('createLoop (fixed timestep)', () => {
	it('calls update exactly once per fixedDt of elapsed time', () => {
		let currentTime = 0;
		const updates: number[] = [];
		const renders: number[] = [];
		const pending: PendingRef = {cb: null};

		const loop = createLoop(
			(dt) => updates.push(dt),
			(alpha) => renders.push(alpha),
			{
				fixedDt: 1 / 60,
				now: () => currentTime,
				scheduler: (cb) => {
					pending.cb = cb;
					return 1;
				},
				cancel: () => {
					pending.cb = null;
				},
			},
		);

		loop.start();
		currentTime += 3 * (1 / 60);
		pending.cb?.();

		expect(updates).toHaveLength(3);
		for (const dt of updates) expect(dt).toBeCloseTo(1 / 60, 10);
		expect(renders).toHaveLength(1);
	});

	it('clamps frame time to maxFrameTime (avoids spiral of death)', () => {
		let currentTime = 0;
		let updateCount = 0;
		const pending: PendingRef = {cb: null};

		const loop = createLoop(
			() => {
				updateCount++;
			},
			() => {},
			{
				fixedDt: 1 / 60,
				maxFrameTime: 0.25,
				now: () => currentTime,
				scheduler: (cb) => {
					pending.cb = cb;
					return 1;
				},
				cancel: () => {
					pending.cb = null;
				},
			},
		);

		loop.start();
		currentTime += 10;
		pending.cb?.();

		expect(updateCount).toBeLessThanOrEqual(Math.ceil(0.25 / (1 / 60)) + 1);
	});

	it('stop() prevents further frames', () => {
		let currentTime = 0;
		let updates = 0;
		const pending: PendingRef = {cb: null};

		const loop = createLoop(
			() => {
				updates++;
			},
			() => {},
			{
				fixedDt: 1 / 60,
				now: () => currentTime,
				scheduler: (cb) => {
					pending.cb = cb;
					return 1;
				},
				cancel: () => {
					pending.cb = null;
				},
			},
		);

		loop.start();
		loop.stop();
		currentTime += 1;
		pending.cb?.();

		expect(updates).toBe(0);
		expect(loop.isRunning()).toBe(false);
	});
});
