import type {Container} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


/**
 * Простая камера: держит целевую точку в центре viewport.
 * Дальше добавим damping и clamp по границам уровня — пока вариант-lock.
 */
export class Camera {
	constructor(
		private stage: Container,
		private viewportWidth: number,
		private viewportHeight: number,
	) {}

	setViewport(w: number, h: number): void {
		this.viewportWidth = w;
		this.viewportHeight = h;
	}

	follow(target: Point, zoom: number = 1): void {
		this.stage.scale.set(zoom);
		this.stage.position.set(
			this.viewportWidth / 2 - target.x * zoom,
			this.viewportHeight / 2 - target.y * zoom,
		);
	}
}
