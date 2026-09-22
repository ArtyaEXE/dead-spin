/**
 * Фоны, кадры комикса и фавикон (docs/DESIGN.md §3, §4, §9).
 *
 * Последний растр в проекте. Фон меню и подложка страницы были написаны
 * кистью, комикс — тоже, и это единственное, что держало в репозитории
 * пиксели. Перерисовано теми же правилами: перовой контур, плоская заливка,
 * светлота слоя мира.
 *
 * Сцены строятся из той же геометрии, что порода: осколочная сетка со
 * слиянием ячеек. Отличие в масштабе и в том, что здесь есть композиция —
 * свод, пол, проём и силуэты вдали.
 *
 *   node apps/game/scripts/gen-scenes.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const INK = '#14110e';
const VOID = '#0e0b08';
const ROCK_FAR = '#1d1814';
const ROCK_MID = '#241f1b';
const ROCK_NEAR = '#2f2821';
const ROCK_LIT = '#3a322a';
const BRASS = '#4a3e26';
const GOAL = '#ffd24a';
const HULL = '#e8e2d4';
const HULL_SHADE = '#9a9382';
const GLASS = '#26313a';
const LAMP = '#ffbe63';

const r1 = (v) => Math.round(v * 10) / 10;

function hash(i, salt) {
	let h = Math.imul(i + salt * 7919, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Полоса породы: ломаная с выступами. Верхняя кромка свода или нижняя пола.
 * `dir` = -1 свод (растёт вниз), +1 пол (растёт вверх).
 */
function rockBand(w, baseY, depth, dir, seed, steps = 9) {
	const pts = [];
	for (let i = 0; i <= steps; i++) {
		const x = (i / steps) * w;
		const d = depth * (0.35 + hash(i, seed) * 0.75);
		pts.push(`${r1(x)} ${r1(baseY + dir * d)}`);
	}
	// Полоса всегда замыкается на свою опорную кромку: свод — по y=0,
	// пол — по y=H. Раньше закрытие выбиралось по направлению роста, и свод
	// заливался вниз, из-за чего композиция исчезала.
	return `M${pts.join('L')}L${w} ${baseY}L0 ${baseY}Z`;
}

/** Сталактиты по кромке свода. */
function spikes(w, y, seed, n, len) {
	const out = [];
	for (let i = 0; i < n; i++) {
		const x = ((i + 0.5) / n) * w + (hash(i, seed) - 0.5) * (w / n) * 0.6;
		const half = 18 + hash(i, seed + 3) * 22;
		const l = len * (0.5 + hash(i, seed + 7));
		out.push(`M${r1(x - half)} ${r1(y)}L${r1(x + half)} ${r1(y)}L${r1(x + half * 0.2)} ${r1(y + l)}Z`);
	}
	return out.join('');
}

/** Шестерня-силуэт для дальнего плана. */
function gearSil(cx, cy, rOut, teeth, fill) {
	const rIn = rOut * 0.74;
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
			pts.push(`${r1(cx + Math.cos(ang) * rad)} ${r1(cy + Math.sin(ang) * rad)}`);
		}
	}
	return `<path d="M${pts.join('L')}Z" fill="${fill}"/><circle cx="${cx}" cy="${cy}" r="${r1(rOut * 0.26)}" fill="${VOID}"/>`;
}

/* --------------------------------------------------- подложка страницы --- */

/**
 * Фон вокруг игрового кадра. Виден только на широком экране по бокам от
 * рамки 480px, поэтому здесь нет композиции — только порода, уходящая
 * в темноту. Ему нельзя притягивать взгляд: игра идёт в середине.
 */
function globalBg() {
	const W = 1024;
	const H = 1024;
	const plates = [];
	const cracks = [];
	const n = 7;
	const cell = W / n;
	for (let j = -1; j <= n; j++) {
		for (let i = -1; i <= n; i++) {
			const jx = (hash(i * 31 + j, 5) - 0.5) * cell * 0.5;
			const jy = (hash(i + j * 31, 9) - 0.5) * cell * 0.5;
			const x = i * cell + jx;
			const y = j * cell + jy;
			const tone = [ROCK_FAR, ROCK_MID, '#1d1815'][Math.floor(hash(i * 7 + j * 13, 17) * 3)];
			const p = [];
			const N = 6;
			for (let k = 0; k < N; k++) {
				const a = (k / N) * Math.PI * 2 + hash(i * 3 + k, j + 21) * 0.5;
				const rad = cell * (0.52 + hash(i + k * 5, j + 33) * 0.34);
				p.push(`${r1(x + Math.cos(a) * rad)} ${r1(y + Math.sin(a) * rad)}`);
			}
			plates.push(`<path d="M${p.join('L')}Z" fill="${tone}"/>`);
			cracks.push(`M${p.join('L')}Z`);
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${VOID}"/>
<g>${plates.join('')}</g>
<path d="${cracks.join('')}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" opacity="0.8"/>
</svg>
`;
}

/* -------------------------------------------------------------- меню --- */

/**
 * Фон главного меню. Композиция строится под интерфейс: свод и пол уводят
 * взгляд к центру, где стоит логотип и кнопка. Середина намеренно пустая и
 * тёмная — она под контент, а не под картинку.
 */
function menuBg() {
	const W = 720;
	const H = 1280;
	const lamp = `
<defs>
	<radialGradient id="glow" cx="50%" cy="50%" r="50%">
		<stop offset="0%" stop-color="${LAMP}" stop-opacity="0.2"/>
		<stop offset="55%" stop-color="${LAMP}" stop-opacity="0.06"/>
		<stop offset="100%" stop-color="${LAMP}" stop-opacity="0"/>
	</radialGradient>
	<radialGradient id="vig" cx="50%" cy="46%" r="62%">
		<stop offset="62%" stop-color="${VOID}" stop-opacity="0"/>
		<stop offset="100%" stop-color="${VOID}" stop-opacity="0.6"/>
	</radialGradient>
</defs>`;

	// Дальний план: силуэты механизмов, почти не читаются — это глубина,
	// а не содержание.
	const far =
		gearSil(126, 232, 96, 11, ROCK_FAR) +
		gearSil(232, 316, 58, 9, ROCK_FAR) +
		gearSil(600, 980, 118, 13, ROCK_FAR) +
		`<path d="M40 640L200 640L200 700L40 700Z" fill="${ROCK_FAR}"/>` +
		`<path d="M520 500L680 500L680 556L520 556Z" fill="${ROCK_FAR}"/>` +
		`<path d="M170 640L170 900L228 900L228 640Z" fill="${ROCK_FAR}"/>`;

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${lamp}
<rect width="${W}" height="${H}" fill="${ROCK_FAR}"/>
<rect width="${W}" height="${H}" fill="${VOID}" opacity="0.18"/>
<g opacity="1">${far}</g>
<circle cx="360" cy="600" r="420" fill="url(#glow)"/>

<path d="${rockBand(W, 0, 250, 1, 11, 9)}" fill="${ROCK_MID}"/>
<path d="${rockBand(W, 0, 250, 1, 11, 9)}" fill="none" stroke="${INK}" stroke-width="5"/>
<path d="${spikes(W, 196, 13, 8, 140)}" fill="${ROCK_NEAR}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>

<path d="${rockBand(W, H, 260, -1, 23, 8)}" fill="${ROCK_MID}"/>
<path d="${rockBand(W, H, 260, -1, 23, 8)}" fill="none" stroke="${INK}" stroke-width="5"/>

<g opacity="0.8">
	<path d="M0 214L120 214L120 268L0 268Z" fill="${ROCK_LIT}" stroke="${INK}" stroke-width="5"/>
	<path d="M${W} 1010L${W - 130} 1010L${W - 130} 1066L${W} 1066Z" fill="${BRASS}" stroke="${INK}" stroke-width="5"/>
</g>
<rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>
`;
}

/* ------------------------------------------------------------ комикс --- */

/**
 * Три кадра вступления. Сюжет тот же, что был на живописных кадрах: корабль
 * уходит от станции, ныряет в пояс астероидов, садится в пещеру. Рассказан
 * силуэтом и светом, а не деталями: это пролог на пять секунд, его читают
 * одним взглядом.
 */
function comic(n) {
	const W = 1024;
	const H = 683;
	const defs = `
<defs>
	<radialGradient id="c-lamp" cx="50%" cy="50%" r="50%">
		<stop offset="0%" stop-color="${LAMP}" stop-opacity="0.5"/>
		<stop offset="46%" stop-color="${LAMP}" stop-opacity="0.13"/>
		<stop offset="100%" stop-color="${LAMP}" stop-opacity="0"/>
	</radialGradient>
	<radialGradient id="c-vig" cx="50%" cy="50%" r="62%">
		<stop offset="52%" stop-color="${VOID}" stop-opacity="0"/>
		<stop offset="100%" stop-color="${VOID}" stop-opacity="0.9"/>
	</radialGradient>
</defs>`;

	/** Корабль-силуэт: тот же контур, что у героя, в миниатюре. */
	const ship = (cx, cy, s, rot) => `
<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})">
	<path d="M-52 40L-96 96L-86 104L-52 84Z" fill="${BRASS}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
	<path d="M52 40L96 96L86 104L52 84Z" fill="${BRASS}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
	<path d="M0 -96C22 -70 48 -38 48 2L48 66L34 96L-34 96L-48 66L-48 2C-48 -38 -22 -70 0 -96Z" fill="${HULL}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
	<path d="M0 -96C22 -70 48 -38 48 2L48 66L34 96L0 96Z" fill="${HULL_SHADE}"/>
	<path d="M0 -96C22 -70 48 -38 48 2L48 66L34 96L-34 96L-48 66L-48 2C-48 -38 -22 -70 0 -96Z" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
	<circle cx="0" cy="-22" r="26" fill="${GLASS}" stroke="${INK}" stroke-width="8"/>
	<circle cx="0" cy="-16" r="11" fill="${HULL}"/>
	<path d="M-22 96L22 96L14 152L0 172L-14 152Z" fill="${GOAL}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
</g>`;

	/** Астероид-силуэт. */
	const rock = (cx, cy, rad, seed, fill) => {
		const p = [];
		const N = 9;
		for (let i = 0; i < N; i++) {
			const a = (i / N) * Math.PI * 2 + hash(i, seed) * 0.4;
			const r = rad * (0.66 + hash(i, seed + 5) * 0.62);
			p.push(`${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`);
		}
		return `<path d="M${p.join('L')}Z" fill="${fill}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
	};

	let scene;
	if (n === 1) {
		// Кадр 1: станция позади, корабль уходит в пустоту.
		scene = `
<rect width="${W}" height="${H}" fill="${VOID}"/>
${Array.from({length: 46}, (_, i) => `<circle cx="${r1(hash(i, 2) * W)}" cy="${r1(hash(i, 8) * H)}" r="${r1(1 + hash(i, 14) * 2.2)}" fill="${HULL}" opacity="${r1(0.15 + hash(i, 19) * 0.5)}"/>`).join('')}
<g opacity="0.85">
	<circle cx="176" cy="372" r="150" fill="${ROCK_MID}" stroke="${INK}" stroke-width="7"/>
	<path d="M176 222A150 150 0 0 0 26 372L176 372Z" fill="${ROCK_NEAR}"/>
	<circle cx="176" cy="372" r="150" fill="none" stroke="${INK}" stroke-width="7"/>
	${gearSil(176, 372, 78, 11, ROCK_FAR)}
	<path d="M26 372L-40 372M326 372L392 372" stroke="${BRASS}" stroke-width="24" stroke-linecap="round"/>
	<path d="M26 372L-40 372M326 372L392 372" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
</g>
<circle cx="716" cy="300" r="230" fill="url(#c-lamp)"/>
${ship(716, 300, 1.05, 22)}`;
	} else if (n === 2) {
		// Кадр 2: пояс астероидов, корабль между камнями.
		scene = `
<rect width="${W}" height="${H}" fill="${VOID}"/>
${Array.from({length: 30}, (_, i) => `<circle cx="${r1(hash(i, 3) * W)}" cy="${r1(hash(i, 11) * H)}" r="${r1(1 + hash(i, 17) * 2)}" fill="${HULL}" opacity="${r1(0.12 + hash(i, 23) * 0.4)}"/>`).join('')}
${rock(120, 130, 118, 31, ROCK_FAR)}
${rock(900, 176, 142, 37, ROCK_FAR)}
${rock(268, 574, 156, 41, ROCK_MID)}
${rock(806, 560, 128, 47, ROCK_MID)}
${rock(546, 640, 176, 53, ROCK_NEAR)}
<circle cx="536" cy="286" r="250" fill="url(#c-lamp)"/>
${ship(536, 286, 0.94, -16)}
${rock(52, 420, 92, 59, ROCK_NEAR)}`;
	} else {
		// Кадр 3: вход в пещеру, свод сверху, посадочный свет снизу.
		scene = `
<rect width="${W}" height="${H}" fill="${ROCK_FAR}"/>
<rect width="${W}" height="${H}" fill="${VOID}" opacity="0.4"/>
<path d="${rockBand(W, 0, 230, 1, 61, 8)}" fill="${ROCK_MID}" stroke="${INK}" stroke-width="6"/>
<path d="${spikes(W, 170, 67, 8, 130)}" fill="${ROCK_NEAR}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="${rockBand(W, H, 210, -1, 71, 7)}" fill="${ROCK_MID}" stroke="${INK}" stroke-width="6"/>
<circle cx="560" cy="560" r="200" fill="url(#c-lamp)"/>
<g transform="translate(560 566)">
	<circle cx="0" cy="0" r="96" fill="#1f1a14" stroke="${INK}" stroke-width="8"/>
	<circle cx="0" cy="0" r="72" fill="none" stroke="#c98a17" stroke-width="6"/>
	<circle cx="0" cy="0" r="34" fill="${GOAL}" stroke="${INK}" stroke-width="7"/>
</g>
<circle cx="430" cy="352" r="240" fill="url(#c-lamp)"/>
${ship(430, 352, 0.82, 8)}`;
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${defs}
${scene}
<rect width="${W}" height="${H}" fill="url(#c-vig)"/>
</svg>
`;
}

/* ----------------------------------------------------------- фавикон --- */

/** Силуэт корабля в кружке породы. Читается на 16 px: только корпус и глаз. */
function favicon() {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="#241f1b"/>
<path d="M14 44L4 58L10 60L18 52Z" fill="#4a3e26" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M50 44L60 58L54 60L46 52Z" fill="#4a3e26" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
<path d="M32 4C41 14 48 24 48 34L48 48L42 56L22 56L16 48L16 34C16 24 23 14 32 4Z" fill="${HULL}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<path d="M32 4C41 14 48 24 48 34L48 48L42 56L32 56Z" fill="${HULL_SHADE}"/>
<path d="M32 4C41 14 48 24 48 34L48 48L42 56L22 56L16 48L16 34C16 24 23 14 32 4Z" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
<circle cx="32" cy="24" r="7" fill="${GLASS}" stroke="${INK}" stroke-width="3"/>
</svg>
`;
}

/* ------------------------------------------------------------- запись --- */

const FILES = {
	'global-bg.svg': globalBg(),
	'main-menu-bg.svg': menuBg(),
	'favicon.svg': favicon(),
	'comics/c1-1.svg': comic(1),
	'comics/c1-2.svg': comic(2),
	'comics/c1-3.svg': comic(3),
};

let total = 0;
for (const [name, body] of Object.entries(FILES)) {
	const full = join(PUB, name);
	mkdirSync(dirname(full), {recursive: true});
	writeFileSync(full, body);
	total += body.length;
	console.log(`${name.padEnd(22)} ${(body.length / 1024).toFixed(1).padStart(6)} КБ`);
}
console.log(`\nвсего ${(total / 1024).toFixed(1)} КБ вектором против 587 КБ в растре`);
