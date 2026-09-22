import {describe, expect, it} from 'vitest';
import {
	advanceStreak,
	challengeDate,
	dailyReward,
	EMPTY_ATTEMPT,
	mergeDailyAttempt,
	previousDate,
	type DailyAttempt,
} from '@dead-spin/shared';

describe('испытание дня', () => {
	it('дата по UTC: таблица имеет смысл только в общем окне', () => {
		expect(challengeDate(new Date('2026-10-07T23:59:00Z'))).toBe('2026-10-07');
		expect(challengeDate(new Date('2026-10-08T00:01:00Z'))).toBe('2026-10-08');
	});

	it('предыдущий день считается через границу месяца', () => {
		expect(previousDate('2026-10-01')).toBe('2026-09-30');
		expect(previousDate('2027-01-01')).toBe('2026-12-31');
	});

	it('лучшее время липкое: провал после победы не стирает рекорд', () => {
		const win = mergeDailyAttempt(EMPTY_ATTEMPT, {win: true, timeMs: 42_000, stars: 2});
		const after = mergeDailyAttempt(win, {win: false, timeMs: 5_000, stars: 0});
		expect(after.bestTimeMs).toBe(42_000);
		expect(after.bestStars).toBe(2);
	});

	it('оставляет лучшее из двух побед', () => {
		const a = mergeDailyAttempt(EMPTY_ATTEMPT, {win: true, timeMs: 42_000, stars: 1});
		const b = mergeDailyAttempt(a, {win: true, timeMs: 31_000, stars: 3});
		expect(b.bestTimeMs).toBe(31_000);
		expect(b.bestStars).toBe(3);
	});

	it('награда выдаётся один раз: испытание не ферма монет', () => {
		const first = dailyReward(EMPTY_ATTEMPT, {win: true, timeMs: 20_000, stars: 1});
		expect(first).toBe(50);
		const cleared: DailyAttempt = {bestTimeMs: 20_000, bestStars: 1, attempts: 1};
		expect(dailyReward(cleared, {win: true, timeMs: 18_000, stars: 1})).toBe(0);
	});

	it('за три звезды доплачивает, даже если выбиты не с первого раза', () => {
		const cleared: DailyAttempt = {bestTimeMs: 20_000, bestStars: 1, attempts: 1};
		expect(dailyReward(cleared, {win: true, timeMs: 18_000, stars: 3})).toBe(50);
		const already: DailyAttempt = {bestTimeMs: 18_000, bestStars: 3, attempts: 2};
		expect(dailyReward(already, {win: true, timeMs: 17_000, stars: 3})).toBe(0);
	});

	it('за проигрыш не платит', () => {
		expect(dailyReward(EMPTY_ATTEMPT, {win: false, timeMs: 3_000, stars: 0})).toBe(0);
	});

	it('серия растёт по соседним дням и рвётся на пропуске', () => {
		let s = {streakDays: 0, longestStreak: 0, lastClearedDate: null as string | null};
		s = advanceStreak(s, '2026-10-05', true);
		s = advanceStreak(s, '2026-10-06', true);
		expect(s.streakDays).toBe(2);
		s = advanceStreak(s, '2026-10-08', true);
		expect(s.streakDays).toBe(1);
		expect(s.longestStreak).toBe(2);
	});

	it('повторная победа в тот же день не накручивает серию', () => {
		let s = {streakDays: 0, longestStreak: 0, lastClearedDate: null as string | null};
		s = advanceStreak(s, '2026-10-07', true);
		s = advanceStreak(s, '2026-10-07', true);
		expect(s.streakDays).toBe(1);
	});

	it('проигрыш серию не трогает', () => {
		const before = {streakDays: 3, longestStreak: 5, lastClearedDate: '2026-10-06'};
		expect(advanceStreak(before, '2026-10-07', false)).toEqual(before);
	});
});
