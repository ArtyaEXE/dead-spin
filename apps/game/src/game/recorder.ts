import type {Body} from '@dead-spin/engine';
import type {GhostRecording, GhostEvent, GhostEventType} from '@dead-spin/shared';


/**
 * Recorder — фиксирует ключевые события прохождения для последующего
 * воспроизведения как ghost в групповом контексте. Порт `Tries.js` из
 * Meteor-исходника на TypeScript.
 *
 * Снимок берётся ТОЛЬКО на ключевых событиях (start/boost/loose/win),
 * не покадрово. Между ними плеер-призрак движется детерминированно
 * (gravity + linear vr) — поэтому ~10–30 событий за прохождение
 * достаточно для гладкого replay'а, и одна запись весит ~1 КБ.
 */


export class Recorder {
	private events: GhostEvent[] = [];
	private readonly level: number;
	private readonly gravity: {x: number; y: number};

	constructor(args: {level: number; gravity: {x: number; y: number}}) {
		this.level = args.level;
		this.gravity = args.gravity;
	}

	add(type: GhostEventType, time: number, p: Body): void {
		this.events.push({
			type, time,
			x: p.x, y: p.y, r: p.r,
			vx: p.vx, vy: p.vy, vr: p.vr,
		});
	}

	/**
	 * Запись финализирована — годится только если есть start и
	 * win-замыкание. Loose-записи не отдаём (ghost проигравшего никому
	 * не нужен).
	 */
	finalize(): GhostRecording | null {
		if (this.events.length < 2) return null;
		const last = this.events[this.events.length - 1]!;
		if (last.type !== 'win') return null;
		return {
			level: this.level,
			gravity: this.gravity,
			events: this.events,
		};
	}
}
