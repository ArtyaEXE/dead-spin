/**
 * Генератор материала пещеры: рисованный камень вместо фотореалистичных
 * текстур (docs/DESIGN.md §3, §4).
 *
 * Что было: 10 JPG на 2.6 МБ, сгенерированных нейросетью — лёд, фиолетовый
 * инопланетный мох, золотой стимпанк, лава, кость. Пять миров в пяти
 * несвязанных палитрах, без контура и без автора; `juno-1.jpg` к тому же
 * светлее корабля, что прямо ломает закон трёх слоёв.
 *
 * Что стало: порода, расколотая на осколки. Плоская заливка в три значения
 * плюс линия пера — та же техника, что у логотипа и робота. Миры различаются
 * тоном, калибром скола и частотой трещин, а не жанром.
 *
 * Как получается не-сетка. Основа — сетка N×N, но она не видна:
 *  1) узлы смещены на 0.55 ячейки, рёбра ломаются в середине — форма
 *     угловатая, скол идёт прямыми, как у настоящего камня;
 *  2) соседние ячейки сливаются в один осколок (union-find на торе),
 *     внутренние рёбра не обводятся, тон общий на весь осколок. Именно
 *     слияние убирает ритм сетки: осколки выходят разного калибра;
 *  3) толщина трещины разная, часть трещин — волосяные.
 *
 * Бесшовность по построению: индексы узлов берутся по модулю N, а смещение
 * ребра считается от пары соседей в фиксированном порядке, поэтому общее
 * ребро двух ячеек смещается одинаково с обеих сторон, а левый край плитки
 * совпадает с правым.
 *
 * SVG здесь — промежуточная форма, а не ассет: в public/ кладётся растр 1024.
 * TilingSprite нужна предсказуемая растеризация на всех DPR, а браузерный
 * рендер SVG в текстуру даёт шов по краю плитки. Источник правды — сам
 * генератор: он детерминирован и всегда воспроизводит плитки один в один.
 *
 *   node apps/game/scripts/gen-cave.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'cave');
const SIZE = 512;

/** Детерминированный шум: одно и то же (x, y, соль) всегда даёт одно число. */
function hash2(x, y, salt) {
	let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h = h ^ (h >>> 16);
	return (h >>> 0) / 4294967296;
}

const WORLDS = {
	/** CERES — стылый камень, крупный скол, редкие трещины. */
	ceres: {
		grid: 6,
		merge: 0.55,
		ink: '#14110e',
		plates: ['#2b251f', '#241f1b', '#1e1a16'],
		pit: '#171310',
		chip: '#3a322a',
	},
	/** PALLAS — ржавчина, скол мельче. */
	pallas: {
		grid: 7,
		merge: 0.48,
		ink: '#150f0c',
		plates: ['#32261e', '#2a201a', '#221a15'],
		pit: '#19120e',
		chip: '#463629',
	},
	/** JUNO — тёмная латунь, самая рваная порода. */
	juno: {
		grid: 8,
		merge: 0.42,
		ink: '#15110b',
		plates: ['#342c1e', '#2b2418', '#231d14'],
		pit: '#181309',
		chip: '#4a3d29',
	},
	/** VESTA — базальт, почти без тона, колотый мелко. */
	vesta: {
		grid: 9,
		merge: 0.38,
		ink: '#100f0f',
		plates: ['#262322', '#1f1d1c', '#191717'],
		pit: '#131111',
		chip: '#37322f',
	},
	/** EUNOMIA — пепел, самая светлая порода в допуске (L ≈ 0.3). */
	eunomia: {
		grid: 7,
		merge: 0.5,
		ink: '#16130f',
		plates: ['#38332c', '#2e2a24', '#26221d'],
		pit: '#1c1813',
		chip: '#4e453a',
	},
};

const r1 = (v) => Math.round(v * 10) / 10;

/** Узел сетки со смещением; индексы по модулю, отсюда бесшовность. */
function node(i, j, n, salt, cell) {
	const wi = ((i % n) + n) % n;
	const wj = ((j % n) + n) % n;
	const amp = cell * 0.55;
	return {
		x: i * cell + (hash2(wi, wj, salt) - 0.5) * amp,
		y: j * cell + (hash2(wi, wj, salt + 17) - 0.5) * amp,
	};
}

/** Точка излома ребра. Считается от пары узлов, одинаково для обеих ячеек. */
function bend(a, b, ai, aj, bi, bj, n, salt, cell) {
	const wai = ((ai % n) + n) % n;
	const waj = ((aj % n) + n) % n;
	const wbi = ((bi % n) + n) % n;
	const wbj = ((bj % n) + n) % n;
	const k = wai * 31 + waj * 131 + wbi * 1031 + wbj * 10331;
	const amp = (hash2(k, k >>> 5, salt + 53) - 0.5) * cell * 0.42;
	const t = 0.35 + hash2(k, k >>> 7, salt + 59) * 0.3;
	const mx = a.x + (b.x - a.x) * t;
	const my = a.y + (b.y - a.y) * t;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy) || 1;
	return {x: mx - (dy / len) * amp, y: my + (dx / len) * amp};
}

/** Слияние ячеек в осколки: union-find по индексу ячейки на торе. */
function buildShards(n, salt, mergeP) {
	const parent = new Int32Array(n * n).map((_, k) => k);
	const find = (k) => {
		while (parent[k] !== k) {
			parent[k] = parent[parent[k]];
			k = parent[k];
		}
		return k;
	};
	const union = (a, b) => {
		const ra = find(a);
		const rb = find(b);
		if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
	};
	// Решение о слиянии принимается на ребре, поэтому оно одинаково для
	// обеих сторон и переживает заворот через край плитки.
	const joinRight = [];
	const joinDown = [];
	for (let j = 0; j < n; j++) {
		for (let i = 0; i < n; i++) {
			const jr = hash2(i, j, salt + 701) < mergeP;
			const jd = hash2(i, j, salt + 809) < mergeP;
			joinRight.push(jr);
			joinDown.push(jd);
			if (jr) union(j * n + i, j * n + ((i + 1) % n));
			if (jd) union(j * n + i, ((j + 1) % n) * n + i);
		}
	}
	return {find, joinRight, joinDown};
}

function tile(w, salt, dim, inkWidth) {
	const n = w.grid;
	const cell = SIZE / n;
	const mix = (hex) => {
		const v = parseInt(hex.slice(1), 16);
		const f = (c) => Math.round(c * dim);
		return `#${((f((v >> 16) & 255) << 16) | (f((v >> 8) & 255) << 8) | f(v & 255)).toString(16).padStart(6, '0')}`;
	};
	const {find, joinRight, joinDown} = buildShards(n, salt, w.merge);
	const at = (i, j) => (((j % n) + n) % n) * n + (((i % n) + n) % n);

	const plates = [];
	const pits = [];
	const chips = [];
	const cracksThick = [];
	const cracksThin = [];

	// Плитка рисуется с запасом в ячейку по кругу: вылезшее обрежет viewBox,
	// а его двойник уже пришёл с противоположной стороны.
	for (let j = -1; j <= n; j++) {
		for (let i = -1; i <= n; i++) {
			const c00 = node(i, j, n, salt, cell);
			const c10 = node(i + 1, j, n, salt, cell);
			const c11 = node(i + 1, j + 1, n, salt, cell);
			const c01 = node(i, j + 1, n, salt, cell);
			const bTop = bend(c00, c10, i, j, i + 1, j, n, salt, cell);
			const bRight = bend(c10, c11, i + 1, j, i + 1, j + 1, n, salt, cell);
			const bBottom = bend(c01, c11, i, j + 1, i + 1, j + 1, n, salt, cell);
			const bLeft = bend(c00, c01, i, j, i, j + 1, n, salt, cell);

			// Заливка ячейки: тон берётся у корня осколка, поэтому весь
			// осколок одного цвета и слияние видно.
			const root = find(at(i, j));
			const tone = w.plates[Math.floor(hash2(root, root >>> 3, salt + 91) * w.plates.length)];
			plates.push(
				`<path d="M${r1(c00.x)} ${r1(c00.y)}L${r1(bTop.x)} ${r1(bTop.y)}L${r1(c10.x)} ${r1(c10.y)}` +
					`L${r1(bRight.x)} ${r1(bRight.y)}L${r1(c11.x)} ${r1(c11.y)}L${r1(bBottom.x)} ${r1(bBottom.y)}` +
					`L${r1(c01.x)} ${r1(c01.y)}L${r1(bLeft.x)} ${r1(bLeft.y)}Z" fill="${mix(tone)}"/>`,
			);

			// Трещина рисуется только там, где ячейки НЕ слиты: внутренние
			// рёбра осколка невидимы, поэтому сетка не читается.
			const wi = ((i % n) + n) % n;
			const wj = ((j % n) + n) % n;
			const seg = (a, b, m) => `M${r1(a.x)} ${r1(a.y)}L${r1(m.x)} ${r1(m.y)}L${r1(b.x)} ${r1(b.y)}`;
			if (!joinDown[at(i, j - 1)]) {
				(hash2(wi, wj, salt + 911) > 0.65 ? cracksThin : cracksThick).push(seg(c00, c10, bTop));
			}
			if (!joinRight[at(i, j)]) {
				(hash2(wi, wj, salt + 913) > 0.65 ? cracksThin : cracksThick).push(seg(c10, c11, bRight));
			}

			// Выбоины: одна-две на ячейку, плоская заливка без градиента.
			const pitCount = Math.floor(hash2(wi, wj, salt + 131) * 2.6);
			for (let k = 0; k < pitCount; k++) {
				const px = (i + 0.25 + hash2(wi, wj, salt + 200 + k) * 0.5) * cell;
				const py = (j + 0.25 + hash2(wi, wj, salt + 300 + k) * 0.5) * cell;
				const pr = (3 + hash2(wi, wj, salt + 400 + k) * 7) * (cell / 100);
				pits.push(`<circle cx="${r1(px)}" cy="${r1(py)}" r="${r1(pr)}"/>`);
			}

			// Скол: короткий светлый штрих вдоль верхней грани, один тон.
			if (hash2(wi, wj, salt + 501) > 0.62) {
				const t = 0.2 + hash2(wi, wj, salt + 502) * 0.35;
				const x1 = c00.x + (c10.x - c00.x) * t;
				const y1 = c00.y + (c10.y - c00.y) * t;
				chips.push(`M${r1(x1)} ${r1(y1)}L${r1(x1 + (c10.x - c00.x) * 0.26)} ${r1(y1 + (c10.y - c00.y) * 0.26)}`);
			}
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" fill="${mix(w.plates[1])}"/>
<g>${plates.join('')}</g>
<g fill="${mix(w.pit)}" opacity="0.8">${pits.join('')}</g>
<path d="${cracksThick.join('')}" fill="none" stroke="${mix(w.ink)}" stroke-width="${inkWidth}" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${cracksThin.join('')}" fill="none" stroke="${mix(w.ink)}" stroke-width="${r1(inkWidth * 0.4)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>
<path d="${chips.join('')}" fill="none" stroke="${mix(w.chip)}" stroke-width="${r1(inkWidth * 0.7)}" stroke-linecap="round" opacity="0.55"/>
</svg>
`;
}

const RASTER = 1024;

async function emit(name, svg) {
	const png = await sharp(Buffer.from(svg), {density: (RASTER / SIZE) * 96})
		.resize(RASTER, RASTER)
		.png({palette: true, effort: 9})
		.toBuffer();
	writeFileSync(join(OUT, `${name}.png`), png);
	return png.length;
}

mkdirSync(OUT, {recursive: true});
let total = 0;
for (const [name, w] of Object.entries(WORLDS)) {
	// Стена: полный тон, толстая линия. Задник: приглушён, линия тоньше —
	// так он уходит вглубь и не спорит с передним планом.
	const outer = await emit(`${name}-outer`, tile(w, 1, 1, 3.2));
	const inner = await emit(`${name}-inner`, tile(w, 7, 0.5, 2));
	total += outer + inner;
	console.log(
		`${name.padEnd(9)} outer ${(outer / 1024).toFixed(1).padStart(6)} КБ   inner ${(inner / 1024).toFixed(1).padStart(6)} КБ`,
	);
}
console.log(`
всего ${(total / 1024).toFixed(1)} КБ против 2518 КБ в JPG`);
