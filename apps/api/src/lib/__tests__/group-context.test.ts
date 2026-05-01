import {describe, expect, it} from 'vitest';
import {parseGroupStartParam, makeGroupStartParam, GROUP_HMAC_LEN} from '@dead-spin/shared';
import {signGroupContext, verifyGroupContext} from '@dead-spin/shared/group-hmac';


describe('group-context HMAC', () => {
	const SECRET = 'test-bot-token-1234567890';

	it('signGroupContext produces deterministic 12-hex digest', () => {
		const a = signGroupContext(-1001234567890, SECRET);
		const b = signGroupContext(-1001234567890, SECRET);
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]+$/);
		expect(a.length).toBe(GROUP_HMAC_LEN);
	});

	it('different chatId → different digest', () => {
		const a = signGroupContext(-100123, SECRET);
		const b = signGroupContext(-100124, SECRET);
		expect(a).not.toBe(b);
	});

	it('different secret → different digest (cannot forge without bot token)', () => {
		const a = signGroupContext(-100123, SECRET);
		const b = signGroupContext(-100123, 'other-secret');
		expect(a).not.toBe(b);
	});

	it('verify accepts genuine, rejects forged', () => {
		const chatId = -1001234567890;
		const hmac = signGroupContext(chatId, SECRET);
		expect(verifyGroupContext(chatId, hmac, SECRET)).toBe(true);
		expect(verifyGroupContext(chatId, hmac, 'other-secret')).toBe(false);
		expect(verifyGroupContext(chatId, '0'.repeat(GROUP_HMAC_LEN), SECRET)).toBe(false);
		expect(verifyGroupContext(chatId + 1, hmac, SECRET)).toBe(false);
	});

	it('verify rejects malformed HMAC', () => {
		expect(verifyGroupContext(-1, 'too-short', SECRET)).toBe(false);
		expect(verifyGroupContext(-1, '', SECRET)).toBe(false);
		expect(verifyGroupContext(-1, 'X'.repeat(GROUP_HMAC_LEN), SECRET)).toBe(false);
	});

	it('signGroupContext throws on empty secret', () => {
		expect(() => signGroupContext(-1, '')).toThrow();
	});
});


describe('parseGroupStartParam', () => {
	it('parses valid g_<chatId>_<hmac>', () => {
		const r = parseGroupStartParam('g_-1001234567890_abcdef012345');
		expect(r).toEqual({kind: 'group', chatId: -1001234567890, hmac: 'abcdef012345'});
	});

	it('parses positive chatId (private group?)', () => {
		const r = parseGroupStartParam('g_42_abcdef012345');
		expect(r?.chatId).toBe(42);
	});

	it('makeGroupStartParam round-trips through parse', () => {
		const sp = makeGroupStartParam(-1001234567890, 'abcdef012345');
		expect(parseGroupStartParam(sp)).toEqual({
			kind: 'group', chatId: -1001234567890, hmac: 'abcdef012345',
		});
	});

	it('rejects malformed inputs', () => {
		expect(parseGroupStartParam(null)).toBeNull();
		expect(parseGroupStartParam(undefined)).toBeNull();
		expect(parseGroupStartParam('')).toBeNull();
		expect(parseGroupStartParam('x_123_abc')).toBeNull();         // wrong prefix
		expect(parseGroupStartParam('g_abc_def012345678')).toBeNull(); // non-numeric chatId
		expect(parseGroupStartParam('g_-100_abc')).toBeNull();         // hmac too short
		expect(parseGroupStartParam('g_-100_abcdefghijkl')).toBeNull();// non-hex hmac
	});
});
