import {Sprite, type Texture, Container} from 'pixi.js';
import {Physics, getNearStrokesByPoint, getDistanceBtwPoints, type Body, type ChunkMap} from '@dead-spin/engine';
import type {Enemy} from './types';
import type {SmokeSystem} from '../effects/smokes';
import {audio} from '../audio';

type StoneSetup = {x: number; y: number; r: number; radius: number; speed: number};

/**
 * "Камень" — движется по прямой, отражается от стен (упругий отскок
 * вдоль нормали отрезка стены), вращается. Логика 1:1 с [Stone.svelte](space/imports/ui/enemy/stone/Stone.svelte).
 */
export function createStone(setup: StoneSetup, tex: Texture, smokes: SmokeSystem, speedMult: number = 1): Enemy {
	const container = new Container();
	const sprite = new Sprite(tex);
	sprite.anchor.set(0.5);
	sprite.width = setup.radius * 2;
	sprite.height = setup.radius * 2;
	container.addChild(sprite);

	const state: Body = {
		x: setup.x,
		y: setup.y,
		r: setup.r,
		vx: 0,
		vy: 0,
		vr: randRange(-90, 90),
		radius: setup.radius,
		speed: 0,
	};
	Physics.applyForce(state, setup.speed * speedMult);

	let runSmokes = false;

	return {
		name: 'stone',
		container,
		body: state, // экспонируем для stone-stone collision в GameWorld
		// Камень — твёрдая масса, никакого взрыва не даёт. getHitPosition
		// намеренно не определён, GameWorld пропускает дополнительный explosion
		// для этого врага; игрок всё равно взрывается об него (как об стену).
		step(player, chunks, dt) {
			state.r += state.vr * dt;
			const collided = moveAndReflect(state, chunks, dt, smokes, runSmokes);

			const distance = getDistanceBtwPoints(state, player);
			runSmokes = distance < 500;

			if (collided) {
				const volume = distance < 200 ? 0.6 : distance > 700 ? 0 : 0.6 * (1 - (distance - 200) / 500);
				if (volume > 0) audio.play('stone-impact', volume);
			}

			sprite.position.set(state.x, state.y);
			sprite.rotation = (state.r * Math.PI) / 180;

			return distance <= state.radius + player.radius;
		},
		destroy() {
			container.destroy({children: true});
		},
	};
}

/** Шаг stone-а: попытка движения; при пересечении со стеной — упругое отражение. */
function moveAndReflect(stone: Body, chunks: ChunkMap, dt: number, smokes: SmokeSystem, runSmokes: boolean): boolean {
	const strokes = getNearStrokesByPoint(chunks, stone);
	const nextX = stone.x + stone.vx * dt;
	const nextY = stone.y + stone.vy * dt;
	let collision = false;

	for (const {s, e} of strokes) {
		const wdx = e.x - s.x;
		const wdy = e.y - s.y;
		const wLen = Math.hypot(wdx, wdy);
		if (wLen === 0) continue;
		const wNx = wdx / wLen;
		const wNy = wdy / wLen;

		// Ближайшая точка отрезка к центру камня
		const toStartX = stone.x - s.x;
		const toStartY = stone.y - s.y;
		const projection = toStartX * wNx + toStartY * wNy;
		let cx: number;
		let cy: number;
		if (projection < 0) {
			cx = s.x;
			cy = s.y;
		} else if (projection > wLen) {
			cx = e.x;
			cy = e.y;
		} else {
			cx = s.x + projection * wNx;
			cy = s.y + projection * wNy;
		}

		const dx = stone.x - cx;
		const dy = stone.y - cy;
		const dist = Math.hypot(dx, dy);
		if (dist > stone.radius) continue;

		// Коллизия
		const tcLen = dist;
		if (tcLen === 0) continue;
		const nx = dx / tcLen;
		const ny = dy / tcLen;

		// Отражение, только если камень летит В стену
		const dot = stone.vx * nx + stone.vy * ny;
		if (dot > 0) continue;

		stone.vx -= 2 * dot * nx;
		stone.vy -= 2 * dot * ny;

		const overlap = stone.radius - dist;
		stone.x += overlap * nx;
		stone.y += overlap * ny;

		collision = true;
		stone.vr = randRange(-90, 90);

		if (runSmokes) smokes.add({x: cx, y: cy}, 70, 1500);
	}

	if (!collision) {
		stone.x = nextX;
		stone.y = nextY;
	}
	return collision;
}

function randRange(min: number, max: number): number {
	return min + Math.random() * (max - min);
}
