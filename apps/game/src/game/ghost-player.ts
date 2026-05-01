import {Container, Sprite, type Texture} from 'pixi.js';
import type {GhostEvent, GhostRecording} from '@dead-spin/shared';


/**
 * Призрак — translucent-копия корабля лидера, проигрывает запись Tries.
 * Воспроизведение детерминистично:
 *  - На каждом event'е снимок state'а резко перезаписывает локальное состояние.
 *  - Между event'ами — ballistic: gravity на vx/vy + линейная угловая скорость.
 *
 * Caller вызывает `setTime(t)` каждый кадр с игровым временем (мс),
 * синхронно с `GameWorld.time`. Pause-aware естественно: время не идёт
 * вперёд → ghost замирает.
 *
 * Бустер-вспышка анимируется тем же envelope'ом, что у игрока, но в
 * game-time (не wall-time), поэтому замораживается на pause тоже.
 */


type GhostBody = {x: number; y: number; r: number; vx: number; vy: number; vr: number};


const BOOST_FLAME_MS = 280;


export class GhostPlayer {
	readonly container: Container;
	private sprite: Sprite;
	private booster: Sprite;
	private boosterBaseScaleX: number;
	private boosterBaseScaleY: number;
	private body: GhostBody;
	private events: GhostEvent[];
	private gravity: {x: number; y: number};
	private nextEventIdx = 1;
	private lastTimeMs = 0;
	private lastBoostAt = -1;
	private finished = false;

	constructor(rec: GhostRecording, shipTex: Texture, boosterTex: Texture) {
		if (rec.events.length === 0) throw new Error('GhostPlayer: empty recording');
		const start = rec.events[0]!;
		this.body = {x: start.x, y: start.y, r: start.r, vx: start.vx, vy: start.vy, vr: start.vr};
		this.events = rec.events;
		this.gravity = rec.gravity;

		this.container = new Container();

		// Бустер-пламя (под корпусом). 1:1 с createPlayer: anchor top-center,
		// смещение (-2, 40), baseScale из native-размера текстуры.
		this.booster = new Sprite(boosterTex);
		this.booster.anchor.set(0.5, 0);
		this.booster.x = -2;
		this.booster.y = 40;
		this.boosterBaseScaleX = 27 / (boosterTex.width || 27);
		this.boosterBaseScaleY = 57 / (boosterTex.height || 57);
		this.booster.scale.set(this.boosterBaseScaleX, this.boosterBaseScaleY);
		this.booster.visible = false;
		// Бустер тоже translucent — пусть весь корабль выглядит призрачным,
		// иначе пламя визуально "плотнее" корпуса и режет глаз.
		this.booster.alpha = 0.45;
		this.container.addChild(this.booster);

		this.sprite = new Sprite(shipTex);
		this.sprite.anchor.set(0.5);
		this.sprite.width = 80;
		this.sprite.height = 80;
		this.sprite.alpha = 0.45;
		this.sprite.tint = 0x88aaff;
		this.container.addChild(this.sprite);

		this.applyToSprite();
	}

	/** Установить игровое время. Caller знает this.time из GameWorld. */
	setTime(timeMs: number): void {
		if (this.finished) {
			this.tickBoosterFlame(timeMs);
			return;
		}

		// 1) Применяем все event'ы, у которых time уже наступил.
		while (this.nextEventIdx < this.events.length && this.events[this.nextEventIdx]!.time <= timeMs) {
			const ev = this.events[this.nextEventIdx]!;
			this.body.x = ev.x; this.body.y = ev.y; this.body.r = ev.r;
			this.body.vx = ev.vx; this.body.vy = ev.vy; this.body.vr = ev.vr;
			this.lastTimeMs = ev.time;
			this.nextEventIdx++;

			if (ev.type === 'boost') {
				this.lastBoostAt = ev.time;
			} else if (ev.type === 'win') {
				this.finished = true;
				this.tickBoosterFlame(timeMs);
				this.applyToSprite();
				return;
			} else if (ev.type === 'loose') {
				this.finished = true;
				this.container.visible = false;
				return;
			}
		}

		// 2) Ballistic от lastTimeMs до timeMs.
		const dt = (timeMs - this.lastTimeMs) / 1000;
		if (dt > 0) {
			this.body.r += this.body.vr * dt;
			while (this.body.r < -180) this.body.r += 360;
			while (this.body.r > 180) this.body.r -= 360;
			this.body.vx += this.gravity.x * dt;
			this.body.vy += this.gravity.y * dt;
			this.body.x += this.body.vx * dt;
			this.body.y += this.body.vy * dt;
		}
		this.lastTimeMs = timeMs;

		this.tickBoosterFlame(timeMs);
		this.applyToSprite();
	}

	/** Сбросить призрака к старту записи (на restart уровня). */
	reset(): void {
		const start = this.events[0]!;
		this.body = {x: start.x, y: start.y, r: start.r, vx: start.vx, vy: start.vy, vr: start.vr};
		this.nextEventIdx = 1;
		this.lastTimeMs = 0;
		this.lastBoostAt = -1;
		this.finished = false;
		this.container.visible = true;
		this.booster.visible = false;
		this.applyToSprite();
	}

	destroy(): void {
		this.container.destroy({children: true});
	}

	private applyToSprite(): void {
		this.container.position.set(this.body.x, this.body.y);
		this.container.rotation = (this.body.r * Math.PI) / 180;
	}

	/**
	 * Envelope бустер-пламени (1:1 с GameWorld.tickBoosterFlame), но в
	 * game-time. Скейл текстуры на baseScale, чтобы 27×57px сохранялись.
	 */
	private tickBoosterFlame(timeMs: number): void {
		const elapsed = timeMs - this.lastBoostAt;
		if (this.lastBoostAt < 0 || elapsed >= BOOST_FLAME_MS) {
			this.booster.visible = false;
			return;
		}
		const t = elapsed / BOOST_FLAME_MS;
		let sx: number, sy: number;
		if (t < 0.18) {
			const u = t / 0.18;
			sx = 0.5 + 0.75 * u;
			sy = 0.7 + 0.65 * u;
		} else if (t < 0.55) {
			const u = (t - 0.18) / (0.55 - 0.18);
			sx = 1.25 - 0.25 * u;
			sy = 1.35 - 0.25 * u;
		} else {
			const u = (t - 0.55) / 0.45;
			sx = 1.0 * (1 - u);
			sy = 1.1 * (1 - u * u);
		}
		const flick = Math.sin(elapsed * 0.09) * 0.06 + Math.sin(elapsed * 0.14) * 0.04;
		sx += flick;
		sy += flick * 0.4;
		this.booster.scale.set(this.boosterBaseScaleX * sx, this.boosterBaseScaleY * sy);
		this.booster.visible = true;
	}
}
