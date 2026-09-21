/**
 * Декор мира CERES (docs/DESIGN.md §3, §4).
 *
 * Что было: шесть фотореалистичных ассетов — голубые кристаллы, ледяные
 * плиты, сосульки. Самая используемая группа декора в игре (67 установок по
 * уровням) и при этом самая светлая: лёд светился ярче корабля, то есть
 * взгляд игрока уводило ровно туда, где ничего не происходит.
 *
 * Что стало: тот же перовой контур и плоская двухтоновая заливка, что у
 * породы, и светлота внутри слоя мира. Холодный рим оставлен тонкой линией:
 * лёд остаётся льдом, но перестаёт спорить с героем.
 *
 * Размеры повторяют исходные: renderer масштабирует спрайт полем `s` от
 * нативного размера текстуры, и смена габарита сдвинула бы весь декор на
 * тридцати уровнях.
 *
 *   node apps/game/scripts/gen-deco.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'deco', 'static', 'ceres');

const INK = '#14110e';
const ROCK = '#2b251f';
const ROCK_LIT = '#3a322a';
const ICE = '#2d3742';
const ICE_LIT = '#3e4b59';
const RIM = '#5d7383';
const METAL = '#39332b';
const METAL_LIT = '#4b4339';

const r1 = (v) => Math.round(v * 10) / 10;

function hash(i, salt) {
	let h = Math.imul(i + salt, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function svg(w, h, body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

/** Сталактит: клин от потолка, грани прямые, скол неровный. */
function stalactite() {
	const W = 256;
	const H = 384;
	const left = [];
	const right = [];
	const steps = 6;
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const y = 8 + t * (H - 30);
		const halfW = (92 - t * 82) * (0.82 + hash(i, 3) * 0.3);
		left.push(`${r1(128 - halfW)} ${r1(y)}`);
		right.unshift(`${r1(128 + halfW * 0.9)} ${r1(y)}`);
	}
	const body = `M${left.join('L')}L${r1(128)} ${H - 6}L${right.join('L')}Z`;
	const facet = `M${left.join('L')}L${r1(128)} ${H - 6}Z`;
	return svg(
		W,
		H,
		`<path d="${body}" fill="${ROCK}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${facet}" fill="${ROCK_LIT}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M${r1(128 - 70)} 22L${r1(128 - 30)} 120" fill="none" stroke="${RIM}" stroke-width="4" stroke-linecap="round" opacity="0.5"/>`,
	);
}

/** Кристаллы: гранёные клинья из одной точки, холодный рим по левой грани. */
function crystalCluster() {
	const W = 256;
	const H = 384;
	const base = H - 26;
	const shards = [];
	const rims = [];
	const specs = [
		{x: 74, tip: 150, w: 34, lean: -16},
		{x: 128, tip: 56, w: 44, lean: 6},
		{x: 186, tip: 176, w: 32, lean: 18},
		{x: 104, tip: 232, w: 24, lean: -6},
		{x: 158, tip: 244, w: 22, lean: 10},
	];
	for (const [i, s] of specs.entries()) {
		const tipX = s.x + s.lean;
		shards.push(
			`M${s.x - s.w} ${base}L${s.x - s.w * 0.55} ${r1(s.tip + 38)}L${tipX} ${s.tip}` +
				`L${s.x + s.w * 0.6} ${r1(s.tip + 44)}L${s.x + s.w} ${base}Z`,
		);
		rims.push(`M${s.x - s.w * 0.55} ${r1(s.tip + 38)}L${tipX} ${s.tip}`);
		void i;
	}
	const facets = specs.map(
		(s) => `M${s.x - s.w} ${base}L${s.x - s.w * 0.55} ${r1(s.tip + 38)}L${s.x + s.lean} ${s.tip}L${s.x} ${base}Z`,
	);
	return svg(
		W,
		H,
		`<path d="${shards.join('')}" fill="${ICE}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${facets.join('')}" fill="${ICE_LIT}"/>
<path d="${shards.join('')}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${rims.join('')}" fill="none" stroke="${RIM}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`,
	);
}

/** Сосульки: ряд клиньев разной длины от общей кромки. */
function icicles() {
	const S = 256;
	const spikes = [];
	const rims = [];
	let x = 18;
	for (let i = 0; x < S - 30; i++) {
		const w = 22 + hash(i, 7) * 20;
		const len = 90 + hash(i, 11) * 120;
		spikes.push(`M${r1(x)} 26L${r1(x + w)} 26L${r1(x + w * 0.45)} ${r1(26 + len)}Z`);
		rims.push(`M${r1(x + 4)} 34L${r1(x + w * 0.45)} ${r1(20 + len)}`);
		x += w + 6 + hash(i, 13) * 10;
	}
	return svg(
		S,
		S,
		`<path d="M0 6L${S} 6L${S} 34L0 34Z" fill="${ROCK_LIT}" stroke="${INK}" stroke-width="7"/>
<path d="${spikes.join('')}" fill="${ICE}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="${rims.join('')}" fill="none" stroke="${RIM}" stroke-width="3.5" stroke-linecap="round" opacity="0.55"/>`,
	);
}

/** Плита: наклонный скол льда, две грани и трещина. */
function iceSheet() {
	const S = 256;
	const body = 'M14 196L52 92L150 62L242 108L228 200L118 232Z';
	const facet = 'M14 196L52 92L150 62L128 150Z';
	return svg(
		S,
		S,
		`<path d="${body}" fill="${ICE}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${facet}" fill="${ICE_LIT}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M128 150L242 108M128 150L118 232" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>
<path d="M52 92L150 62" fill="none" stroke="${RIM}" stroke-width="5" stroke-linecap="round" opacity="0.6"/>`,
	);
}

/** Зонд: брошенная машина, вмёрзшая в породу. Семья робота и труб. */
function frozenProbe() {
	const S = 256;
	const legs = 'M78 158L46 228L66 232L96 176ZM178 158L210 228L190 232L160 176Z';
	const rivets = [];
	for (const a of [0.5, 1.6, 2.7, 3.8, 4.9]) {
		rivets.push(`<circle cx="${r1(128 + Math.cos(a) * 52)}" cy="${r1(120 + Math.sin(a) * 52)}" r="5"/>`);
	}
	return svg(
		S,
		S,
		`<path d="${legs}" fill="${METAL}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<circle cx="128" cy="120" r="70" fill="${METAL}" stroke="${INK}" stroke-width="7"/>
<path d="M128 50A70 70 0 0 0 58 120L128 120Z" fill="${METAL_LIT}"/>
<circle cx="128" cy="120" r="70" fill="none" stroke="${INK}" stroke-width="7"/>
<g fill="${INK}" opacity="0.5">${rivets.join('')}</g>
<circle cx="128" cy="120" r="30" fill="${ICE}" stroke="${INK}" stroke-width="6"/>
<path d="M112 104L128 96" fill="none" stroke="${RIM}" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
<path d="M128 50L128 18" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
<circle cx="128" cy="14" r="10" fill="${METAL_LIT}" stroke="${INK}" stroke-width="6"/>`,
	);
}

/** Труба во льду: колено с фланцами, наледь снизу. */
function frostPipe() {
	const S = 256;
	const pipe = 'M20 84L150 84L150 224L104 224L104 130L20 130Z';
	const frost = [];
	for (let i = 0; i < 7; i++) {
		const x = 30 + i * 18 + hash(i, 5) * 8;
		frost.push(`M${r1(x)} 130L${r1(x + 8)} 130L${r1(x + 4)} ${r1(150 + hash(i, 9) * 34)}Z`);
	}
	return svg(
		S,
		S,
		`<path d="${pipe}" fill="${METAL}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M20 84L150 84L150 110L20 110Z" fill="${METAL_LIT}"/>
<path d="${pipe}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M8 74L32 74L32 140L8 140Z" fill="${METAL_LIT}" stroke="${INK}" stroke-width="6"/>
<path d="M94 214L160 214L160 240L94 240Z" fill="${METAL_LIT}" stroke="${INK}" stroke-width="6"/>
<path d="${frost.join('')}" fill="${ICE}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
	);
}

const ITEMS = {
	'ceres-stalactite': stalactite(),
	'ceres-crystal-cluster': crystalCluster(),
	'ceres-icicles': icicles(),
	'ceres-ice-sheet': iceSheet(),
	'ceres-frozen-probe': frozenProbe(),
	'ceres-frost-pipe': frostPipe(),
};

mkdirSync(OUT, {recursive: true});
let total = 0;
for (const [name, body] of Object.entries(ITEMS)) {
	const m = /width="(\d+)" height="(\d+)"/.exec(body);
	const w = Number(m[1]);
	const h = Number(m[2]);
	const png = await sharp(Buffer.from(body), {density: 96}).resize(w, h).png({effort: 9}).toBuffer();
	writeFileSync(join(OUT, `${name}.png`), png);
	total += png.length;
	console.log(`${name.padEnd(24)} ${w}x${h} ${(png.length / 1024).toFixed(1).padStart(6)} КБ`);
}
console.log(`\nвсего ${(total / 1024).toFixed(1)} КБ против 92.9 КБ`);
