import {Sprite, Texture, Container} from 'pixi.js';
import {
	getDistanceBtwPoints,
	updateHeat,
	heatToTint,
	MINE_DETECT_MULT,
	MINE_SWELL,
	MINE_SHAKE_AMP,
	DEFAULT_HEAT_PARAMS,
	type MineHeatState,
} from '@dead-spin/engine';
import type {Enemy} from './types';


type MineSetup = {x: number; y: number; r: number; radius: number};


/**
 * Мина с магнитным взрывателем. Старая «инстакилл на касание» осталась
 * как один из двух способов погибнуть; новый — heat-механика:
 *
 *   • r_kill   = radius                  — прямое касание убивает мгновенно
 *   • r_detect = radius × MINE_DETECT_MULT — магнитный детектор
 *
 * Пока игрок в r_detect, heat ∈ [0..1] растёт. При heat ≥ 1 мина
 * взрывается; если игрок ещё в r_detect — kill, иначе мина «выгорает»
 * без жертвы (одноразовая). Подробнее — `@dead-spin/engine/mine-heat.ts`.
 *
 * Визуал — без UI-элементов, всё через сам спрайт:
 *   • idle: лёгкое покачивание ±5px по синусу (наследие Mine.svelte).
 *   • heat растёт → спрайт надувается (scale до MINE_SWELL), тинт уходит
 *     от белого к красному (heatToTint), добавляется случайная тряска
 *     амплитудой до MINE_SHAKE_AMP.
 *   • Burn-out (heat=1, игрока нет): быстрый «вздулась-лопнула» pop —
 *     scale до 1.7 + fade alpha за 350 ms, потом скрытие.
 *
 * Игрок не видит технических колец и шкал, ориентируется на органическую
 * реакцию объекта: тряска и краснение = «отойди», pop = «опоздал, повезло».
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

	// Базовые размеры — от них пляшут scale в step.
	const baseW = sprite.width;
	const baseH = sprite.height;

	const startedAtMs = performance.now();
	const rDetect = setup.radius * MINE_DETECT_MULT;
	const rKill = setup.radius;

	const state: MineHeatState = {heat: 0, lastInRangeAtMs: null};
	let deactivated = false;
	let burnedAtMs: number | null = null;
	let lastStepMs = startedAtMs;

	const BURN_MS = 350;

	function applyBurnoutFx(nowMs: number): boolean {
		// Возвращает true когда анимация догорела и спрайт уже не нужно
		// рисовать (caller тогда может выйти из step раньше).
		if (burnedAtMs === null) return false;
		const t = (nowMs - burnedAtMs) / BURN_MS;
		if (t >= 1) {
			sprite.visible = false;
			return true;
		}
		// «Вздулась-лопнула»: scale 1.3 → 1.7, alpha 1 → 0, лёгкое
		// случайное вращение поверх исходного, чтобы выглядело «рвано».
		const s = 1.3 + t * 0.4;
		sprite.width = baseW * s;
		sprite.height = baseH * s;
		sprite.alpha = 1 - t;
		return false;
	}

	function applyHeatFx(heat: number, nowMs: number): void {
		// Scale: 1.0 → 1+SWELL. Тинт: white → red. Тряска: 0 → SHAKE_AMP.
		const s = 1 + MINE_SWELL * heat;
		sprite.width = baseW * s;
		sprite.height = baseH * s;
		sprite.tint = heatToTint(heat);

		// Базовое покачивание (как раньше) + добавочная тряска от heat.
		const t = (nowMs - startedAtMs) / 1000;
		const phase = (t % 3) / 3;
		const idleY = -Math.sin(Math.PI * phase) * 5;

		if (heat > 0) {
			// Чем выше heat — тем чаще «дёрганость». Используем sin от
			// большой частоты + псевдо-noise через addition of harmonics.
			const freq = 40 + heat * 30;
			const shakeX = Math.sin(t * freq) * MINE_SHAKE_AMP * heat;
			const shakeY = Math.cos(t * freq * 1.3) * MINE_SHAKE_AMP * heat;
			sprite.position.set(shakeX, idleY + shakeY);
		} else {
			sprite.position.set(0, idleY);
		}
	}

	return {
		name: 'mine',
		container,
		getHitPosition: () => ({x: setup.x, y: setup.y}),
		step(player) {
			const nowMs = performance.now();
			const dt = Math.max(0, (nowMs - lastStepMs) / 1000);
			lastStepMs = nowMs;

			if (deactivated) {
				applyBurnoutFx(nowMs);
				return false;
			}

			const dist = getDistanceBtwPoints(setup, player);
			const inDetect = dist <= rDetect + player.radius;
			const inKill = dist <= rKill + player.radius;

			// Прямое касание — instakill, как раньше. Скрываем спрайт сразу,
			// GameWorld нарисует штатный взрыв через `getHitPosition()`.
			if (inKill) {
				sprite.visible = false;
				deactivated = true;
				return true;
			}

			const next = updateHeat(state, dt, inDetect, nowMs, DEFAULT_HEAT_PARAMS);
			state.heat = next.heat;
			state.lastInRangeAtMs = next.lastInRangeAtMs;

			if (state.heat >= 1) {
				deactivated = true;
				if (inDetect) {
					// Поймали — kill, штатный взрыв.
					sprite.visible = false;
					return true;
				}
				// Игрок сбежал — pop без жертвы. Анимация догорит в
				// следующих кадрах через applyBurnoutFx.
				burnedAtMs = nowMs;
				return false;
			}

			applyHeatFx(state.heat, nowMs);
			return false;
		},
		destroy() { container.destroy({children: true}); },
	};
}
