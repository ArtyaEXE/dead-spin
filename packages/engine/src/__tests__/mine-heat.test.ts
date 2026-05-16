import {describe, expect, it} from 'vitest';
import {
	updateHeat,
	heatToTint,
	DEFAULT_HEAT_PARAMS,
	type MineHeatState,
} from '../mine-heat';


function fresh(): MineHeatState {
	return {heat: 0, lastInRangeAtMs: null};
}


describe('updateHeat — нагрев в радиусе', () => {
	it('линейный рост с заданной скоростью', () => {
		let s = fresh();
		// armTime=2.5s → 0.5s в радиусе должно дать heat=0.2
		s = updateHeat(s, 0.5, true, 1000);
		expect(s.heat).toBeCloseTo(0.2, 5);
		expect(s.lastInRangeAtMs).toBe(1000);
	});

	it('доходит до 1.0 за armTime', () => {
		let s = fresh();
		s = updateHeat(s, DEFAULT_HEAT_PARAMS.armTime, true, 0);
		expect(s.heat).toBe(1);
	});

	it('не превышает 1.0 даже при длинном dt', () => {
		let s = fresh();
		s = updateHeat(s, 10, true, 0);
		expect(s.heat).toBe(1);
	});

	it('накапливается через несколько вызовов', () => {
		let s = fresh();
		s = updateHeat(s, 0.5, true, 0);
		s = updateHeat(s, 0.5, true, 500);
		s = updateHeat(s, 0.5, true, 1000);
		// 3 × 0.5s / 2.5s armTime = 0.6
		expect(s.heat).toBeCloseTo(0.6, 5);
	});
});


describe('updateHeat — поведение вне радиуса', () => {
	it('не остывает до конца coolDelay', () => {
		// Прогрели наполовину (1.25s × armTime=2.5s = 0.5)
		let s = updateHeat(fresh(), 1.25, true, 0);
		expect(s.heat).toBeCloseTo(0.5, 5);

		// Через 200мс после выхода (coolDelay=500ms) — heat не изменился
		s = updateHeat(s, 0.2, false, 200);
		expect(s.heat).toBeCloseTo(0.5, 5);

		// Через 400мс — всё ещё пауза
		s = updateHeat(s, 0.2, false, 400);
		expect(s.heat).toBeCloseTo(0.5, 5);
	});

	it('после coolDelay начинает падать', () => {
		let s = updateHeat(fresh(), 1.25, true, 0);
		// 600мс с момента выхода = 100мс после конца coolDelay
		// dt=0.1s, coolTime=3s → −0.0333
		s = updateHeat(s, 0.1, false, 600);
		expect(s.heat).toBeCloseTo(0.5 - 0.1 / 3, 5);
	});

	it('сбрасывает lastInRangeAtMs при достижении 0', () => {
		let s = updateHeat(fresh(), 1.25, true, 0); // heat≈0.5
		// Пропускаем coolDelay сразу dt=10s — heat должен упасть до 0
		s = updateHeat(s, 10, false, 10_000);
		expect(s.heat).toBe(0);
		expect(s.lastInRangeAtMs).toBeNull();
	});

	it('NO-op если ни разу не был в радиусе', () => {
		const s = updateHeat(fresh(), 1, false, 500);
		expect(s.heat).toBe(0);
		expect(s.lastInRangeAtMs).toBeNull();
	});
});


describe('updateHeat — переходы in/out', () => {
	it('возврат в радиус снова греет, не сбрасывая heat', () => {
		let s = updateHeat(fresh(), 1.25, true, 0);     // ≈0.5
		s = updateHeat(s, 1.0, false, 1000);             // ушёл; после coolDelay вычтется (1.0-0.5)/3
		const heatAfterCool = s.heat;
		expect(heatAfterCool).toBeLessThan(0.5);

		s = updateHeat(s, 0.5, true, 1500);              // вернулся, +0.2
		expect(s.heat).toBeCloseTo(heatAfterCool + 0.2, 5);
		expect(s.lastInRangeAtMs).toBe(1500);
	});
});


describe('heatToTint', () => {
	it('heat=0 — чистый белый (нейтральный tint)', () => {
		const c = heatToTint(0);
		expect((c >> 16) & 0xff).toBe(255);
		expect((c >> 8) & 0xff).toBe(255);
		expect(c & 0xff).toBe(255);
	});

	it('heat=1 — красный', () => {
		const c = heatToTint(1);
		expect((c >> 16) & 0xff).toBe(255);
		expect((c >> 8) & 0xff).toBe(64);
		expect(c & 0xff).toBe(64);
	});

	it('heat=0.5 — розово-оранжевый посередине', () => {
		const c = heatToTint(0.5);
		expect((c >> 16) & 0xff).toBe(255);
		// (255+64)/2 ≈ 159 или 160 после округления
		const g = (c >> 8) & 0xff;
		expect(g).toBeGreaterThanOrEqual(158);
		expect(g).toBeLessThanOrEqual(160);
	});

	it('clamps outside [0..1]', () => {
		expect(heatToTint(-1)).toBe(heatToTint(0));
		expect(heatToTint(2)).toBe(heatToTint(1));
	});
});


describe('DEFAULT_HEAT_PARAMS', () => {
	it('exports concrete numbers', () => {
		expect(DEFAULT_HEAT_PARAMS.armTime).toBeGreaterThan(0);
		expect(DEFAULT_HEAT_PARAMS.coolDelay).toBeGreaterThan(0);
		expect(DEFAULT_HEAT_PARAMS.coolTime).toBeGreaterThan(0);
		// Sanity: остывание медленнее нагрева → возвращаться рискованно.
		expect(DEFAULT_HEAT_PARAMS.coolTime).toBeGreaterThan(DEFAULT_HEAT_PARAMS.armTime);
	});
});
