import {z} from 'zod';


export const UserSchema = z.object({
	id: z.string(),
	tgId: z.string(),
	username: z.string(),
	locale: z.string(),
	fuel: z.number().int(),
	fuelUpdatedAt: z.string(),
	coins: z.number().int(),
	details: z.number().int(),
	createdAt: z.string(),
	updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;


export const LoginResponseSchema = z.object({
	token: z.string(),
	user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;


export const ProgressLevelSchema = z.object({
	userId: z.string(),
	level: z.number().int(),
	stars: z.number().int(),
	timeMs: z.number().int(),
	fuelSpent: z.number().int(),
	updatedAt: z.string(),
});
export type ProgressLevel = z.infer<typeof ProgressLevelSchema>;


export const ProgressResponseSchema = z.object({
	summaryStars: z.number().int(),
	levels: z.array(ProgressLevelSchema),
});
export type ProgressResponse = z.infer<typeof ProgressResponseSchema>;


export const LevelCompleteResponseSchema = z.object({
	ok: z.literal(true),
	newStars: z.number().int(),
});


export const FuelSpendResponseSchema = z.object({
	fuel: z.number().int(),
});


export const LeaderboardEntrySchema = z.object({
	userId: z.string(),
	username: z.string(),
	stars: z.number().int(),
	timeMs: z.number().int(),
	fuelSpent: z.number().int(),
	updatedAt: z.string(),
});

export const LeaderboardResponseSchema = z.object({
	level: z.number().int(),
	entries: z.array(LeaderboardEntrySchema),
	me: z.object({rank: z.number().int(), stars: z.number().int(), timeMs: z.number().int()}).nullable(),
});


export const MeResponseSchema = z.object({user: UserSchema});
