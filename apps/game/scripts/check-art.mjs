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
	['cave/ceres-outer.png', 'world'],
	['cave/ceres-inner.png', 'world'],
	['cave/pallas-outer.png', 'world'],
	['cave/juno-outer.png', 'world'],
	['cave/vesta-outer.png', 'world'],
	['cave/eunomia-outer.png', 'world'],
	['deco/static/ceres/ceres-stalactite.png', 'world'],
	['deco/static/ceres/ceres-crystal-cluster.png', 'world'],
	['deco/static/ceres/ceres-icicles.png', 'world'],
	['deco/static/ceres/ceres-ice-sheet.png', 'world'],
	['deco/static/ceres/ceres-frozen-probe.png', 'world'],
	['deco/static/ceres/ceres-frost-pipe.png', 'world'],
	['start.png', 'world'],
	['enemies/mine/mine.png', 'threat'],
	['enemies/stone/stone.png', 'threat'],
	['enemies/worm/s1.png', 'threat'],
	['enemies/worm/s2.png', 'threat'],
	['enemies/worm/s3.png', 'threat'],
	['effects/explosion/3.png', 'flash'],
	['effects/explosion/9.png', 'threat'],
	['star.png', 'goal'],
	['finish.png', 'goal'],
	['booster-single.png', 'goal'],
	['ship2.png', 'hero'],
	['ship-skins/ship-wanderer.png', 'hero'],
	['ship-skins/ship-engineer.png', 'hero'],
	['ship-skins/ship-veteran.png', 'hero'],
	['ship-skins/ship-asteroid-king.png', 'hero'],
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
	const {data, info} = await sharp(readFileSync(join(PUB, relPath)))
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
