import {Container, Sprite, Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


/**
 * Маркеры start/finish — один и тот же спрайт hole.png, как в Game.svelte
 * (где .hole-start и .hole-finish — просто картинки hole.png, 160×160).
 * Разные размеры оставляем: start 160, finish 200 — соответствует offset
 * `(x - 80)/(x - 100)` из оригинала.
 */
export function createStartMarker(pos: Point, tex: Texture): Container {
	const c = new Container();
	c.position.set(pos.x, pos.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = 160;
	sprite.height = 160;
	c.addChild(sprite);
	return c;
}


export function createFinishMarker(pos: Point, tex: Texture): Container {
	const c = new Container();
	c.position.set(pos.x, pos.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = 200;
	sprite.height = 200;
	c.addChild(sprite);
	return c;
}
