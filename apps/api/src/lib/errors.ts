import type {Context} from 'hono';

export class ApiError extends Error {
	constructor(
		public status: number,
		public code: string,
		message?: string,
	) {
		super(message ?? code);
		this.name = 'ApiError';
	}
}

export const badRequest = (code: string, msg?: string) => new ApiError(400, code, msg);
export const unauthorized = (code = 'unauthorized') => new ApiError(401, code);
export const forbidden = (code = 'forbidden') => new ApiError(403, code);
export const notFound = (code = 'notFound') => new ApiError(404, code);

export function formatError(c: Context, err: unknown): Response {
	if (err instanceof ApiError) {
		return c.json({error: err.code, message: err.message}, err.status as 400 | 401 | 403 | 404);
	}
	console.error('Unhandled error:', err);
	return c.json({error: 'internal'}, 500);
}
