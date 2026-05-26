import {Assets, type Texture} from 'pixi.js';
import {getSkinById, type SkinId} from '../stores/skin';


/**
 * Текстуры игрового поля — предзагружаем один раз до монтирования сцены.
 * Имена совпадают с путями в public/.
 */
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
	hole: Texture;
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
	ceresOuter: '/ceres-1.jpg',
	ceresInner: '/ceres-2.jpg',
	pallasOuter: '/pallas-1.jpg',
	pallasInner: '/pallas-2.jpg',
	junoOuter: '/juno-1.jpg',
	junoInner: '/juno-2.jpg',
	vestaOuter: '/vesta-1.jpg',
	vestaInner: '/vesta-2.jpg',
	eunomiaOuter: '/eunomia-1.jpg',
	eunomiaInner: '/eunomia-2.jpg',
	hole: '/hole.png',
	ship: '/ship2.png',
	booster: '/booster-single.png',
	star: '/star.png',
	stone: '/enemies/stone/stone.png',
	mine: '/enemies/mine/mine.png',
	worm1: '/enemies/worm/s1.png',
	worm2: '/enemies/worm/s2.png',
	worm3: '/enemies/worm/s3.png',
	light: '/light.png',
} as const;


const EXPLOSION_FRAMES = Array.from({length: 13}, (_, i) => `/effects/explosion/${i + 1}.png`);


let cached: Promise<GameTextures> | null = null;


/**
 * Грузит текстуру корабля для выбранного скина. Если ассета нет — возвращает
 * дефолтный prospector (ship2.png). Используется в GameWorld.mount чтобы
 * подменить ship после loadGameTextures.
 */
export async function loadShipTexture(skinId: SkinId): Promise<Texture> {
	const skin = getSkinById(skinId);
	try {
		return await Assets.load<Texture>(skin.src);
	} catch {
		return Assets.load<Texture>('/ship2.png');
	}
}


/**
 * Cave-текстуры по миру. 15 уровней на мир, 5 миров.
 * Каждый мир — своя пара (outer wall + inner parallax).
 */
export function caveTexturesForLevel(
	levelNumber: number, t: GameTextures,
): {outer: Texture; inner: Texture} {
	const worldIdx = Math.floor((levelNumber - 1) / 15);
	switch (worldIdx) {
		case 1:  return {outer: t.pallasOuter, inner: t.pallasInner};
		case 2:  return {outer: t.junoOuter,   inner: t.junoInner};
		case 3:  return {outer: t.vestaOuter,  inner: t.vestaInner};
		case 4:  return {outer: t.eunomiaOuter, inner: t.eunomiaInner};
		default: return {outer: t.ceresOuter,  inner: t.ceresInner};
	}
}


export function loadGameTextures(): Promise<GameTextures> {
	if (cached) return cached;
	cached = (async () => {
		const simpleEntries = Object.entries(SIMPLE_PATHS) as [keyof typeof SIMPLE_PATHS, string][];
		const simpleLoaded = await Promise.all(simpleEntries.map(async ([key, path]) => {
			const tex = await Assets.load<Texture>(path);
			return [key, tex] as const;
		}));

		const explosionFrames = await Promise.all(
			EXPLOSION_FRAMES.map(path => Assets.load<Texture>(path)),
		);

		const simple = Object.fromEntries(simpleLoaded) as Record<keyof typeof SIMPLE_PATHS, Texture>;
		return {...simple, explosion: explosionFrames};
	})();
	return cached;
}
