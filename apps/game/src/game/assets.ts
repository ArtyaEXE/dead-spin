import {Assets, type Texture} from 'pixi.js';
import {getSkinById, type SkinId} from '../stores/skin';


/**
 * Текстуры игрового поля — предзагружаем один раз до монтирования сцены.
 * Имена совпадают с путями в public/.
 */
export type GameTextures = {
	cave1: Texture;
	cave2: Texture;
	cave2_1: Texture;  // PALLAS outer rock
	cave2_2: Texture;  // PALLAS inner parallax
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
	cave1: '/cave1.jpg',
	cave2: '/cave2.jpg',
	cave2_1: '/cave2-1.jpg',
	cave2_2: '/cave2-2.jpg',
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
 * Cave-текстуры по миру. CERES (L1-15) — cave1+cave2, PALLAS (L16-30) —
 * cave2-1+cave2-2. Будущие миры (JUNO/VESTA/EUNOMIA) добавим сюда же,
 * когда появятся свои тайлы.
 */
export function caveTexturesForLevel(
	levelNumber: number, t: GameTextures,
): {outer: Texture; inner: Texture} {
	const worldIdx = Math.floor((levelNumber - 1) / 15);
	if (worldIdx === 1) return {outer: t.cave2_1, inner: t.cave2_2};
	return {outer: t.cave1, inner: t.cave2};
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
