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
 */


type GhostBody = {x: number; y: number; r: number; vx: number; vy: number; vr: number};


export class GhostPlayer {
	readonly container: Container;
	private sprite: Sprite;
	private body: GhostBody;
	private events: GhostEvent[];
	private gravity: {x: number; y: number};
	private nextEventIdx = 1;
	private lastTimeMs = 0;
	private finished = false;

	constructor(rec: GhostRecording, shipTex: Texture) {
		if (rec.events.length === 0) throw new Error('GhostPlayer: empty recording');
		const start = rec.events[0]!;
		this.body = {x: start.x, y: start.y, r: start.r, vx: start.vx, vy: start.vy, vr: start.vr};
		this.events = rec.events;
		this.gravity = rec.gravity;

		this.container = new Container();
		this.sprite = new Sprite(shipTex);
		this.sprite.anchor.set(0.5);
		this.sprite.width = 80;
		this.sprite.height = 80;
		// Полупрозрачный + лёгкий холодный tint — чтобы было видно что это
		// "не настоящий" корабль и не сливался с твоим в момент пересечения.
		this.sprite.alpha = 0.45;
		this.sprite.tint = 0x88aaff;
		this.container.addChild(this.sprite);
		this.applyToSprite();
	}

	/** Установить игровое время. Caller знает this.time из GameWorld. */
	setTime(timeMs: number): void {
		if (this.finished) return;

		// 1) Применяем все event'ы, у которых time уже наступил.
		while (this.nextEventIdx < this.events.length && this.events[this.nextEventIdx]!.time <= timeMs) {
			const ev = this.events[this.nextEventIdx]!;
			this.body.x = ev.x; this.body.y = ev.y; this.body.r = ev.r;
			this.body.vx = ev.vx; this.body.vy = ev.vy; this.body.vr = ev.vr;
			this.lastTimeMs = ev.time;
			this.nextEventIdx++;

			if (ev.type === 'win') {
				this.finished = true;
				this.applyToSprite();
				return;
			}
			if (ev.type === 'loose') {
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
		this.applyToSprite();
	}

	/** Сбросить призрака к старту записи (на restart уровня). */
	reset(): void {
		const start = this.events[0]!;
		this.body = {x: start.x, y: start.y, r: start.r, vx: start.vx, vy: start.vy, vr: start.vr};
		this.nextEventIdx = 1;
		this.lastTimeMs = 0;
		this.finished = false;
		this.container.visible = true;
		this.applyToSprite();
	}

	destroy(): void {
		this.container.destroy({children: true});
	}

	private applyToSprite(): void {
		this.container.position.set(this.body.x, this.body.y);
		this.container.rotation = (this.body.r * Math.PI) / 180;
	}
}
