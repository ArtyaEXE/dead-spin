import {Assets, type Texture} from 'pixi.js';


/**
 * Кэш для статичных декораций: спрайты из /deco/static/*.png.
 * Загружаются лениво по `src` из уровня, чтобы не тянуть все 38 PNG
 * когда они не нужны на текущем уровне.
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
