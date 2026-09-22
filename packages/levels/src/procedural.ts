import type {Level} from '@dead-spin/shared';
import {
	distToPolygonEdge,
	generateLevel,
	type GenBranch,
	type GenPoint,
	type GenPolyline,
	type LevelSpec,
	pointInPoly,
} from './generate';

/**
 * Процедурные уровни: испытание дня и бесконечный режим (GDD §19, этап B).
 *
 * Тридцать уровней кампании — это полтора часа. Дальше играть нечего, а KPI
 * проекта — возврат на седьмой день. Испытание дня даёт причину открыть игру
 * завтра, бесконечный режим — причину не закрывать её сегодня. Обоим нужен
 * один и тот же кусок: спека уровня из сида.
 *
 * Ручные спеки кампании (`scripts/generate-pallas.ts`) описывают геометрию
 * поимённо: каждый изгиб коридора, каждый карман под звезду. Здесь та же
 * структура собирается из сида, а потом проверяется теми же инвариантами,
 * что и кампания (`scripts/validate.ts`): если выпала непроходимая или
 * скучная раскладка, сид отбрасывается и берётся следующий.
 *
 * Генерация детерминирована: одна дата — один уровень у всех игроков, и
 * сравнивать время в таблице имеет смысл.
 */

/** Размер поля. Совпадает с кампанией: камера и зум настроены под него. */
const RES = {x: 1500, y: 1700} as const;

/** Инварианты дизайна. Те же числа, что в scripts/validate.ts. */
const STAR_WALL = 55;
const STAR_STAR = 130;
const STAR_ENEMY = 110;
const STAR_ENDPOINT = 120;
const MINE_RADIUS = 28;
const MINE_WALL = MINE_RADIUS + 45;
const MINE_ENDPOINT = 220;
const MINE_MINE = 260;
const MINE_STAR = STAR_ENEMY + MINE_RADIUS;

/**
 * Цель по «крюку» — во сколько раз маршрут через все три звезды длиннее
 * прямой до финиша. Ниже 1.6 выбор «нырнуть за звездой или лететь к финишу»
 * исчезает: звёзды просто лежат по дороге.
 */
const HOOK_TARGET = 1.6;

/** Сколько раскладок перебрать, прежде чем сдаться. */
const MAX_ATTEMPTS = 40;

export type ProceduralOptions = {
	/** 0 — спокойно, 1 — плотно. Влияет на ширину коридора и число мин. */
	difficulty?: number;
	/** Имя уровня в схеме. UI показывает его в шапке. */
	name?: string;
};

/** Детерминированный генератор: один сид — одна последовательность. */
function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x9e3779b9) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const dist = (a: GenPoint, b: GenPoint): number => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Точка внутри игровой пещеры: в наружном полигоне и не внутри островов. */
function inCave(p: GenPoint, level: Level): boolean {
	const outer = level.walls[0];
	if (!outer || !pointInPoly(p, outer)) return false;
	for (let i = 1; i < level.walls.length; i++) {
		const hole = level.walls[i];
		if (hole && pointInPoly(p, hole)) return false;
	}
	return true;
}

function wallClearance(p: GenPoint, level: Level): number {
	let best = Number.POSITIVE_INFINITY;
	for (const poly of level.walls) best = Math.min(best, distToPolygonEdge(p, poly));
	return best;
}

/**
 * Коридор от старта к финишу. Идёт по диагонали сверху вниз, виляя вбок:
 * знак поперечного сдвига чередуется, иначе получается прямая труба, в
 * которой нечего решать.
 */
function buildMainPath(rand: () => number, steps: number): {path: GenPolyline; widths: number[]} {
	const start: GenPoint = {x: lerp(200, 380, rand()), y: lerp(170, 300, rand())};
	const finish: GenPoint = {x: lerp(RES.x - 380, RES.x - 200, rand()), y: lerp(RES.y - 300, RES.y - 170, rand())};

	const path: GenPolyline = [start];
	const dx = finish.x - start.x;
	const dy = finish.y - start.y;
	const len = Math.hypot(dx, dy) || 1;
	// Нормаль к оси старт-финиш: вдоль неё и уводим коридор.
	const nx = -dy / len;
	const ny = dx / len;
	let sign = rand() < 0.5 ? 1 : -1;

	for (let i = 1; i < steps - 1; i++) {
		const t = i / (steps - 1);
		const amp = lerp(140, 300, rand()) * Math.sin(Math.PI * t);
		const px = start.x + dx * t + nx * amp * sign;
		const py = start.y + dy * t + ny * amp * sign;
		path.push({
			x: Math.round(Math.min(RES.x - 180, Math.max(180, px))),
			y: Math.round(Math.min(RES.y - 180, Math.max(180, py))),
		});
		sign = -sign;
	}
	path.push(finish);

	// Ширина: шире в середине, у́же на концах. Старт и финиш должны быть
	// просторными, там игрок ещё не разогнался или уже тормозит.
	const widths = path.map((_, i) => {
		const t = i / (path.length - 1);
		return Math.round(lerp(108, 145, Math.sin(Math.PI * t)) + rand() * 8);
	});
	return {path, widths};
}

/**
 * Карманы: тупиковые ответвления, заканчивающиеся комнатой. Именно в них
 * кладутся звёзды — так крюк получается из геометрии, а не из натяжки.
 */
function buildPockets(
	rand: () => number,
	path: GenPolyline,
	count: number,
): {branches: GenBranch[]; rooms: {x: number; y: number; radius: number}[]; ends: GenPoint[]} {
	const branches: GenBranch[] = [];
	const rooms: {x: number; y: number; radius: number}[] = [];
	const ends: GenPoint[] = [];

	// Кандидаты на врезку — только внутренние узлы: от концов карман уводит
	// игрока мимо старта или финиша, и это читается как ошибка уровня.
	const slots = path.map((_, i) => i).filter((i) => i > 0 && i < path.length - 1);
	for (let k = 0; k < count && slots.length > 0; k++) {
		const pick = Math.floor(rand() * slots.length);
		const idx = slots.splice(pick, 1)[0];
		if (idx === undefined) break;
		const from = path[idx];
		const prev = path[idx - 1];
		const next = path[idx + 1];
		if (!from || !prev || !next) continue;

		// Уводим перпендикулярно локальному направлению коридора.
		const tx = next.x - prev.x;
		const ty = next.y - prev.y;
		const tl = Math.hypot(tx, ty) || 1;
		const side = rand() < 0.5 ? 1 : -1;
		const nx = (-ty / tl) * side;
		const ny = (tx / tl) * side;
		const reach = lerp(230, 340, rand());

		const mid: GenPoint = {
			x: Math.round(Math.min(RES.x - 150, Math.max(150, from.x + nx * reach * 0.55))),
			y: Math.round(Math.min(RES.y - 150, Math.max(150, from.y + ny * reach * 0.55))),
		};
		const end: GenPoint = {
			x: Math.round(Math.min(RES.x - 150, Math.max(150, from.x + nx * reach))),
			y: Math.round(Math.min(RES.y - 150, Math.max(150, from.y + ny * reach))),
		};

		branches.push({path: [from, mid, end], widths: [110, 92, 86]});
		rooms.push({x: end.x, y: end.y, radius: Math.round(lerp(92, 112, rand()))});
		ends.push(end);
	}
	return {branches, rooms, ends};
}

/** Порядок звёзд по проекции на ось старт-финиш: так игрок и полетит. */
function orderAlongRoute(stars: GenPoint[], start: GenPoint, finish: GenPoint): GenPoint[] {
	const dx = finish.x - start.x;
	const dy = finish.y - start.y;
	const len2 = dx * dx + dy * dy || 1;
	return [...stars].sort((a, b) => {
		const ta = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len2;
		const tb = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len2;
		return ta - tb;
	});
}

function hookOf(level: Level): number {
	const chain =
		dist(level.startPoint, level.star1) +
		dist(level.star1, level.star2) +
		dist(level.star2, level.star3) +
		dist(level.star3, level.finishPoint);
	return chain / Math.max(1, dist(level.startPoint, level.finishPoint));
}

/**
 * Те же проверки, что гоняет `pnpm validate:levels` по кампании. Уровень,
 * который их не прошёл, играется либо нечестно (звезда в стене), либо
 * скучно (звёзды на маршруте).
 */
function violations(level: Level): string[] {
	const problems: string[] = [];
	const stars = [level.star1, level.star2, level.star3];

	for (const [i, s] of stars.entries()) {
		if (!inCave(s, level)) problems.push(`звезда ${i + 1} вне пещеры`);
		else if (wallClearance(s, level) < STAR_WALL) problems.push(`звезда ${i + 1} у стены`);
		if (dist(s, level.startPoint) < STAR_ENDPOINT || dist(s, level.finishPoint) < STAR_ENDPOINT) {
			problems.push(`звезда ${i + 1} у старта или финиша`);
		}
		for (let j = i + 1; j < stars.length; j++) {
			const other = stars[j];
			if (other && dist(s, other) < STAR_STAR) problems.push(`звёзды ${i + 1} и ${j + 1} слиплись`);
		}
		for (const e of level.enemies) {
			const r = e.name === 'worm' ? 35 : e.radius;
			if (dist(s, e) < STAR_ENEMY + r) problems.push(`звезда ${i + 1} прижата к врагу`);
		}
	}

	for (const [i, e] of level.enemies.entries()) {
		if (!inCave(e, level)) problems.push(`враг ${i + 1} вне пещеры`);
		else if (wallClearance(e, level) < MINE_WALL) problems.push(`враг ${i + 1} без коридора`);
		if (dist(e, level.startPoint) < MINE_ENDPOINT || dist(e, level.finishPoint) < MINE_ENDPOINT) {
			problems.push(`враг ${i + 1} у старта или финиша`);
		}
		for (let j = i + 1; j < level.enemies.length; j++) {
			const other = level.enemies[j];
			if (other && dist(e, other) < MINE_MINE) problems.push(`враги ${i + 1} и ${j + 1} слиплись`);
		}
	}

	if (level.enemies.length < 2) problems.push(`угроз ${level.enemies.length} — испытание без риска не испытание`);

	const hook = hookOf(level);
	if (hook < HOOK_TARGET) problems.push(`крюк ${hook.toFixed(2)} < ${HOOK_TARGET}`);
	return problems;
}

/**
 * Мины на маршруте, в самых широких местах: heat-механика должна читаться,
 * а не душить. Кандидаты берутся не только с осевой линии — в узком колене
 * центр коридора может не дать мине места, а полметра вбок даёт.
 */
function placeMines(level: Level, rand: () => number, want: number): void {
	if (want <= 0) return;
	const route = [level.startPoint, level.star1, level.star2, level.star3, level.finishPoint];
	const candidates: {p: GenPoint; clearance: number}[] = [];
	for (let i = 0; i < route.length - 1; i++) {
		const a = route[i];
		const b = route[i + 1];
		if (!a || !b) continue;
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		for (let t = 0.2; t <= 0.8001; t += 0.04) {
			for (const off of [0, -34, 34, -60, 60]) {
				const p = {
					x: Math.round(lerp(a.x, b.x, t) + nx * off),
					y: Math.round(lerp(a.y, b.y, t) + ny * off),
				};
				if (!inCave(p, level)) continue;
				candidates.push({p, clearance: wallClearance(p, level)});
			}
		}
	}
	// Небольшой случайный сдвиг порядка, иначе мины каждый раз садятся
	// в одни и те же точки маршрута и уровни становятся узнаваемыми.
	candidates.sort((x, y) => y.clearance - x.clearance + (rand() - 0.5) * 12);

	const placed: GenPoint[] = [];
	for (const c of candidates) {
		if (placed.length >= want) break;
		if (c.clearance < MINE_WALL) continue;
		if (dist(c.p, level.startPoint) < MINE_ENDPOINT || dist(c.p, level.finishPoint) < MINE_ENDPOINT) continue;
		if ([level.star1, level.star2, level.star3].some((s) => dist(c.p, s) < MINE_STAR)) continue;
		if (placed.some((m) => dist(c.p, m) < MINE_MINE)) continue;
		placed.push(c.p);
		level.enemies.push({name: 'mine', x: c.p.x, y: c.p.y, r: 0, radius: MINE_RADIUS, speed: 0});
	}
}

const DECOR_SRC = [
	'sign-warning.svg',
	'sign-danger.svg',
	'pipe-2.svg',
	'pipe-3.svg',
	'gear-1.svg',
	'gear-2.svg',
	'robot-2.svg',
	'ship-1.svg',
	'debris-3.svg',
	'debris-7.svg',
	'stuff-1.svg',
];

/** Одна попытка: спека из сида плюс мины и декор поверх готового уровня. */
function attempt(seed: number, difficulty: number, name: string): Level | null {
	const rand = rng(seed);
	const steps = 5 + Math.floor(rand() * 3);
	const {path, widths} = buildMainPath(rand, steps);
	const pockets = buildPockets(rand, path, 2);

	// Третья звезда — на маршруте, но сдвинутая вбок: два кармана дают крюк,
	// третья точка не даёт ему схлопнуться в прямую.
	const midIdx = Math.max(1, Math.min(path.length - 2, Math.floor(path.length / 2)));
	const mid = path[midIdx];
	const extra: GenPoint = mid
		? {x: Math.round(mid.x + (rand() - 0.5) * 60), y: Math.round(mid.y + (rand() - 0.5) * 60)}
		: {x: Math.round(RES.x / 2), y: Math.round(RES.y / 2)};

	const start = path[0];
	const finish = path[path.length - 1];
	if (!start || !finish) return null;

	const picked = [...pockets.ends, extra].slice(0, 3);
	while (picked.length < 3) picked.push(extra);
	const ordered = orderAlongRoute(picked, start, finish);
	const [s1, s2, s3] = ordered;
	if (!s1 || !s2 || !s3) return null;

	const spec: LevelSpec = {
		n: 0,
		res: {x: RES.x, y: RES.y},
		seed: seed & 0xffff,
		noiseAmps: [28, 14, 7],
		noiseScale: 0.0042,
		grid: 10,
		simplifyEps: 4,
		gravity: {x: 0, y: 18},
		mainPath: path,
		mainWidths: widths.map((w) => Math.round(w - difficulty * 12)),
		branches: pockets.branches,
		rooms: pockets.rooms,
		startPoint: start,
		finishPoint: finish,
		stars: [s1, s2, s3],
		enemies: [],
		decor: [],
	};

	const level = generateLevel(spec) as Level;
	level.name = name;

	placeMines(level, rand, 2 + Math.round(difficulty * 3));

	// Декор кладём в карманы и по маршруту: он объясняет место, а не
	// заполняет пустоту. В стенах ему делать нечего.
	const spots = [...pockets.ends, ...path.slice(1, -1)];
	for (const [i, p] of spots.entries()) {
		const src = DECOR_SRC[Math.floor(rand() * DECOR_SRC.length)];
		if (!src) continue;
		const jitter = {x: Math.round(p.x + (rand() - 0.5) * 90), y: Math.round(p.y + (rand() - 0.5) * 90)};
		if (!inCave(jitter, level) || wallClearance(jitter, level) < 50) continue;
		if (dist(jitter, level.startPoint) < 150 || dist(jitter, level.finishPoint) < 150) continue;
		level.decorations.push({
			name: 'static',
			x: jitter.x,
			y: jitter.y,
			r: Math.round((rand() - 0.5) * 180),
			s: Number((0.26 + rand() * 0.2).toFixed(2)),
			src,
		});
		if (i >= 5) break;
	}

	return violations(level).length === 0 ? level : null;
}

/**
 * Уровень из сида. Перебирает раскладки, пока одна не пройдёт инварианты.
 * Бросает, если не нашлось за MAX_ATTEMPTS — это означает баг в параметрах,
 * а не невезение: на практике подходящая находится за одну-две попытки.
 */
export function levelFromSeed(seed: number, options: ProceduralOptions = {}): Level {
	const difficulty = Math.min(1, Math.max(0, options.difficulty ?? 0.5));
	const name = options.name ?? 'daily';
	for (let i = 0; i < MAX_ATTEMPTS; i++) {
		const level = attempt((seed + i * 0x9e3779b9) >>> 0, difficulty, name);
		if (level) return level;
	}
	throw new Error(`Не удалось собрать уровень из сида ${seed} за ${MAX_ATTEMPTS} попыток`);
}

/** Сид из даты `YYYY-MM-DD`. Одна дата — один уровень у всех игроков. */
export function seedFromDate(isoDate: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < isoDate.length; i++) {
		h ^= isoDate.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

/**
 * Испытание дня. Сложность плавает по дню недели: выходные чуть плотнее,
 * чтобы забег ощущался иначе, а не был тем же уровнем в другой раскладке.
 */
export function dailyLevel(isoDate: string): Level {
	const seed = seedFromDate(isoDate);
	const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
	const difficulty = weekday === 0 || weekday === 6 ? 0.75 : 0.45;
	return levelFromSeed(seed, {difficulty, name: isoDate});
}

/** Уровень бесконечного режима: сложность растёт с номером забега. */
export function endlessLevel(runSeed: number, index: number): Level {
	const difficulty = Math.min(1, 0.25 + index * 0.06);
	return levelFromSeed((runSeed + index * 0x85ebca6b) >>> 0, {difficulty, name: `∞${index + 1}`});
}
