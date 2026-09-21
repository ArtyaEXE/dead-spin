import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';

type Smoke = {
	/** Один спрайт на кадр, индекс совпадает с индексом кадра в пуле. */
	sprites: Sprite[];
	// baseScale[i] = finalSize / texture.width для спрайта i. Нужен потому, что
	// каждый tick мы перезаписываем sprite.scale, и без множителя размер
	// получается равным native-размеру текстуры (у explosion-кадров — сотни пикселей).
	baseScales: number[];
	startedAt: number;
	duration: number;
	// Позиция + плавный дрейф: оригинал использует CSS `transition: left/top 1.5s ease-out`,
	// значит нам нужно интерполировать (fromX,fromY) → (toX,toY) за DRIFT_MS.
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	driftStart: number;
};

const DRIFT_MS = 1500;
/**
 * Потолок одновременно живых клубов. Дым эмитится на каждый тап буста,
 * на каждый отскок камня и от червя раз в секунду — при активной игре это
 * десятки в секунду. Старше потолка — гасим досрочно, чтобы число спрайтов
 * в кадре на слабом Android было ограничено.
 */
const MAX_ACTIVE = 40;

// ease-out как в CSS ease-out (квадратичный) — быстрый старт, плавное затухание
function easeOut(t: number): number {
	return 1 - (1 - t) * (1 - t);
}

/**
 * Дымные клубы — 3 кадра из explosion-spritesheet (индексы 8, 10, 11 в оригинале
 * Smokes.svelte соответствуют файлам 9.png, 11.png, 12.png).
 * Каждый кадр появляется со scale 0.3→1.5 и fade-in→out, последовательно.
 * Конкретно: длительность анимации = 0.7 * duration, старт каждого следующего
 * сдвинут на равные интервалы, чтобы получилась "волна" дыма.
 *
 * Спрайты берутся из пула и возвращаются в него, а не создаются и
 * уничтожаются на каждый клуб: раньше это давало десятки `new Sprite()` и
 * `destroy()` в секунду и GC-паузы на слабых устройствах.
 */
export interface SmokeSystem {
	container: Container;
	add: (point: Point, size?: number, duration?: number, move?: Point) => void;
	tick: (now: number) => void;
	/** Убрать все живые клубы, контейнер оставить (рестарт уровня). */
	clear: () => void;
	destroy: () => void;
}

export function createSmokeSystem(explosionFrames: Texture[]): SmokeSystem {
	const container = new Container();
	const active: Smoke[] = [];

	// Используем кадры 9, 11, 12 — как в Smokes.svelte:30-33
	const frameTextures = [explosionFrames[8], explosionFrames[10], explosionFrames[11]].filter((t): t is Texture => !!t);
	// Пул по кадрам: у каждого слота своя текстура, поэтому спрайты не взаимозаменяемы.
	const pools: Sprite[][] = frameTextures.map(() => []);

	function acquire(fi: number): Sprite {
		const pooled = pools[fi]!.pop();
		if (pooled) {
			pooled.visible = true;
			return pooled;
		}
		const s = new Sprite(frameTextures[fi]!);
		s.anchor.set(0.5);
		container.addChild(s);
		return s;
	}

	function release(sm: Smoke): void {
		for (let fi = 0; fi < sm.sprites.length; fi++) {
			const s = sm.sprites[fi]!;
			s.visible = false;
			s.alpha = 0;
			pools[fi]!.push(s);
		}
	}

	return {
		container,
		add(point, size = 100, duration = 2000, move) {
			if (active.length >= MAX_ACTIVE) {
				release(active.shift()!);
			}

			const finalSize = size * randRange(0.75, 1.25);
			const rot = randRange(-Math.PI, Math.PI);
			const sprites: Sprite[] = [];
			const baseScales: number[] = [];

			for (let fi = 0; fi < frameTextures.length; fi++) {
				const tex = frameTextures[fi]!;
				const s = acquire(fi);
				s.alpha = 0;
				s.rotation = rot;
				// finalSize задаёт 100%-размер клуба в мировых пикселях,
				// на него поверх умножается анимационный множитель 0.3→1.5.
				const baseScale = finalSize / (tex.width || finalSize);
				s.scale.set(baseScale * 0.3);
				s.position.set(point.x, point.y);
				sprites.push(s);
				baseScales.push(baseScale);
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
				const sm = active[i]!;
				const t = now - sm.startedAt;
				if (t >= sm.duration) {
					release(sm);
					active.splice(i, 1);
					continue;
				}

				// Плавный дрейф from→to за DRIFT_MS с ease-out — эквивалент
				// CSS `transition: left/top 1.5s ease-out` из оригинала.
				const driftT = Math.min(1, (now - sm.driftStart) / DRIFT_MS);
				const d = easeOut(driftT);
				const cx = sm.fromX + (sm.toX - sm.fromX) * d;
				const cy = sm.fromY + (sm.toY - sm.fromY) * d;

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
					const eased = easeOut(phase);
					// scale 0.3→1.5, alpha 0→0.5→0 — оба с ease-out, как в оригинальном CSS animation.
					const anim = 0.3 + eased * 1.2;
					sprite.scale.set(sm.baseScales[fi]! * anim);
					sprite.alpha = phase < 0.2 ? (phase / 0.2) * 0.5 : 0.5 * (1 - easeOut((phase - 0.2) / 0.8));
					sprite.position.set(cx, cy);
				}
			}
		},
		clear() {
			for (const sm of active) release(sm);
			active.length = 0;
		},
		destroy() {
			active.length = 0;
			for (const p of pools) p.length = 0;
			container.destroy({children: true});
		},
	};
}

function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}
