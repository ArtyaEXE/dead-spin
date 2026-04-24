import {Assets, Container, Sprite, type Texture} from 'pixi.js';
import type {Decoration} from '@dead-spin/shared';
import {loadDecoTexture} from '../decorations-cache';


/**
 * Декорации уровня — 3 типа:
 *  - static: спрайт /deco/static/{src}.png с поворотом r и scale s
 *  - stop:  иконка /icons/deco-stop.png (мигающая, вместо текстового "STOP" из оригинала)
 *  - gravity: иконка /icons/deco-gravity-{type}.png (пульсирующая, вместо текстовых "↓ G ↓")
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
	| {kind: 'gravity'; sprite: Sprite; type: 'up' | 'down' | 'left' | 'right'};


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
			const sprite = new Sprite();
			sprite.anchor.set(0.5);
			sprite.position.set(d.x, d.y);
			sprite.rotation = (d.r * Math.PI) / 180;
			const size = GRAVITY_BASE_SIZE * d.s;
			sprite.width = size;
			sprite.height = size;
			container.addChild(sprite);
			void Assets.load<Texture>(`/icons/deco-gravity-${d.type}.png`).then(tex => { sprite.texture = tex; sprite.width = size; sprite.height = size; }).catch(() => {});
			items.push({kind: 'gravity', sprite, type: d.type});
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
					// пульсирующий сдвиг вдоль направления ±8px + лёгкий pulse alpha
					const phase = (now % GRAVITY_BLINK_MS) / GRAVITY_BLINK_MS;
					const amt = (1 - Math.cos(phase * Math.PI * 2)) * 0.5; // 0→1→0
					const dir = it.type;
					const dx = dir === 'right' ? amt * 8 : dir === 'left' ? -amt * 8 : 0;
					const dy = dir === 'down' ? amt * 8 : dir === 'up' ? -amt * 8 : 0;
					it.sprite.position.set(it.sprite.position.x, it.sprite.position.y); // noop, pivot вместо этого
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


