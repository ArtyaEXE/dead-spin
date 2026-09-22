/**
 * Проверка ассетов по закону трёх слоёв (docs/DESIGN.md §4).
 *
 * Правило «корабль — самое светлое пятно кадра» невозможно соблюдать на глаз:
 * ровно так в проекте и появился фон ярче героя. Здесь оно считается.
 *
 * Для каждого ассета берётся светлота по CIELAB, прозрачные пиксели
 * отбрасываются, и сравнивается 95-й процентиль — не максимум, потому что
 * одинокий блик в пару пикселей не делает объект светлым.
 *
 * Ассеты векторные, поэтому скрипт растеризует их в памяти тем же способом,
 * что и браузер, и меряет уже пиксели: закон §4 про то, что видит игрок, а не
 * про то, что написано в атрибуте fill.
 *
 *   node apps/game/scripts/check-art.mjs
 *
 * Выход 1, если хоть один ассет вне допуска своего слоя.
 */

import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Допуски по слоям. `lMax` и `lMin` — границы 95-го процентиля светлоты.
 * `danger` требует присутствия угрожающего тона: пиксели с хромой от 40 и
 * тоном 15–45°, то есть тот самый оранжевый, который в игре означает смерть.
 */
const LAYERS = {
	world: {lMax: 34, label: 'мир'},
	threat: {lMin: 28, lMax: 72, danger: true, label: 'угроза'},
	goal: {lMin: 60, danger: false, label: 'цель'},
	hero: {lMin: 72, danger: false, label: 'герой'},
	// Вспышка — задокументированное исключение из закона. Ядро взрыва обязано
	// быть ярче корабля, иначе смерть не читается как событие. Оно живёт
	// два-три кадра и не борется за внимание, потому что игра в этот момент
	// уже кончилась. Верхней границы у слоя нет, нижняя есть: тусклый взрыв
	// это баг.
	flash: {lMin: 85, danger: true, label: 'вспышка'},
};

const ASSETS = [
	['cave/ceres-outer.svg', 'world'],
	['cave/ceres-inner.svg', 'world'],
	['cave/pallas-outer.svg', 'world'],
	['cave/juno-outer.svg', 'world'],
	['cave/vesta-outer.svg', 'world'],
	['cave/eunomia-outer.svg', 'world'],
	['deco/static/ceres/ceres-stalactite.svg', 'world'],
	['deco/static/ceres/ceres-crystal-cluster.svg', 'world'],
	['deco/static/ceres/ceres-icicles.svg', 'world'],
	['deco/static/ceres/ceres-ice-sheet.svg', 'world'],
	['deco/static/ceres/ceres-frozen-probe.svg', 'world'],
	['deco/static/ceres/ceres-frost-pipe.svg', 'world'],
	['start.svg', 'world'],
	['enemies/mine/mine.svg', 'threat'],
	['enemies/stone/stone.svg', 'threat'],
	['enemies/worm/s1.svg', 'threat'],
	['enemies/worm/s2.svg', 'threat'],
	['enemies/worm/s3.svg', 'threat'],
	['effects/explosion/3.svg', 'flash'],
	['effects/explosion/9.svg', 'threat'],
	['star.svg', 'goal'],
	['finish.svg', 'goal'],
	['booster-single.svg', 'goal'],
	['ship2.svg', 'hero'],
	['ship-skins/ship-wanderer.svg', 'hero'],
	['ship-skins/ship-engineer.svg', 'hero'],
	['ship-skins/ship-veteran.svg', 'hero'],
	['ship-skins/ship-asteroid-king.svg', 'hero'],
];

const toLinear = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);

function lab(r, g, b) {
	const R = toLinear(r);
	const G = toLinear(g);
	const B = toLinear(b);
	const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505;
	const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
	const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
	const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const fx = f(x);
	const fy = f(y);
	const fz = f(z);
	return {L: 116 * fy - 16, a: 500 * (fx - fy), bb: 200 * (fy - fz)};
}

async function stats(relPath) {
	const {data, info} = await sharp(readFileSync(join(PUB, relPath)), {density: 192})
		.ensureAlpha()
		.raw()
		.toBuffer({resolveWithObject: true});
	const ls = [];
	let danger = 0;
	let opaque = 0;
	for (let i = 0; i < data.length; i += info.channels) {
		if (data[i + 3] < 200) continue;
		opaque++;
		const {L, a, bb} = lab(data[i], data[i + 1], data[i + 2]);
		ls.push(L);
		const chroma = Math.hypot(a, bb);
		const hue = (Math.atan2(bb, a) * 180) / Math.PI;
		if (chroma >= 40 && hue >= 15 && hue <= 45) danger++;
	}
	ls.sort((p, q) => p - q);
	return {
		p95: ls[Math.floor(ls.length * 0.95)] ?? 0,
		median: ls[Math.floor(ls.length * 0.5)] ?? 0,
		dangerShare: opaque ? danger / opaque : 0,
	};
}

let failed = 0;
console.log('ассет                                        слой     L медиана  L p95   оранж   вердикт');
for (const [rel, layerName] of ASSETS) {
	const layer = LAYERS[layerName];
	const s = await stats(rel);
	const problems = [];
	if (layer.lMax !== undefined && s.p95 > layer.lMax) problems.push(`L p95 ${s.p95.toFixed(0)} > ${layer.lMax}`);
	if (layer.lMin !== undefined && s.p95 < layer.lMin) problems.push(`L p95 ${s.p95.toFixed(0)} < ${layer.lMin}`);
	if (layer.danger === true && s.dangerShare < 0.01) problems.push('нет тона угрозы');
	if (layer.danger === false && s.dangerShare > 0.02) problems.push('оранжевый вне слоя угрозы');
	if (problems.length) failed++;
	console.log(
		`${rel.padEnd(44)} ${layer.label.padEnd(7)} ${s.median.toFixed(0).padStart(8)} ${s.p95.toFixed(0).padStart(7)} ${(s.dangerShare * 100).toFixed(1).padStart(6)}%   ${problems.length ? problems.join('; ') : 'ок'}`,
	);
}

console.log(
	failed
		? `\nвне допуска: ${failed} из ${ASSETS.length}. Правила и обоснование — docs/DESIGN.md §4.`
		: `\nвсе ${ASSETS.length} ассетов в допуске своего слоя.`,
);
process.exit(failed ? 1 : 0);
