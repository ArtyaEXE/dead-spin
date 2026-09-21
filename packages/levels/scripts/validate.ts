import {readdirSync, readFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema, type Level} from '@dead-spin/shared';
import {pointInPoly, distToPolygonEdge, type GenPoint} from '../src/generate';


/**
 * Валидация уровней: схема + дизайн-инварианты (GDD §8.3, память
 * feedback_level_design §5).
 *
 * FAIL — физически неиграбельные конфигурации:
 *   звезда вне пещеры, звезда↔стена < 55, звезда↔звезда < 130,
 *   звезда↔враг < 110 (между центрами), start/finish вне пещеры.
 * WARN — цели по кривой, которые не ломают игру, но ухудшают её:
 *   крюк ниже цели (≥1.35 с L4, ≥1.6 с L10), нет par-порогов.
 */


const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

const STAR_WALL = 55;
const STAR_STAR = 130;
const STAR_ENEMY = 110;

type P = GenPoint;
const dist = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);

function hookTarget(n: number): number {
	if (n >= 10) return 1.6;
	if (n >= 4) return 1.35;
	return 0;
}

function inCave(p: P, l: Level): boolean {
	if (!pointInPoly(p, l.walls[0]!)) return false;
	for (let i = 1; i < l.walls.length; i++) if (pointInPoly(p, l.walls[i]!)) return false;
	return true;
}

function wallClearance(p: P, l: Level): number {
	let best = Infinity;
	for (const poly of l.walls) best = Math.min(best, distToPolygonEdge(p, poly));
	return best;
}

function checkDesign(n: number, l: Level): {errors: string[]; warns: string[]; hook: number} {
	const errors: string[] = [];
	const warns: string[] = [];
	const stars: P[] = [l.star1, l.star2, l.star3];

	for (const [name, p] of [['start', l.startPoint], ['finish', l.finishPoint]] as const) {
		if (!inCave(p, l)) errors.push(`${name} вне пещеры`);
	}
	stars.forEach((s, i) => {
		if (!inCave(s, l)) { errors.push(`★${i + 1} вне пещеры`); return; }
		const wc = wallClearance(s, l);
		// Допуск 0.5 px — рукотворные уровни ставили звёзды ровно на границе.
		if (wc < STAR_WALL - 0.5) errors.push(`★${i + 1} ↔ стена ${wc.toFixed(0)} < ${STAR_WALL}`);
		for (let j = i + 1; j < 3; j++) {
			const d = dist(s, stars[j]!);
			if (d < STAR_STAR) errors.push(`★${i + 1} ↔ ★${j + 1} ${d.toFixed(0)} < ${STAR_STAR}`);
		}
		// Правило из feedback_level_design §5a — 110 px между центрами
		// (диаметр корабля 80 + запас 30). Радиус врага не добавляем: у мины
		// звезда в зоне детекта — это осознанный риск, а не ошибка.
		for (const e of l.enemies) {
			const d = dist(s, e);
			if (d < STAR_ENEMY) errors.push(`★${i + 1} ↔ ${e.name} ${d.toFixed(0)} < ${STAR_ENEMY}`);
		}
	});

	const path = dist(l.startPoint, l.star1) + dist(l.star1, l.star2) + dist(l.star2, l.star3) + dist(l.star3, l.finishPoint);
	const hook = path / Math.max(1, dist(l.startPoint, l.finishPoint));
	const tgt = hookTarget(n);
	if (tgt > 0 && hook < tgt) warns.push(`крюк ${hook.toFixed(2)} < ${tgt}`);
	if (l.parTimeMs === undefined || l.parFuel === undefined || l.fuelTank === undefined) warns.push('нет par/fuelTank');

	return {errors, warns, hook};
}


function naturalSortByNumber(a: string, b: string): number {
	return Number(a.replace(/\.json$/, '')) - Number(b.replace(/\.json$/, ''));
}


const files = readdirSync(dataDir)
	.filter(f => /^\d+\.json$/.test(f))
	.sort(naturalSortByNumber);

console.log(`Validating ${files.length} level file(s) in ${dataDir}\n`);

let passed = 0;
let failed = 0;
let warned = 0;

for (const file of files) {
	const n = Number(file.replace(/\.json$/, ''));
	const raw = JSON.parse(readFileSync(join(dataDir, file), 'utf8')) as unknown;
	const result = LevelSchema.safeParse(raw);

	if (!result.success) {
		console.log(`  FAIL ${file}`);
		for (const issue of result.error.issues) console.log(`    • ${issue.path.join('.')}: ${issue.message}`);
		failed++;
		continue;
	}

	const L = result.data;
	const d = checkDesign(n, L);
	const enemies = L.enemies.reduce((acc, e) => { acc[e.name] = (acc[e.name] ?? 0) + 1; return acc; }, {} as Record<string, number>);
	const enemyStr = Object.entries(enemies).map(([k, v]) => `${k}×${v}`).join(' ') || '—';
	const status = d.errors.length ? 'FAIL' : d.warns.length ? 'WARN' : 'OK  ';
	console.log(
		`  ${status} ${file.padEnd(8)} res=${L.res.x}x${L.res.y}  крюк=${d.hook.toFixed(2)}  ` +
		`враги: ${enemyStr.padEnd(18)} deco=${L.decorations.length}  bak=${L.fuelTank ?? '—'}`
	);
	for (const e of d.errors) console.log(`    ✗ ${e}`);
	for (const w of d.warns) console.log(`    ⚠ ${w}`);

	if (d.errors.length) failed++;
	else { passed++; if (d.warns.length) warned++; }
}

console.log(`\n${passed} passed (${warned} with warnings), ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
