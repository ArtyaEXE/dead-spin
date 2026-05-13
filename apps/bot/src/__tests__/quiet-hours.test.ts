import {describe, expect, it} from 'vitest';
import {isQuietHourUTC, parseQuietHours} from '../lib/sweepers/quiet-hours';


function utc(h: number): Date {
	const d = new Date(Date.UTC(2026, 4, 13, h, 0, 0));
	return d;
}


describe('parseQuietHours', () => {
	it('parses simple ranges', () => {
		expect(parseQuietHours('22-7')).toEqual({start: 22, end: 7});
		expect(parseQuietHours('0-6')).toEqual({start: 0, end: 6});
	});
	it('rejects garbage', () => {
		expect(() => parseQuietHours('abc')).toThrow();
		expect(() => parseQuietHours('25-3')).toThrow();
	});
});


describe('isQuietHourUTC — окно через полночь (22-7)', () => {
	const spec = '22-7';
	it('quiet at 22:00', () => expect(isQuietHourUTC(utc(22), spec)).toBe(true));
	it('quiet at 03:00', () => expect(isQuietHourUTC(utc(3), spec)).toBe(true));
	it('quiet at 06:00', () => expect(isQuietHourUTC(utc(6), spec)).toBe(true));
	it('loud at 07:00', () => expect(isQuietHourUTC(utc(7), spec)).toBe(false));
	it('loud at 12:00', () => expect(isQuietHourUTC(utc(12), spec)).toBe(false));
	it('loud at 21:59-ish (boundary)', () => expect(isQuietHourUTC(utc(21), spec)).toBe(false));
});


describe('isQuietHourUTC — окно в одни сутки (1-5)', () => {
	const spec = '1-5';
	it('loud at 00:00', () => expect(isQuietHourUTC(utc(0), spec)).toBe(false));
	it('quiet at 01:00', () => expect(isQuietHourUTC(utc(1), spec)).toBe(true));
	it('quiet at 04:00', () => expect(isQuietHourUTC(utc(4), spec)).toBe(true));
	it('loud at 05:00', () => expect(isQuietHourUTC(utc(5), spec)).toBe(false));
});


describe('isQuietHourUTC — нулевое окно (5-5)', () => {
	it('always loud', () => {
		for (let h = 0; h < 24; h++) {
			expect(isQuietHourUTC(utc(h), '5-5')).toBe(false);
		}
	});
});
