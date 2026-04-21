import {Container, FillGradient, Sprite, Text, TextStyle, type Texture} from 'pixi.js';
import type {Decoration} from '@dead-spin/shared';
import {loadDecoTexture} from '../decorations-cache';


/**
 * Декорации уровня — 3 типа:
 *  - static: спрайт /deco/static/{src}.png с поворотом r и scale s
 *  - stop:  мигающая "⬅ STOP" надпись с бело-зелёно-золотым градиентом
 *  - gravity: пульсирующие "↓ G ↓" стрелки (направление из type)
 *
 * Renderer возвращает Container с функцией tick(now) для обновления
 * мигания/пульсации. Логика 1:1 с исходными Svelte-компонентами:
 *  - [Static.svelte](space/imports/ui/deco/static/Static.svelte)
 *  - [Stop.svelte](space/imports/ui/deco/stop/Stop.svelte)
 *  - [Gravity.svelte](space/imports/ui/deco/gravity/Gravity.svelte)
 */

export interface DecorationsLayer {
	container: Container;
	tick: (now: number) => void;
	destroy: () => void;
}


const STOP_BLINK_MS = 600;
const GRAVITY_BLINK_MS = 510;


type DecoItem =
	| {kind: 'static'; sprite: Sprite; pending: Promise<void>}
	| {kind: 'stop'; node: Container}
	| {kind: 'gravity'; node: Container; type: 'up' | 'down' | 'left' | 'right'};


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
			const node = makeGradientLabel(
				'\u2190  STOP',
				['#33C41F', '#C8961F'],
				d.s,
			);
			node.position.set(d.x, d.y);
			node.rotation = (d.r * Math.PI) / 180;
			container.addChild(node);
			items.push({kind: 'stop', node});
		} else {
			const arrow =
				d.type === 'up'   ? '\u2191  G  \u2191' :
				d.type === 'down' ? '\u2193  G  \u2193' :
				d.type === 'left' ? '\u2190  G'        :
				                    'G  \u2192';
			const node = makeGradientLabel(arrow, ['#D32000', '#D4AD00'], d.s);
			node.position.set(d.x, d.y);
			node.rotation = (d.r * Math.PI) / 180;
			container.addChild(node);
			items.push({kind: 'gravity', node, type: d.type});
		}
	}

	return {
		container,
		tick(now) {
			for (const it of items) {
				if (it.kind === 'stop') {
					// мигание каждые 600мс — толерантный on/off
					const phase = Math.floor(now / STOP_BLINK_MS) % 2;
					it.node.alpha = phase ? 1 : 0;
				} else if (it.kind === 'gravity') {
					const phase = Math.floor(now / GRAVITY_BLINK_MS) % 2;
					// "пульсация" вдоль направления ±30px с мягким ease
					const t = (now % GRAVITY_BLINK_MS) / GRAVITY_BLINK_MS;
					const amt = phase ? t : (1 - t);
					const dir = it.type;
					const dx = dir === 'left' ? amt * 30 : dir === 'right' ? -amt * 30 : 0;
					const dy = dir === 'up' ? amt * 30 : dir === 'down' ? -amt * 30 : 0;
					it.node.pivot.set(dx, dy);
					it.node.alpha = 0.6 + amt * 0.4;
				}
			}
		},
		destroy() {
			for (const it of items) {
				if (it.kind === 'static') it.sprite.destroy();
				else it.node.destroy({children: true});
			}
			container.destroy({children: true});
		},
	};
}


/**
 * "Дорожная" надпись: цветовой градиент + skew — как в оригинальном
 * CSS (`background-clip: text` + `skew(0.06turn, -8deg)`).
 * Рисуем Pixi.Text и применяем skew через контейнер.
 */
function makeGradientLabel(text: string, colors: [string, string], scale: number): Container {
	const gradient = new FillGradient({
		type: 'linear',
		colorStops: [
			{offset: 0, color: colors[0]},
			{offset: 1, color: colors[1]},
		],
		start: {x: 0, y: 0},
		end: {x: 1, y: 1},
		textureSpace: 'local',
	});

	const style = new TextStyle({
		fontFamily: 'Road Rage, sans-serif',
		fontSize: 50,
		fontWeight: 'bold',
		fill: gradient,
		stroke: {color: '#000', width: 2, alpha: 0.5},
		dropShadow: {color: '#000', blur: 8, alpha: 0.8, distance: 0},
	});

	const label = new Text({text, style});
	label.anchor.set(0.5);

	const wrap = new Container();
	wrap.addChild(label);
	// skew(0.06turn ≈ 21.6°, -8°): skew.x влияет на вертикальные края,
	// skew.y — на горизонтальные. В Pixi skew измеряется в радианах.
	wrap.skew.set(0.06 * Math.PI * 2, (-8 * Math.PI) / 180);
	wrap.scale.set(scale);
	return wrap;
}
