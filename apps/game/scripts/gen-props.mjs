/**
 * Декор пещеры: таблички, трубы, шестерни, роботы, обломки, ящики, остовы
 * кораблей (docs/DESIGN.md §3, §4, §9).
 *
 * Тридцать восемь растровых объектов, 105 установок по тридцати уровням —
 * самая массовая группа ассетов в игре. Написаны они были кистью и написаны
 * хорошо, но это оставляло в проекте растр, а растр здесь означает одну
 * фиксированную плотность: на ретине всё это размазывалось.
 *
 * Перерисовано тем же законом, что порода и угрозы: перовой контур, плоская
 * двухтоновая заливка, светлота внутри слоя мира. Декор не имеет права быть
 * ярче корабля — раньше именно на этом горел ледяной декор CERES.
 *
 * Габариты сохранены по исходникам: renderer масштабирует спрайт полем `s`
 * от нативного размера текстуры, и смена габарита сдвинула бы весь декор.
 *
 *   node apps/game/scripts/gen-props.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'deco', 'static');

const INK = '#14110e';
const METAL = '#3a332b';
const METAL_LIT = '#4d4438';
const METAL_DIM = '#2a251f';
const ROCK = '#2e2821';
const ROCK_LIT = '#3d3529';
const BRASS = '#443a24';
const BRASS_LIT = '#564a2e';
const DANGER = '#8e2f16';
const GLASS = '#26313a';
const RIM = '#5d7383';

const r1 = (v) => Math.round(v * 10) / 10;

function hash(i, salt) {
	let h = Math.imul(i + salt * 7919, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function svg(w, h, body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>\n`;
}

/** Клёпки по окружности — общий мотив всей семьи. */
function rivets(cx, cy, r, n, size = 5, from = 0) {
	const out = [];
	for (let i = 0; i < n; i++) {
		const a = from + (i / n) * Math.PI * 2;
		out.push(`<circle cx="${r1(cx + Math.cos(a) * r)}" cy="${r1(cy + Math.sin(a) * r)}" r="${size}"/>`);
	}
	return `<g fill="${INK}" opacity="0.5">${out.join('')}</g>`;
}

/* ------------------------------------------------------------ таблички --- */

/**
 * Жестяная табличка на стойке. Самый массовый объект декора: она объясняет
 * игроку уровень без текста, поэтому глиф на ней рисуется путями, а не
 * шрифтом — шрифт в растеризуемом SVG зависит от системы и может не приехать.
 */
function sign(kind) {
	const S = 300;
	const cx = 150;
	const plateY = 40;
	const plateH = 150;
	const post = `M${cx - 12} ${plateY + plateH - 10}L${cx + 12} ${plateY + plateH - 10}L${cx + 12} ${S - 22}L${cx - 12} ${S - 22}Z`;
	const foot = `M${cx - 44} ${S - 30}L${cx + 44} ${S - 30}L${cx + 52} ${S - 8}L${cx - 52} ${S - 8}Z`;

	let plate;
	let glyph;
	let accent = BRASS;

	if (kind === 'warning') {
		// Треугольник с восклицательным знаком: тревога, но не смерть.
		plate = `M${cx} ${plateY}L${cx + 88} ${plateY + plateH}L${cx - 88} ${plateY + plateH}Z`;
		accent = '#5a4a22';
		glyph =
			`<path d="M${cx - 9} ${plateY + 58}L${cx + 9} ${plateY + 58}L${cx + 6} ${plateY + 108}L${cx - 6} ${plateY + 108}Z" fill="${INK}"/>` +
			`<circle cx="${cx}" cy="${plateY + 124}" r="9" fill="${INK}"/>`;
	} else if (kind === 'danger') {
		// Прямоугольник с красной полосой: единственная табличка, которой
		// разрешён тон угрозы, и то приглушённый — это знак, а не мина.
		plate = `M${cx - 92} ${plateY}L${cx + 92} ${plateY}L${cx + 92} ${plateY + plateH}L${cx - 92} ${plateY + plateH}Z`;
		accent = METAL;
		glyph =
			`<path d="M${cx - 92} ${plateY + 20}L${cx + 92} ${plateY + 20}L${cx + 92} ${plateY + 44}L${cx - 92} ${plateY + 44}Z" fill="${DANGER}"/>` +
			`<path d="M${cx - 92} ${plateY + 20}L${cx + 92} ${plateY + 20}L${cx + 92} ${plateY + 44}L${cx - 92} ${plateY + 44}Z" fill="none" stroke="${INK}" stroke-width="7"/>` +
			`<path d="M${cx - 11} ${plateY + 68}L${cx + 11} ${plateY + 68}L${cx + 7} ${plateY + 116}L${cx - 7} ${plateY + 116}Z" fill="${INK}"/>` +
			`<circle cx="${cx}" cy="${plateY + 132}" r="10" fill="${INK}"/>`;
	} else if (kind === 'round') {
		plate = `M${cx - 86} ${plateY + 75}A86 75 0 1 1 ${cx + 86} ${plateY + 75}A86 75 0 1 1 ${cx - 86} ${plateY + 75}Z`;
		glyph = `<circle cx="${cx}" cy="${plateY + 75}" r="30" fill="none" stroke="${INK}" stroke-width="12"/><circle cx="${cx}" cy="${plateY + 75}" r="9" fill="${INK}"/>`;
	} else if (kind === 'happy' || kind === 'sad') {
		plate = `M${cx - 86} ${plateY + 75}A86 75 0 1 1 ${cx + 86} ${plateY + 75}A86 75 0 1 1 ${cx - 86} ${plateY + 75}Z`;
		const mouth =
			kind === 'happy'
				? `M${cx - 34} ${plateY + 88}Q${cx} ${plateY + 122} ${cx + 34} ${plateY + 88}`
				: `M${cx - 34} ${plateY + 110}Q${cx} ${plateY + 76} ${cx + 34} ${plateY + 110}`;
		glyph =
			`<circle cx="${cx - 28}" cy="${plateY + 58}" r="11" fill="${INK}"/><circle cx="${cx + 28}" cy="${plateY + 58}" r="11" fill="${INK}"/>` +
			`<path d="${mouth}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/>`;
	} else {
		// Стрелки. Одна форма на три направления, разворот поворотом глифа.
		plate = `M${cx - 92} ${plateY}L${cx + 92} ${plateY}L${cx + 92} ${plateY + plateH}L${cx - 92} ${plateY + plateH}Z`;
		const rot = kind === 'left' ? 180 : kind === 'down' ? 90 : 0;
		glyph =
			`<g transform="rotate(${rot} ${cx} ${plateY + 75})">` +
			`<path d="M${cx - 52} ${plateY + 75}L${cx + 34} ${plateY + 75}" stroke="${INK}" stroke-width="16" stroke-linecap="round" fill="none"/>` +
			`<path d="M${cx + 10} ${plateY + 40}L${cx + 58} ${plateY + 75}L${cx + 10} ${plateY + 110}Z" fill="${INK}"/></g>`;
	}

	return svg(
		S,
		S,
		`<path d="${foot}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="${post}" fill="${METAL}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="${plate}" fill="${accent}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${rivets(cx, plateY + 75, kind === 'warning' ? 46 : 74, 4, 6, 0.8)}
${glyph}`,
	);
}

/* --------------------------------------------------------------- трубы --- */

function pipe(kind) {
	const S = 300;
	const t = 46; // радиус трубы
	const flange = (x, y, vertical) =>
		vertical
			? `<path d="M${x - t - 14} ${y - 13}L${x + t + 14} ${y - 13}L${x + t + 14} ${y + 13}L${x - t - 14} ${y + 13}Z" fill="${METAL_LIT}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`
			: `<path d="M${x - 13} ${y - t - 14}L${x + 13} ${y - t - 14}L${x + 13} ${y + t + 14}L${x - 13} ${y + t + 14}Z" fill="${METAL_LIT}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`;

	let body = '';
	let lit = '';
	let extra = '';
	if (kind === 1) {
		body = `M20 ${150 - t}L280 ${150 - t}L280 ${150 + t}L20 ${150 + t}Z`;
		lit = `M20 ${150 - t}L280 ${150 - t}L280 ${150 - t + 22}L20 ${150 - t + 22}Z`;
		extra = flange(46, 150, false) + flange(254, 150, false);
	} else if (kind === 2) {
		// Колено.
		body = `M20 ${150 - t}L${150 + t} ${150 - t}L${150 + t} 280L${150 - t} 280L${150 - t} ${150 + t}L20 ${150 + t}Z`;
		lit = `M20 ${150 - t}L${150 + t} ${150 - t}L${150 + t} ${150 - t + 22}L20 ${150 - t + 22}Z`;
		extra = flange(46, 150, false) + flange(150, 254, true);
	} else if (kind === 3) {
		// Тройник.
		body = `M20 ${150 - t}L280 ${150 - t}L280 ${150 + t}L${150 + t} ${150 + t}L${150 + t} 280L${150 - t} 280L${150 - t} ${150 + t}L20 ${150 + t}Z`;
		lit = `M20 ${150 - t}L280 ${150 - t}L280 ${150 - t + 22}L20 ${150 - t + 22}Z`;
		extra = flange(46, 150, false) + flange(254, 150, false) + flange(150, 254, true);
	} else {
		// Вентиль.
		body = `M20 ${150 - t}L280 ${150 - t}L280 ${150 + t}L20 ${150 + t}Z`;
		lit = `M20 ${150 - t}L280 ${150 - t}L280 ${150 - t + 22}L20 ${150 - t + 22}Z`;
		extra =
			flange(46, 150, false) +
			flange(254, 150, false) +
			`<path d="M138 ${150 - t}L162 ${150 - t}L162 52L138 52Z" fill="${METAL}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
			`<circle cx="150" cy="44" r="42" fill="none" stroke="${BRASS_LIT}" stroke-width="14"/>` +
			`<circle cx="150" cy="44" r="42" fill="none" stroke="${INK}" stroke-width="7"/>` +
			`<path d="M108 44L192 44M150 2L150 86" stroke="${BRASS_LIT}" stroke-width="12" stroke-linecap="round"/>`;
	}

	return svg(
		S,
		S,
		`<path d="${body}" fill="${METAL}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="${lit}" fill="${METAL_LIT}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${extra}`,
	);
}

/* ---------------------------------------------------------- шестерёнки --- */

function gearProp(teeth, w, h) {
	const cx = w / 2;
	const cy = h / 2;
	const rOut = Math.min(w, h) / 2 - 8;
	const rIn = rOut * 0.76;
	const step = (Math.PI * 2) / teeth;
	const tw = step * 0.2;
	const tf = step * 0.1;
	const pts = [];
	for (let i = 0; i < teeth; i++) {
		const a = i * step - Math.PI / 2;
		for (const [ang, rad] of [
			[a - tw, rOut],
			[a + tw, rOut],
			[a + tw + tf, rIn],
			[a + step - tw - tf, rIn],
		]) {
			pts.push(`${r1(cx + Math.cos(ang) * rad)} ${r1(cy + Math.sin(ang) * rad)}`);
		}
	}
	const hole = rOut * 0.3;
	return svg(
		w,
		h,
		`<path d="M${pts.join('L')}Z" fill="${BRASS}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="M${pts.slice(0, Math.floor(pts.length / 2)).join('L')}L${cx} ${cy}Z" fill="${BRASS_LIT}"/>
<path d="M${pts.join('L')}Z" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<circle cx="${cx}" cy="${cy}" r="${r1(hole)}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="8"/>
${rivets(cx, cy, hole + 22, 5, 5)}`,
	);
}

/* -------------------------------------------------------------- роботы --- */

/**
 * Брошенный робот. Здесь живёт характер мира: игра шутит, и её декор тоже
 * должен. Три варианта отличаются позой и деталью, а не палитрой.
 */
function robot(kind) {
	const S = 300;
	const cx = 150;
	const headY = kind === 3 ? 92 : 86;
	const bodyTop = headY + 52;
	const eye = kind === 2 ? 15 : 12;

	const legs =
		kind === 3
			? `M108 250L92 284L118 284L128 252ZM192 250L208 284L182 284L172 252Z`
			: `M112 248L104 286L134 286L134 250ZM188 248L196 286L166 286L166 250Z`;
	const arms =
		kind === 2
			? `M78 ${bodyTop + 18}L34 ${bodyTop + 70}L56 ${bodyTop + 84}L92 ${bodyTop + 44}ZM222 ${bodyTop + 18}L266 ${bodyTop - 24}L244 ${bodyTop - 38}L208 ${bodyTop + 4}Z`
			: `M78 ${bodyTop + 18}L40 ${bodyTop + 56}L62 ${bodyTop + 72}L92 ${bodyTop + 42}ZM222 ${bodyTop + 18}L260 ${bodyTop + 56}L238 ${bodyTop + 72}L208 ${bodyTop + 42}Z`;

	return svg(
		S,
		S,
		`<path d="${legs}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="${arms}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="M${cx - 62} ${bodyTop}L${cx + 62} ${bodyTop}L${cx + 54} ${bodyTop + 110}L${cx - 54} ${bodyTop + 110}Z" fill="${METAL}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M${cx - 62} ${bodyTop}L${cx} ${bodyTop}L${cx} ${bodyTop + 110}L${cx - 54} ${bodyTop + 110}Z" fill="${METAL_LIT}"/>
<path d="M${cx - 62} ${bodyTop}L${cx + 62} ${bodyTop}L${cx + 54} ${bodyTop + 110}L${cx - 54} ${bodyTop + 110}Z" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${rivets(cx, bodyTop + 55, 38, 4, 6, 0.7)}
<path d="M${cx - 14} ${headY + 40}L${cx + 14} ${headY + 40}L${cx + 14} ${bodyTop}L${cx - 14} ${bodyTop}Z" fill="${METAL_DIM}" stroke="${INK}" stroke-width="7"/>
<circle cx="${cx}" cy="${headY}" r="52" fill="${METAL}" stroke="${INK}" stroke-width="9"/>
<path d="M${cx} ${headY - 52}A52 52 0 0 0 ${cx - 52} ${headY}L${cx} ${headY}Z" fill="${METAL_LIT}"/>
<circle cx="${cx}" cy="${headY}" r="52" fill="none" stroke="${INK}" stroke-width="9"/>
<circle cx="${cx - 20}" cy="${headY - 4}" r="${eye}" fill="${GLASS}" stroke="${INK}" stroke-width="6"/>
<circle cx="${cx + 20}" cy="${headY - 4}" r="${eye}" fill="${GLASS}" stroke="${INK}" stroke-width="6"/>
<circle cx="${cx - 24}" cy="${headY - 9}" r="4" fill="${RIM}"/>
<path d="M${cx} ${headY - 52}L${cx} ${headY - 82}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
<circle cx="${cx}" cy="${headY - 88}" r="11" fill="${BRASS_LIT}" stroke="${INK}" stroke-width="7"/>`,
	);
}

/* -------------------------------------------------------------- ящики --- */

function stuff(kind, w, h) {
	const cx = w / 2;
	if (kind === 1 || kind === 3) {
		// Ящик с обвязкой.
		const bw = w * 0.32;
		const bh = h * 0.28;
		return svg(
			w,
			h,
			`<path d="M${cx - bw} ${h / 2 - bh}L${cx + bw} ${h / 2 - bh}L${cx + bw} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="${METAL}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M${cx - bw} ${h / 2 - bh}L${cx} ${h / 2 - bh}L${cx} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="${METAL_LIT}"/>
<path d="M${cx - bw} ${h / 2 - bh}L${cx + bw} ${h / 2 + bh}M${cx + bw} ${h / 2 - bh}L${cx - bw} ${h / 2 + bh}" stroke="${INK}" stroke-width="8" opacity="0.55"/>
<path d="M${cx - bw} ${h / 2 - bh}L${cx + bw} ${h / 2 - bh}L${cx + bw} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${rivets(cx, h / 2, Math.min(bw, bh) * 0.72, 4, 6, 0.8)}`,
		);
	}
	// Бочка с обручами.
	const bw = w * 0.24;
	const bh = h * 0.32;
	return svg(
		w,
		h,
		`<path d="M${cx - bw} ${h / 2 - bh}L${cx + bw} ${h / 2 - bh}L${cx + bw} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="${BRASS}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M${cx - bw} ${h / 2 - bh}L${cx - bw * 0.1} ${h / 2 - bh}L${cx - bw * 0.1} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="${BRASS_LIT}"/>
<path d="M${cx - bw} ${h / 2 - bh * 0.45}L${cx + bw} ${h / 2 - bh * 0.45}M${cx - bw} ${h / 2 + bh * 0.45}L${cx + bw} ${h / 2 + bh * 0.45}" stroke="${INK}" stroke-width="12" opacity="0.6"/>
<path d="M${cx - bw} ${h / 2 - bh}L${cx + bw} ${h / 2 - bh}L${cx + bw} ${h / 2 + bh}L${cx - bw} ${h / 2 + bh}Z" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<circle cx="${cx}" cy="${h / 2 - bh + 2}" r="${r1(bw * 0.3)}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="7"/>`,
	);
}

/* ------------------------------------------------------------ обломки --- */

/** Обломок породы. Тот же угловатый скол, что у камня, но без жил: это не
 *  угроза, а мусор на полу пещеры, и оранжевого ему не положено. */
function debris(seed, w, h) {
	const cx = w / 2;
	const cy = h / 2;
	const base = Math.min(w, h) * 0.3;
	const N = 8 + Math.floor(hash(seed, 3) * 4);
	const pts = [];
	for (let i = 0; i < N; i++) {
		const a = (i / N) * Math.PI * 2 + hash(i, seed) * 0.3;
		const rad = base * (0.62 + hash(i, seed + 11) * 0.72);
		pts.push({x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, a});
	}
	const outline = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('') + 'Z';
	const facet =
		pts
			.filter((p) => Math.cos(p.a - 2.3) > -0.2)
			.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`)
			.join('') + 'Z';
	const cracks = [];
	for (const k of [1, Math.floor(N / 2)]) {
		const p = pts[k % N];
		cracks.push(`M${r1(cx)} ${r1(cy)}L${r1(cx + (p.x - cx) * 0.8)} ${r1(cy + (p.y - cy) * 0.8)}`);
	}
	return svg(
		w,
		h,
		`<path d="${outline}" fill="${ROCK}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="${facet}" fill="${ROCK_LIT}"/>
<path d="${cracks.join('')}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
<path d="${outline}" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>`,
	);
}

/* ------------------------------------------------------------- остовы --- */

/** Разбитый корабль. Та же жестянка, что у героя, но потухшая и вскрытая:
 *  игрок узнаёт свой силуэт и понимает, чем кончается ошибка. */
function wreck(kind, w, h) {
	const cx = w / 2;
	const k = Math.min(w, h) / 500;
	const y = (v) => r1(h / 2 + (v - 250) * k);
	const x = (v) => r1(cx + (v - 250) * k);
	const tilt = kind === 2 ? -18 : kind === 3 ? 26 : kind === 4 ? 8 : -6;
	const broken = kind === 3 || kind === 4;

	const hull = broken
		? `M${x(250)} ${y(60)}C${x(296)} ${y(112)} ${x(340)} ${y(168)} ${x(340)} ${y(232)}L${x(332)} ${y(330)}L${x(196)} ${y(352)}L${x(160)} ${y(232)}C${x(160)} ${y(168)} ${x(204)} ${y(112)} ${x(250)} ${y(60)}Z`
		: `M${x(250)} ${y(54)}C${x(296)} ${y(108)} ${x(340)} ${y(164)} ${x(340)} ${y(230)}L${x(340)} ${y(360)}L${x(310)} ${y(420)}L${x(190)} ${y(420)}L${x(160)} ${y(360)}L${x(160)} ${y(230)}C${x(160)} ${y(164)} ${x(204)} ${y(108)} ${x(250)} ${y(54)}Z`;
	const shade = `M${x(250)} ${y(54)}L${x(340)} ${y(230)}L${x(340)} ${y(360)}L${x(250)} ${y(420)}Z`;
	const fin = `M${x(160)} ${y(300)}L${x(56)} ${y(424)}L${x(70)} ${y(440)}L${x(160)} ${y(392)}Z`;

	const tear = broken
		? `<path d="M${x(196)} ${y(352)}L${x(238)} ${y(300)}L${x(262)} ${y(338)}L${x(300)} ${y(292)}L${x(332)} ${y(330)}" fill="none" stroke="${INK}" stroke-width="${r1(10 * k)}" stroke-linejoin="round"/>`
		: '';

	return svg(
		w,
		h,
		`<g transform="rotate(${tilt} ${cx} ${h / 2})">
<path d="${fin}" fill="${METAL_DIM}" stroke="${INK}" stroke-width="${r1(9 * k)}" stroke-linejoin="round"/>
<path d="${hull}" fill="${METAL}" stroke="${INK}" stroke-width="${r1(10 * k)}" stroke-linejoin="round"/>
<path d="${shade}" fill="${METAL_DIM}"/>
<path d="${hull}" fill="none" stroke="${INK}" stroke-width="${r1(10 * k)}" stroke-linejoin="round"/>
${tear}
<circle cx="${x(250)}" cy="${y(168)}" r="${r1(44 * k)}" fill="${GLASS}" stroke="${INK}" stroke-width="${r1(10 * k)}"/>
<path d="M${x(216)} ${y(140)}L${x(266)} ${y(196)}" stroke="${INK}" stroke-width="${r1(7 * k)}" opacity="0.7"/>
${rivets(x(250), y(280), 42 * k, 4, 5 * k, 0.6)}
</g>`,
	);
}

/* ------------------------------------------------------------- запись --- */

const FILES = {
	'sign-warning.svg': sign('warning'),
	'sign-danger.svg': sign('danger'),
	'sign-right.svg': sign('right'),
	'sign-left.svg': sign('left'),
	'sign-down.svg': sign('down'),
	'sign-round.svg': sign('round'),
	'sign-happy.svg': sign('happy'),
	'sign-sad.svg': sign('sad'),
	'pipe-1.svg': pipe(1),
	'pipe-2.svg': pipe(2),
	'pipe-3.svg': pipe(3),
	'pipe-4.svg': pipe(4),
	'gear-1.svg': gearProp(10, 132, 134),
	'gear-2.svg': gearProp(12, 300, 300),
	'robot-1.svg': robot(1),
	'robot-2.svg': robot(2),
	'robot-3.svg': robot(3),
	'ship-1.svg': wreck(1, 500, 500),
	'ship-2.svg': wreck(2, 500, 500),
	'ship-3.svg': wreck(3, 500, 500),
	'ship-4.svg': wreck(4, 500, 750),
	'stuff-1.svg': stuff(1, 300, 300),
	'stuff-2.svg': stuff(2, 250, 250),
	'stuff-3.svg': stuff(3, 300, 300),
	'stuff-4.svg': stuff(4, 300, 299),
};
// Габариты обломков повторяют исходники: смена сдвинула бы декор на уровнях.
const DEBRIS_SIZE = {12: [300, 301], 2: [344, 344], 5: [300, 299], 8: [299, 300]};
for (let i = 1; i <= 13; i++) {
	const [w, h] = DEBRIS_SIZE[i] ?? [300, 300];
	FILES[`debris-${i}.svg`] = debris(i, w, h);
}

mkdirSync(OUT, {recursive: true});
let total = 0;
for (const [name, body] of Object.entries(FILES)) {
	writeFileSync(join(OUT, name), body);
	total += body.length;
}
console.log(
	`декор: ${Object.keys(FILES).length} объектов, ${(total / 1024).toFixed(1)} КБ вектором против 1180 КБ в PNG`,
);
