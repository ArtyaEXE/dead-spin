import {Container, Graphics, type Texture, TilingSprite} from 'pixi.js';
import type {Level, Point} from '@dead-spin/shared';

export type WallsLayer = {
	container: Container;
	/** cave2-тайл внутри каверны — у него сдвигаем tilePosition ради параллакса. */
	innerCave: TilingSprite;
};

/**
 * Рендер стен — повторяет логику space/imports/ui/game/Canvas.svelte:
 *
 *  1) Снаружи замкнутого полигона: тайлированная cave1.jpg (скала-внешность).
 *  2) Внутри полигона: cave2.jpg параллаксный тайл (виден через polygon-mask).
 *  3) Контур стены: тёмная линия + мягкий внешний светлый "rim".
 *
 * В PixiJS v8 `cut()` неустойчиво работает с texture-fill-ом (в 8.5),
 * поэтому используем надёжную схему из двух слоёв:
 *   - cave1 TilingSprite (сплошной фон)
 *   - cave2 TilingSprite сверху, маскируется Graphics-полигоном →
 *     показывается только внутри каверны.
 */
export function createWallsLayer(level: Level, cave1: Texture, cave2: Texture): WallsLayer {
	const container = new Container();
	const pad = 500;
	const w = level.res.x + pad * 2;
	const h = level.res.y + pad * 2;

	// 1) Внешняя порода — передний план, стены. Фильтр насыщенности отсюда
	// убран: плитки генерируются сразу в допуске слоя мира (DESIGN.md §4),
	// подкручивать их на лету больше не нужно, и это минус один проход
	// постобработки на кадр.
	const outerCave = new TilingSprite({texture: cave1, width: w, height: h});
	outerCave.position.set(-pad, -pad);
	container.addChild(outerCave);

	// 2) Задник пещеры поверх породы, маскируется полигоном. Tint убран:
	// плитка задника генерируется уже приглушённой (dim 0.5 в gen-cave.mjs),
	// поэтому глубина заложена в сам ассет, а не докручивается в рантайме.
	const innerCave = new TilingSprite({texture: cave2, width: w, height: h});
	innerCave.position.set(-pad, -pad);
	innerCave.tileTransform.scale.set(0.8, 0.8);

	const polyMask = new Graphics();
	for (const polygon of level.walls) {
		if (polygon.length < 3) continue;
		polyPath(polyMask, polygon);
	}
	polyMask.fill({color: 0xffffff});
	innerCave.mask = polyMask;
	container.addChild(innerCave);
	container.addChild(polyMask);

	// 3) Тёмная линия стены
	const stroke = new Graphics();
	for (const polygon of level.walls) {
		if (polygon.length < 2) continue;
		polyPath(stroke, polygon);
	}
	// Контур пера по кромке стены: тот же закон, что у остальных ассетов.
	stroke.stroke({color: 0x14110e, width: 3, cap: 'round', join: 'round'});
	container.addChild(stroke);

	// 4) Внешний "rim" со сдвигом по нормали наружу на 2px
	const rim = new Graphics();
	for (const polygon of level.walls) {
		if (polygon.length < 2) continue;
		rimPath(rim, polygon);
	}
	rim.stroke({color: 0x3a322a, width: 2, cap: 'round', join: 'round'});
	container.addChild(rim);

	return {container, innerCave};
}

function polyPath(g: Graphics, polygon: readonly Point[]): void {
	g.moveTo(polygon[0]!.x, polygon[0]!.y);
	for (let i = 1; i < polygon.length; i++) g.lineTo(polygon[i]!.x, polygon[i]!.y);
	g.closePath();
}

function rimPath(g: Graphics, polygon: readonly Point[]): void {
	for (let i = 0; i < polygon.length; i++) {
		const p1 = polygon[i]!;
		const p2 = polygon[(i + 1) % polygon.length]!;
		const dx = p2.x - p1.x;
		const dy = p2.y - p1.y;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		const ox = -nx * 2;
		const oy = -ny * 2;
		g.moveTo(p1.x + ox, p1.y + oy);
		g.lineTo(p2.x + ox, p2.y + oy);
	}
}
