import {z} from 'zod';


export const PointSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
});
export type Point = z.infer<typeof PointSchema>;


const WallPolygonSchema = z.array(PointSchema).min(3);
const WallsSchema = z.array(WallPolygonSchema).min(1);


const DecorationBaseSchema = z.object({
	x: z.number().finite(),
	y: z.number().finite(),
	r: z.number().finite(),
	s: z.number().positive(),
});

const StaticDecorationSchema = DecorationBaseSchema.extend({
	name: z.literal('static'),
	src: z.string().min(1),
});

const StopDecorationSchema = DecorationBaseSchema.extend({
	name: z.literal('stop'),
});

const GravityDecorationTypeSchema = z.enum(['up', 'down', 'left', 'right']);
const GravityDecorationSchema = DecorationBaseSchema.extend({
	name: z.literal('gravity'),
	type: GravityDecorationTypeSchema,
});

export const DecorationSchema = z.discriminatedUnion('name', [
	StaticDecorationSchema,
	StopDecorationSchema,
	GravityDecorationSchema,
]);
export type Decoration = z.infer<typeof DecorationSchema>;


const WormEnemySchema = z.object({
	name: z.literal('worm'),
	x: z.number().finite(),
	y: z.number().finite(),
	seed: z.string().min(1),
});

const StoneEnemySchema = z.object({
	name: z.literal('stone'),
	x: z.number().finite(),
	y: z.number().finite(),
	r: z.number().finite(),
	radius: z.number().positive(),
	speed: z.number().nonnegative(),
});

const MineEnemySchema = z.object({
	name: z.literal('mine'),
	x: z.number().finite(),
	y: z.number().finite(),
	r: z.number().finite(),
	radius: z.number().positive(),
	speed: z.number().nonnegative(),
});

export const EnemySchema = z.discriminatedUnion('name', [
	WormEnemySchema,
	StoneEnemySchema,
	MineEnemySchema,
]);
export type Enemy = z.infer<typeof EnemySchema>;


export const LevelSchema = z.object({
	name: z.string().min(1),
	res: z.object({
		x: z.number().int().positive(),
		y: z.number().int().positive(),
	}),
	startPoint: PointSchema,
	finishPoint: PointSchema,
	star1: PointSchema,
	star2: PointSchema,
	star3: PointSchema,
	gravity: z.object({
		x: z.number().finite(),
		y: z.number().finite(),
	}),
	referenceUrl: z.string().default(''),
	intro: z.string().min(1).optional(),
	outro: z.string().min(1).optional(),
	decorations: z.array(DecorationSchema).default([]),
	enemies: z.array(EnemySchema).default([]),
	walls: WallsSchema,
});
export type Level = z.infer<typeof LevelSchema>;


export const LevelListSchema = z.array(LevelSchema);


export function validateLevel(data: unknown): Level {
	return LevelSchema.parse(data);
}

export function safeValidateLevel(data: unknown) {
	return LevelSchema.safeParse(data);
}
