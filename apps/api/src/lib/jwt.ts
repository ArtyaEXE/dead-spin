import {sign, verify} from 'hono/jwt';
import {env} from '../config';
import {DAY} from '@dead-spin/shared';


export type JWTPayload = {
	sub: string;       // users.id
	tgId: string;
	exp: number;
};


const ALG = 'HS256' as const;


export async function signUserToken(userId: string, tgId: string): Promise<string> {
	const payload: JWTPayload = {
		sub: userId,
		tgId,
		exp: Math.floor((Date.now() + 7 * DAY) / 1000),
	};
	return sign(payload, env.JWT_SECRET, ALG);
}


export async function verifyUserToken(token: string): Promise<JWTPayload | null> {
	try {
		const payload = await verify(token, env.JWT_SECRET, ALG);
		if (
			typeof payload === 'object' &&
			payload !== null &&
			typeof (payload as JWTPayload).sub === 'string' &&
			typeof (payload as JWTPayload).tgId === 'string'
		) {
			return payload as unknown as JWTPayload;
		}
		return null;
	} catch {
		return null;
	}
}
