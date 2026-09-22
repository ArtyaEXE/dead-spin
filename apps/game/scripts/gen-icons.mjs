/**
 * Иконки интерфейса из game-icons.net (docs/DESIGN.md §7).
 *
 * До этого иконки рисовались здесь же вручную: перовой контур и два тона,
 * как у объектов мира. Сравнение с профессионально нарисованными силуэтами
 * показало две вещи. Первая: их рисунок лучше — бочка, кубок, замок сделаны
 * увереннее, чем получалось у меня. Вторая, и более важная: перенести их в
 * двухтоновый закон механически нельзя. Внутренняя деталь у них сделана
 * негативным пространством — обручи бочки и риски циферблата это дырки, и
 * обводка превращает их в кашу.
 *
 * Поэтому закон для HUD переписан, а не обойдён: иконки интерфейса — сплошные
 * силуэты, контур с двумя тонами остаётся объектам мира. Это не поблажка.
 * На 24 пикселях второй тон не виден, а лишняя обводка съедает форму; и
 * прецедент уже был — глифы `Icon.tsx` (крестик, шестерня, play) одноцветные
 * с самого начала. Набор `/icons/*` был единственным, что выбивалось.
 *
 * Геометрия исходников не меняется: берётся путь силуэта и заливается цветом
 * роли. Роль, а не вкус, решает цвет — прибор латунный, награда золотая,
 * угроза оранжевая.
 *
 * Исходники вендорены в `apps/game/assets/game-icons/` вместе с лицензией
 * CC BY 3.0: сборка не ходит в сеть и воспроизводима.
 *
 *   node apps/game/scripts/gen-icons.mjs
 */

import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'assets', 'game-icons');
const OUT = join(HERE, '..', 'public', 'icons');

/**
 * Цвета ролей. Светлее, чем у объектов мира: иконка живёт на тёмной плашке
 * приборной панели и обязана читаться без подсветки.
 */
const BRASS = '#c39c50'; // прибор, настройка, механизм
const GOAL = '#ffd24a'; // награда, цель, подсказка действия
const DANGER = '#ff5324'; // угроза
const STEEL = '#b4ab9b'; // нейтральное: замок, чужой призрак

/**
 * Карта: наш файл → исходник и роль.
 *
 * Подбор не случайный. `land-mine` вместо абстрактной бомбы, потому что
 * именно мина и есть угроза в игре; `falling-boulder` вместо камня, потому
 * что камень в игре падает; `level-end-flag` вместо мишени, потому что
 * финиш это площадка, а не цель для стрельбы.
 */
const MAP = {
	// Приборы и настройки
	'fuel-icon': ['delapouite/jerrycan', BRASS],
	'clock-icon': ['lorc/stopwatch', BRASS],
	'music-icon': ['delapouite/musical-notes', BRASS],
	'sound-icon': ['delapouite/sound-on', BRASS],
	'icon-loading': ['lorc/gears', BRASS],
	'pause-icon': ['guard13007/pause-button', BRASS],

	// Награды и цели
	'coins-icon': ['badges/coins', GOAL],
	'trophy-icon': ['delapouite/trophy-cup', GOAL],
	'daily-gift-icon': ['delapouite/present', GOAL],
	'icon-star-collect': ['badges/star', GOAL],
	'icon-finish': ['delapouite/finish-line', GOAL],
	'icon-boost': ['lorc/afterburn', GOAL],
	'icon-tap': ['lorc/pointing', GOAL],
	'warning-icon': ['lorc/hazard-sign', GOAL],
	'deco-gravity-down': ['badges/arrow-down', GOAL],

	// Угрозы
	'icon-mine-warning': ['skoll/teller-mine', DANGER],
	'icon-stone-warning': ['lorc/falling-boulder', DANGER],
	'icon-worm-warning': ['cathelineau/earth-worm', DANGER],
	'crash-icon': ['lorc/bright-explosion', DANGER],
	'deco-stop': ['lorc/interdiction', DANGER],

	// Нейтральное
	'lock-icon': ['lorc/padlock', STEEL],
	'ghost-icon': ['lorc/ghost', STEEL],

	// Ачивки: медали одной семьи, различает символ
	'ach-first-clear': ['lorc/medal', BRASS],
	'ach-first-3stars': ['delapouite/star-medal', GOAL],
	'ach-all-3stars': ['delapouite/ribbon-medal', GOAL],
	'ach-all-levels': ['delapouite/sport-medal', BRASS],
	'ach-all-skins': ['delapouite/medallist', BRASS],
	'ach-speedrunner': ['delapouite/speedometer', STEEL],
	'ach-fuel-efficient': ['delapouite/jerrycan', GOAL],
};

/**
 * Силуэт из исходника. У game-icons формат один: чёрный прямоугольник фона
 * и поверх путь с `fill="#fff"`. Фон нам не нужен — иконка ложится на плашку
 * приборной панели и должна быть прозрачной.
 */
function silhouette(rel) {
	const raw = readFileSync(join(SRC, `${rel}.svg`), 'utf8');
	const box = /viewBox="([^"]+)"/.exec(raw);
	const path = /<path fill="#fff" d="([^"]+)"/.exec(raw);
	if (!path) throw new Error(`В ${rel}.svg не нашёлся путь силуэта`);
	return {viewBox: box ? box[1] : '0 0 512 512', d: path[1]};
}

mkdirSync(OUT, {recursive: true});
let total = 0;
const byAuthor = {};

for (const [name, entry] of Object.entries(MAP)) {
	const [rel, tone] = entry;
	const {viewBox, d} = silhouette(rel);
	const author = rel.split('/')[0];
	byAuthor[author] = (byAuthor[author] ?? 0) + 1;
	const body = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${viewBox}"><path fill="${tone}" d="${d}"/></svg>\n`;
	writeFileSync(join(OUT, `${name}.svg`), body);
	total += body.length;
}

console.log(`иконки: ${Object.keys(MAP).length} штук, ${(total / 1024).toFixed(1)} КБ`);
console.log(
	'авторы:',
	Object.entries(byAuthor)
		.map(([a, n]) => `${a} ${n}`)
		.join(', '),
);
