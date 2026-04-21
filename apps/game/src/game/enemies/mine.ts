import {Sprite, Texture, Container} from 'pixi.js';
import {getDistanceBtwPoints} from '@dead-spin/engine';
import type {Enemy} from './types';


type MineSetup = {x: number; y: number; r: number; radius: number};


/**
 * "Мина" — статичная, с вертикальным покачиванием по синусу
 * (как CSS-keyframes float из [Mine.svelte](space/imports/ui/enemy/mine/Mine.svelte):
 * translateY ±5px за 3 сек).
 */
export function createMine(setup: MineSetup, tex: Texture): Enemy {
	const container = new Container();
	container.position.set(setup.x, setup.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = setup.radius * 2;
	sprite.height = setup.radius * 2;
	sprite.rotation = (setup.r * Math.PI) / 180;
	container.addChild(sprite);

	const startedAt = performance.now();

	return {
		name: 'mine',
		container,
		step(player) {
			const t = (performance.now() - startedAt) / 1000;
			// sin ±5 каждые 3 секунды
			sprite.position.set(0, Math.sin((t / 3) * Math.PI * 2) * 5);
			return getDistanceBtwPoints(setup, player) <= setup.radius + player.radius;
		},
		destroy() { container.destroy({children: true}); },
	};
}
