import {Assets, type Texture} from 'pixi.js';


/**
 * Текстуры игрового поля — предзагружаем один раз до монтирования сцены.
 * Имена совпадают с путями в public/.
 */
export type GameTextures = {
	cave1: Texture;
	cave2: Texture;
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
