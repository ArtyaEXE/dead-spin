import {Container, Sprite, type Texture} from 'pixi.js';
import type {Point} from '@dead-spin/shared';

export type StarSprite = {
	id: string;
	container: Container;
	sprite: Sprite;
	/** Световое пятно под звездой; вспыхивает при подборе. */
	glow: Sprite;
	pos: Point;
	radius: number;
	spawnAt: number;
	baseScale: number;
	/** Момент подбора. null — звезда ещё на месте. */
	collectedAt: number | null;
};

/** Длительность вспышки подбора. Эмиля ради: награда — редкое событие,
 *  ему разрешено занимать больше 300 мс, в отличие от интерфейса. */
const COLLECT_MS = 420;

// Чуть меньше корабля (80px) — ~55px визуально.
const STAR_SIZE = 55;

/**
 * Спрайт звезды из star.png. `baseScale` считается один раз из native-размера
 * текстуры, чтобы анимация scale в animateStar не затирала физический размер.
 */
export function createStar(id: string, pos: Point, tex: Texture, glowTex: Texture): StarSprite {
	const container = new Container();
	container.position.set(pos.x, pos.y);

	// Звезда тоже несёт свет — иначе на тёмном фоне её видно только когда
	// она уже в кадре, а собирать их надо планируя маршрут заранее.
	const glow = new Sprite(glowTex);
	glow.anchor.set(0.5);
	glow.width = 190;
	glow.height = 190;
	glow.blendMode = 'add';
	glow.alpha = 0.34;
	container.addChild(glow);

	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	const baseScale = STAR_SIZE / (tex.width || STAR_SIZE);
	sprite.scale.set(baseScale);
	container.addChild(sprite);

	return {id, container, sprite, glow, pos, radius: 20, spawnAt: performance.now(), baseScale, collectedAt: null};
}

/**
 * Подбор. Звезда не исчезает мгновенно: она разворачивается и гаснет, а
 * световое пятно под ней вспыхивает. Это единственная награда, которую игра
 * выдаёт по ходу уровня, и она стоила игроку осознанного крюка с маршрута
 * (GDD §8.3) — мгновенное исчезновение обесценивает решение, которое он
 * только что принял.
 */
export function collectStar(star: StarSprite, now: number): void {
	if (star.collectedAt === null) star.collectedAt = now;
}

/** true, когда вспышка догорела и контейнер можно скрыть. */
export function isCollectDone(star: StarSprite, now: number): boolean {
	return star.collectedAt !== null && now - star.collectedAt >= COLLECT_MS;
}

/**
 * "floatAndScale" — вечная плавная анимация звезды. Повторяет CSS-keyframes
 * из Game.svelte:556-563: Y ±10px, scale 1.0→1.1, rotate −3°…+7°.
 * Используем sin²(π·phase) — это даёт ease-in-out форму без острого пика
 * посередине (треугольная волна выглядит "рваной" на 60 FPS).
 * Первые 500мс поверх накладывается back-out scale-in при появлении.
 */
export function animateStar(star: StarSprite, now: number): void {
	if (star.collectedAt !== null) {
		const t = Math.min(1, (now - star.collectedAt) / COLLECT_MS);
		// Экспоненциальный выход: быстрый старт, мягкая посадка. Именно на
		// первые миллисекунды смотрит игрок, и они должны быть резкими.
		const e = 1 - (1 - t) ** 3;
		star.sprite.scale.set(star.baseScale * (1 + e * 0.9));
		star.sprite.rotation = e * 0.5;
		star.sprite.position.set(0, -34 * e);
		star.sprite.alpha = 1 - e;
		// Свет вспыхивает и гаснет позже звезды: послесвечение держит момент.
		const flare = t < 0.28 ? t / 0.28 : 1 - (t - 0.28) / 0.72;
		star.glow.alpha = 0.34 + flare * 0.62;
		star.glow.scale.set((1 + e * 0.55) * (190 / (star.glow.texture.width || 190)));
		return;
	}

	const spawnDur = 500;
	const sinceSpawn = now - star.spawnAt;

	let baseScale = 1;
	if (sinceSpawn < spawnDur) {
		const t = sinceSpawn / spawnDur;
		const overshoot = 1.10158;
		baseScale = 1 + (overshoot + 1) * (t - 1) ** 3 + overshoot * (t - 1) ** 2;
	}

	// sin²(π·phase) — плавная волна 0→1→0 без излома посередине.
	const phase = (sinceSpawn % 2000) / 2000;
	const s = Math.sin(Math.PI * phase);
	const smooth = s * s;

	const yOffset = -10 * smooth;
	const scale = baseScale * (1 + 0.1 * smooth);
	const rotDeg = -3 + 10 * smooth;

	star.sprite.position.set(0, yOffset);
	star.sprite.scale.set(star.baseScale * scale);
	star.sprite.rotation = (rotDeg * Math.PI) / 180;
}

// Старое имя — reexport для обратной совместимости в GameWorld.
export const animateStarSpawn = animateStar;
