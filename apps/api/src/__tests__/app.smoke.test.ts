import {describe, expect, it} from 'vitest';
import {createApp} from '../index';


describe('Hono app smoke', () => {
	it('GET /healthz returns ok', async () => {
		const app = createApp();
		const res = await app.request('/healthz');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toMatchObject({ok: true});
	});

	it('unknown route returns 404 with json error', async () => {
		const app = createApp();
		const res = await app.request('/no-such-route');
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body).toEqual({error: 'notFound'});
	});

	it('GET /me without auth header returns 401', async () => {
		const app = createApp();
		const res = await app.request('/me');
		expect(res.status).toBe(401);
		const body = await res.json() as {error: string};
		expect(body.error).toBe('missingToken');
	});
});
