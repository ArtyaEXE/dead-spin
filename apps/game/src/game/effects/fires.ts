import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


/**
 * Огонь из сопла бустера — particle-эффект по той же схеме что smokes.ts.
 *
 * Использует 3 кастомных кадра пламени (/effects/flame/1..3.png):
 * нарисованы вертикальным языком вверх в Machinarium-стилистике.
 * В коде поворачиваем спрайты по направлению ТЯГИ (противоположно носу
 * корабля), чтобы пламя точно вылетало из сопла, а не вращалось
 * случайно как клубы дыма.
 *
 * Параметры (vs smokes):
 *  - duration по умолчанию 500мс (vs 2000) — пламя резкое, не висит.
 *  - scale 0.4 → 1.0 (vs 0.3 → 1.5) — компактный язык, не пышный клуб.
 *  - drift 600мс (vs 1500) — близко к соплу.
 *  - alpha быстрый rise до 0.9 за 15%, потом ease-out — яркий пшик
 *    с длинным затуханием.
 */


type Fire = {
	sprites: Sprite[];
	baseScales: number[];
	startedAt: number;
	duration: number;
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	driftStart: number;
};


const DRIFT_MS = 600;

function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t);
}


export interface FireSystem {
	container: Container;
	/**
	 * @param point — где появится пламя (как правило за соплом корабля).
	 * @param rotationRad — куда смотрит «верх» текстуры; для бустера это
	 *   направление тяги (противоположно носу). 0 = верх текстуры
	 *   совпадает с -Y мира.
	 * @param size — высота пламени в мировых пикселях.
	 * @param duration — мс.
	 * @param move — смещение позиции за время жизни (дрейф back).
	 */
	add: (point: Point, rotationRad: number, size?: number, duration?: number, move?: Point) => void;
	tick: (now: number) => void;
	destroy: () => void;
}


export function createFireSystem(flameFrames: Texture[]): FireSystem {
	const container = new Container();
	const active: Fire[] = [];

	return {
		container,
		add(point, rotationRad, size = 60, duration = 500, move) {
			const finalSize = size * randRange(0.9, 1.1);
			const sprites: Sprite[] = [];
			const baseScales: number[] = [];

			for (const tex of flameFrames) {
				const s = new Sprite(tex);
				// anchor посередине-снизу: «корень» пламени привязан к точке point,
				// чтобы пламя росло от сопла наружу, а не из центра.
				s.anchor.set(0.5, 1);
				s.alpha = 0;
				s.rotation = rotationRad;
				const baseScale = finalSize / (tex.height || finalSize);
				s.scale.set(baseScale * 0.4);
				sprites.push(s);
				baseScales.push(baseScale);
				container.addChild(s);
			}

			const now = performance.now();
			active.push({
				sprites,
				baseScales,
				startedAt: now,
				duration,
				fromX: point.x,
				fromY: point.y,
				toX: point.x + (move?.x ?? 0),
				toY: point.y + (move?.y ?? 0),
				driftStart: now,
			});
		},
		tick(now) {
			for (let i = active.length - 1; i >= 0; i--) {
				const f = active[i]!;
				const t = now - f.startedAt;
				if (t >= f.duration) {
					for (const s of f.sprites) s.destroy();
					active.splice(i, 1);
					continue;
				}

				const driftT = Math.min(1, (now - f.driftStart) / DRIFT_MS);
				const d = easeOut(driftT);
				const cx = f.fromX + (f.toX - f.fromX) * d;
				const cy = f.fromY + (f.toY - f.fromY) * d;

				const animDur = f.duration * 0.8;
				const perFrameDelay = (f.duration - animDur) / f.sprites.length;

				for (let fi = 0; fi < f.sprites.length; fi++) {
					const sprite = f.sprites[fi]!;
					const delay = perFrameDelay * fi;
					const local = t - delay;
					if (local < 0 || local > animDur) {
						sprite.alpha = 0;
						continue;
					}
					const phase = local / animDur;
					const eased = easeOut(phase);
					sprite.scale.set(f.baseScales[fi]! * (0.4 + eased * 0.6));
					sprite.alpha = phase < 0.15
						? (phase / 0.15) * 0.9
						: 0.9 * (1 - easeOut((phase - 0.15) / 0.85));
					sprite.position.set(cx, cy);
				}
			}
		},
		destroy() {
			for (const f of active) for (const s of f.sprites) s.destroy();
			active.length = 0;
			container.destroy({children: true});
		},
	};
}


function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}
