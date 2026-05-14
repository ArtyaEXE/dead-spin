import {Sprite, Texture, Container, Graphics} from 'pixi.js';
import {
	getDistanceBtwPoints,
	updateHeat,
	heatToColor,
	MINE_DETECT_MULT,
	DEFAULT_HEAT_PARAMS,
	type MineHeatState,
} from '@dead-spin/engine';
import type {Enemy} from './types';


type MineSetup = {x: number; y: number; r: number; radius: number};


/**
 * Мина с магнитным взрывателем. Старая «инстакилл на касание» осталась
 * как один из двух способов погибнуть; новый — heat-механика:
 *
 *   • r_kill   = radius            — прямое касание убивает мгновенно
 *   • r_detect = radius × 2        — магнитный детектор
 *
 * Пока игрок в r_detect, heat ∈ [0..1] растёт (по умолчанию за 2 с до
 * полного нагрева). При heat ≥ 1 мина взрывается. Если игрок в этот
 * момент всё ещё в r_detect — kill. Если успел вырваться — мина просто
 * «выгорает», без kill (одноразовая, deactivated).
 *
 * Подробнее про числовые параметры — `@dead-spin/engine/mine-heat.ts`.
 *
 * Визуал:
 *   • Спрайт мины + старое покачивание ±5px по синусу (см. оригинал).
 *   • Кольцо радиуса детекта появляется когда heat > 0, цвет
 *     зелёный→жёлтый→красный, плюс arc-progress по периметру.
 *   • После выгорания без kill — короткая 0.5-секундная вспышка
 *     расширяющегося красного кольца, потом мина исчезает.
 */
export function createMine(setup: MineSetup, tex: Texture): Enemy {
	const container = new Container();
	container.position.set(setup.x, setup.y);

	const ring = new Graphics();
	container.addChild(ring);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = setup.radius * 2;
	sprite.height = setup.radius * 2;
	sprite.rotation = (setup.r * Math.PI) / 180;
	container.addChild(sprite);

	const startedAtMs = performance.now();
	const rDetect = setup.radius * MINE_DETECT_MULT;
	const rKill = setup.radius;

	const state: MineHeatState = {heat: 0, lastInRangeAtMs: null};
	let deactivated = false;
	let burnedAtMs: number | null = null;
	let lastStepMs = startedAtMs;

	function drawRing(heat: number, nowMs: number): void {
		ring.clear();

		// Burn-out FX: мина потратила заряд, игрока нет — короткая вспышка.
		if (burnedAtMs !== null) {
			const t = (nowMs - burnedAtMs) / 500; // 0.5s анимация
			if (t >= 1) {
				ring.visible = false;
				return;
			}
			const radius = rDetect * (1 + t * 0.5);
			const alpha = 1 - t;
			ring.circle(0, 0, radius).stroke({width: 3, color: 0xff5028, alpha});
			return;
		}

		if (heat <= 0) {
			ring.visible = false;
			return;
		}
		ring.visible = true;

		const color = heatToColor(heat);
		// Прозрачное появление: при heat<0.1 кольцо почти не видно.
		const baseAlpha = Math.min(1, 0.25 + heat * 0.75);
		const lineWidth = 1.5 + heat * 2.5;

		// Тонкий контур по радиусу детекта.
		ring.circle(0, 0, rDetect).stroke({width: lineWidth, color, alpha: baseAlpha});

		// Arc-прогресс «таймер до взрыва». От 12 часов по часовой.
		const startAngle = -Math.PI / 2;
		const endAngle = startAngle + heat * Math.PI * 2;
		ring.arc(0, 0, rDetect + 5, startAngle, endAngle)
			.stroke({width: 3, color, alpha: 1});
	}

	return {
		name: 'mine',
		container,
		getHitPosition: () => ({x: setup.x, y: setup.y}),
		step(player) {
			const nowMs = performance.now();
			const dt = Math.max(0, (nowMs - lastStepMs) / 1000);
			lastStepMs = nowMs;

			// Покачивание ±5px: keyframes {0%: 0, 50%: -5, 100%: 0} ease-in-out.
			// Оригинал из Mine.svelte — translateY на ±5px за 3 сек.
			const t = (nowMs - startedAtMs) / 1000;
			const phase = (t % 3) / 3;
			sprite.position.set(0, -Math.sin(Math.PI * phase) * 5);

			// Уже выгорела (либо после kill, либо после burn-out) — только
			// дорисовываем затухание кольца, в логику больше не вмешиваемся.
			if (deactivated) {
				drawRing(0, nowMs);
				return false;
			}

			const dist = getDistanceBtwPoints(setup, player);
			const inDetect = dist <= rDetect + player.radius;
			const inKill = dist <= rKill + player.radius;

			// Прямое касание — instakill, как раньше. Кольцо/heat не важны.
			if (inKill) {
				sprite.visible = false;
				ring.visible = false;
				deactivated = true;
				return true;
			}

			// Обновляем heat.
			const next = updateHeat(state, dt, inDetect, nowMs, DEFAULT_HEAT_PARAMS);
			state.heat = next.heat;
			state.lastInRangeAtMs = next.lastInRangeAtMs;

			// Триггер взрыва.
			if (state.heat >= 1) {
				deactivated = true;
				sprite.visible = false;
				if (inDetect) {
					// Игрок попал в радиус разлёта — kill, GameWorld нарисует
					// штатный взрыв через `getHitPosition()`.
					ring.visible = false;
					return true;
				}
				// Игрок успел уйти — мина просто выгорает без жертвы.
				burnedAtMs = nowMs;
				drawRing(0, nowMs);
				return false;
			}

			drawRing(state.heat, nowMs);
			return false;
		},
		destroy() { container.destroy({children: true}); },
	};
}
