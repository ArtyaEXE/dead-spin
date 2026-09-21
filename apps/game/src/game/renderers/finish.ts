import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';

/**
 * Старт и финиш. Раньше это была одна текстура дыры, перекрашиваемая тинтом
 * в пять мировых оттенков — ледяной голубой, фиолетовый, охра, красный,
 * серый. Из-за этого цель выглядела по-разному каждые пятнадцать уровней и
 * вдобавок была тёмной, хотя по закону трёх слоёв (DESIGN.md §4) цель обязана
 * быть одним из самых светлых пятен кадра.
 *
 * Теперь это два разных ассета и ни одного тинта: финиш золотой и одинаковый
 * во всех мирах, старт — тихий люк слоя мира.
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
