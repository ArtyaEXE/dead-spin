import {z} from 'zod';


export const ShakeSchema = z.enum(['none', 'slow', 'medium', 'fast']);
export type Shake = z.infer<typeof ShakeSchema>;


export const SoundCueSchema = z.object({
	sound: z.string().min(1),
	volume: z.number().min(0).max(1).optional(),
	loop: z.boolean().optional(),
	delay: z.number().nonnegative().optional(),
});
export type SoundCue = z.infer<typeof SoundCueSchema>;


export const AnchorSchema = z.enum([
	'center', 'tl', 'tr', 'bl', 'br', 'top', 'bottom', 'left', 'right',
]);
export type Anchor = z.infer<typeof AnchorSchema>;


/**
 * Ken Burns: плавный pan + zoom по статичной картинке. `path` — массив
 * якорей (минимум 2), через которые "проезжает камера" равномерно по
 * времени; `scale` — постоянный зум (1.15 = +15%); `duration` — длительность
 * проезда (если не указана, берётся `panel.duration`).
 *
 * Например: `path: ["left", "right", "center"]` за 7000мс — первая половина
 * панорамируется слева направо, вторая возвращает камеру в центр.
 */
export const KenBurnsSchema = z.object({
	path: z.array(AnchorSchema).min(2),
	scale: z.number().min(1).max(2).default(1.15),
	duration: z.number().positive().optional(),
});
export type KenBurns = z.infer<typeof KenBurnsSchema>;


/**
 * Реплика поверх панели. `at` — через сколько мс после входа в панель
 * начать показ; `until` — когда скрыть (default: до конца панели).
 * `cps` — скорость "печати" (символов в секунду); при `typewriter:false`
 * текст появляется целиком.
 */
export const CaptionSchema = z.object({
	text: z.string().min(1),
	at: z.number().nonnegative().default(0),
	until: z.number().nonnegative().optional(),
	typewriter: z.boolean().default(true),
	cps: z.number().positive().default(40),
});
export type Caption = z.infer<typeof CaptionSchema>;


export const PanelSchema = z.object({
	img: z.string().min(1),
	duration: z.number().positive().default(7000),
	shake: ShakeSchema.default('none'),
	ken: KenBurnsSchema.optional(),
	enter: z.array(SoundCueSchema).default([]),
	caption: CaptionSchema.optional(),
});
export type Panel = z.infer<typeof PanelSchema>;


export const ComicSchema = z.object({
	id: z.string().min(1),
	letterbox: z.boolean().default(true),
	panels: z.array(PanelSchema).min(1),
});
export type Comic = z.infer<typeof ComicSchema>;


export function validateComic(data: unknown): Comic {
	return ComicSchema.parse(data);
}
