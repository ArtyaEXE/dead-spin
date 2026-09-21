import {z} from 'zod';


export const UserSchema = z.object({
	id: z.string(),
	deviceId: z.string(),
	username: z.string(),
	locale: z.string(),
	fuel: z.number().int(),
	fuelUpdatedAt: z.string(),
	coins: z.number().int(),
	details: z.number().int(),
	selectedSkin: z.string().default('prospector'),
	seenTutorials: z.array(z.string()).default([]),
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


export const SimpleOkSchema = z.object({ok: z.literal(true)});


/** POST /me/skin — возвращает обновлённого юзера. */
export const SetSkinResponseSchema = z.object({user: UserSchema});
export type SetSkinResponse = z.infer<typeof SetSkinResponseSchema>;


export const DailyRewardSchema = z.object({fuel: z.number().int(), coins: z.number().int()});


export const DailyStateResponseSchema = z.object({
	canClaim: z.boolean(),
	streakDays: z.number().int(),
	nextReward: DailyRewardSchema,
});
export type DailyStateResponse = z.infer<typeof DailyStateResponseSchema>;


export const DailyClaimResponseSchema = z.object({
	claimed: z.boolean(),
	streakDays: z.number().int(),
	reward: DailyRewardSchema.optional(),
	nextReward: DailyRewardSchema,
	user: UserSchema,
});
export type DailyClaimResponse = z.infer<typeof DailyClaimResponseSchema>;


export const AchievementSchema = z.object({
	key: z.string(),
	emoji: z.string(),
	icon: z.string().optional(),
	ru: z.string(),
	en: z.string(),
	unlocked: z.boolean(),
	unlockedAt: z.string().nullable(),
});
export const AchievementsResponseSchema = z.object({
	achievements: z.array(AchievementSchema),
});


export const SpendCoinsResponseSchema = z.object({
	ok: z.literal(true),
	coins: z.number().int(),
});
export type Achievement = z.infer<typeof AchievementSchema>;
export type AchievementsResponse = z.infer<typeof AchievementsResponseSchema>;


/** GET /leaderboard/:level/ghost — запись прохождения глобального лидера. */
export const GhostResponseSchema = z.object({
	level: z.number().int(),
	userId: z.string(),
	username: z.string(),
	stars: z.number().int(),
	timeMs: z.number().int(),
	recording: z.object({
		level: z.number().int(),
		gravity: z.object({x: z.number(), y: z.number()}),
		events: z.array(z.object({
			type: z.enum(['start', 'boost', 'loose', 'win']),
			time: z.number(),
			x: z.number(), y: z.number(), r: z.number(),
			vx: z.number(), vy: z.number(), vr: z.number(),
		})),
	}),
	recordedAt: z.string(),
});
export type GhostResponse = z.infer<typeof GhostResponseSchema>;
