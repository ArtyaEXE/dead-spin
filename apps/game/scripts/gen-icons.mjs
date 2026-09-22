/**
 * Рисованные иконки интерфейса и мира (docs/DESIGN.md §3, §7).
 *
 * Двадцать девять растровых иконок: показания приборов, ачивки, подсказки
 * туториала, предупреждения. Они были написаны кистью и в этом была их
 * ценность, но растр означает одну фиксированную плотность — на ретине
 * латунный фонарь размазывался.
 *
 * Здесь они переведены в тот же перовой контур и плоскую заливку, что весь
 * остальной мир. Это не глифы интерфейса из Icon.tsx: у тех сетка 24 и один
 * штрих, здесь предметы мира со своим материалом и двумя тонами. Разница
 * умышленная — HUD показывает вещи, а не абстракции.
 *
 * Габарит 256 повторяет исходники, кроме двух иконок результата на 512.
 *
 *   node apps/game/scripts/gen-icons.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const INK = '#14110e';
const BRASS = '#9a7b3c';
const BRASS_LIT = '#c39c50';
const BRASS_DIM = '#6d5628';
const STEEL = '#8d8578';
const STEEL_LIT = '#b4ab9b';
const STEEL_DIM = '#5f594f';
const GOAL = '#ffd24a';
const GOAL_DEEP = '#c98a17';
const DANGER = '#ff5324';
const DANGER_DEEP = '#b32110';
const GLASS = '#2a3742';
const PAPER = '#e6dcc6';

const S = 256;
const C = S / 2;
const r1 = (v) => Math.round(v * 10) / 10;

function svg(body, size = S) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${body}</svg>\n`;
}

const ring = (cx, cy, r, n, rad = 5, from = 0) => {
	const out = [];
	for (let i = 0; i < n; i++) {
		const a = from + (i / n) * Math.PI * 2;
		out.push(`<circle cx="${r1(cx + Math.cos(a) * r)}" cy="${r1(cy + Math.sin(a) * r)}" r="${rad}"/>`);
	}
	return `<g fill="${INK}" opacity="0.45">${out.join('')}</g>`;
};

/* ------------------------------------------------------------ приборы --- */

/** Баллон топлива: корпус с манометром и краном. */
const fuel = () =>
	svg(`
<path d="M74 92L182 92L182 232L74 232Z" fill="${BRASS}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M74 92L128 92L128 232L74 232Z" fill="${BRASS_LIT}"/>
<path d="M74 92L182 92L182 232L74 232Z" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M74 138L182 138M74 194L182 194" stroke="${INK}" stroke-width="7" opacity="0.4"/>
<path d="M104 92L104 56L152 56L152 92Z" fill="${BRASS_DIM}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="M152 70L196 70L196 44" fill="none" stroke="${BRASS_DIM}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M152 70L196 70L196 44" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="146" cy="176" r="30" fill="${GLASS}" stroke="${INK}" stroke-width="8"/>
<path d="M146 176L162 158" stroke="${GOAL}" stroke-width="8" stroke-linecap="round"/>
${ring(128, 162, 0, 0)}`);

/** Часы: корпус, стекло, стрелки. */
const clock = () =>
	svg(`
<circle cx="${C}" cy="140" r="92" fill="${BRASS}" stroke="${INK}" stroke-width="10"/>
<path d="M${C} 48A92 92 0 0 0 36 140L${C} 140Z" fill="${BRASS_LIT}"/>
<circle cx="${C}" cy="140" r="92" fill="none" stroke="${INK}" stroke-width="10"/>
<circle cx="${C}" cy="140" r="68" fill="${PAPER}" stroke="${INK}" stroke-width="8"/>
<path d="M${C} 96L${C} 140L166 168" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${C}" cy="140" r="8" fill="${INK}"/>
<path d="M${C} 48L${C} 24" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
<circle cx="${C}" cy="18" r="14" fill="${BRASS_DIM}" stroke="${INK}" stroke-width="8"/>`);

/** Монеты: стопка из трёх, верхняя с чеканкой. */
const coins = () => {
	const disc = (y, fill) =>
		`<ellipse cx="${C}" cy="${y}" rx="86" ry="30" fill="${fill}" stroke="${INK}" stroke-width="9"/>`;
	return svg(`
${disc(186, BRASS_DIM)}
<path d="M42 186L42 162L214 162L214 186Z" fill="${BRASS_DIM}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${disc(162, BRASS)}
<path d="M42 162L42 138L214 138L214 162Z" fill="${BRASS}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
${disc(138, GOAL_DEEP)}
<ellipse cx="${C}" cy="138" rx="54" ry="18" fill="${GOAL}" stroke="${INK}" stroke-width="7"/>
<ellipse cx="112" cy="132" rx="14" ry="5" fill="#fff4d2" opacity="0.8"/>`);
};

/** Трофей. */
const trophy = () =>
	svg(`
<path d="M88 116L168 116L168 156L88 156Z" fill="none"/>
<path d="M84 44L172 44L172 106A44 44 0 0 1 84 106Z" fill="${BRASS}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M84 44L128 44L128 148A44 44 0 0 1 84 106Z" fill="${BRASS_LIT}"/>
<path d="M84 44L172 44L172 106A44 44 0 0 1 84 106Z" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M84 58L48 58L48 92A34 34 0 0 0 86 124" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
<path d="M172 58L208 58L208 92A34 34 0 0 1 170 124" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
<path d="M116 148L140 148L140 186L116 186Z" fill="${BRASS_DIM}" stroke="${INK}" stroke-width="9"/>
<path d="M76 186L180 186L192 218L64 218Z" fill="${BRASS_DIM}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M128 66L140 92L168 94L146 112L154 140L128 124L102 140L110 112L88 94L116 92Z" fill="${GOAL}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`);

/** Призрак: полупрозрачный корпус чужого корабля. */
const ghost = () =>
	svg(`
<path d="M${C} 44C160 78 192 116 192 158L192 214L164 190L136 214L108 190L80 214L64 158C64 116 96 78 ${C} 44Z" fill="${STEEL_DIM}" stroke="${INK}" stroke-width="10" stroke-linejoin="round" opacity="0.85"/>
<path d="M${C} 44C160 78 192 116 192 158L192 214L164 190L${C} 214Z" fill="${STEEL}" opacity="0.55"/>
<circle cx="${C}" cy="126" r="34" fill="${GLASS}" stroke="${INK}" stroke-width="9"/>
<path d="M112 110L136 138" stroke="#7fd4ff" stroke-width="8" stroke-linecap="round" opacity="0.8"/>`);

/** Замок. */
const lock = () =>
	svg(`
<path d="M88 126L88 84A40 40 0 0 1 168 84L168 126" fill="none" stroke="${STEEL_DIM}" stroke-width="24" stroke-linecap="round"/>
<path d="M88 126L88 84A40 40 0 0 1 168 84L168 126" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>
<path d="M56 126L200 126L200 220L56 220Z" fill="${STEEL}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M56 126L128 126L128 220L56 220Z" fill="${STEEL_LIT}"/>
<path d="M56 126L200 126L200 220L56 220Z" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<circle cx="${C}" cy="164" r="17" fill="${INK}"/>
<path d="M${C} 164L${C} 196" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>`);

/** Подарок дейлика. */
const gift = () =>
	svg(`
<path d="M52 118L204 118L204 216L52 216Z" fill="${BRASS}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M52 118L128 118L128 216L52 216Z" fill="${BRASS_LIT}"/>
<path d="M52 118L204 118L204 216L52 216Z" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M40 86L216 86L216 126L40 126Z" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M110 86L110 216L146 216L146 86Z" fill="${GOAL}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M128 86C104 86 86 68 86 52C86 38 110 40 128 86ZM128 86C152 86 170 68 170 52C170 38 146 40 128 86Z" fill="${GOAL}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>`);

/** Ноты и динамик для настроек. */
const music = () =>
	svg(`
<path d="M96 186L96 68L192 46L192 164" fill="none" stroke="${BRASS_DIM}" stroke-width="16" stroke-linejoin="round"/>
<path d="M96 68L192 46L192 84L96 106Z" fill="${BRASS}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M96 186L96 68L192 46L192 164" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<ellipse cx="72" cy="192" rx="34" ry="25" fill="${BRASS}" stroke="${INK}" stroke-width="9" transform="rotate(-12 72 192)"/>
<ellipse cx="168" cy="170" rx="34" ry="25" fill="${BRASS}" stroke="${INK}" stroke-width="9" transform="rotate(-12 168 170)"/>
<ellipse cx="62" cy="184" rx="12" ry="7" fill="${BRASS_LIT}" transform="rotate(-12 62 184)"/>
<ellipse cx="158" cy="162" rx="12" ry="7" fill="${BRASS_LIT}" transform="rotate(-12 158 162)"/>`);

const sound = () =>
	svg(`
<path d="M36 100L84 100L140 52L140 204L84 156L36 156Z" fill="${STEEL}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M36 100L84 100L140 52L140 128L36 128Z" fill="${STEEL_LIT}"/>
<path d="M36 100L84 100L140 52L140 204L84 156L36 156Z" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M172 96A46 46 0 0 1 172 160" fill="none" stroke="${BRASS_LIT}" stroke-width="12" stroke-linecap="round"/>
<path d="M204 70A86 86 0 0 1 204 186" fill="none" stroke="${BRASS_LIT}" stroke-width="12" stroke-linecap="round"/>`);

/* ----------------------------------------------------------- подсказки --- */

/** Палец на экране — «тапни». */
const tap = () =>
	svg(`
<circle cx="${C}" cy="${C}" r="72" fill="none" stroke="${GOAL}" stroke-width="8" opacity="0.5"/>
<circle cx="${C}" cy="${C}" r="104" fill="none" stroke="${GOAL}" stroke-width="6" opacity="0.25"/>
<path d="M112 148L112 74A18 18 0 0 1 148 74L148 140L172 146A26 26 0 0 1 192 176L186 214L118 214L84 168A16 16 0 0 1 108 148Z" fill="${PAPER}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M148 168L148 196M168 172L168 196" stroke="${INK}" stroke-width="8" stroke-linecap="round" opacity="0.5"/>`);

/** Тяга — двойной шеврон вверх в золоте цели. */
const boost = () =>
	svg(`
<path d="M56 148L128 76L200 148" fill="none" stroke="${GOAL_DEEP}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M56 148L128 76L200 148" fill="none" stroke="${GOAL}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M56 212L128 140L200 212" fill="none" stroke="${GOAL_DEEP}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>
<path d="M56 212L128 140L200 212" fill="none" stroke="${GOAL}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>`);

/** Шестерня загрузки. */
const loading = () => {
	const teeth = 10;
	const rOut = 104;
	const rIn = 78;
	const step = (Math.PI * 2) / teeth;
	const pts = [];
	for (let i = 0; i < teeth; i++) {
		const a = i * step - Math.PI / 2;
		for (const [ang, rad] of [
			[a - step * 0.2, rOut],
			[a + step * 0.2, rOut],
			[a + step * 0.3, rIn],
			[a + step * 0.7, rIn],
		]) {
			pts.push(`${r1(C + Math.cos(ang) * rad)} ${r1(C + Math.sin(ang) * rad)}`);
		}
	}
	return svg(`
<path d="M${pts.join('L')}Z" fill="${BRASS}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M${pts.slice(0, pts.length / 2).join('L')}L${C} ${C}Z" fill="${BRASS_LIT}"/>
<path d="M${pts.join('L')}Z" fill="none" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<circle cx="${C}" cy="${C}" r="32" fill="#2a251f" stroke="${INK}" stroke-width="9"/>`);
};

/** Предупреждение: треугольник с восклицанием, цвет задаёт роль. */
const warn = (tone, deep) =>
	svg(`
<path d="M${C} 34L226 210L30 210Z" fill="${deep}" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M${C} 34L226 210L${C} 210Z" fill="${tone}"/>
<path d="M${C} 34L226 210L30 210Z" fill="none" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M116 96L140 96L136 158L120 158Z" fill="${INK}"/>
<circle cx="${C}" cy="180" r="13" fill="${INK}"/>`);

/** Финиш — маленькая копия площадки. */
const finishIcon = () =>
	svg(`
<circle cx="${C}" cy="${C}" r="102" fill="#1f1a14" stroke="${INK}" stroke-width="10"/>
<circle cx="${C}" cy="${C}" r="76" fill="none" stroke="${GOAL_DEEP}" stroke-width="8"/>
<path d="M${C - 26} 88L${C} 118L${C + 26} 88M${C - 26} 168L${C} 138L${C + 26} 168M88 ${C - 26}L118 ${C}L88 ${C + 26}M168 ${C - 26}L138 ${C}L168 ${C + 26}" fill="none" stroke="${GOAL}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${C}" cy="${C}" r="30" fill="${GOAL}" stroke="${INK}" stroke-width="8"/>`);

/** Звезда подбора. */
const starIcon = () => {
	const pts = [];
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
		const rad = i % 2 ? 44 : 106;
		pts.push(`${r1(C + Math.cos(a) * rad)} ${r1(C + Math.sin(a) * rad)}`);
	}
	return svg(`
<path d="M${pts.join('L')}Z" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>
<path d="M${pts.slice(7).join('L')}L${pts.slice(0, 3).join('L')}L${C} ${C}Z" fill="${GOAL}"/>
<path d="M${pts.join('L')}Z" fill="none" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`);
};

/** Стоп и гравитация — знаки внутри уровня, не интерфейс. */
const decoStop = () =>
	svg(`
<path d="M88 30L168 30L226 88L226 168L168 226L88 226L30 168L30 88Z" fill="#7a2a14" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M88 30L168 30L226 88L226 128L30 128L30 88Z" fill="#8e3318"/>
<path d="M88 30L168 30L226 88L226 168L168 226L88 226L30 168L30 88Z" fill="none" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M78 128L178 128" stroke="${PAPER}" stroke-width="22" stroke-linecap="round"/>`);

const decoGravity = () =>
	svg(`
<path d="M${C} 214L74 140L106 140L106 42L150 42L150 140L182 140Z" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M${C} 214L74 140L106 140L106 42L${C} 42Z" fill="${GOAL}"/>
<path d="M${C} 214L74 140L106 140L106 42L150 42L150 140L182 140Z" fill="none" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>`);

/** Крушение и пауза — на экране результата, 512. */
const crash = () => {
	const S2 = 512;
	const c = 256;
	const shards = [];
	for (let i = 0; i < 9; i++) {
		const a = (i / 9) * Math.PI * 2 + 0.3;
		const d = 128 + (i % 3) * 34;
		const sz = 30 - (i % 3) * 6;
		const poly = [];
		for (let k = 0; k < 5; k++) {
			const ka = a * 3 + (k / 5) * Math.PI * 2;
			poly.push(`${r1(c + Math.cos(a) * d + Math.cos(ka) * sz)} ${r1(c + Math.sin(a) * d + Math.sin(ka) * sz)}`);
		}
		shards.push(`M${poly.join('L')}Z`);
	}
	const burst = [];
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		const rad = i % 2 ? 60 : 108;
		burst.push(`${r1(c + Math.cos(a) * rad)} ${r1(c + Math.sin(a) * rad)}`);
	}
	return svg(
		`<path d="${shards.join('')}" fill="${DANGER_DEEP}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<path d="M${burst.join('L')}Z" fill="${DANGER}" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>
<path d="M${burst.filter((_, i) => i < 7).join('L')}L${c} ${c}Z" fill="#ff8a5c"/>
<path d="M${burst.join('L')}Z" fill="none" stroke="${INK}" stroke-width="11" stroke-linejoin="round"/>`,
		S2,
	);
};

const pauseIcon = () => {
	const S2 = 512;
	const c = 256;
	const bar = (x) =>
		`<path d="M${x - 44} 130L${x + 44} 130L${x + 44} 382L${x - 44} 382Z" fill="${BRASS}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>
<path d="M${x - 44} 130L${x} 130L${x} 382L${x - 44} 382Z" fill="${BRASS_LIT}"/>
<path d="M${x - 44} 130L${x + 44} 130L${x + 44} 382L${x - 44} 382Z" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/>`;
	return svg(bar(c - 66) + bar(c + 66), S2);
};

/* ------------------------------------------------------------- ачивки --- */

/**
 * Ачивка — медаль: лента, диск, символ. Одна форма на все семь, различает
 * символ. Так они читаются как коллекция, а не как семь разных картинок.
 */
function medal(symbol, tone = BRASS, toneLit = BRASS_LIT) {
	return svg(`
<path d="M84 26L118 26L134 116L104 130ZM172 26L138 26L122 116L152 130Z" fill="#6d3a2a" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/>
<circle cx="${C}" cy="166" r="80" fill="${tone}" stroke="${INK}" stroke-width="10"/>
<path d="M${C} 86A80 80 0 0 0 48 166L${C} 166Z" fill="${toneLit}"/>
<circle cx="${C}" cy="166" r="80" fill="none" stroke="${INK}" stroke-width="10"/>
<circle cx="${C}" cy="166" r="60" fill="none" stroke="${INK}" stroke-width="6" opacity="0.35"/>
${symbol}`);
}

const symStar = (cx, cy, r, fill) => {
	const pts = [];
	for (let i = 0; i < 10; i++) {
		const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
		const rad = i % 2 ? r * 0.42 : r;
		pts.push(`${r1(cx + Math.cos(a) * rad)} ${r1(cy + Math.sin(a) * rad)}`);
	}
	return `<path d="M${pts.join('L')}Z" fill="${fill}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
};

const ACH = {
	'ach-first-clear': medal(
		`<path d="M96 168L120 194L164 138" fill="none" stroke="${INK}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`,
	),
	'ach-first-3stars': medal(symStar(128, 166, 44, GOAL)),
	'ach-all-3stars': medal(
		`${symStar(98, 176, 30, GOAL)}${symStar(158, 176, 30, GOAL)}${symStar(128, 140, 34, GOAL)}`,
		GOAL_DEEP,
		GOAL,
	),
	'ach-all-levels': medal(
		`<path d="M92 130L164 130L164 202L92 202Z" fill="none" stroke="${INK}" stroke-width="10"/><path d="M92 154L164 154M92 178L164 178M116 130L116 202M140 130L140 202" stroke="${INK}" stroke-width="7" opacity="0.6"/>`,
	),
	'ach-all-skins': medal(
		`<path d="M128 116C144 134 160 152 160 174L160 208L96 208L96 174C96 152 112 134 128 116Z" fill="${PAPER}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/><circle cx="128" cy="160" r="15" fill="${GLASS}" stroke="${INK}" stroke-width="7"/>`,
	),
	'ach-speedrunner': medal(
		`<circle cx="128" cy="166" r="42" fill="${PAPER}" stroke="${INK}" stroke-width="9"/><path d="M128 136L128 166L152 182" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
		STEEL_DIM,
		STEEL,
	),
	'ach-fuel-efficient': medal(
		`<path d="M104 130L152 130L152 202L104 202Z" fill="${PAPER}" stroke="${INK}" stroke-width="9" stroke-linejoin="round"/><path d="M104 176L152 176L152 202L104 202Z" fill="${GOAL}" stroke="${INK}" stroke-width="7"/><path d="M116 130L116 114L140 114L140 130" fill="none" stroke="${INK}" stroke-width="8"/>`,
	),
};

/* ------------------------------------------------------------- запись --- */

const FILES = {
	'fuel-icon.svg': fuel(),
	'clock-icon.svg': clock(),
	'coins-icon.svg': coins(),
	'trophy-icon.svg': trophy(),
	'ghost-icon.svg': ghost(),
	'lock-icon.svg': lock(),
	'daily-gift-icon.svg': gift(),
	'music-icon.svg': music(),
	'sound-icon.svg': sound(),
	'icon-tap.svg': tap(),
	'icon-boost.svg': boost(),
	'icon-loading.svg': loading(),
	'icon-finish.svg': finishIcon(),
	'icon-star-collect.svg': starIcon(),
	'icon-mine-warning.svg': warn(DANGER, DANGER_DEEP),
	'icon-stone-warning.svg': warn('#c9702f', '#8a4718'),
	'icon-worm-warning.svg': warn('#d1853a', '#8f571f'),
	'warning-icon.svg': warn(GOAL, GOAL_DEEP),
	'deco-stop.svg': decoStop(),
	'deco-gravity-down.svg': decoGravity(),
	'crash-icon.svg': crash(),
	'pause-icon.svg': pauseIcon(),
	...Object.fromEntries(Object.entries(ACH).map(([k, v]) => [`${k}.svg`, v])),
};

mkdirSync(OUT, {recursive: true});
let total = 0;
for (const [name, body] of Object.entries(FILES)) {
	writeFileSync(join(OUT, name), body);
	total += body.length;
}
console.log(`иконки: ${Object.keys(FILES).length} штук, ${(total / 1024).toFixed(1)} КБ вектором против 720 КБ в PNG`);
