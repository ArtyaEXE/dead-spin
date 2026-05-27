import {Assets, type Texture} from 'pixi.js';


/**
 * Кэш для статичных декораций.
 *
 * Пути резолвятся так:
 *   - `ceres/ceres-stalactite.png` → `/deco/static/ceres/ceres-stalactite.png`
 *   - `debris-1.png`               → `/deco/static/debris-1.png` (legacy flat)
 *
 * Загружаются лениво по `src` из уровня.
 */
const cache = new Map<string, Promise<Texture>>();


export function loadDecoTexture(src: string): Promise<Texture> {
	let existing = cache.get(src);
	if (!existing) {
		existing = Assets.load<Texture>(`/deco/static/${src}`);
		cache.set(src, existing);
	}
	return existing;
}
