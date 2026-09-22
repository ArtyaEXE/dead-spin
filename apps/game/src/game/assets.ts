import {Assets, type Texture} from 'pixi.js';
import {getSkinById, type SkinId} from '../stores/skin';

/**
 * Текстуры игрового поля — предзагружаем один раз до монтирования сцены.
 * Имена совпадают с путями в public/.
 *
 * Все игровые ассеты — вектор. Pixi растеризует SVG один раз при загрузке
 * (loadSVG → canvas → ImageSource), и `resolution` задаёт, во сколько раз
 * плотнее холст относительно логического размера текстуры. Берём реальный
 * DPR устройства с потолком 3: выше разницы уже не видно, а память текстур
 * растёт квадратично. На 1x это ровно тот же вес, что был бы у PNG, на 3x —
 * резкая картинка, которой у растра не было вообще.
 */

const SVG_RESOLUTION = Math.min(Math.max(globalThis.devicePixelRatio || 1, 1), 3);

/** Загрузка вектора с растеризацией под DPR. Кэш Pixi ключуется по src. */
export function loadSvgTexture(src: string): Promise<Texture> {
	return Assets.load<Texture>({src, data: {resolution: SVG_RESOLUTION}});
}
export type GameTextures = {
	ceresOuter: Texture;
	ceresInner: Texture;
	pallasOuter: Texture;
	pallasInner: Texture;
	junoOuter: Texture;
	junoInner: Texture;
	vestaOuter: Texture;
	vestaInner: Texture;
	eunomiaOuter: Texture;
	eunomiaInner: Texture;
	finish: Texture;
	start: Texture;
	ship: Texture;
	booster: Texture;
	star: Texture;
	stone: Texture;
	mine: Texture;
	worm1: Texture; // голова
	worm2: Texture; // тело
	worm3: Texture; // хвост
	light: Texture;
	explosion: Texture[]; // 13 кадров 1..13
};

const SIMPLE_PATHS = {
	ceresOuter: '/cave/ceres-outer.svg',
	ceresInner: '/cave/ceres-inner.svg',
	pallasOuter: '/cave/pallas-outer.svg',
	pallasInner: '/cave/pallas-inner.svg',
	junoOuter: '/cave/juno-outer.svg',
	junoInner: '/cave/juno-inner.svg',
	vestaOuter: '/cave/vesta-outer.svg',
	vestaInner: '/cave/vesta-inner.svg',
	eunomiaOuter: '/cave/eunomia-outer.svg',
	eunomiaInner: '/cave/eunomia-inner.svg',
	finish: '/finish.svg',
	start: '/start.svg',
	ship: '/ship2.svg',
	booster: '/booster-single.svg',
	star: '/star.svg',
	stone: '/enemies/stone/stone.svg',
	mine: '/enemies/mine/mine.svg',
	worm1: '/enemies/worm/s1.svg',
	worm2: '/enemies/worm/s2.svg',
	worm3: '/enemies/worm/s3.svg',
	light: '/dust.svg',
} as const;

const EXPLOSION_FRAMES = Array.from({length: 13}, (_, i) => `/effects/explosion/${i + 1}.svg`);

let cached: Promise<GameTextures> | null = null;

/**
 * Грузит текстуру корабля для выбранного скина. Если ассета нет — возвращает
 * дефолтный prospector (ship2.svg). Используется в GameWorld.mount чтобы
 * подменить ship после loadGameTextures.
 */
export async function loadShipTexture(skinId: SkinId): Promise<Texture> {
	const skin = getSkinById(skinId);
	try {
		return await loadSvgTexture(skin.src);
	} catch {
		return loadSvgTexture('/ship2.svg');
	}
}

/**
 * Cave-текстуры по миру. 15 уровней на мир, 5 миров.
 * Каждый мир — своя пара (outer wall + inner parallax).
 */
export function caveTexturesForLevel(levelNumber: number, t: GameTextures): {outer: Texture; inner: Texture} {
	const worldIdx = Math.floor((levelNumber - 1) / 15);
	switch (worldIdx) {
		case 1:
			return {outer: t.pallasOuter, inner: t.pallasInner};
		case 2:
			return {outer: t.junoOuter, inner: t.junoInner};
		case 3:
			return {outer: t.vestaOuter, inner: t.vestaInner};
		case 4:
			return {outer: t.eunomiaOuter, inner: t.eunomiaInner};
		default:
			return {outer: t.ceresOuter, inner: t.ceresInner};
	}
}

export function loadGameTextures(): Promise<GameTextures> {
	if (cached) return cached;
	cached = (async () => {
		const simpleEntries = Object.entries(SIMPLE_PATHS) as [keyof typeof SIMPLE_PATHS, string][];
		const simpleLoaded = await Promise.all(
			simpleEntries.map(async ([key, path]) => {
				const tex = await loadSvgTexture(path);
				return [key, tex] as const;
			}),
		);

		const explosionFrames = await Promise.all(EXPLOSION_FRAMES.map(loadSvgTexture));

		const simple = Object.fromEntries(simpleLoaded) as Record<keyof typeof SIMPLE_PATHS, Texture>;
		return {...simple, explosion: explosionFrames};
	})();
	return cached;
}
