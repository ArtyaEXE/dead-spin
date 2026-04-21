import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


/**
 * Взрыв: 13 кадров explosion/1..13.png, запускаемые с интервалом 80мс.
 * Каждый кадр — эффект "explode" (CSS в Explosion.svelte:120-124):
 *  0% scale 0.5 opacity 0
 *  40% scale 1.0 opacity 1
 *  100% scale 2.0 opacity 0
 * На одном месте, длительность 700мс.
 *
 * Вся работа делается через Pixi-спрайты с альфой и scale, вычисляется
 * по времени — без Howler-таймеров.
 */

const SIZE = 300;
const FRAME_DURATION = 700;
const FRAME_INTERVAL = 80;


export type ExplosionHandle = {
	container: Container;
	/** Пока не закончилась — true. Когда false — можно удалить из сцены. */
	tick: (now: number) => boolean;
	destroy: () => void;
};


export function createExplosion(
	pos: Point,
	frames: Texture[],
): ExplosionHandle {
	const container = new Container();
	container.position.set(pos.x, pos.y);
	const sprites: Sprite[] = [];

	for (const tex of frames) {
		const s = new Sprite(tex);
		s.anchor.set(0.5);
		s.width = SIZE;
		s.height = SIZE;
		s.alpha = 0;
		sprites.push(s);
		container.addChild(s);
	}

	const startedAt = performance.now();

	return {
		container,
		tick(now) {
			const t = now - startedAt;
			let anyActive = false;

			for (let i = 0; i < sprites.length; i++) {
				const sprite = sprites[i]!;
				// Оригинал использует 13 кадров, но 10/11 пропускает — для упрощения
				// отображаем все 13, эффект визуально тот же.
				const start = i * FRAME_INTERVAL;
				const end = start + FRAME_DURATION;
				if (t < start || t >= end) {
					sprite.alpha = 0;
					continue;
				}
				anyActive = true;
				const phase = (t - start) / FRAME_DURATION;
				// 0..0.4: scale 0.5→1.0, alpha 0→1
				// 0.4..1.0: scale 1.0→2.0, alpha 1→0
				if (phase < 0.4) {
					const p = phase / 0.4;
					sprite.scale.set(0.5 + 0.5 * p);
					sprite.alpha = p;
				} else {
					const p = (phase - 0.4) / 0.6;
					sprite.scale.set(1.0 + p);
					sprite.alpha = 1 - p;
				}
			}

			const lastStart = (sprites.length - 1) * FRAME_INTERVAL;
			return anyActive || t < lastStart + FRAME_DURATION;
		},
		destroy() { container.destroy({children: true}); },
	};
}
