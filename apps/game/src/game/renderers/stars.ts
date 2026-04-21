import {Container, Sprite, Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';


export type StarSprite = {
	id: string;
	container: Container;
	sprite: Sprite;
	pos: Point;
	radius: number;
	spawnAt: number;
};


const STAR_SIZE = 35;


/**
 * Спрайт звезды из star.png. Размер подобран под ощущение оригинала
 * (в Game.svelte div 60×60 с background: cover, но видимая звезда в PNG
 * занимает около 75% контейнера — визуально ≈45px).
 */
export function createStar(id: string, pos: Point, tex: Texture): StarSprite {
	const container = new Container();
	container.position.set(pos.x, pos.y);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = STAR_SIZE;
	sprite.height = STAR_SIZE;
	container.addChild(sprite);

	return {id, container, sprite, pos, radius: 20, spawnAt: performance.now()};
}


/**
 * "floatAndScale" — вечная плавная анимация звезды. Повторяет CSS-keyframes
 * из Game.svelte:556-563: Y ±10px, scale 1.0→1.1, rotate −3°…+7°.
 * Используем sin²(π·phase) — это даёт ease-in-out форму без острого пика
 * посередине (треугольная волна выглядит "рваной" на 60 FPS).
 * Первые 500мс поверх накладывается back-out scale-in при появлении.
 */
export function animateStar(star: StarSprite, now: number): void {
	const spawnDur = 500;
	const sinceSpawn = now - star.spawnAt;

	let baseScale = 1;
	if (sinceSpawn < spawnDur) {
		const t = sinceSpawn / spawnDur;
		const overshoot = 1.10158;
		baseScale = 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
	}

	// sin²(π·phase) — плавная волна 0→1→0 без излома посередине.
	const phase = (sinceSpawn % 2000) / 2000;
	const s = Math.sin(Math.PI * phase);
	const smooth = s * s;

	const yOffset = -10 * smooth;
	const scale = baseScale * (1 + 0.1 * smooth);
	const rotDeg = -3 + 10 * smooth;

	star.sprite.position.set(0, yOffset);
	star.sprite.scale.set(scale);
	star.sprite.rotation = (rotDeg * Math.PI) / 180;
}


// Старое имя — reexport для обратной совместимости в GameWorld.
export const animateStarSpawn = animateStar;
