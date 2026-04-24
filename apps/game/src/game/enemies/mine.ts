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
		getHitPosition: () => ({x: setup.x, y: setup.y}),
		step(player) {
			const t = (performance.now() - startedAt) / 1000;
			// Повторяет CSS-keyframes из оригинала:
			// {0%: 0, 50%: -5, 100%: 0} с ease-in-out — мина "всплывает" на 5px
			// и возвращается обратно, не ныряя вниз. sin(π · phase) даёт именно
			// такую форму (0→1→0) с плавным ease-in-out.
			const phase = (t % 3) / 3;
			sprite.position.set(0, -Math.sin(Math.PI * phase) * 5);
			const hit = getDistanceBtwPoints(setup, player) <= setup.radius + player.radius;
			// При попадании — скрываем сам спрайт мины, её визуально заменяет
			// взрыв (GameWorld рисует explosion в getHitPosition() этого врага).
			if (hit) sprite.visible = false;
			return hit;
		},
		destroy() { container.destroy({children: true}); },
	};
}
