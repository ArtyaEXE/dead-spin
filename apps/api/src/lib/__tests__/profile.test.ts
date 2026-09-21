import {describe, it, expect} from 'vitest';
import {
	defaultProfile,
	dailyState,
	claimDaily,
	evaluateAchievements,
	mergeProfiles,
	ProfileSchema,
	ALL_SKINS_STARS,
	LEVEL_COUNT,
} from '@dead-spin/shared';

describe('дейлик', () => {
	it('первый клейм — день 1, 20 монет', () => {
		const r = claimDaily(defaultProfile(), '2026-09-21');
		expect(r.claimed).toBe(true);
		expect(r.reward).toBe(20);
		expect(r.streakDays).toBe(1);
		expect(r.profile.coins).toBe(20);
		expect(r.profile.daily.lastClaimDate).toBe('2026-09-21');
	});

	it('повторный клейм в тот же день невозможен', () => {
		const p = claimDaily(defaultProfile(), '2026-09-21').profile;
		expect(dailyState(p, '2026-09-21').canClaim).toBe(false);
		expect(claimDaily(p, '2026-09-21').claimed).toBe(false);
		expect(p.coins).toBe(20);
	});

	it('на следующий день стрик растёт, через день — сбрасывается', () => {
		let p = claimDaily(defaultProfile(), '2026-09-21').profile;
		p = claimDaily(p, '2026-09-22').profile;
		expect(p.daily.streakDays).toBe(2);
		expect(p.coins).toBe(50);
		const skipped = claimDaily(p, '2026-09-24');
		expect(skipped.streakDays).toBe(1);
		expect(skipped.reward).toBe(20);
	});

	it('состояние до клейма показывает тот же стрик, что получится после', () => {
		const p = claimDaily(defaultProfile(), '2026-09-21').profile;
		const s = dailyState(p, '2026-09-22');
		expect(s.canClaim).toBe(true);
		expect(s.streakDays + 1).toBe(claimDaily(p, '2026-09-22').streakDays);
	});

	it('перевод часов назад не даёт второй клейм', () => {
		const p = claimDaily(defaultProfile(), '2026-09-22').profile;
		expect(dailyState(p, '2026-09-21').canClaim).toBe(false);
		expect(claimDaily(p, '2026-09-21').claimed).toBe(false);
	});

	it('седьмой день и дальше — по 100', () => {
		let p = defaultProfile();
		for (let d = 1; d <= 8; d++) p = claimDaily(p, `2026-09-${String(d).padStart(2, '0')}`).profile;
		expect(p.daily.streakDays).toBe(8);
		expect(p.coins).toBe(20 + 30 + 40 + 50 + 60 + 80 + 100 + 100);
	});
});

describe('ачивки', () => {
	const run = (stars: number, timeMs: number, fuelSpent: number) => ({stars, timeMs, fuelSpent});

	it('первая победа даёт first_clear и ничего лишнего', () => {
		const r = evaluateAchievements(defaultProfile(), {1: run(1, 20_000, 2_000)}, run(1, 20_000, 2_000), 't');
		expect(r.unlocked).toEqual(['first_clear']);
	});

	it('быстрый и экономный заход даёт speedrunner и fuel_efficient', () => {
		const r = evaluateAchievements(defaultProfile(), {1: run(3, 9_000, 300)}, run(3, 9_000, 300), 't');
		expect(r.unlocked).toEqual(
			expect.arrayContaining(['first_clear', 'first_3stars', 'speedrunner', 'fuel_efficient']),
		);
	});

	it('выданное не выдаётся повторно', () => {
		const first = evaluateAchievements(defaultProfile(), {1: run(1, 20_000, 2_000)}, run(1, 20_000, 2_000), 't1');
		const second = evaluateAchievements(first.profile, {1: run(1, 20_000, 2_000)}, run(1, 20_000, 2_000), 't2');
		expect(second.unlocked).toEqual([]);
		expect(second.profile.achievements['first_clear']).toBe('t1');
	});

	it('all_levels / all_3stars / all_skins по агрегатам', () => {
		const levels: Record<number, ReturnType<typeof run>> = {};
		for (let i = 1; i <= LEVEL_COUNT; i++) levels[i] = run(3, 30_000, 3_000);
		const r = evaluateAchievements(defaultProfile(), levels, run(3, 30_000, 3_000), 't');
		expect(r.unlocked).toEqual(expect.arrayContaining(['all_levels', 'all_3stars', 'all_skins']));
		expect(LEVEL_COUNT * 3).toBeGreaterThanOrEqual(ALL_SKINS_STARS);
	});
});

describe('слияние профилей', () => {
	it('монеты — максимум, ачивки и туториалы — объединение, скин — локальный', () => {
		const local = {
			...defaultProfile(),
			coins: 50,
			selectedSkin: 'wanderer' as const,
			seenTutorials: ['controls' as const],
			achievements: {first_clear: 'b'},
		};
		const remote = {
			...defaultProfile(),
			coins: 120,
			selectedSkin: 'engineer' as const,
			seenTutorials: ['mine' as const],
			achievements: {first_clear: 'a', speedrunner: 'c'},
		};
		const m = mergeProfiles(local, remote);
		expect(m.coins).toBe(120);
		expect(m.selectedSkin).toBe('wanderer');
		expect(m.seenTutorials).toEqual(['controls', 'mine']);
		expect(m.achievements).toEqual({first_clear: 'a', speedrunner: 'c'});
	});

	it('дейлик берётся у того, чей клейм позже', () => {
		const local = claimDaily(defaultProfile(), '2026-09-20').profile;
		const remote = claimDaily(claimDaily(defaultProfile(), '2026-09-20').profile, '2026-09-21').profile;
		expect(mergeProfiles(local, remote).daily.streakDays).toBe(2);
		expect(mergeProfiles(remote, local).daily.streakDays).toBe(2);
	});

	it('снимок проходит собственную схему', () => {
		expect(ProfileSchema.safeParse(defaultProfile()).success).toBe(true);
	});
});
