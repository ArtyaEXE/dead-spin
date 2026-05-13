import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


/**
 * Огонь из сопла бустера — particle-эффект по той же схеме что smokes.ts,
 * но с другими параметрами под характер пламени:
 *  - оранжево-жёлтый tint поверх explosion-кадров (используем самые
 *    яркие, ранние кадры взрыва — индексы 0, 1, 2);
 *  - короче (по умолчанию 600мс vs 2000мс у дыма) — пламя возникает
 *    резко при импульсе и быстро гаснет;
 *  - меньший дрейф (огонь сидит близко к соплу, не разлетается);
 *  - анимация scale 0.4 → 1.0 (а не 0.3 → 1.5 как у дыма) — пламя
 *    не растёт пышно, оно остаётся compactным языком.
 *
 * Огонь рисуется ПОВЕРХ дыма в GameWorld — yarkий язык ближе к
 * камере, сероватые клубы фоном.
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
const FIRE_TINT = 0xFFAA33;  // насыщенный оранжевый

function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t);
}


export interface FireSystem {
	container: Container;
	add: (point: Point, size?: number, duration?: number, move?: Point) => void;
	tick: (now: number) => void;
	destroy: () => void;
}


export function createFireSystem(explosionFrames: Texture[]): FireSystem {
	const container = new Container();
	const active: Fire[] = [];

	// Ранние кадры explosion — самая яркая стадия. На них применим tint,
	// чтобы получить тёплый оранж независимо от исходного цвета спрайта.
	const frameTextures = [explosionFrames[0], explosionFrames[1], explosionFrames[2]].filter(
		(t): t is Texture => !!t,
	);

	return {
		container,
		add(point, size = 60, duration = 600, move) {
			const finalSize = size * randRange(0.85, 1.15);
			const rot = randRange(-Math.PI, Math.PI);
			const sprites: Sprite[] = [];
			const baseScales: number[] = [];

			for (const tex of frameTextures) {
				const s = new Sprite(tex);
				s.anchor.set(0.5);
				s.alpha = 0;
				s.rotation = rot;
				s.tint = FIRE_TINT;
				const baseScale = finalSize / (tex.width || finalSize);
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

				// Дрейф 0→1 за DRIFT_MS, потом застывает.
				const driftT = Math.min(1, (now - f.driftStart) / DRIFT_MS);
				const d = easeOut(driftT);
				const cx = f.fromX + (f.toX - f.fromX) * d;
				const cy = f.fromY + (f.toY - f.fromY) * d;

				// 80% длительности анимации; последние 20% — догорание.
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
					// scale 0.4 → 1.0 (компактный язык). Alpha 0 → 0.9 → 0 —
					// яркая вспышка, пик в 15% длительности, затем затухание.
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
