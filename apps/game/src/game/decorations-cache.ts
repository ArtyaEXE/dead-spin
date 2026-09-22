import type {Texture} from 'pixi.js';
import {loadSvgTexture} from './assets';

/**
 * Кэш для статичных декораций.
 *
 * Пути резолвятся так:
 *   - `ceres/ceres-stalactite.svg` → `/deco/static/ceres/ceres-stalactite.svg`
 *   - `debris-1.png`               → `/deco/static/debris-1.png` (рисованное от руки)
 *
 * Загружаются лениво по `src` из уровня. Векторные декорации растеризуются
 * под DPR устройства, рисованные от руки грузятся как есть.
 */
const cache = new Map<string, Promise<Texture>>();

export function loadDecoTexture(src: string): Promise<Texture> {
	let existing = cache.get(src);
	if (!existing) {
		existing = loadSvgTexture(`/deco/static/${src}`);
		cache.set(src, existing);
	}
	return existing;
}
