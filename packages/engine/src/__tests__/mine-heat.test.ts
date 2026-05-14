import {describe, expect, it} from 'vitest';
import {
	updateHeat,
	heatToColor,
	DEFAULT_HEAT_PARAMS,
	type MineHeatState,
} from '../mine-heat';


function fresh(): MineHeatState {
	return {heat: 0, lastInRangeAtMs: null};
}


describe('updateHeat — нагрев в радиусе', () => {
	it('линейный рост с заданной скоростью', () => {
		let s = fresh();
		// armTime=2s → 0.5s в радиусе должно дать heat=0.25
		s = updateHeat(s, 0.5, true, 1000);
		expect(s.heat).toBeCloseTo(0.25, 5);
		expect(s.lastInRangeAtMs).toBe(1000);
	});

	it('доходит до 1.0 за armTime', () => {
		let s = fresh();
		s = updateHeat(s, 2.0, true, 0);
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
		expect(s.heat).toBeCloseTo(0.75, 5);
	});
});


describe('updateHeat — поведение вне радиуса', () => {
	it('не остывает до конца coolDelay', () => {
		// Прогрели до 0.5
		let s = updateHeat(fresh(), 1.0, true, 0);
		expect(s.heat).toBe(0.5);

		// Через 200мс после выхода (coolDelay=500ms) — heat не изменился
		s = updateHeat(s, 0.2, false, 200);
		expect(s.heat).toBe(0.5);

		// Через 400мс — всё ещё пауза
		s = updateHeat(s, 0.2, false, 400);
		expect(s.heat).toBe(0.5);
	});

	it('после coolDelay начинает падать', () => {
		let s = updateHeat(fresh(), 1.0, true, 0);
		// 600мс с момента выхода = 100мс после конца coolDelay
		// dt=0.1s, coolTime=3s → −0.0333
		s = updateHeat(s, 0.1, false, 600);
		expect(s.heat).toBeCloseTo(0.5 - 0.1 / 3, 5);
	});

	it('сбрасывает lastInRangeAtMs при достижении 0', () => {
		let s = updateHeat(fresh(), 1.0, true, 0);   // heat=0.5
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
		let s = updateHeat(fresh(), 1.0, true, 0);     // 0.5
		s = updateHeat(s, 1.0, false, 1000);            // ушёл, после coolDelay − 0.5/3
		const heatAfterCool = s.heat;
		expect(heatAfterCool).toBeLessThan(0.5);

		s = updateHeat(s, 0.5, true, 1500);             // вернулся, +0.25
		expect(s.heat).toBeCloseTo(heatAfterCool + 0.25, 5);
		expect(s.lastInRangeAtMs).toBe(1500);
	});
});


describe('heatToColor', () => {
	it('heat=0 — зелёный', () => {
		const c = heatToColor(0);
		// (0,255,80)
		expect((c >> 16) & 0xff).toBe(0);
		expect((c >> 8) & 0xff).toBe(255);
		expect(c & 0xff).toBe(80);
	});

	it('heat=0.5 — жёлтый', () => {
		const c = heatToColor(0.5);
		// (255,220,40)
		expect((c >> 16) & 0xff).toBe(255);
		expect((c >> 8) & 0xff).toBe(220);
		expect(c & 0xff).toBe(40);
	});

	it('heat=1.0 — красный', () => {
		const c = heatToColor(1);
		// (255,50,40)
		expect((c >> 16) & 0xff).toBe(255);
		expect((c >> 8) & 0xff).toBe(50);
		expect(c & 0xff).toBe(40);
	});

	it('clamps outside [0..1]', () => {
		expect(heatToColor(-1)).toBe(heatToColor(0));
		expect(heatToColor(2)).toBe(heatToColor(1));
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
