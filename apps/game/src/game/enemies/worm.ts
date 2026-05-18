import {Sprite, Container, type Texture} from 'pixi.js';
import {
	Physics, createClosedBSpline, initSplineMovement, updateSplineMovement,
	getDistanceBtwPoints, type Body, type SplineState,
} from '@dead-spin/engine';
import type {Point} from '@dead-spin/shared';
import type {Enemy} from './types';
import type {SmokeSystem} from '../effects/smokes';
import {audio, type LoopHandle} from '../audio';


type WormSetup = {seed: string; x: number; y: number};


/** Амплитуда seed-зависимого «дрожания» waypoints, px. */
const JITTER = 110;
/** Сколько случайных промежуточных точек добавлять между waypoints для непредсказуемости. */
const EXTRA_RANDOM_POINTS = 2;


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
 *
 * Путь червя ВСЕГДА проходит через ключевые точки уровня
 * (start → star1 → star2 → star3 → finish) с seed-зависимым jitter ~110 px
 * + 2 случайные промежуточные точки. Это значит червь физически
 * патрулирует маршрут игрока, а не «случайный угол» — раньше путь был
 * раскидан по всему levelW×levelH из чистого хеша seed'а, и при «плохом»
 * сиде звук червя слышался, но визуально он гулял в недосягаемом углу.
 *
 * Спавн-сдвиг (`safeFromPlayer`) теперь работает не как «спрятать червя»,
 * а как «timing-offset»: голова стартует в дальней точке маршрута, и пока
 * игрок продвигается через звёзды — червь сближается с ним по тому же
 * сплайну, перехватывая в неудобный момент (узкий коридор у star2 или
 * непосредственно перед финишем — зависит от уровня).
 *
 * Каждый сегмент ещё слегка покачивается относительно направления
 * сплайной касательной (localRotation).
 *
 * Логика 1:1 с [Worm.svelte](space/imports/ui/enemy/worm/Worm.svelte):274
 * строк, кроме path-генератора — он переписан с учётом waypoints.
 */
export function createWorm(
	setup: WormSetup,
	levelW: number,
	levelH: number,
	textures: {worm1: Texture; worm2: Texture; worm3: Texture},
	smokes: SmokeSystem,
	speedMult: number = 1,
	safeFromPlayer?: {x: number; y: number},
	routeWaypoints?: readonly Point[],
): Enemy {
	const container = new Container();
	const speed = 100 * speedMult;

	const path = generatePath(setup.seed, levelW, levelH, routeWaypoints ?? []);
	const splinePoints = createClosedBSpline(path, 50);

	// Спавн-сдвиг: ищем offset по замкнутому сплайну такой, чтобы голова червяка
	// на t=0 была максимально далеко от игрока. Иначе при "плохом" сиде червяк
	// появляется прямо перед носом корабля.
	let spawnShift = 0;
	if (safeFromPlayer) {
		// Оценим общую длину сплайна примерно
		let splineLen = 0;
		for (let i = 1; i < splinePoints.length; i++) {
			splineLen += Math.hypot(splinePoints[i]!.x - splinePoints[i - 1]!.x, splinePoints[i]!.y - splinePoints[i - 1]!.y);
		}
		let best = 0, bestD = 0;
		for (let k = 0; k < 20; k++) {
			const off = (splineLen * k) / 20;
			// Наивно: берём точку сплайна на дистанции off
			let acc = 0;
			for (let i = 1; i < splinePoints.length; i++) {
				const seg = Math.hypot(splinePoints[i]!.x - splinePoints[i - 1]!.x, splinePoints[i]!.y - splinePoints[i - 1]!.y);
				if (acc + seg >= off) {
					const t = (off - acc) / seg;
					const hx = splinePoints[i - 1]!.x + (splinePoints[i]!.x - splinePoints[i - 1]!.x) * t;
					const hy = splinePoints[i - 1]!.y + (splinePoints[i]!.y - splinePoints[i - 1]!.y) * t;
					const d = Math.hypot(hx - safeFromPlayer.x, hy - safeFromPlayer.y);
					if (d > bestD) { bestD = d; best = off; }
					break;
				}
				acc += seg;
			}
		}
		spawnShift = best;
	}

	const segments: Segment[] = [];
	for (let i = 4; i >= 0; i--) {
		// 1:1 с Worm.svelte:106-113: i=0 → s1 (голова), i=4 → s3 (хвост),
		// остальные — s2 (тело). Голова получает наибольший initialDistance
		// по сплайну (4-i=4), то есть идёт впереди цепочки; хвост плетётся
		// сзади (initialDistance=0).
		const tex = i === 0 ? textures.worm1 : i === 4 ? textures.worm3 : textures.worm2;

		const lrr = i === 0 || i === 4 ? 7.5 : 15;
		const sprite = new Sprite(tex);
		sprite.anchor.set(0.5);
		sprite.width = SEGMENT_SIZE;
		sprite.height = SEGMENT_SIZE;
		container.addChild(sprite);

		segments.push({
			sprite,
			state: initSplineMovement(splinePoints, speed, INTERVAL * (4 - i) + spawnShift),
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
					// 1:1 с оригиналом (Worm.svelte:173): дым эмитится от segments[4] —
					// последнего элемента массива. Push-порядок i=4..0 означает
					// что segments[4] = i=0 = голова, то есть дым идёт ЗА головой.
					const head = segments[4]!.pos;
					smokes.add(head, 120, 3000);
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
 * Детерминированный путь червяка вокруг маршрута игрока.
 *
 * Берём waypoints (start, stars, finish), дёргаем каждую seed-зависимым
 * jitter'ом (±JITTER px), добавляем 2 промежуточные random-точки между
 * соседними waypoints — получаем замкнутый сплайн, который физически
 * проходит через все «полезные» места уровня. Игрок и червь движутся
 * по одной и той же ленте; вопрос только в том, кто и когда оказывается
 * в данной её точке (timing решает `safeFromPlayer`-сдвиг в caller'е).
 *
 * Fallback: если waypoints не переданы или их меньше 2 (старый код,
 * тесты) — возвращаемся к прежнему «случайно по уровню» поведению,
 * чтобы ничего не сломать.
 */
function generatePath(
	seed: string,
	levelW: number,
	levelH: number,
	waypoints: readonly Point[],
): {x: number; y: number}[] {
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

	const clampX = (x: number): number => Math.max(50, Math.min(levelW - 50, x));
	const clampY = (y: number): number => Math.max(50, Math.min(levelH - 50, y));

	if (waypoints.length >= 2) {
		const out: {x: number; y: number}[] = [];
		for (let i = 0; i < waypoints.length; i++) {
			const wp = waypoints[i]!;
			out.push({
				x: clampX(wp.x + rand(JITTER * 2) - JITTER),
				y: clampY(wp.y + rand(JITTER * 2) - JITTER),
			});
		}
		// Промежуточные точки между парами соседних waypoints — без них
		// сплайн получается «слишком ровным» по маршруту игрока, и червь
		// предсказуемо ползёт вдоль; с jitter-вставками появляются заходы
		// в стороны / срезы / непредсказуемые петли.
		for (let i = 0; i < EXTRA_RANDOM_POINTS; i++) {
			out.push({x: 80 + rand(levelW - 160), y: 80 + rand(levelH - 160)});
		}
		return out;
	}

	// Legacy fallback: чисто случайно по уровню.
	const count = Math.round((levelW + levelH) / 300);
	const minDist = Math.min(levelW, levelH) * 0.3;
	const points: {x: number; y: number}[] = [];
	let tries = 0;
	while (points.length < count && tries < 100) {
		tries++;
		const p = {x: 50 + rand(levelW - 100), y: 50 + rand(levelH - 100)};
		let ok = true;
		for (const q of points) {
			if (getDistanceBtwPoints(p, q) < minDist) { ok = false; break; }
		}
		if (ok) points.push(p);
	}
	while (points.length < 4) {
		points.push({x: levelW / 2 + rand(levelW / 4), y: levelH / 2 + rand(levelH / 4)});
	}
	return points;
}
