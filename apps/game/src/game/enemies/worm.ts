import {Sprite, Container, type Texture} from 'pixi.js';
import {
	Physics, createClosedBSpline, initSplineMovement, updateSplineMovement,
	getDistanceBtwPoints, type Body, type SplineState,
} from '@dead-spin/engine';
import type {Enemy} from './types';
import type {SmokeSystem} from '../effects/smokes';
import {audio, type LoopHandle} from '../audio';


type WormSetup = {seed: string; x: number; y: number};


const SEGMENT_COUNT = 5;
const SEGMENT_SIZE = 80;
const RADIUS = 35;
const INTERVAL = 60; // расстояние между сегментами по сплайну


type Segment = {
	sprite: Sprite;
	state: SplineState;
	pos: Body;
	lr: number;  // local rotation (качается)
	tlr: number; // target local rotation
	lrt: number; // local rotation phase
	lrr: number; // local rotation range
};


/**
 * "Червяк" — цепочка из 5 сегментов, движущихся по замкнутому B-сплайну.
 * Путь строится детерминировано из seed (одинаковый для всех рендеров
 * одного и того же врага). Каждый сегмент ещё слегка покачивается
 * относительно направления спланной касательной (localRotation).
 *
 * Логика 1:1 с [Worm.svelte](space/imports/ui/enemy/worm/Worm.svelte):274 строк.
 */
export function createWorm(
	setup: WormSetup,
	levelW: number,
	levelH: number,
	textures: {worm1: Texture; worm2: Texture; worm3: Texture},
	smokes: SmokeSystem,
	speedMult: number = 1,
): Enemy {
	const container = new Container();
	const speed = 100 * speedMult;

	const path = generatePath(setup.seed, levelW, levelH);
	const splinePoints = createClosedBSpline(path, 50);

	const segments: Segment[] = [];
	for (let i = 4; i >= 0; i--) {
		// i=0 — хвост (s3), i=4 — голова (s1). В оригинале SS[0] — голова.
		// Тут индексация обратная: i=4 — голова (создаётся первой),
		// поэтому texture = worm1 (голова).
		const tex = i === 4 ? textures.worm1 : i === 0 ? textures.worm3 : textures.worm2;

		const lrr = i === 0 || i === 4 ? 7.5 : 15;
		const sprite = new Sprite(tex);
		sprite.anchor.set(0.5);
		sprite.width = SEGMENT_SIZE;
		sprite.height = SEGMENT_SIZE;
		container.addChild(sprite);

		segments.push({
			sprite,
			state: initSplineMovement(splinePoints, speed, INTERVAL * (4 - i)),
			pos: {x: 0, y: 0, r: 0, vx: 0, vy: 0, vr: 0, radius: RADIUS, speed: 0},
			lr: i % 2 ? lrr : -lrr,
			tlr: i % 2 ? -lrr : lrr,
			lrt: 0.05 * i,
			lrr,
		});
	}
	// В оригинале центральный сегмент (index 2) используется для расстояния до игрока.
	const centerIndex = Math.floor(SEGMENT_COUNT / 2);
	const maxDistanceCheck = INTERVAL * (SEGMENT_COUNT / 2) + RADIUS;

	const wormSound: LoopHandle | null = audio.loop('worm');
	let smokeTime = 0;
	let runSmokes = false;

	return {
		name: 'worm',
		container,
		step(player, _chunks, dt) {
			for (const seg of segments) {
				const mov = updateSplineMovement(seg.state, dt);
				seg.pos.x = mov.x;
				seg.pos.y = mov.y;
				seg.pos.r = mov.r;
				updateLocalRotation(seg, dt);

				seg.sprite.position.set(mov.x, mov.y);
				seg.sprite.rotation = ((mov.r + seg.lr) * Math.PI) / 180;
			}

			const center = segments[centerIndex]!.pos;
			const distance = getDistanceBtwPoints(center, player);
			runSmokes = distance < 500;

			if (runSmokes) {
				smokeTime += dt;
				if (smokeTime > 1) {
					smokeTime = 0;
					const tail = segments[4]!.pos;
					smokes.add(tail, 120, 3000);
				}
			}

			// Громкость пропорциональна близости
			const volume =
				distance < maxDistanceCheck ? 0.6 :
				distance > maxDistanceCheck * 5 ? 0 :
				0.6 * (1 - (distance - maxDistanceCheck) / (maxDistanceCheck * 4));
			wormSound?.setVolume(volume);

			if (distance > maxDistanceCheck) return false;

			for (const seg of segments) {
				if (Physics.resolveCollision(seg.pos, player)) return true;
			}
			return false;
		},
		destroy() {
			wormSound?.stop();
			container.destroy({children: true});
		},
	};
}


function updateLocalRotation(seg: Segment, dt: number): void {
	const from = seg.tlr > 0 ? -seg.lrr : seg.lrr;
	seg.lrt += dt;

	const res = quadraticInterpolation(from, seg.tlr, seg.lrt, 0.35);
	seg.lr = res.value;

	if (res.reached) {
		seg.lrt = 0;
		seg.tlr = from;
	}
}


function quadraticInterpolation(
	from: number, to: number, t: number, duration: number,
): {value: number; reached: boolean} {
	const ratio = Math.min(1, t / duration);
	const eased = 1 - (1 - ratio) * (1 - ratio);
	return {value: from + (to - from) * eased, reached: ratio >= 1};
}


/**
 * Генерирует детерминированный путь червяка из seed — простой hash-based
 * rand range (поведение оригинала без keccak256 — нам не нужна криптография).
 */
function generatePath(seed: string, levelW: number, levelH: number): {x: number; y: number}[] {
	const count = Math.round((levelW + levelH) / 300);
	const minDist = Math.min(levelW, levelH) * 0.3;
	const points: {x: number; y: number}[] = [];

	let cursor = 0;
	const rand = (max: number): number => {
		cursor++;
		let h = 2166136261;
		const s = `${seed}_${cursor}`;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return (h >>> 0) / 0xffffffff * max;
	};

	let tries = 0;
	while (points.length < count && tries < 100) {
		tries++;
		const p = {
			x: 50 + rand(levelW - 100),
			y: 50 + rand(levelH - 100),
		};
		let ok = true;
		for (const q of points) {
			if (getDistanceBtwPoints(p, q) < minDist) {ok = false; break;}
		}
		if (ok) points.push(p);
	}

	// Fallback: если слишком мало точек, добавляем произвольные
	while (points.length < 4) {
		points.push({x: levelW / 2 + rand(levelW / 4), y: levelH / 2 + rand(levelH / 4)});
	}
	return points;
}
