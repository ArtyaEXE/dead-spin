import {describe, expect, it} from 'vitest';
import {isThreadAllowed, parseCommandName} from '../lib/restrict-thread';


describe('parseCommandName', () => {
	it('strips slash and arguments', () => {
		expect(parseCommandName('/play')).toBe('play');
		expect(parseCommandName('/play arg1 arg2')).toBe('play');
	});
	it('strips @botname suffix', () => {
		expect(parseCommandName('/play@DeadSpinBot')).toBe('play');
		expect(parseCommandName('/setplay@DeadSpinBot arg')).toBe('setplay');
	});
	it('lowercases', () => {
		expect(parseCommandName('/SetPlay')).toBe('setplay');
	});
	it('returns empty for non-command text', () => {
		expect(parseCommandName('hello world')).toBe('');
		expect(parseCommandName('')).toBe('');
	});
});


describe('isThreadAllowed', () => {
	it('no configured thread → allow everywhere', () => {
		expect(isThreadAllowed({configuredThread: null, msgThread: null, command: 'play'})).toBe(true);
		expect(isThreadAllowed({configuredThread: null, msgThread: 7, command: 'play'})).toBe(true);
	});

	it('matching thread → allow', () => {
		expect(isThreadAllowed({configuredThread: 7, msgThread: 7, command: 'play'})).toBe(true);
	});

	it('different thread → deny', () => {
		expect(isThreadAllowed({configuredThread: 7, msgThread: 9, command: 'play'})).toBe(false);
	});

	it('General (msgThread=null) with configured topic → deny', () => {
		expect(isThreadAllowed({configuredThread: 7, msgThread: null, command: 'play'})).toBe(false);
	});

	it('/setplay always allowed — even in wrong topic or General', () => {
		expect(isThreadAllowed({configuredThread: 7, msgThread: 9, command: 'setplay'})).toBe(true);
		expect(isThreadAllowed({configuredThread: 7, msgThread: null, command: 'setplay'})).toBe(true);
	});

	it('/setplay allowed when no configuredThread (no-op but consistent)', () => {
		expect(isThreadAllowed({configuredThread: null, msgThread: 7, command: 'setplay'})).toBe(true);
	});

	it('restriction applies to all other commands uniformly', () => {
		for (const cmd of ['play', 'lb', 'me', 'best', 'challenge', 'feedback', 'help']) {
			expect(isThreadAllowed({configuredThread: 7, msgThread: 9, command: cmd})).toBe(false);
			expect(isThreadAllowed({configuredThread: 7, msgThread: 7, command: cmd})).toBe(true);
		}
	});
});
