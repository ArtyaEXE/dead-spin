import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';

/**
 * Tint hole-спрайта по миру. Pixi tint мультипликативный: белый = без
 * изменений, более холодные/тёплые значения окрашивают текстуру.
 * Hole.png базово тёплый (коричневая земля) — для CERES сдвигаем в
 * холодный голубой, для VESTA — в красноватый, и т.д.
 */
const WORLD_HOLE_TINT: Record<number, number> = {
	0: 0xa0c0dd, // CERES — ледяной голубой
	1: 0xc8a0d0, // PALLAS — фиолетово-органический
	2: 0xffffff, // JUNO — нейтральный (охра hole уже совпадает)
	3: 0xd0a0a0, // VESTA — красноватый геотермальный
	4: 0xd0d0d0, // EUNOMIA — бледный серый
};

function holeTint(levelNumber: number): number {
	const worldIdx = Math.floor((levelNumber - 1) / 15);
	return WORLD_HOLE_TINT[worldIdx] ?? 0xffffff;
}

export function createStartMarker(pos: Point, tex: Texture, levelNumber: number): Container {
	const c = new Container();
	c.position.set(pos.x, pos.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = 160;
	sprite.height = 160;
	sprite.tint = holeTint(levelNumber);
	c.addChild(sprite);
	return c;
}

export function createFinishMarker(pos: Point, tex: Texture, levelNumber: number): Container {
	const c = new Container();
	c.position.set(pos.x, pos.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = 200;
	sprite.height = 200;
	sprite.tint = holeTint(levelNumber);
	c.addChild(sprite);
	return c;
}
