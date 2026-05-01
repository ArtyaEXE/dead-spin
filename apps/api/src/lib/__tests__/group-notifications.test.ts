import {describe, expect, it} from 'vitest';
import {buildNotificationHtml, type GroupDiff} from '../group-notifications';


function diff(over: Partial<GroupDiff>): GroupDiff {
	return {
		isFirstClear: false,
		starsImproved: false,
		timeImproved: false,
		newStars: 3,
		newTimeMs: 12_345,
		oldLeader: null,
		newLeader: {userId: 'u1', username: 'Alice'},
		leaderChanged: false,
		...over,
	};
}


describe('buildNotificationHtml', () => {
	it('first clear with stars + first leader → two-line cinematic', () => {
		const html = buildNotificationHtml({
			level: 2, username: 'David', locale: 'ru',
			diff: diff({
				isFirstClear: true, starsImproved: true,
				newStars: 3, oldLeader: null,
				newLeader: {userId: 'u1', username: 'David'},
				leaderChanged: true,
			}),
		});
		expect(html).toContain('David');
		expect(html).toContain('уровень 2');
		expect(html).toContain('3⭐');
		expect(html).toContain('первый лидер');
	});

	it('star improvement, no leader change → only first line', () => {
		const html = buildNotificationHtml({
			level: 2, username: 'David', locale: 'ru',
			diff: diff({starsImproved: true, newStars: 3, leaderChanged: false}),
		});
		expect(html).toContain('David');
		expect(html).toContain('3⭐');
		expect(html).not.toContain('лидер');
	});

	it('leader takeover names the dethroned user', () => {
		const html = buildNotificationHtml({
			level: 5, username: 'David', locale: 'ru',
			diff: diff({
				starsImproved: true, newStars: 3,
				oldLeader: {userId: 'u2', username: 'PrevKing'},
				newLeader: {userId: 'u1', username: 'David'},
				leaderChanged: true,
			}),
		});
		expect(html).toContain('David');
		expect(html).toContain('PrevKing');
		expect(html).toContain('уровень 5');
	});

	it('only time improved without stars change → personal best line', () => {
		const html = buildNotificationHtml({
			level: 1, username: 'David', locale: 'ru',
			diff: diff({timeImproved: true, newStars: 2, newTimeMs: 65_432}),
		});
		expect(html).toContain('личный рекорд');
		expect(html).toMatch(/1:05\.43/);
	});

	it('no improvement → empty string', () => {
		const html = buildNotificationHtml({
			level: 1, username: 'David', locale: 'ru', diff: diff({}),
		});
		expect(html).toBe('');
	});

	it('escapes HTML in usernames', () => {
		const html = buildNotificationHtml({
			level: 1, username: '<script>alert(1)</script>', locale: 'en',
			diff: diff({starsImproved: true, newStars: 3}),
		});
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('en locale produces English text', () => {
		const html = buildNotificationHtml({
			level: 2, username: 'David', locale: 'en',
			diff: diff({isFirstClear: true, starsImproved: true, newStars: 3}),
		});
		expect(html).toContain('cleared level 2');
		expect(html).toContain('with 3⭐');
	});
});
