/**
 * Расставляет в JSON каждого уровня три числа для рейтинга и бака
 * (GDD §9–§10): `fuelTank`, `parTimeMs`, `parFuel`.
 *
 * Это ЗАГЛУШКИ по геометрии, а не замер: у нас пока нет прохождений
 * реальных игроков. Оценка строится от длины маршрута через звёзды
 * (start → ★1 → ★2 → ★3 → finish):
 *
 *   boosts    = ceil(path / PX_PER_BOOST)
 *   parFuel   = boosts × 100 × PAR_FUEL_MULT      (округление до 100)
 *   fuelTank  = boosts × 100 × TANK_MULT          (округление до 500, min 2000)
 *   parTimeMs = path / CRUISE_PX_S × PAR_TIME_MULT (округление до секунды)
 *
 * После закрытого теста коэффициенты пересчитать по медиане игроков
 * (GDD §20, вопрос 1). Идемпотентно: перезаписывает только эти три ключа.
 *
 *   pnpm --filter @dead-spin/levels exec tsx scripts/inject-par.ts
 */

import {readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {LevelSchema} from '@dead-spin/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'src', 'data');

const PX_PER_BOOST = 120;
const CRUISE_PX_S = 140;
const PAR_FUEL_MULT = 1.3;
const TANK_MULT = 2.0;
const PAR_TIME_MULT = 1.5;
const MIN_TANK = 2000;

type P = {x: number; y: number};
const dist = (a: P, b: P): number => Math.hypot(b.x - a.x, b.y - a.y);

function roundUpTo(v: number, step: number): number {
	return Math.ceil(v / step) * step;
}

const files = readdirSync(dataDir)
	.filter((f) => /^\d+\.json$/.test(f))
	.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

console.log('lvl   path   boosts  parFuel  tank   parTime');
for (const file of files) {
	const full = join(dataDir, file);
	const raw = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
	const lvl = LevelSchema.parse(raw);

	const path =
		dist(lvl.startPoint, lvl.star1) +
		dist(lvl.star1, lvl.star2) +
		dist(lvl.star2, lvl.star3) +
		dist(lvl.star3, lvl.finishPoint);

	const boosts = Math.ceil(path / PX_PER_BOOST);
	const parFuel = roundUpTo(boosts * 100 * PAR_FUEL_MULT, 100);
	const fuelTank = Math.max(MIN_TANK, roundUpTo(boosts * 100 * TANK_MULT, 500));
	const parTimeMs = roundUpTo((path / CRUISE_PX_S) * PAR_TIME_MULT, 1) * 1000;

	raw['fuelTank'] = fuelTank;
	raw['parTimeMs'] = parTimeMs;
	raw['parFuel'] = parFuel;

	// Схема должна принять результат — иначе не пишем.
	LevelSchema.parse(raw);
	writeFileSync(full, JSON.stringify(raw, null, 2) + '\n', 'utf8');

	console.log(
		`${lvl.name.padStart(3)}  ${String(Math.round(path)).padStart(5)}  ${String(boosts).padStart(5)}  ` +
			`${String(parFuel).padStart(7)}  ${String(fuelTank).padStart(5)}  ${String(parTimeMs / 1000).padStart(5)}s`,
	);
}
console.log(`\n${files.length} уровней обновлено.`);
