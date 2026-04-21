import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


type Smoke = {
	sprites: Sprite[];
	startedAt: number;
	duration: number;
	x: number;
	y: number;
};


/**
 * Дымные клубы — 3 кадра из explosion-spritesheet (индексы 8, 10, 11 в оригинале
 * Smokes.svelte соответствуют файлам 9.png, 11.png, 12.png).
 * Каждый кадр появляется со scale 0.3→1.5 и fade-in→out, последовательно.
 * Конкретно: длительность анимации = 0.7 * duration, старт каждого следующего
 * сдвинут на равные интервалы, чтобы получилась "волна" дыма.
 */
export interface SmokeSystem {
	container: Container;
	add: (point: Point, size?: number, duration?: number, move?: Point) => void;
	tick: (now: number) => void;
	destroy: () => void;
}


export function createSmokeSystem(explosionFrames: Texture[]): SmokeSystem {
	const container = new Container();
	const active: Smoke[] = [];

	// Используем кадры 9, 11, 12 — как в Smokes.svelte:30-33
	const frameTextures = [explosionFrames[8], explosionFrames[10], explosionFrames[11]].filter(
		(t): t is Texture => !!t,
	);

	return {
		container,
		add(point, size = 100, duration = 2000, move) {
			const finalSize = size * randRange(0.75, 1.25);
			const rot = randRange(-Math.PI, Math.PI);
			const sprites: Sprite[] = [];

			for (const tex of frameTextures) {
				const s = new Sprite(tex);
				s.anchor.set(0.5);
				s.alpha = 0;
				s.width = finalSize;
				s.height = finalSize;
				s.rotation = rot;
				sprites.push(s);
				container.addChild(s);
			}

			const smoke: Smoke = {
				sprites,
				startedAt: performance.now(),
				duration,
				x: point.x,
				y: point.y,
			};
			active.push(smoke);

			if (move) {
				setTimeout(() => {
					smoke.x += move.x;
					smoke.y += move.y;
				}, 1);
			}
		},
		tick(now) {
			for (let i = active.length - 1; i >= 0; i--) {
				const sm = active[i]!;
				const t = now - sm.startedAt;
				if (t >= sm.duration) {
					for (const s of sm.sprites) s.destroy();
					active.splice(i, 1);
					continue;
				}

				const animDur = sm.duration * 0.7;
				const perFrameDelay = (sm.duration - animDur) / sm.sprites.length;

				for (let fi = 0; fi < sm.sprites.length; fi++) {
					const sprite = sm.sprites[fi]!;
					const delay = perFrameDelay * fi;
					const local = t - delay;
					if (local < 0 || local > animDur) {
						sprite.alpha = 0;
						continue;
					}
					const phase = local / animDur;
					// scale 0.3→1.5, alpha 0→0.5→0
					sprite.scale.set(0.3 + phase * 1.2);
					sprite.alpha = phase < 0.2 ? (phase / 0.2) * 0.5 : 0.5 * (1 - (phase - 0.2) / 0.8);
					sprite.position.set(sm.x, sm.y);
				}
			}
		},
		destroy() {
			for (const sm of active) for (const s of sm.sprites) s.destroy();
			active.length = 0;
			container.destroy({children: true});
		},
	};
}


function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}
