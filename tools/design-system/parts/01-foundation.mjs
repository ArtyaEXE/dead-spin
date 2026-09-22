/**
 * Сборка дизайн-системы Dead Spin из настоящих исходников проекта:
 * tokens.css, Icon.tsx и сгенерированных SVG. Ничего не переписывается
 * руками — иначе кит разойдётся с игрой на первой же правке.
 */
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'apps', 'game') + '/';
const OUT = process.env['DS_OUT'] ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'out', 'project');

const w = (p, body) => {
	const full = join(OUT, p);
	mkdirSync(dirname(full), {recursive: true});
	writeFileSync(full, body, 'utf8');
	return body.length;
};

/** Внутренность SVG-файла без обёртки, чтобы вставить в разметку превью. */
function svgBody(rel) {
	const raw = readFileSync(REPO + 'public/' + rel, 'utf8');
	const m = /<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*)<\/svg>/.exec(raw);
	return {viewBox: m[1], body: m[2].trim()};
}

function inlineSvg(rel, size, cls = '') {
	const {viewBox, body} = svgBody(rel);
	return `<svg class="${cls}" width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;
}

/* ------------------------------------------------------------- токены --- */

const colors = [
	[
		'void',
		'#0e0b08',
		'Глубина за стенами и подложка оверлеев. Заменяет чистый чёрный: он в проекте запрещён, тень на тёплой поверхности обязана быть тёплой.',
	],
	['rock-900', '#1a1410', 'Дальний план пещеры, фон экрана, утопленные ячейки уровней.'],
	['rock-700', '#2b211a', 'Корпус приборной панели и карточек. Основной материал интерфейса.'],
	['rock-500', '#3e3026', 'Потолок светлоты слоя мира: выше нельзя. Оправа приборов.'],
	['rock-line', '#12100e', 'Контур пера. Обводка плашек и кромки стен.'],

	['hull', '#e8e2d4', 'Корпус корабля и бумага. Самое светлое в кадре.'],
	['hull-shade', '#9a9382', 'Теневая сторона корпуса. Второй тон двухтоновой заливки.'],
	['rim', '#7fd4ff', 'Холодная подсветка контура героя. На декор не расходуется: это метка «это ты».'],

	['goal', '#ffd24a', 'Звезда, финиш, монета, показание прибора. Единственное золото на экране.'],
	['goal-deep', '#c98a17', 'Тень золота и нажатое состояние золотой кнопки.'],

	[
		'danger',
		'#ff5324',
		'Мина, камень, червь, взрыв, низкое топливо. Единственный насыщенный красный в проекте: увидел оранжевое — оно тебя убьёт.',
	],
	['danger-deep', '#b32110', 'Тень угрозы, жилы камня, ободок глаза мины.'],

	['paper', '#e6dcc6', 'Наклейка на кнопке и лицо плашки. Крашеная жесть, не резной камень.'],
	['paper-edge', '#a8987a', 'Кромка бумаги и нижняя тень краски на кнопке.'],
	['ink', '#1b1611', 'Текст и глиф по бумаге. Контраст к paper — 12.6:1.'],
	['ink-inv', '#f2ece0', 'Текст по тёмному. Контраст к rock-900 — 13.2:1.'],
	['ink-soft', '#6b5f4c', 'Вторичный текст по бумаге. Подтонирован от поверхности, не нейтрально-серый.'],
	['ink-inv-soft', '#b9ae99', 'Вторичный текст по тёмному.'],
];

const tokens = {
	name: 'Dead Spin',
	version: 1,
	meta: {source: 'apps/game/src/ui/tokens.css'},
	color: {
		themes: [{id: 'soot', name: 'Копоть'}],
		note: 'Игра существует в одной теме: она целиком происходит в тёмной пещере. Светлой темы нет и не планируется — светлота тут несёт смысл, а не вкус.',
		tokens: colors.map(([name, value, usage]) => ({name, value, usage})),
	},
	type: {
		fonts: [{family: 'Rubik', file: 'https://fonts.googleapis.com/css2?family=Rubik', weight: '400 700'}],
		families: {
			display: '"Road Rage", "Rubik", sans-serif',
			ui: '"Rubik", system-ui, sans-serif',
		},
		groups: [
			{
				name: 'Дисплей — Road Rage',
				family: 'display',
				styles: [
					{
						name: 'hero',
						fontSize: '48px',
						lineHeight: 1,
						fontWeight: 400,
						usage: 'Победа, имя мира. Только крупно.',
						sample: 'CERES',
					},
					{
						name: 'display',
						fontSize: '34px',
						lineHeight: 1,
						fontWeight: 400,
						usage: 'Экран результата, заголовок секции.',
						sample: 'НАСТРОЙКИ',
					},
					{
						name: 'title',
						fontSize: '24px',
						lineHeight: 1.1,
						fontWeight: 400,
						usage: 'Заголовок экрана. Нижняя граница дисплейной гарнитуры: мельче она нечитаема.',
						sample: 'Заголовок',
					},
				],
			},
			{
				name: 'Интерфейс — Rubik',
				family: 'ui',
				styles: [
					{
						name: 'label',
						fontSize: '18px',
						lineHeight: 1.25,
						fontWeight: 500,
						usage: 'Кнопки, пункты меню.',
						sample: 'Забрать бонус',
					},
					{
						name: 'body',
						fontSize: '15px',
						lineHeight: 1.45,
						fontWeight: 400,
						usage: 'Тело, подписи, ошибки.',
						sample: 'Перепрохождение не стирает лучшее время',
					},
					{
						name: 'hud',
						fontSize: '13px',
						lineHeight: 1.2,
						fontWeight: 700,
						usage: 'Топливо и таймер. Обязательны табличные цифры: без них таймер дёргается каждый кадр.',
						sample: '1:07  4.00',
					},
				],
			},
		],
	},
	spacing: {
		note: 'Шаг 4 px. Плотные группы жмутся, разные группы разводятся щедро.',
		tokens: [
			{name: 'sp-1', value: '4px', usage: 'Зазор внутри связки иконка + число.'},
			{name: 'sp-2', value: '8px', usage: 'Между элементами одной строки.'},
			{name: 'sp-3', value: '12px', usage: 'Внутренний отступ мелкой плашки.'},
			{name: 'sp-4', value: '16px', usage: 'Внутренний отступ карточки, зазор между кнопками результата.'},
			{name: 'sp-6', value: '24px', usage: 'Отступ секции.'},
			{name: 'sp-8', value: '32px', usage: 'Поля экрана.'},
		],
	},
	radius: {
		note: 'Три радиуса и документированное правило, по которому выбирается один из них. Смешанные системы без правила — сломанный дизайн.',
		tokens: [
			{
				name: 'r-panel',
				value: '2px',
				usage: 'Плашка, карточка, приборная панель. Жестяная табличка, а не карточка веб-интерфейса.',
			},
			{name: 'r-round', value: '50%', usage: 'Круглая кнопка. Все интерактивные круглые элементы.'},
			{name: 'r-bar', value: '999px', usage: 'Полоса прогресса, стрик, баннер дейлика.'},
		],
	},
	shadow: {
		note: 'У тени есть смещение и размытие. Цветной ореол без смещения — декорация, а не глубина, и в системе запрещён.',
		tokens: [
			{name: 'shadow-sm', value: '0 1px 2px rgba(14,11,8,0.5)', usage: 'Нажатое состояние кнопки.'},
			{name: 'shadow-md', value: '0 4px 10px rgba(14,11,8,0.55)', usage: 'Кнопка, карточка, плашка.'},
			{name: 'shadow-lg', value: '0 10px 28px rgba(14,11,8,0.6)', usage: 'Оверлей, главная кнопка экрана.'},
		],
	},
	opacity: {
		note: 'Состояния, где прозрачность несёт смысл.',
		tokens: [
			{name: 'disabled', value: '0.45', usage: 'Недоступная кнопка. Плюс pointer-events: none.'},
			{name: 'locked', value: '0.4', usage: 'Закрытая ачивка, недоступный скин.'},
		],
	},
};

/* ------------------------------------------------------------- превью --- */

const head = (group, height, subtitle, extra = '') =>
	`<!-- @dsCard group="${group}" height=${height}${subtitle ? ` subtitle="${subtitle}"` : ''}${extra} -->`;

const BASE = `
<style>
	.k { font-family: var(--font-ui, system-ui, sans-serif); color: var(--ink-inv); padding: 20px; }
	.k-row { display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }
	.k-cell { display: flex; flex-direction: column; align-items: center; gap: 8px; }
	.k-cap { font-size: 11px; color: var(--ink-inv-soft); letter-spacing: 0.02em; text-align: center; }
	.k-note { font-size: 13px; color: var(--ink-inv-soft); line-height: 1.5; margin: 0 0 16px; max-width: 62ch; }
</style>`;

/* --- Закон трёх слоёв: сердце системы --- */
const layers = [
	['Мир', 'стены, задник, декор', '≤ 34', '#2b251f', 'var(--rock-700)'],
	['Угроза', 'мина, камень, червь', '28–72', '#8a7f6e', 'var(--danger)'],
	['Цель', 'звезда, финиш, факел', '≥ 60', '#ffd24a', 'var(--goal)'],
	['Герой', 'корабль и скины', '≥ 72', '#e8e2d4', 'var(--hull)'],
	['Вспышка', 'ядро взрыва', '≥ 85', '#fff4d2', 'var(--goal)'],
];

w(
	'components/Layers/preview.html',
	`${head('Основа', 300, 'Пять слоёв, границы измеримы')}
<div class="k">${BASE}
	<p class="k-note">Главный закон системы. Каждый пиксель принадлежит ровно одному слою, и слой диктует его светлоту. Правило «корабль — самое светлое пятно кадра» нельзя соблюдать на глаз: ровно так в проекте и появился фон ярче героя. Поэтому границы заданы числом и считаются скриптом в CI.</p>
	<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:760px">
		${layers
			.map(
				([
					name,
					what,
					l,
					sw,
				]) => `<div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;padding:12px">
			<div style="height:46px;border-radius:2px;background:${sw};border:1px solid var(--rock-line)"></div>
			<div style="font-weight:700;font-size:13px;margin-top:10px">${name}</div>
			<div style="font-size:11px;color:var(--ink-inv-soft);line-height:1.4;margin-top:2px">${what}</div>
			<div style="font-size:11px;color:var(--goal);margin-top:6px;font-variant-numeric:tabular-nums">L p95 ${l}</div>
		</div>`,
			)
			.join('')}
	</div>
	<p class="k-note" style="margin-top:16px">Светлота — CIELAB, 95-й процентиль по непрозрачным пикселям: одинокий блик не делает объект светлым, а максимум именно на это и ловится. «Вспышка» — единственное задокументированное исключение: ядро взрыва обязано быть ярче корабля, иначе смерть не читается как событие.</p>
</div>`,
);

/* --- Круглые кнопки --- */
const glyphs = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'glyphs.json'), 'utf8'));

const rbtnCss = `
	.rb { display:inline-flex; align-items:center; justify-content:center; padding:0;
		border:2px solid var(--rock-900); border-radius:50%; background:var(--paper); color:var(--ink);
		box-shadow: inset 0 3px 0 rgba(242,236,224,0.75), inset 0 -4px 0 var(--paper-edge), 0 4px 10px rgba(14,11,8,0.55);
		cursor:pointer; transition: transform 120ms cubic-bezier(0.22,1,0.36,1), background 120ms cubic-bezier(0.22,1,0.36,1); }
	.rb:active { transform: scale(0.97); background: var(--paper-edge);
		box-shadow: inset 0 3px 6px rgba(14,11,8,0.35), 0 1px 2px rgba(14,11,8,0.5); }
	.rb:disabled { opacity:0.45; pointer-events:none; }
	.rb-sm{width:38px;height:38px} .rb-md{width:52px;height:52px} .rb-lg{width:68px;height:68px} .rb-xl{width:112px;height:112px}
	.rb-goal{background:var(--goal);color:var(--rock-900);box-shadow:inset 0 3px 0 rgba(255,232,160,0.9), inset 0 -5px 0 var(--goal-deep), 0 4px 10px rgba(14,11,8,0.55)}
	.rb-danger{background:var(--danger);color:var(--ink-inv);box-shadow:inset 0 3px 0 rgba(255,160,120,0.7), inset 0 -5px 0 var(--danger-deep), 0 4px 10px rgba(14,11,8,0.55)}`;

const g = (name, px) => {
	const d = glyphs[name];
	const parts = [];
	if (d.fill) parts.push(`<path d="${d.fill}" fill="currentColor"${d.evenodd ? ' fill-rule="evenodd"' : ''}/>`);
	if (d.stroke)
		parts.push(
			`<path d="${d.stroke}" stroke="currentColor" stroke-width="${d.width ?? 2.4}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
		);
	return `<svg width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true">${parts.join('')}</svg>`;
};

w(
	'components/RoundBtn/preview.html',
	`${head('Компоненты', 250, 'Четыре размера, три тона, три состояния')}
<div class="k">${BASE}<style>${rbtnCss}</style>
	<p class="k-note">Крашеная жесть с бумажной наклейкой: тёмная обводка пера, блик сверху, тень краски снизу. Тот же закон, что у рисованных ассетов. Заменила тринадцать каменных медальонов по 43 КБ, размытых на всех DPR кроме одного.</p>
	<div class="k-row">
		<div class="k-cell"><button class="rb rb-sm">${g('close', 19)}</button><span class="k-cap">sm · 38<br>закрыть</span></div>
		<div class="k-cell"><button class="rb rb-md">${g('cog', 26)}</button><span class="k-cap">md · 52<br>настройки</span></div>
		<div class="k-cell"><button class="rb rb-lg">${g('replay', 34)}</button><span class="k-cap">lg · 68<br>заново</span></div>
		<div class="k-cell"><button class="rb rb-xl rb-goal">${g('play', 58)}</button><span class="k-cap">xl · 112 · goal<br>главное действие</span></div>
		<div class="k-cell"><button class="rb rb-lg rb-danger">${g('close', 34)}</button><span class="k-cap">lg · danger<br>выход</span></div>
		<div class="k-cell"><button class="rb rb-md" disabled>${g('right', 26)}</button><span class="k-cap">disabled<br>0.45 + без событий</span></div>
	</div>
	<p class="k-note" style="margin-top:18px">Золотая кнопка на экране одна: это цель. Красная — только выход и отмена необратимого. Нажатие даёт scale(0.97) за 120 мс: заметно пальцу, незаметно глазу.</p>
</div>`,
);

w(
	'components/RoundBtn/README.md',
	`Круглая кнопка интерфейса: крашеная жесть с бумажной наклейкой и глифом.

Четыре размера — \`sm\` 38, \`md\` 52, \`lg\` 68, \`xl\` 112. Три тона — \`paper\` по умолчанию, \`goal\` для главного действия экрана, \`danger\` для выхода и отмены необратимого.

## Правила

- **Золотая кнопка на экране ровно одна.** Она означает цель. Две золотых кнопки — это отсутствие приоритета.
- **Красная только для необратимого.** Выход из уровня, отмена покупки. На «назад» красный не тратится.
- Радиус — \`r-round\`, один из трёх разрешённых системой.
- Нажатие: \`scale(0.97)\` за \`120ms\` с \`ease-out\`. Не \`scale(0)\` и не исчезновение: в реальном мире ничто не появляется из ничего.
- Недоступное состояние — \`opacity: 0.45\` плюс \`pointer-events: none\`, а не просто бледный вид: кнопка не должна ловить тап.

## Что даёт потребитель

Имя глифа из набора, локализованную подпись для \`aria-label\` и обработчик. Подпись обязательна: кнопка состоит из одного глифа, без неё скринридер прочитает пустоту.`,
);

/* --- Иконки --- */
const glyphNames = Object.keys(glyphs);
w(
	'components/Icons/preview.html',
	`${head('Компоненты', 200, `${glyphNames.length} глифов, одна толщина штриха`)}
<div class="k">${BASE}
	<p class="k-note">Сетка 24, центр 12,12, штрих 2.4. Это геометрия, а не иллюстрация: окружности, дуги, шевроны, многоугольники. Шестерня и звезда сгенерированы по сетке, а не срисованы — поэтому зубья ровные. Рисованные кистью ассеты мира сюда не переезжают.</p>
	<div class="k-row" style="gap:26px">
		${glyphNames.map((n) => `<div class="k-cell"><div style="color:var(--paper)">${g(n, 30)}</div><span class="k-cap">${n}</span></div>`).join('')}
	</div>
	<p class="k-note" style="margin-top:18px">Эмодзи в роли иконки запрещены: у них нет общей толщины штриха, они по-разному выглядят на разных платформах и не красятся в цвет текста.</p>
</div>`,
);

w(
	'components/Icons/README.md',
	`Набор глифов интерфейса. Одна толщина штриха, сетка 24.

Каждый глиф — геометрия, которую можно задать точно: окружность, дуга, шеврон, многоугольник. Шестерня и звезда генерируются по сетке, а не срисовываются, поэтому зубья и лучи ровные.

## Правила

- Цвет — \`currentColor\`. Глиф красится цветом текста родителя и работает на любом тоне кнопки.
- Размер — \`1em\`. Задаётся \`font-size\` родителя, а не атрибутами.
- **Эмодзи в роли иконки запрещены.** У них нет общей толщины штриха, они разные на разных платформах и не красятся.
- Рисованные кистью иконки мира (топливо, часы, монеты, трофей) в этот набор не входят: там ценность в материале, а не в контуре.

## Что даёт потребитель

Имя глифа. Всё остальное — размер, цвет, выравнивание — наследуется от контекста.`,
);

/* --- Материал плашек --- */
w(
	'components/Plate/preview.html',
	`${head('Компоненты', 230, 'Два материала: стекло прибора и клёпаная пластина')}
<div class="k">${BASE}
	<p class="k-note">Семь растровых подложек заменены двумя материалами в CSS. Растянутый растр мылил клёпки на каждом нестандартном размере; CSS не мылит ничего и не весит ничего.</p>
	<div class="k-row" style="align-items:stretch">
		<div style="flex:1;min-width:230px">
			<div style="background:var(--void);border:2px solid var(--rock-500);border-radius:2px;
				box-shadow:inset 0 2px 8px rgba(14,11,8,0.9), inset 0 -1px 0 rgba(242,236,224,0.06);
				padding:14px 18px;display:flex;align-items:center;gap:10px">
				<span style="color:var(--goal);font-weight:700;font-size:24px;font-variant-numeric:tabular-nums">1:07</span>
				<span style="color:var(--ink-inv-soft);font-size:13px">таймер</span>
			</div>
			<div class="k-cap" style="text-align:left;margin-top:8px">Утопленное стекло прибора — показания: топливо, время, счёт.</div>
		</div>
		<div style="flex:1;min-width:230px">
			<div style="background:var(--rock-700);border:3px solid var(--rock-line);border-radius:2px;
				background-image:radial-gradient(circle 3px at 11px 11px,var(--rock-line) 98%,transparent 100%),radial-gradient(circle 3px at calc(100% - 11px) 11px,var(--rock-line) 98%,transparent 100%),radial-gradient(circle 3px at 11px calc(100% - 11px),var(--rock-line) 98%,transparent 100%),radial-gradient(circle 3px at calc(100% - 11px) calc(100% - 11px),var(--rock-line) 98%,transparent 100%);
				box-shadow:inset 0 2px 0 rgba(242,236,224,0.07), inset 0 -3px 0 rgba(14,11,8,0.5), 0 4px 10px rgba(14,11,8,0.55);
				padding:20px;color:var(--ink-inv);font-size:15px">Клёпаная пластина</div>
			<div class="k-cap" style="text-align:left;margin-top:8px">Корпус — карточки, приборные панели, оверлеи.</div>
		</div>
	</div>
	<p class="k-note" style="margin-top:18px">Вложенных плашек не бывает. Карточка внутри карточки — признак того, что иерархию не продумали, а обернули.</p>
</div>`,
);

w(
	'components/Plate/README.md',
	`Два материала интерфейса: утопленное стекло прибора и клёпаная жестяная пластина.

**Стекло** (\`.panel\`, \`.setting-display\`) — для показаний: топливо, таймер, счёт звёзд. Тёмное поле в светлой оправе с внутренней тенью. Текст на нём — \`goal\`, потому что это подсвеченная шкала.

**Пластина** (\`.result-body\`, \`.ach-card\`, \`.topbar\`, \`.bottombar\` и другие) — корпус: карточки, приборные панели, оверлеи. Клёпки рисуются точками и остаются круглыми при любом размере плашки.

## Правила

- **Вложенных плашек не бывает.** Карточка внутри карточки — признак того, что иерархию не продумали, а обернули.
- Глубина объявляется один раз: либо обводка, либо тень. Обводка под широкой мягкой тенью — призрачная карточка.
- Радиус — \`r-panel\`, 2px. Это жестяная табличка, а не карточка веб-интерфейса.
- Материал объявлен один раз списком селекторов, а не скопирован в каждое правило.`,
);

/* --- Движение --- */
w(
	'components/Motion/preview.html',
	`${head('Основа', 260, 'Три кривые, три длительности')}
<div class="k">${BASE}
<style>
	.m-track { position:relative; height:34px; background:var(--rock-900); border:2px solid var(--rock-line); border-radius:2px; overflow:hidden; }
	.m-dot { position:absolute; top:7px; left:6px; width:18px; height:18px; border-radius:50%; background:var(--goal); }
	.m-run .m-dot { animation: m-slide 1.6s infinite; }
	.m-1 .m-dot { animation-timing-function: cubic-bezier(0.22,1,0.36,1); }
	.m-2 .m-dot { animation-timing-function: cubic-bezier(0.65,0,0.35,1); }
	.m-3 .m-dot { animation-timing-function: cubic-bezier(0.34,1.4,0.64,1); background: var(--danger); }
	@keyframes m-slide { 0%,8% { transform: translateX(0) } 58%,100% { transform: translateX(calc(100% + 240px)) } }
	@media (prefers-reduced-motion: reduce) { .m-run .m-dot { animation: none } }
</style>
	<p class="k-note">Интерфейс и игровой фидбек живут по разным правилам, и раньше они были перепутаны: overshoot стоял на общих оверлеях, а <code>ease-in</code> — на уходе тоста, то есть тормозил ровно тот момент, на который смотрит игрок.</p>
	<div style="display:grid;gap:14px;max-width:560px">
		<div><div class="m-track m-run m-1"><div class="m-dot"></div></div>
			<div class="k-cap" style="text-align:left;margin-top:6px"><b>ease-out</b> · cubic-bezier(0.22, 1, 0.36, 1) — появление и уход, по умолчанию</div></div>
		<div><div class="m-track m-run m-2"><div class="m-dot"></div></div>
			<div class="k-cap" style="text-align:left;margin-top:6px"><b>ease-mid</b> · cubic-bezier(0.65, 0, 0.35, 1) — перемещение по экрану</div></div>
		<div><div class="m-track m-run m-3"><div class="m-dot"></div></div>
			<div class="k-cap" style="text-align:left;margin-top:6px"><b>ease-pop</b> · cubic-bezier(0.34, 1.4, 0.64, 1) — только редкое и праздничное: звезда, ачивка, дейлик</div></div>
	</div>
	<div class="k-row" style="margin-top:18px;gap:28px">
		<div><div style="font-size:24px;color:var(--goal);font-variant-numeric:tabular-nums">120<span style="font-size:13px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap" style="text-align:left">нажатие</div></div>
		<div><div style="font-size:24px;color:var(--goal);font-variant-numeric:tabular-nums">180<span style="font-size:13px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap" style="text-align:left">тултип, панель</div></div>
		<div><div style="font-size:24px;color:var(--goal);font-variant-numeric:tabular-nums">260<span style="font-size:13px;color:var(--ink-inv-soft)"> мс</span></div><div class="k-cap" style="text-align:left">оверлей, смена экрана</div></div>
	</div>
</div>`,
);

w(
	'components/Motion/README.md',
	`Три кривые и три длительности. Больше в системе нет.

| Токен | Значение | Где |
|---|---|---|
| \`ease-out\` | \`cubic-bezier(0.22, 1, 0.36, 1)\` | появление и уход, по умолчанию |
| \`ease-mid\` | \`cubic-bezier(0.65, 0, 0.35, 1)\` | перемещение по экрану |
| \`ease-pop\` | \`cubic-bezier(0.34, 1.4, 0.64, 1)\` | только редкое и праздничное |
| \`t-press\` | \`120ms\` | нажатие |
| \`t-ui\` | \`180ms\` | тултип, дропдаун, смена панели |
| \`t-panel\` | \`260ms\` | оверлей, экран результата, смена экрана |

## Правила

- **\`ease-in\` в интерфейсе запрещён.** Он тормозит начало движения, а именно на начало смотрит пользователь.
- **Никакой анимации интерфейса дольше 300 мс.** Длинный фидбек ощущается как задержка ввода.
- **Overshoot только там, где событие редкое и его празднуют:** подбор звезды, выдача ачивки, дейлик, звёзды результата. В кнопках и переходах — никогда: именно это читается как дешёвый шаблон.
- **Появление не начинается со \`scale(0)\`.** Минимум \`0.92\`: в реальном мире ничто не возникает из ничего.
- **Анимируются только \`transform\` и \`opacity\`.** \`width\`, \`height\`, \`top\`, \`left\` вызывают layout и роняют кадры на слабом телефоне.
- **Переходы, а не keyframes,** для всего, что может прерваться на полпути: keyframes перезапускаются с нуля, transition доигрывает от текущей точки.
- \`prefers-reduced-motion\` убирает движение по позиции и оставляет прозрачность: пользователь всё ещё видит, что произошло.

## Частотное правило

Действие, которое игрок делает десятки раз за сессию — рестарт, пауза, зум — анимируется минимально или не анимируется вовсе. Редкое и праздничное — первая победа, новый скин, дейлик — получает характер. «Выглядит круто» на часто повторяемом элементе не является основанием.`,
);

/* --- Игровые объекты --- */
const hazards = [
	['enemies/mine/mine.svg', 'Мина', 'Активная угроза. Греется от близости, глаз горячий, шипы кованые.'],
	['enemies/stone/stone.svg', 'Камень', 'Пассивная масса. Оранжевое только в жилах.'],
	['enemies/worm/s1.svg', 'Червь: голова', 'Преследует. Пасть — единственное яркое пятно.'],
	['enemies/worm/s2.svg', 'Червь: тело', 'Жерло вместо пасти. Когти держат силуэт на 40 px.'],
	['enemies/worm/s3.svg', 'Червь: хвост', 'Тот же панцирь мельче.'],
];
w(
	'components/Hazards/preview.html',
	`${head('Игровые объекты', 260, 'Иерархия угрозы по количеству оранжевого')}
<div class="k">${BASE}
	<p class="k-note">Три объекта одной роли раньше были нарисованы тремя разными руками: аэрографный шар, красно-зелёный сток-камень и оливковый рендер. Теперь один перовой контур и плоская двухтоновая заливка, а внутри слоя есть своя иерархия — она читается по количеству оранжевого.</p>
	<div class="k-row">
		${hazards.map(([f, n, d]) => `<div class="k-cell" style="max-width:150px"><div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;padding:8px">${inlineSvg(f, 92)}</div><span class="k-cap"><b>${n}</b><br>${d}</span></div>`).join('')}
	</div>
</div>`,
);

w(
	'components/Hazards/README.md',
	`Слой угрозы: мина, камень, червь. Единственное место в игре, где разрешён насыщенный оранжевый.

Внутри слоя есть иерархия, и она читается по количеству оранжевого:

- **Мина** — активная угроза. Греется от близости игрока, горячий глаз, свечение растёт быстрее нагрева: тревога должна опережать опасность.
- **Червь** — преследует. Оранжевого меньше: пасть у головы, дыхательные жерла у тела.
- **Камень** — пассивная масса. Оранжевое только в жилах.

Правило «оранжевое убивает» остаётся верным, но объекты не спорят друг с другом.

## Правила

- Мина тинтуется в рантайме от белого к \`rgb(255,64,64)\`, поэтому её корпус держится в тёплом железе средней светлоты: слишком тёмная база не даст тинту диапазона, слишком яркая сравняет мину с кораблём.
- Светлота слоя — L p95 от 28 до 72. Считается \`pnpm art:check\`, роняет CI.
- Силуэт обязан читаться за 100 мс при 40 px. Проверка простая: уменьшить до 40 и посмотреть, отличается ли объект от соседнего.`,
);

const goals = [
	['star.svg', 'Звезда', 'Награда за осознанный крюк с маршрута.'],
	['finish.svg', 'Финиш', 'Одинаковый во всех мирах: цель нельзя учить заново.'],
	['booster-single.svg', 'Факел', 'Золотой, не оранжевый: оранжевое означает смерть.'],
	['start.svg', 'Старт', 'Слой мира, не цели. Тихий люк без золота.'],
];
w(
	'components/Goal/preview.html',
	`${head('Игровые объекты', 250, 'Золото цели и почему факел не оранжевый')}
<div class="k">${BASE}
	<p class="k-note">Финиш раньше был тёмной дырой, перекрашиваемой тинтом в пять мировых оттенков — цель выглядела по-разному каждые пятнадцать уровней и при этом была темнее фона. Теперь это золотой маяк, одинаковый везде.</p>
	<div class="k-row">
		${goals.map(([f, n, d]) => `<div class="k-cell" style="max-width:160px"><div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;padding:8px">${inlineSvg(f, 100)}</div><span class="k-cap"><b>${n}</b><br>${d}</span></div>`).join('')}
	</div>
	<p class="k-note" style="margin-top:18px">Факел двигателя намеренно золотой. Оранжевое пламя было бы естественнее физически, но сломало бы единственное правило, по которому игрок читает опасность.</p>
</div>`,
);

w(
	'components/Goal/README.md',
	`Слой цели: звезда, финиш, факел двигателя. Золото — единственный акцент, который не означает смерть.

- **Звезда** стоит игроку осознанного крюка с маршрута, поэтому её подбор — не исчезновение, а вспышка на 420 мс со световым послесвечением.
- **Финиш** одинаковый во всех мирах. Цель нельзя учить заново каждые пятнадцать уровней.
- **Факел** золотой, а не оранжевый. Оранжевое пламя было бы естественнее физически, но сломало бы единственное правило, по которому игрок читает опасность.
- **Старт** принадлежит слою мира, а не цели: это место, откуда ты пришёл, оно не должно притягивать взгляд.

## Свет

Цель светится. Это не украшение: в тёмной пещере свет разносится дальше силуэта, и игрок видит, куда лететь, раньше, чем разберёт форму. Свечение — аддитивный режим, потому что свет складывается с тем, что под ним, а не закрашивает это.`,
);

const ships = [
	['ship2.svg', 'PROSPECTOR', 'Базовый. Бумажная жесть, латунная отделка.'],
	['ship-skins/ship-wanderer.svg', 'WANDERER', 'Холодная эмаль, ледяной рим.'],
	['ship-skins/ship-engineer.svg', 'ENGINEER', 'Рабочая краска, много латуни.'],
	['ship-skins/ship-veteran.svg', 'VETERAN', 'Выгоревший корпус, тёмная отделка.'],
	['ship-skins/ship-asteroid-king.svg', 'ASTEROID KING', 'Парадная позолота, самый светлый корпус.'],
];
w(
	'components/Hero/preview.html',
	`${head('Игровые объекты', 250, 'Одна жестянка в пяти окрасках')}
<div class="k">${BASE}
	<p class="k-note">Корабль обязан быть самым светлым пятном кадра. Старый был темнее декора, и в рефлекторной игре это стоило игроку первых ста миллисекунд на каждом экране. Пилот в иллюминаторе был и раньше — тёмный на тёмном, его никто не видел.</p>
	<div class="k-row">
		${ships.map(([f, n, d]) => `<div class="k-cell" style="max-width:145px"><div style="background:var(--rock-900);border:2px solid var(--rock-line);border-radius:2px;padding:8px">${inlineSvg(f, 92)}</div><span class="k-cap"><b>${n}</b><br>${d}</span></div>`).join('')}
	</div>
	<p class="k-note" style="margin-top:18px">Скины — одна и та же жестянка в разной окраске, а не пять картинок из разных рук. У всех корпус держится выше L p95 = 84, поэтому закон не ломается от выбора игрока.</p>
</div>`,
);

w(
	'components/Hero/README.md',
	`Корабль и пять скинов. Самое светлое пятно кадра — всегда.

Скины — одна и та же жестянка в разной окраске, а не пять картинок из разных источников. У всех корпус держится выше L p95 = 84, поэтому закон трёх слоёв не ломается от выбора игрока.

## Правила

- **Корабль светлее любого декора.** Если декор ярче корабля, неправилен декор.
- **Ни у одного скина нет оранжевого.** Он означает смерть.
- Корабль несёт собственную лампу — мягкое тёплое световое пятно под корпусом, аддитивное. В тёмной пещере это делает три вещи разом: показывает, где ты, вылепляет пространство вокруг и не даёт объектам висеть в пустоте.
- Тон лампы насыщеннее, чем кажется нужным. Аддитивный свет на тёмном быстро уходит в белый, и бледно-кремовый превращается в белое пятно, которое спорит с корпусом. Янтарь остаётся янтарём даже в клиппинге.
- Пилот виден и реагирует. Одна анимированная деталь даёт игре лицо — буквально.`,
);

/* --- Порода --- */
const caves = [
	['cave/ceres-outer.svg', 'CERES', 'Стылый камень, крупный скол.'],
	['cave/pallas-outer.svg', 'PALLAS', 'Ржавчина, скол мельче.'],
	['cave/juno-outer.svg', 'JUNO', 'Тёмная латунь, самая рваная порода.'],
	['cave/vesta-outer.svg', 'VESTA', 'Базальт, колотый мелко.'],
	['cave/eunomia-outer.svg', 'EUNOMIA', 'Пепел, светлейшая порода в допуске.'],
];
w(
	'components/Cave/preview.html',
	`${head('Игровые объекты', 230, 'Пять миров, один материал')}
<div class="k">${BASE}
	<p class="k-note">Было десять JPG на 2.6 МБ: лёд, фиолетовый мох, золотой стимпанк, лава, кость. Пять миров в пяти несвязанных жанрах, и один из них светлее корабля. Стало пять пород одного материала: миры различаются тоном, калибром скола и частотой трещин, а не жанром.</p>
	<div class="k-row">
		${caves.map(([f, n, d]) => `<div class="k-cell" style="max-width:150px"><div style="border:2px solid var(--rock-line);border-radius:2px;overflow:hidden;width:136px;height:136px">${inlineSvg(f, 136)}</div><span class="k-cap"><b>${n}</b><br>${d}</span></div>`).join('')}
	</div>
	<p class="k-note" style="margin-top:18px">Плитки бесшовны по построению: узлы сетки берутся по модулю, а решение о слиянии ячеек принимается на ребре, поэтому общая грань смещается одинаково с обеих сторон и левый край совпадает с правым.</p>
</div>`,
);

w(
	'components/Cave/README.md',
	`Порода пяти миров. Стена и задник, бесшовные плитки.

Миры различаются тоном, калибром скола и частотой трещин — не жанром. Раньше это были пять несвязанных клише: лёд, фиолетовый мох, золотой стимпанк, лава, кость.

## Как не выглядит сеткой

Основа — сетка, но её не видно:

1. Узлы смещены на 0.55 ячейки, рёбра ломаются в середине: скол идёт прямыми, как у настоящего камня.
2. Соседние ячейки сливаются в один осколок, внутренние рёбра не обводятся, тон общий на весь осколок. Именно слияние убирает ритм сетки.
3. Толщина трещины разная, часть трещин волосяные.

## Задник

Задник приглушён и собран из более крупных осколков: дальше видно меньше деталей, а не то же самое потемнее. Раньше он уходил почти в чёрное, и игровое поле читалось как провал, в котором висят объекты.`,
);

console.log('файлов записано:', 0);

/* --------------------------------------------------------- бренд-книга --- */

w('tokens.json', JSON.stringify(tokens, null, '\t'));

w(
	'README.md',
	`# Dead Spin — «Жесть и копоть»

Мобильная аркада: ракета на тяге летит по пещере астероида, собирает звёзды
и садится на площадку. Управление в один палец, забег на пару минут.

Это система рисованной от руки жестяной игрушки. Школа Amanita Design
скрещённая с ретрофутурной ракетой 1950-х. Look редкий для мобильного рынка,
опознаётся по одному скриншоту и потому работает как маркетинговый актив,
а не только как вкусовщина.

Чего в этом мире нет: фотореализма, аэрографа, неона, свечений ради свечений,
объёмного 3D-рендера, частиц «для красоты».

## Откуда система взялась

Игра была наполовину сгенерирована нейросетью, и это было видно. Рядом жили
две техники: честная рука с перовым контуром — логотип, робот, трубы,
таблички, монеты, комиксы — и фотореалистичные текстуры без линии: ледяные
пещеры, красно-зелёный сток-камень, аэрографная мина. Второй слой и читался
как слоп: у него нет линии, нет авторского решения и нет общей светотени
с остальной игрой.

Плюс три измеримые поломки: корабль был темнее декора, в CSS лежало двадцать
чистых чёрных, двенадцать кеглей и одиннадцать радиусов, а визуал не
поддерживал шутку, которую уже произносит логотип.

## Три закона

**Первый: одна техника.** Каждый ассет имеет видимый перовой контур и плоскую
или двухтоновую заливку. Ассет без контура в игру не попадает. Если объект
нельзя нарисовать пером — это не объект этого мира, а текстура из стока.

**Второй: три слоя яркости.** Каждый пиксель принадлежит ровно одному слою, и
слой диктует его светлоту. Корабль — самое светлое пятно кадра, всегда.
Насыщенный оранжевый есть только у того, что тебя убьёт. Мир тише героя
минимум на 45% светлоты. Это не стилистика, это бюджет внимания: в
рефлекторной игре у игрока есть сто миллисекунд, чтобы разобрать кадр на
«я / цель / смерть».

**Третий: токены, не значения.** Шесть кеглей, три радиуса, три кривые. Чистый
чёрный запрещён: тень на тёплой поверхности обязана быть тёплой.

## Цвет

Роли, а не набор свотчей. Ни один компонент не пишет хекс напрямую.

- \`void\` и семейство \`rock-*\` — слой мира. Рецессивный, тихий, никогда не
  светлее \`rock-500\`.
- \`hull\`, \`rim\` — герой. \`rim\` не расходуется на декор: это метка «это ты».
- \`goal\` — цель. Единственное золото на экране.
- \`danger\` — смерть. Нигде, кроме угрозы: ни в интерфейсе, ни в декоре, ни
  на факеле двигателя.
- \`paper\`, \`ink\` — интерфейс. Крашеная жесть и бумажная наклейка, не резной
  камень.

Вторичный текст подтонирован от поверхности, никогда не нейтрально-серый.
Один акцент на экран: \`goal\` и \`danger\` не встречаются в одном элементе.

## Типографика

Две гарнитуры. **Road Rage** — голос бренда: логотип, заголовки, крупные
числа. Только от 24 px: мельче она нечитаема, а стояла она на 11–15 px.
**Rubik** — интерфейс и цифры, обязательно с табличными цифрами: без них
таймер дёргается на каждом кадре.

Шесть кеглей. Два задокументированных исключения: дисплейный текст крупнее
24 px может задаваться через \`clamp()\`, а \`font-size\` внутри круглой кнопки
задаёт размер глифа, а не текста.

## Свет

В тёмной пещере объект без собственного света висит в пустоте. Свет делает
три вещи сразу: показывает, где герой, показывает, куда лететь, и превращает
провал в пространство. Это и есть разница между «правильно» и «приятно».

Светятся корабль, финиш, звёзды и нагревающаяся мина. Режим аддитивный: свет
складывается с тем, что под ним, а не закрашивает это. Радиальный градиент
здесь не нарушает первый закон — запрет на градиенты относится к объектам, а
свет объектом не является.

## Тон

Игра шутит: на логотипе написано THRUST ME, I'M A PILOT. Долгое время визуал
шутку не поддерживал и выглядел как мрачный стимпанк 2012 года. Направление —
не мрачный космос, а неудачливый механик в консервной банке.

Копирайт конкретный и сухой, шутка в ситуации, а не в прилагательных. Кнопка
называет действие, ошибка называет проблему и выход из неё.

## Что проверяется машиной

\`pnpm art:check\` меряет каждый ассет: светлота по CIELAB, 95-й процентиль по
непрозрачным пикселям, доля тона угрозы. Роняет CI. Правило «корабль — самое
светлое пятно» невозможно соблюдать на глаз: ровно так в проекте и появился
фон ярче героя.

Арт рисуется генераторами, а не лежит картинками: то, что рисует программа с
перовым контуром и плоской заливкой, физически не может оказаться
фотореалистичной текстурой из стока. Первый закон соблюдается по построению,
а не на честном слове.

## Граница вектора и растра

Системное рисуется кодом, написанное кистью остаётся кистью. Весь
сгенерированный слой — порода, угрозы, корабль, кадры взрыва, интерфейс —
вектор. Логотип, комиксы и рисованные иконки остаются растром: там ценность
в материале, а вектор воспроизводит контур и заливку.
`,
);

/* ------------------------------------------------------------ обложка --- */

w(
	'components/Cover/preview.html',
	`<!-- @dsCard group="Cover" height=420 page -->
<div class="cover">
<style>
	.cover { position:relative; min-height:420px; display:flex; align-items:center; justify-content:center;
		background: var(--rock-900); overflow:hidden; font-family: var(--font-ui, system-ui, sans-serif); }
	.cover-rock { position:absolute; inset:0; opacity:0.5; }
	.cover-rock svg { width:100%; height:100%; object-fit:cover; }
	.cover-lamp { position:absolute; left:50%; top:52%; width:620px; height:620px; transform:translate(-50%,-50%);
		background: radial-gradient(circle, rgba(255,190,99,0.42) 0%, rgba(255,190,99,0.16) 38%, rgba(255,190,99,0) 68%); }
	.cover-mid { position:relative; text-align:center; padding:40px 24px; }
	.cover-ship { filter: drop-shadow(0 10px 28px rgba(14,11,8,0.6)); }
	.cover-name { margin:22px 0 0; font-size:44px; font-weight:700; letter-spacing:-0.03em; color: var(--hull); }
	.cover-sub { margin:10px 0 0; font-size:15px; color: var(--ink-inv-soft); line-height:1.6; max-width:46ch; margin-inline:auto; }
	.cover-chips { display:flex; gap:8px; justify-content:center; margin-top:22px; flex-wrap:wrap; }
	.cover-chip { font-size:12px; padding:6px 12px; border-radius:999px; border:1px solid var(--rock-500);
		background: var(--rock-700); color: var(--ink-inv-soft); }
	.cover-chip b { color: var(--goal); font-weight:700; }
</style>
	<div class="cover-rock">${inlineSvg('cave/ceres-outer.svg', 620)}</div>
	<div class="cover-lamp"></div>
	<div class="cover-mid">
		<div class="cover-ship">${inlineSvg('ship2.svg', 132)}</div>
		<h1 class="cover-name">Жесть и копоть</h1>
		<p class="cover-sub">Дизайн-система Dead Spin. Рисованная от руки жестяная игрушка: перовой контур, плоская заливка и три закона, два из которых проверяет машина.</p>
		<div class="cover-chips">
			<span class="cover-chip"><b>1</b> одна техника</span>
			<span class="cover-chip"><b>2</b> три слоя яркости</span>
			<span class="cover-chip"><b>3</b> токены, не значения</span>
		</div>
	</div>
</div>`,
);

console.log('готово');
