import {describe, expect, it} from 'vitest';
import {
	escapeHtml,
	fmtNum,
	fmtTime,
	progressBar,
	rankEmoji,
	starsEmoji,
	statsCard,
} from '../lib/format';


describe('format helpers', () => {
	it('escapeHtml neutralizes tags', () => {
		expect(escapeHtml('<script>&alert</script>')).toBe('&lt;script&gt;&amp;alert&lt;/script&gt;');
	});

	it('fmtNum inserts thousand separators', () => {
		expect(fmtNum(0)).toBe('0');
		expect(fmtNum(1500)).toBe('1 500');
		expect(fmtNum(30_000)).toBe('30 000');
	});

	it('fmtTime formats ms as M:SS.d', () => {
		expect(fmtTime(9000)).toBe('0:09.0');
		expect(fmtTime(11_234)).toBe('0:11.2');
		expect(fmtTime(72_500)).toBe('1:12.5');
	});

	it('progressBar returns fixed-length bar', () => {
		const bar = progressBar(5000, 10_000, 10);
		expect(bar).toHaveLength(10);
		expect(bar).toMatch(/^[█░]+$/);
	});

	it('progressBar clamps out-of-range values', () => {
		expect(progressBar(-100, 10, 4)).toMatch(/^░{4}$/);
		expect(progressBar(50, 10, 4)).toMatch(/^█{4}$/);
	});

	it('rankEmoji uses medals for top 3', () => {
		expect(rankEmoji(1)).toBe('🥇');
		expect(rankEmoji(2)).toBe('🥈');
		expect(rankEmoji(3)).toBe('🥉');
		expect(rankEmoji(4)).toContain('4');
	});

	it('starsEmoji pads with dots', () => {
		expect(starsEmoji(0)).toBe('···');
		expect(starsEmoji(2)).toBe('⭐⭐·');
		expect(starsEmoji(3)).toBe('⭐⭐⭐');
	});

	it('statsCard has expected labels and numbers', () => {
		const card = statsCard({
			fuel: 11_500, summaryStars: 12, coins: 500, levelsCleared: 5,
			labels: {fuel: '⛽ Топливо', stars: '⭐ Звёзды', coins: '💰 Монеты', levels: '🏁 Уровни'},
		});
		expect(card).toContain('⛽');
		expect(card).toContain('Топливо');
		expect(card).toContain('11 500');
		expect(card).toContain('30 000');
		expect(card).toContain('5 / 15');
	});
});
