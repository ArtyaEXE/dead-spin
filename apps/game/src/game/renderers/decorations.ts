import {Assets, Container, Sprite, type Texture} from 'pixi.js';
import type {Decoration} from '@dead-spin/shared';
import {loadDecoTexture} from '../decorations-cache';


/**
 * Декорации уровня — 3 типа:
 *  - static: спрайт /deco/static/{src}.png с поворотом r и scale s
 *  - stop:  иконка /icons/deco-stop.png (мигающая, вместо текстового "STOP" из оригинала)
 *  - gravity: ОДНА иконка /icons/deco-gravity-down.png (стрелка вниз),
 *    повёрнутая на угол `r` градусов в направлении вектора гравитации.
 *    Поле `type` в schema оставлено для backward-compat — renderer его
 *    игнорирует, использует только `r`. Для диагональной гравитации
 *    (например 8, 12) — одна стрелка под нужным углом, не две.
 *
 * Renderer возвращает Container с функцией tick(now) для обновления
 * мигания/пульсации.
 */

export interface DecorationsLayer {
	container: Container;
	tick: (now: number) => void;
	destroy: () => void;
}


const STOP_BLINK_MS = 600;
const GRAVITY_BLINK_MS = 510;
const STOP_BASE_SIZE = 140;
const GRAVITY_BASE_SIZE = 140;


type DecoItem =
	| {kind: 'static'; sprite: Sprite; pending: Promise<void>}
	| {kind: 'stop'; sprite: Sprite}
	| {kind: 'gravity'; sprite: Sprite; angleRad: number};


export function createDecorationsLayer(decorations: readonly Decoration[]): DecorationsLayer {
	const container = new Container();
	const items: DecoItem[] = [];

	for (const d of decorations) {
		if (d.name === 'static') {
			const sprite = new Sprite();
			sprite.anchor.set(0.5);
			sprite.position.set(d.x, d.y);
			sprite.rotation = (d.r * Math.PI) / 180;
			sprite.scale.set(d.s);
			container.addChild(sprite);

			const pending = loadDecoTexture(d.src).then((tex: Texture) => {
				sprite.texture = tex;
				// Оригинал хранит natural-size картинки (img без width/height),
				// применяя только transform: scale — делаем то же: width/height
				// берутся из текстуры, scale — из s.
			}).catch(() => {/* отсутствующий ассет — просто пропускаем */});

			items.push({kind: 'static', sprite, pending});
		} else if (d.name === 'stop') {
			const sprite = new Sprite();
			sprite.anchor.set(0.5);
			sprite.position.set(d.x, d.y);
			sprite.rotation = (d.r * Math.PI) / 180;
			const size = STOP_BASE_SIZE * d.s;
			sprite.width = size;
			sprite.height = size;
			container.addChild(sprite);
			void Assets.load<Texture>('/icons/deco-stop.png').then(tex => { sprite.texture = tex; sprite.width = size; sprite.height = size; }).catch(() => {});
			items.push({kind: 'stop', sprite});
		} else {
			const angleRad = (d.r * Math.PI) / 180;
			const sprite = new Sprite();
			sprite.anchor.set(0.5);
			sprite.position.set(d.x, d.y);
			sprite.rotation = angleRad;
			const size = GRAVITY_BASE_SIZE * d.s;
			sprite.width = size;
			sprite.height = size;
			container.addChild(sprite);
			void Assets.load<Texture>('/icons/deco-gravity-down.png').then(tex => { sprite.texture = tex; sprite.width = size; sprite.height = size; }).catch(() => {});
			items.push({kind: 'gravity', sprite, angleRad});
		}
	}

	return {
		container,
		tick(now) {
			for (const it of items) {
				if (it.kind === 'stop') {
					// мигание каждые 600мс — мягкий пульс opacity (не резкий on/off,
					// иначе иконка выглядит как баг)
					const phase = (now % STOP_BLINK_MS) / STOP_BLINK_MS;
					it.sprite.alpha = 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
				} else if (it.kind === 'gravity') {
					// Пульсирующий сдвиг вдоль угла направления (на 8px) +
					// лёгкий pulse alpha. Direction-вектор — единичный
					// (sin θ, −cos θ × −1) = (sin θ, cos θ), где θ — angleRad
					// (0 = вниз, потому что текстура down).
					const phase = (now % GRAVITY_BLINK_MS) / GRAVITY_BLINK_MS;
					const amt = (1 - Math.cos(phase * Math.PI * 2)) * 0.5; // 0→1→0
					// Локальная "low" направление спрайта = +Y (так как
					// текстура нарисована стрелкой вниз и rotation=0). После
					// rotation θ направление = (sin θ, cos θ). Pivot вычитаем
					// чтобы сместить картинку В этом направлении.
					const dx = Math.sin(it.angleRad) * amt * 8;
					const dy = Math.cos(it.angleRad) * amt * 8;
					it.sprite.pivot.set(-dx, -dy);
					it.sprite.alpha = 0.7 + amt * 0.3;
				}
			}
		},
		destroy() {
			for (const it of items) {
				if (it.kind === 'static' || it.kind === 'stop' || it.kind === 'gravity') it.sprite.destroy();
			}
			container.destroy({children: true});
		},
	};
}


