/**
 * Генератор слоя угрозы: мина, камень, червь (docs/DESIGN.md §3, §4).
 *
 * Что было: фотореалистичные текстуры без контура — аэрографный шар вместо
 * мины, красно-зелёный сток-камень вне палитры, оливковый рендер червя.
 * Три разных руки на трёх объектах одной роли.
 *
 * Что стало: перовой контур и плоская двухтоновая заливка. Внутри слоя
 * угрозы есть своя иерархия, и она читается по количеству оранжевого:
 *   мина   — активная угроза, у неё горячий глаз и она греется;
 *   червь  — преследует, оранжевого меньше, только пасть и суставы;
 *   камень — пассивная масса, оранжевое только в трещинах.
 * «Оранжевое убивает» остаётся верным, но объекты не спорят друг с другом.
 *
 * Мина тинтуется в рантайме (heatToTint: белый → 255,64,64), поэтому её тело
 * держится в тёплом железе средней светлоты: слишком тёмная база не даст
 * тинту диапазона, слишком яркая сравняет мину с кораблём.
 *
 * Слой цели живёт по тем же правилам, но в золоте: звезда, финишная площадка
 * и факел двигателя. Факел намеренно НЕ оранжевый — иначе сломается правило
 * «оранжевое убивает»; он золотой с белым ядром, то есть читается как топливо.
 *
 *   node apps/game/scripts/gen-sprites.mjs
 */

import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const VB = 256;
const C = VB / 2;

const INK = '#17120e';
const DANGER = '#ff5324';
const DANGER_DEEP = '#b32110';
const GOAL = '#ffd24a';
const GOAL_DEEP = '#c98a17';
const HOT = '#fff4d2';

const r1 = (v) => Math.round(v * 10) / 10;
const pt = (a, rad) => `${r1(C + Math.cos(a) * rad)} ${r1(C + Math.sin(a) * rad)}`;

function svg(body) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${VB}" height="${VB}" viewBox="0 0 ${VB} ${VB}">${body}</svg>\n`;
}

/* ---------------------------------------------------------------- мина --- */

function mine() {
	const R = 72;
	const SPIKES = 8;
	const spikeOut = 120;
	const half = 0.23; // половина углового основания шипа

	const spikes = [];
	for (let i = 0; i < SPIKES; i++) {
		const a = (i / SPIKES) * Math.PI * 2 - Math.PI / 2;
		// Шип не равнобедренный: одна грань круче другой, отчего силуэт
		// читается как кованый, а не как штампованная звезда.
		spikes.push(`M${pt(a - half, R - 8)}L${pt(a - half * 0.3, spikeOut)}L${pt(a + half, R - 8)}Z`);
	}

	// Фасет — прямой срез корпуса: жёсткая граница двух тонов, не градиент.
	const cut = -2.2;
	const facet = `M${pt(cut, R)}A${R} ${R} 0 0 1 ${pt(cut + Math.PI * 0.86, R)}` + `L${pt(cut, R)}Z`;

	const rivets = [];
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2 + 0.4;
		rivets.push(`<circle cx="${r1(C + Math.cos(a) * (R - 19))}" cy="${r1(C + Math.sin(a) * (R - 19))}" r="5"/>`);
	}

	return svg(`
<g stroke="${INK}" stroke-width="6" stroke-linejoin="round">
<path d="${spikes.join('')}" fill="#5f564a"/>
</g>
<circle cx="${C}" cy="${C}" r="${R}" fill="#7d7264" stroke="${INK}" stroke-width="7"/>
<path d="${facet}" fill="#9c9081"/>
<circle cx="${C}" cy="${C}" r="${R}" fill="none" stroke="${INK}" stroke-width="7"/>
<g fill="${INK}" opacity="0.5">${rivets.join('')}</g>
<circle cx="${C}" cy="${C}" r="26" fill="${DANGER_DEEP}" stroke="${INK}" stroke-width="7"/>
<circle cx="${C}" cy="${C}" r="14" fill="${DANGER}"/>
<circle cx="${r1(C - 5)}" cy="${r1(C - 5)}" r="4.5" fill="#ffd9c4"/>`);
}

/* -------------------------------------------------------------- камень --- */

function hash(i, salt) {
	let h = Math.imul(i + salt, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 3266489917);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function stone() {
	// Угловатый обломок: радиус прыгает от вершины к вершине, грани прямые.
	const N = 11;
	const pts = [];
	for (let i = 0; i < N; i++) {
		const a = (i / N) * Math.PI * 2 + hash(i, 3) * 0.28;
		const rad = 82 + (hash(i, 11) - 0.5) * 38;
		pts.push({x: C + Math.cos(a) * rad, y: C + Math.sin(a) * rad, a, rad});
	}
	const outline = pts.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`).join('') + 'Z';

	// Фасет: половина обломка, срезанная прямой — плоский второй тон.
	const facet =
		pts
			.filter((p) => Math.cos(p.a - 2.4) > -0.15)
			.map((p, i) => `${i ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`)
			.join('') + 'Z';

	// Жилы от центра к граням: единственное оранжевое у камня.
	const seams = [];
	for (const k of [1, 5, 8]) {
		const p = pts[k];
		const mx = C + (p.x - C) * 0.35 + (hash(k, 21) - 0.5) * 22;
		const my = C + (p.y - C) * 0.35 + (hash(k, 31) - 0.5) * 22;
		seams.push(`M${C} ${C}L${r1(mx)} ${r1(my)}L${r1(C + (p.x - C) * 0.82)} ${r1(C + (p.y - C) * 0.82)}`);
	}

	return svg(`
<path d="${outline}" fill="#3c352e" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${facet}" fill="#554b41"/>
<path d="${seams.join('')}" fill="none" stroke="${DANGER_DEEP}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${seams.join('')}" fill="none" stroke="${DANGER}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${outline}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`);
}

/* --------------------------------------------------------------- червь --- */

/**
 * Броневой сегмент. Сегменты цепляются в ленту и ползут по любому
 * направлению, поэтому форма симметрична по обеим осям, а куда смотрит
 * тварь, говорит только голова. Оранжевого здесь меньше, чем у мины:
 * у тела это дыхательное жерло, у головы — пасть.
 */
function wormSegment(kind) {
	const R = kind === 'tail' ? 56 : kind === 'head' ? 88 : 76;
	const plate = kind === 'head' ? '#544a3c' : '#473e33';
	const facetTone = kind === 'head' ? '#726551' : '#615645';

	// Панцирь: восьмиугольная пластина, почти круглая, но с гранями —
	// хитин, а не шар.
	const N = 8;
	const pts = [];
	for (let i = 0; i < N; i++) pts.push(pt((i / N) * Math.PI * 2 - Math.PI / 8, R));
	const body = `M${pts.join('L')}Z`;

	// Когти по диагоналям, длиннее радиуса пластины — силуэт цепляется
	// за стену и читается как многоножка даже на 40 px.
	const claws = [];
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
		claws.push(`M${pt(a - 0.19, R * 0.82)}L${pt(a - 0.02, R * 1.46)}L${pt(a + 0.19, R * 0.82)}Z`);
	}

	const facet = `M${pts.slice(5).join('L')}L${pts.slice(0, 2).join('L')}L${C} ${C}Z`;

	const core =
		kind === 'head'
			? `<circle cx="${C}" cy="${C}" r="34" fill="${DANGER_DEEP}" stroke="${INK}" stroke-width="7"/>
<path d="M${C - 19} ${C - 14}L${C} ${C + 4}L${C + 19} ${C - 14}L${C + 13} ${C + 20}L${C} ${C + 8}L${C - 13} ${C + 20}Z" fill="${DANGER}"/>`
			: `<circle cx="${C}" cy="${C}" r="${r1(R * 0.26)}" fill="${DANGER_DEEP}" stroke="${INK}" stroke-width="6"/>
<circle cx="${C}" cy="${C}" r="${r1(R * 0.12)}" fill="${DANGER}"/>`;

	return svg(`
<path d="${claws.join('')}" fill="${plate}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
<path d="${body}" fill="${plate}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${facet}" fill="${facetTone}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
${core}`);
}

/* ---------------------------------------------------------------- цель --- */

function star() {
	const N = 5;
	const pts = [];
	for (let i = 0; i < N * 2; i++) {
		pts.push(pt((i / (N * 2)) * Math.PI * 2 - Math.PI / 2, i % 2 ? 46 : 112));
	}
	const body = `M${pts.join('L')}Z`;
	// Фасет по трём верхним лучам: та же двухтоновая заливка, что у угрозы.
	const facet = `M${pts.slice(7).join('L')}L${pts.slice(0, 3).join('L')}L${C} ${C}Z`;
	return svg(`
<path d="${body}" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<path d="${facet}" fill="${GOAL}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
<circle cx="${r1(C - 16)}" cy="${r1(C - 22)}" r="9" fill="${HOT}"/>`);
}

/**
 * Финишная площадка. Одна и та же во всех мирах: финиш нельзя учить заново
 * каждые пятнадцать уровней. Самое светлое пятно кадра после корабля.
 */
function finish() {
	const chevrons = [];
	for (let i = 0; i < 4; i++) {
		const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
		chevrons.push(`M${pt(a - 0.3, 104)}L${pt(a, 68)}L${pt(a + 0.3, 104)}`);
	}
	return svg(`
<circle cx="${C}" cy="${C}" r="112" fill="#1f1a14" stroke="${INK}" stroke-width="9"/>
<circle cx="${C}" cy="${C}" r="86" fill="none" stroke="${GOAL_DEEP}" stroke-width="7"/>
<path d="${chevrons.join('')}" fill="none" stroke="${GOAL}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="${C}" cy="${C}" r="44" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="8"/>
<circle cx="${C}" cy="${C}" r="30" fill="${GOAL}"/>
<circle cx="${C}" cy="${C}" r="15" fill="${HOT}"/>`);
}

/** Стартовый люк — слой мира, не цели: тихий, без золота. */
function start() {
	const bolts = [];
	for (let i = 0; i < 8; i++) {
		const a = (i / 8) * Math.PI * 2;
		bolts.push(`<circle cx="${r1(C + Math.cos(a) * 88)}" cy="${r1(C + Math.sin(a) * 88)}" r="6"/>`);
	}
	return svg(`
<circle cx="${C}" cy="${C}" r="110" fill="#2b241c" stroke="${INK}" stroke-width="9"/>
<circle cx="${C}" cy="${C}" r="70" fill="#1c1712" stroke="${INK}" stroke-width="7"/>
<g fill="${INK}" opacity="0.65">${bolts.join('')}</g>`);
}

/**
 * Факел двигателя. Золото с белым ядром: оранжевое в этой игре означает
 * смерть, и тратить его на собственную тягу игрока нельзя.
 */
function booster() {
	const body = `M${C} 18L${C + 46} ${C + 6}L${C + 26} ${VB - 26}L${C} ${VB - 6}L${C - 26} ${VB - 26}L${C - 46} ${C + 6}Z`;
	const core = `M${C} 64L${C + 22} ${C + 22}L${C} ${VB - 52}L${C - 22} ${C + 22}Z`;
	return svg(`
<path d="${body}" fill="${GOAL_DEEP}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="${core}" fill="${GOAL}"/>
<path d="M${C} 92L${C + 11} ${C + 26}L${C} ${VB - 78}L${C - 11} ${C + 26}Z" fill="${HOT}"/>`);
}

/**
 * Пылевой слой поверх сцены — бесшовная плитка. Заменяет шумовое облако
 * light.png: вместо нейрошума редкие плоские пятна очень низкой плотности,
 * они дают глубину и не спорят с линией.
 */
function dust() {
	const S = 512;
	const blobs = [];
	for (let i = 0; i < 26; i++) {
		const x = hash(i, 71) * S;
		const y = hash(i, 137) * S;
		const rr = 34 + hash(i, 211) * 78;
		// Каждое пятно дублируется по обеим осям: то, что вылезло за край,
		// приходит с противоположной стороны, поэтому плитка бесшовна.
		for (const dx of [-S, 0, S]) {
			for (const dy of [-S, 0, S]) {
				if (x + dx + rr < 0 || x + dx - rr > S || y + dy + rr < 0 || y + dy - rr > S) continue;
				blobs.push(`<circle cx="${r1(x + dx)}" cy="${r1(y + dy)}" r="${r1(rr)}"/>`);
			}
		}
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<g fill="#0e0b08" opacity="0.16">${blobs.join('')}</g></svg>
`;
}

/* -------------------------------------------------------------- корабль --- */

/**
 * Корабль. Он обязан быть самым светлым пятном кадра (DESIGN.md §4): старый
 * ship2.png был темнее декора, и в рефлекторной игре это стоило игроку
 * первых ста миллисекунд на каждом экране.
 *
 * Скины — одна и та же жестянка в разной окраске, а не пять разных картинок
 * из разных рук. У всех корпус держится выше 75% светлоты, поэтому закон не
 * ломается от выбора игрока. Оранжевого нет ни у одного: он означает смерть.
 *
 * В иллюминаторе сидит пилот. На старом ассете он тоже был, но тёмный на
 * тёмном, и его никто не видел.
 */
function ship(skin) {
	const {hull, shade, trim, rim} = skin;

	// Силуэт: нос, корпус, сужение к дюзе. Дюза внизу по центру — туда
	// крепится факел (nozzle в stores/skin.ts).
	const body = 'M128 14C150 40 176 72 176 112L176 176L162 206L94 206L80 176L80 112C80 72 106 40 128 14Z';
	// Теневая сторона: правая треть, срезана прямой. Плоский второй тон.
	const shadeSide = 'M128 14C150 40 176 72 176 112L176 176L162 206L128 206Z';
	const finL = 'M80 148L24 214L30 222L80 198Z';
	const finR = 'M176 148L232 214L226 222L176 198Z';
	const bell = 'M94 206L162 206L172 248L84 248Z';

	const rivets = [];
	for (const y of [140, 168]) {
		for (const x of [98, 128, 158]) rivets.push(`<circle cx="${x}" cy="${y}" r="4.5"/>`);
	}

	return svg(`
<g stroke="${INK}" stroke-width="7" stroke-linejoin="round">
<path d="${finL}" fill="${trim}"/>
<path d="${finR}" fill="${trim}"/>
<path d="${bell}" fill="${shade}"/>
<path d="${body}" fill="${hull}"/>
</g>
<path d="${shadeSide}" fill="${shade}"/>
<path d="${body}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
<path d="M90 124L166 124" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
<path d="M84 186L172 186" stroke="${INK}" stroke-width="6" stroke-linecap="round" opacity="0.5"/>
<g fill="${INK}" opacity="0.45">${rivets.join('')}</g>
<circle cx="128" cy="88" r="36" fill="${trim}" stroke="${INK}" stroke-width="7"/>
<circle cx="128" cy="88" r="26" fill="#1c2630"/>
<circle cx="128" cy="94" r="15" fill="${hull}"/>
<circle cx="121" cy="90" r="4" fill="${INK}"/>
<circle cx="135" cy="90" r="4" fill="${INK}"/>
<path d="M121 101Q128 106 135 101" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
<path d="M104 70Q128 56 152 70" fill="none" stroke="${HOT}" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
<path d="M128 14C106 40 80 72 80 112L80 176" fill="none" stroke="${rim}" stroke-width="5" stroke-linecap="round" opacity="0.75"/>`);
}

const SKINS = {
	// prospector — базовый: бумажная жесть, латунная отделка.
	ship2: {hull: '#e8e2d4', shade: '#b3aa98', trim: '#c98a17', rim: '#fff4d2'},
	// wanderer — холодная эмаль, ледяной рим: самый читаемый в тёмной пещере.
	'ship-skins/ship-wanderer': {hull: '#dde7f0', shade: '#a3b2c0', trim: '#4f7d99', rim: '#7fd4ff'},
	// engineer — рабочая краска и много латуни.
	'ship-skins/ship-engineer': {hull: '#e3d8bd', shade: '#ab9d7c', trim: '#8a6a22', rim: '#ffe6a8'},
	// veteran — выгоревший корпус, тёмная отделка.
	'ship-skins/ship-veteran': {hull: '#d9d2c1', shade: '#9d9483', trim: '#4a4038', rim: '#f2ece0'},
	// asteroid-king — парадная позолота, самый светлый корпус.
	'ship-skins/ship-asteroid-king': {hull: '#f2e9d2', shade: '#c0b291', trim: '#ffd24a', rim: '#fff4d2'},
};

/* ------------------------------------------------------------- взрыв --- */

/**
 * Тринадцать кадров взрыва. Раньше это была нейросгенерированная вспышка без
 * контура — единственный момент смерти игрока выглядел как чужой стоковый
 * эффект. Теперь это тот же перовой контур и та же плоская заливка, что у
 * всего остального: ядро, разлетающиеся осколки, кольцо ударной волны и
 * дым в конце.
 *
 * Взрыв принадлежит слою угрозы, поэтому он оранжевый. Дым уходит в цвет
 * мира, чтобы кадр закрывался, а не оставался гореть.
 */
function explosion(frame, frames) {
	const p = frame / (frames - 1);
	const ease = 1 - (1 - p) ** 2.2;

	// Ядро: горячее и мелкое в начале, гаснет к середине.
	const coreR = 46 * (1 - ease * 0.55) * (p < 0.72 ? 1 : Math.max(0, (1 - p) / 0.28));
	// Ядро рисуется рваным многоугольником, а не кругом: огонь не бывает
	// окружностью, и круг здесь сразу читался как шарик.
	const burst = (rad, lobes, salt) => {
		const out = [];
		for (let i = 0; i < lobes; i++) {
			const a = (i / lobes) * Math.PI * 2;
			const k = rad * (i % 2 ? 0.58 : 1) * (0.82 + hash(i, salt) * 0.36);
			out.push(`${r1(C + Math.cos(a) * k)} ${r1(C + Math.sin(a) * k)}`);
		}
		return `M${out.join('L')}Z`;
	};
	const core =
		coreR > 1
			? `<path d="${burst(coreR, 12, 41)}" fill="${p < 0.3 ? HOT : DANGER}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
				(p < 0.45 ? `<path d="${burst(coreR * 0.52, 10, 43)}" fill="${HOT}"/>` : '')
			: '';

	// Кольцо ударной волны: расширяется и утончается.
	const ringR = 30 + ease * 92;
	const ringW = Math.max(0, 13 * (1 - ease));
	const ring =
		ringW > 0.6
			? `<circle cx="${C}" cy="${C}" r="${r1(ringR)}" fill="none" stroke="${DANGER_DEEP}" stroke-width="${r1(ringW)}" opacity="${r1(0.9 * (1 - ease * 0.8))}"/>`
			: '';

	// Осколки: угловатые, с контуром, разлетаются и мельчают.
	const shards = [];
	const N = 9;
	for (let i = 0; i < N; i++) {
		const a = (i / N) * Math.PI * 2 + hash(i, 5) * 0.5;
		const d = 26 + ease * (74 + hash(i, 9) * 34);
		const sz = (17 + hash(i, 13) * 11) * (1 - ease * 0.62);
		if (sz < 2) continue;
		const cx = C + Math.cos(a) * d;
		const cy = C + Math.sin(a) * d;
		const spin = hash(i, 17) * Math.PI;
		const poly = [];
		for (let k = 0; k < 5; k++) {
			const ka = spin + (k / 5) * Math.PI * 2;
			const kr = sz * (0.62 + hash(i * 5 + k, 23) * 0.5);
			poly.push(`${r1(cx + Math.cos(ka) * kr)} ${r1(cy + Math.sin(ka) * kr)}`);
		}
		shards.push(`M${poly.join('L')}Z`);
	}

	// Дым — только во второй половине, в цвете мира: кадр должен закрыться.
	const puffs = [];
	if (p > 0.42) {
		const q = (p - 0.42) / 0.58;
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + 0.7;
			const d = 24 + q * 62;
			const rr = (16 + hash(i, 29) * 16) * (0.55 + q);
			puffs.push(`<circle cx="${r1(C + Math.cos(a) * d)}" cy="${r1(C + Math.sin(a) * d)}" r="${r1(rr)}"/>`);
		}
	}

	const shardFill = p < 0.5 ? DANGER : DANGER_DEEP;
	return svg(`
${ring}
<g fill="#241f1b" opacity="${r1(Math.max(0, (p - 0.42) / 0.58) * 0.75)}">${puffs.join('')}</g>
<path d="${shards.join('')}" fill="${shardFill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round" opacity="${r1(1 - ease * 0.55)}"/>
${core}`);
}

/* ---------------------------------------------------------------- свет --- */

/**
 * Световые пятна. Радиальный градиент здесь не нарушает §3: запрет на
 * градиенты относится к объектам, а свет объектом не является — он ровно
 * то, чем градиент и должен быть.
 *
 * Зачем: в тёмной пещере объект без собственного света висит в пустоте.
 * Свет делает три вещи сразу — показывает, где герой, показывает, куда
 * лететь, и превращает провал в пространство. Это и есть разница между
 * «правильно» и «приятно».
 *
 * @param tone цвет ядра
 * @param falloff доля радиуса, на которой свет ещё заметен
 */
function lightPool(tone, falloff = 0.55) {
	const S = 512;
	const stops = [];
	// Кривая спада ближе к обратному квадрату, чем к линейной: линейный
	// градиент читается как наклейка, потому что в природе свет так не падает.
	for (let i = 0; i <= 8; i++) {
		const t = i / 8;
		const a = Math.max(0, (1 - t) ** 2.4) * (t < falloff ? 1 : 1 - (t - falloff) / (1 - falloff));
		stops.push(`<stop offset="${(t * 100).toFixed(0)}%" stop-color="${tone}" stop-opacity="${a.toFixed(3)}"/>`);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><radialGradient id="g" cx="50%" cy="50%" r="50%">${stops.join('')}</radialGradient></defs>
<rect width="${S}" height="${S}" fill="url(#g)"/></svg>
`;
}

/* ------------------------------------------------------------- рендер --- */

function emit(relPath, body) {
	const full = join(ROOT, relPath);
	mkdirSync(dirname(full), {recursive: true});
	writeFileSync(full, body);
	console.log(`${relPath.padEnd(34)} ${(body.length / 1024).toFixed(1).padStart(6)} КБ`);
	return body.length;
}

let total = 0;
total += emit('enemies/mine/mine.svg', mine());
total += emit('enemies/stone/stone.svg', stone());
total += emit('enemies/worm/s1.svg', wormSegment('head'));
total += emit('enemies/worm/s2.svg', wormSegment('body'));
total += emit('enemies/worm/s3.svg', wormSegment('tail'));
total += emit('star.svg', star());
total += emit('finish.svg', finish());
total += emit('start.svg', start());
total += emit('booster-single.svg', booster());
total += emit('dust.svg', dust());
// Тон лампы насыщеннее, чем кажется нужным: аддитивный свет на тёмном
// быстро уходит в белый, и бледно-кремовый превращается в белое пятно,
// которое спорит с корпусом. Янтарь остаётся янтарём даже в клиппинге.
total += emit('light-lamp.svg', lightPool('#ffbe63', 0.42));
total += emit('light-goal.svg', lightPool('#ffd24a', 0.42));
total += emit('light-danger.svg', lightPool('#ff5324', 0.38));
for (const [path, skin] of Object.entries(SKINS)) total += emit(`${path}.svg`, ship(skin));
for (let i = 0; i < 13; i++) total += emit(`effects/explosion/${i + 1}.svg`, explosion(i, 13));
console.log(`\nвсего ${(total / 1024).toFixed(1)} КБ`);
